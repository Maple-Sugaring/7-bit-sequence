param([string]$Container = 'maple-sugar-db-1', [string]$Output = "$PSScriptRoot/../.local/source.dump")
$ErrorActionPreference = 'Stop'
$dump = '/tmp/maple-migration-' + [guid]::NewGuid().ToString('N') + '.dump'
$destination = [IO.Path]::GetFullPath($Output)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
try {
    # pg_dump uses one consistent snapshot; docker cp preserves binary bytes on Windows.
    docker exec $Container pg_dump -U maple -d maple_sugaring -Fc -f $dump
    if ($LASTEXITCODE -ne 0) { throw 'Local database snapshot failed' }
    docker cp "${Container}:$dump" $destination
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy database dump' }
    Write-Host "Database snapshot saved to $destination"
} finally { docker exec $Container rm -f $dump | Out-Null }
