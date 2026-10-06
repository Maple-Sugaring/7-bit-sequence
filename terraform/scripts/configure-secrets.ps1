param(
    [string]$Region = 'us-east-1',
    [string]$Hostname = 'ritmaplesugaring.privatedns.org',
    [string]$EnvironmentFile = "$PSScriptRoot/../../Maple-Sugar-BE/.env"
)
$ErrorActionPreference = 'Stop'
$env:AWS_CLI_FILE_ENCODING = 'UTF-8'
$values = [ordered]@{}
foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $EnvironmentFile))) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim()
    }
}
foreach ($name in @('JWT_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GATEWAY_INGEST_TOKEN')) {
    if (-not $values[$name]) { throw "Missing required backend value: $name" }
}
$values['NODE_ENV'] = 'production'
$values['PORT'] = '3000'
$values['PUBLIC_WEB_URL'] = "https://$Hostname"
$values['PUBLIC_API_URL'] = "https://$Hostname/api"
$values['CORS_ORIGINS'] = "https://$Hostname"
$values['TRUST_PROXY_HOPS'] = '2'
# Compose supplies these; omit local database credentials from the uploaded file.
$values.Remove('DATABASE_URL')
$values.Remove('REDIS_URL')
$backend = (($values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n") + "`n"
$parameterPath = '/maple-sugar/production'
$parameters = aws ssm describe-parameters --region $Region --parameter-filters "Key=Name,Option=Equals,Values=$parameterPath/postgres-password" --query 'Parameters[].Name' --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot check existing database parameter' }
$upload = [ordered]@{ 'backend-env' = $backend }
if ($parameters.Count -eq 0) {
    $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $upload['postgres-password'] = [Convert]::ToHexString($bytes)
}
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("maple-parameters-" + [guid]::NewGuid() + '.json')
try {
    [IO.File]::WriteAllText($temporary, '')
    if ($IsWindows) {
        $acl = Get-Acl -LiteralPath $temporary
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow'))
        Set-Acl -LiteralPath $temporary -AclObject $acl
    } else { chmod 600 $temporary }
    foreach ($entry in $upload.GetEnumerator()) {
        $request = @{ Name = "$parameterPath/$($entry.Key)"; Type = 'SecureString'; Value = $entry.Value; Overwrite = $true }
        [IO.File]::WriteAllText($temporary, ($request | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
        aws ssm put-parameter --region $Region --cli-input-json "file://$temporary" --output json | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not store $($entry.Key)" }
        Write-Host "Configured SecureString $parameterPath/$($entry.Key)"
    }
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
}
