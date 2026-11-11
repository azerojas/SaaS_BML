$ErrorActionPreference='Stop'
$backendPath=Split-Path -Parent $PSScriptRoot
$privatePath=Join-Path $env:USERPROFILE '.codex\lasheo-private\engine-update'
$resultPath=Join-Path $privatePath 'elevated-result.json'
Start-Transcript -Path (Join-Path $privatePath 'maintenance-transcript.log') -Append | Out-Null
try {
    Set-Location -LiteralPath $backendPath
    $env:LASHEO_SHARED_ENGINE_UPGRADE_APPROVED='True'
    $env:LASHEO_SHARED_ADMIN_ROTATION_APPROVED='True'
    & (Join-Path $PSScriptRoot 'update_native_postgres.ps1') -Apply -RotateAdministrator
    @{Completed=$true;ExitCode=0;At=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
    @{Completed=$false;ExitCode=1;ErrorType=$_.Exception.GetType().Name;At=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
    Write-Error $_
} finally {
    Remove-Item Env:LASHEO_SHARED_ENGINE_UPGRADE_APPROVED -ErrorAction SilentlyContinue
    Remove-Item Env:LASHEO_SHARED_ADMIN_ROTATION_APPROVED -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
}
