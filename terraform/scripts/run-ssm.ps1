param([Parameter(Mandatory)][string]$InstanceId, [Parameter(Mandatory)][string]$Command, [string]$Region = 'us-east-1')
$ErrorActionPreference = 'Stop'
$env:AWS_CLI_FILE_ENCODING = 'UTF-8'
$env:AWS_CLI_OUTPUT_ENCODING = 'UTF-8'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("maple-command-" + [guid]::NewGuid() + '.json')
try {
    $request = @{ InstanceIds = @($InstanceId); DocumentName = 'AWS-RunShellScript'; TimeoutSeconds = 1200; Parameters = @{ commands = @($Command); executionTimeout = @('1200') } }
    [IO.File]::WriteAllText($temporary, ($request | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    $commandId = aws ssm send-command --region $Region --cli-input-json "file://$temporary" --query Command.CommandId --output text
    if ($LASTEXITCODE -ne 0) { throw 'SSM command submission failed' }
    Write-Host "SSM command: $commandId"
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        Start-Sleep -Seconds 10
        $response = aws ssm get-command-invocation --region $Region --command-id $commandId --instance-id $InstanceId --output json 2>$null
        if ($LASTEXITCODE -ne 0) { continue }
        $invocation = $response | ConvertFrom-Json
        if ($invocation.Status -in @('Pending','InProgress','Delayed')) { continue }
        Write-Host $invocation.StandardOutputContent
        Write-Host $invocation.StandardErrorContent
        if ($invocation.Status -ne 'Success') { throw "SSM command ended with $($invocation.Status)" }
        return
    }
    throw 'SSM command did not complete within 20 minutes'
} finally { Remove-Item -LiteralPath $temporary }
