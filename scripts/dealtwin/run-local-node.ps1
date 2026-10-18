# Forward arguments directly to the pinned executable; no shell command assembly,
# global installation, PATH mutation, service or security-setting change.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-runtime.json') -Raw | ConvertFrom-Json
$exe = Join-Path $root ('.cache/runtimes/' + $pin.directory + '/node.exe')
if (-not (Test-Path -LiteralPath $exe)) { throw 'Run scripts/dealtwin/setup-local-node.ps1 first.' }
foreach ($p in @((Join-Path $root '.cache'), (Join-Path $root '.cache/runtimes'), (Split-Path $exe), $exe)) {
  if ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing redirected runtime path.' }
}
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'Local Node hash mismatch; refusing execution.' }
Push-Location -LiteralPath $root
try { & $exe @args; $code = $LASTEXITCODE } finally { Pop-Location }
exit $code
