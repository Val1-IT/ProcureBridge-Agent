$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-runtime.json') -Raw | ConvertFrom-Json
if ([Environment]::OSVersion.Platform -ne 'Win32NT' -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
  throw 'This pinned runtime is for Windows x64 only.'
}
$cache = Join-Path $root '.cache/runtimes'
$archive = Join-Path $cache $pin.archive
$target = Join-Path $cache $pin.directory
$exe = Join-Path $target 'node.exe'
foreach ($p in @($cache, $archive, $target, $exe)) {
  if (-not ([IO.Path]::GetFullPath($p)).StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime path escapes worktree.' }
}
# Reject redirected parents before downloading or extracting.
foreach ($p in @((Join-Path $root '.cache'), $cache, $target, $archive, $exe)) {
  if ((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing reparse point: $p" }
}
if (Test-Path -LiteralPath $target) {
  if (-not (Test-Path -LiteralPath $exe) -or (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'Existing runtime is incomplete or changed; preserved without overwrite.' }
} else {
  New-Item -ItemType Directory -Path $cache -Force | Out-Null
  $sums = (Invoke-WebRequest -Uri $pin.checksumsUrl).Content
  $match = @($sums -split "`n" | Where-Object { ($_ -split '\s+')[-1] -eq $pin.archive })
  if ($match.Count -ne 1 -or ($match[0] -split '\s+')[0] -ne $pin.archiveSha256) { throw 'Official checksum differs from reviewed pin.' }
  if (-not (Test-Path -LiteralPath $archive)) {
    # Partial downloads remain preserved; a mismatch never executes or extracts.
    Invoke-WebRequest -Uri $pin.url -OutFile $archive
  }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.archiveSha256) { throw 'Archive checksum mismatch; file preserved, no extraction.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    foreach ($entry in $zip.Entries) {
      $destination = [IO.Path]::GetFullPath((Join-Path $cache $entry.FullName))
      if (-not $entry.FullName.StartsWith($pin.directory + '/', [StringComparison]::Ordinal) -or
          -not $destination.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path.' }
    }
    [IO.Compression.ZipFileExtensions]::ExtractToDirectory($zip, $cache)
  } finally { $zip.Dispose() }
  if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'Extracted executable differs from reviewed official archive.' }
}
& $exe -e 'console.log(JSON.stringify({node:process.versions.node,undici:process.versions.undici,executable:process.execPath}))'
if ($LASTEXITCODE -ne 0) { throw 'Verified runtime did not start.' }
