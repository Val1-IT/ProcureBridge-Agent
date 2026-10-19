# Explicitly authorized one-run Windows synthetic rehearsal. No deletion, schema
# reset, production connection or service installation. Existing paths fail closed.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $root
$runId = 'review-20261019-a'
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($account -ne 'LENOVO-VT\Valen') { throw 'Unexpected execution owner' }
$pin = Get-Content scripts/dealtwin/local-runtime.json -Raw | ConvertFrom-Json
$node = Join-Path $root ('.cache/runtimes/' + $pin.directory + '/node.exe')
if ((Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'Runtime hash mismatch' }
$candidate = (git rev-parse HEAD).Trim()
if (@(git status --porcelain).Count -ne 0) { throw 'Clean candidate required' }
$plan = (& $node scripts/dealtwin/restore-plan.mjs --run-id $runId | Out-String | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Planning failed' }
$samples = [Collections.Generic.List[object]]::new()
$steps = [Collections.Generic.List[object]]::new()
function Guard([string]$stage) {
 $free = [math]::Floor((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)
 $samples.Add([pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');stage=$stage;freeMiB=$free})
 if ($free -lt 4096) { throw "RAM guard: $free MiB at $stage" }
}
Guard 'preflight'
if ((Get-PSDrive C).Free -lt 2GB) { throw 'Insufficient free disk' }
if (@(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 55432,55632 }).Count) { throw 'Port already in use' }
if ((Get-Acl -LiteralPath $plan.source.dataDirectory).Owner -ne $account) { throw 'Source ownership mismatch' }
$pg = $plan.binaries.pg_ctl.path
& $pg status -D $plan.source.dataDirectory
if ($LASTEXITCODE -ne 3) { throw 'Source must be stopped before this task owns startup' }
foreach ($entry in $plan.binaries.PSObject.Properties) {
 if ((Get-FileHash -LiteralPath $entry.Value.path).Hash.ToLowerInvariant() -ne $entry.Value.sha256) { throw 'Binary changed' }
 $version = & $entry.Value.path --version
 if ($LASTEXITCODE -ne 0 -or $version -notmatch '15\.4') { throw 'Unexpected PostgreSQL binary version' }
}
# Exclusive marker/evidence creation. Any collision aborts; no recovery overwrites.
$stream = [IO.File]::Open($plan.ownership.ownerMarker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$ownership = @{runId=$runId;owner=$account;target=$plan.target.dataDirectory;source=$plan.source.dataDirectory;candidate=$candidate;authorized=$true;createdAt=[DateTime]::UtcNow.ToString('o')}
try { $bytes=[Text.Encoding]::UTF8.GetBytes(($ownership|ConvertTo-Json));$stream.Write($bytes,0,$bytes.Length) } finally {$stream.Dispose()}
New-Item -ItemType Directory -Path $plan.evidenceDirectory | Out-Null
$evidence = $plan.evidenceDirectory
$plan | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'plan.json')
$ownership | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'authorization-and-owner.json')
$sourceStarted=$false;$targetStarted=$false;$sourcePid=$null;$targetPid=$null;$failure=$null
$cleanup=[Collections.Generic.List[object]]::new()
function Run([string]$name,[string]$exe,[string[]]$arguments) {
 Guard $name
 $begin=[DateTime]::UtcNow
 & $exe @arguments *> (Join-Path $evidence ($name+'.log'))
 $code=$LASTEXITCODE
 $steps.Add(@{name=$name;exitCode=$code;started=$begin.ToString('o');ended=[DateTime]::UtcNow.ToString('o')})
 $steps | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidence 'steps.json')
 if($code -ne 0){throw "Stage $name failed, exit $code; see retained log"}
}
function ClusterPid([string]$directory,[int]$port) {
 $lines=Get-Content -LiteralPath (Join-Path $directory 'postmaster.pid')
 if([IO.Path]::GetFullPath($lines[1]) -ne [IO.Path]::GetFullPath($directory) -or [int]$lines[3] -ne $port){throw 'Cluster PID file identity mismatch'}
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$lines[0])
 if(!$process -or $process.ExecutablePath -ne (Join-Path (Split-Path $pg) 'postgres.exe')){throw 'Postmaster executable mismatch'}
 $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwner
 if(($owner.Domain+'\'+$owner.User) -ne $account){throw 'Postmaster owner mismatch'}
 return [int]$lines[0]
}
function StopOwned([string]$label,[string]$directory,[int]$port,$expectedPid) {
 $status=& $pg status -D $directory 2>&1
 $before=$LASTEXITCODE
 if($before -eq 3){$cleanup.Add(@{cluster=$label;alreadyStopped=$true;statusExit=3});return}
 if($before -ne 0){throw "Cannot determine $label status"}
 $actual=ClusterPid $directory $port
 if($expectedPid -and $actual -ne $expectedPid){throw 'PID changed; refusing stop'}
 & $pg stop -D $directory -m fast -w *> (Join-Path $evidence ($label+'-stop.log'))
 $stop=$LASTEXITCODE
 & $pg status -D $directory *> (Join-Path $evidence ($label+'-closed.log'))
 $closed=$LASTEXITCODE
 $cleanup.Add(@{cluster=$label;pid=$actual;stopExit=$stop;statusExit=$closed;at=[DateTime]::UtcNow.ToString('o')})
 if($stop -ne 0 -or $closed -ne 3){throw "Unconfirmed $label shutdown"}
}
$oldPassword=$env:PGPASSWORD;$oldOptions=$env:PGOPTIONS;$oldTargetPassword=$env:RESTORE_TARGET_PASSWORD;$oldEvidence=$env:RESTORE_EVIDENCE
try {
 $sourceStarted=$true # startup can have an uncertain outcome; finally checks identity
 Run 'source-start' $pg @('start','-D',$plan.source.dataDirectory,'-o','-h 127.0.0.1 -p 55632 -c default_transaction_read_only=on','-l',(Join-Path $evidence 'source-postgres.log'),'-w','-t','30')
 $sourcePid=ClusterPid $plan.source.dataDirectory 55632
 Run 'source-check' $node @('--max-old-space-size=512','scripts/dealtwin/restore-check.mjs','source',$evidence)
 $env:PGPASSWORD='dealtwin';$env:PGOPTIONS='-c default_transaction_read_only=on'
 $dump=Join-Path $evidence 'source.dump'
 Run 'source-dump' $plan.binaries.pg_dump.path @('--host','127.0.0.1','--port','55632','--username','dealtwin','--format=custom','--file',$dump,'dealtwin_test')
 Run 'source-after' $node @('--max-old-space-size=512','scripts/dealtwin/restore-check.mjs','source-after',$evidence)
 StopOwned 'source' $plan.source.dataDirectory 55632 $sourcePid;$sourceStarted=$false
 # Source is now closed; target is still absent. No source mutation phases exist.
 Guard 'target-create'
 if(Test-Path -LiteralPath $plan.target.dataDirectory){throw 'Target appeared unexpectedly; refusing overwrite'}
 if(@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq 55432}).Count){throw 'Target port became occupied'}
 New-Item -ItemType Directory -Path $plan.target.dataDirectory | Out-Null
 $env:PGOPTIONS=$null
 $env:RESTORE_TARGET_PASSWORD=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 $env:PGPASSWORD=$env:RESTORE_TARGET_PASSWORD
 $passwordFile=Join-Path $evidence 'synthetic-owner-password'
 [IO.File]::WriteAllText($passwordFile,$env:RESTORE_TARGET_PASSWORD)
 Run 'target-init' $plan.binaries.initdb.path @('-D',$plan.target.dataDirectory,'-U','dealtwin','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile',$passwordFile,'--no-locale','--encoding=UTF8')
 $targetStarted=$true
 Run 'target-start' $pg @('start','-D',$plan.target.dataDirectory,'-o','-h 127.0.0.1 -p 55432 -c shared_buffers=32MB -c max_connections=20','-l',(Join-Path $evidence 'target-postgres.log'),'-w','-t','30')
 $targetPid=ClusterPid $plan.target.dataDirectory 55432
 @{sourcePid=$sourcePid;targetPid=$targetPid;owner=$account;candidate=$candidate} | ConvertTo-Json | Set-Content (Join-Path $evidence 'process-ownership.json')
 Run 'target-database' $plan.binaries.createdb.path @('--host','127.0.0.1','--port','55432','--username','dealtwin','--owner','dealtwin','dealtwin_test')
 & $plan.binaries.pg_restore.path --list $dump > (Join-Path $evidence 'dump-list.txt')
 if($LASTEXITCODE -ne 0){throw 'Dump inventory failed'}
 Run 'target-roles' $node @('--max-old-space-size=512','scripts/dealtwin/restore-check.mjs','target-roles',$evidence)
 Run 'target-restore' $plan.binaries.pg_restore.path @('--host','127.0.0.1','--port','55432','--username','dealtwin','--dbname','dealtwin_test','--exit-on-error','--single-transaction','--use-list',(Join-Path $evidence 'restore-list.txt'),$dump)
 Run 'target-compare' $node @('--max-old-space-size=512','scripts/dealtwin/restore-check.mjs','compare',$evidence)
 $env:RESTORE_EVIDENCE=$evidence
 Run 'target-behavior' $node @('--max-old-space-size=512','node_modules/vitest/vitest.mjs','run','--config','vitest.restore.config.ts','--reporter=json',('--outputFile='+ (Join-Path $evidence 'behavior-tests.json')))
} catch { $failure=$_.Exception.Message;Write-Output $failure }
finally {
 foreach($cluster in @(@{label='target';started=$targetStarted;directory=$plan.target.dataDirectory;port=55432;process=$targetPid},@{label='source';started=$sourceStarted;directory=$plan.source.dataDirectory;port=55632;process=$sourcePid})) {
  if($cluster.started){try{StopOwned $cluster.label $cluster.directory $cluster.port $cluster.process}catch{$cleanup.Add(@{cluster=$cluster.label;error=$_.Exception.Message});if(!$failure){$failure=$_.Exception.Message}}}
 }
 $env:PGPASSWORD=$oldPassword;$env:PGOPTIONS=$oldOptions;$env:RESTORE_TARGET_PASSWORD=$oldTargetPassword;$env:RESTORE_EVIDENCE=$oldEvidence
 $samples | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidence 'resources.json')
 $cleanup | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'cleanup.json')
 @{candidate=$candidate;status=$(if($failure){'fail'}else{'pass'});failure=$failure;sourcePid=$sourcePid;targetPid=$targetPid;preserved=$true;finished=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $evidence 'result.json')
}
if($failure){exit 1}
