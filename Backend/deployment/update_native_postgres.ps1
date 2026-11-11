param([switch]$Apply,[switch]$RotateAdministrator)
$ErrorActionPreference='Stop'
$backendPath=Split-Path -Parent $PSScriptRoot
$privateRoot=Join-Path $env:USERPROFILE '.codex\lasheo-private'
$packageRoot=Join-Path $privateRoot 'engine-update\18.6'
$packageInfo=Get-Content -LiteralPath (Join-Path $privateRoot 'engine-update\package.json') -Raw | ConvertFrom-Json
$stageReport=Get-Content -LiteralPath (Join-Path $backendPath 'backups\six-controls-native-engine-stage.json') -Raw | ConvertFrom-Json
if ($stageReport.suite_exit_code -ne 0 -or $stageReport.isolated_native_postgres -ne '18.6') { throw 'Native isolated suite must pass before upgrade.' }
$service=Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-18'"
$oldPath=$service.PathName
$oldExecutable=[regex]::Match($oldPath,'^"([^"]+)"').Groups[1].Value
if ($oldExecutable -eq 'C:\Program Files\PostgreSQL\18-lasheo-18.6\bin\pg_ctl.exe') {
    @{AlreadyActivated=$true;Version='18.6';ChangesApplied=$false} | ConvertTo-Json
    return
}
$oldInstall=Split-Path -Parent (Split-Path -Parent $oldExecutable)
$dataPath=Join-Path $oldInstall 'data'
if ([IO.Path]::GetFullPath($oldInstall) -ne 'C:\Program Files\PostgreSQL\18') { throw 'Unexpected installed path; review service configuration.' }
$newInstall='C:\Program Files\PostgreSQL\18-lasheo-18.6'
$newExecutable=Join-Path $newInstall 'bin\pg_ctl.exe'
$newPath='"'+$newExecutable+'"'+$oldPath.Substring($oldPath.IndexOf('"',1)+1)
$description=[PSCustomObject]@{Service=$service.Name;Installed='18.3';Target='18.6';PreservedDataDirectory=$dataPath;PlannedServiceExecutable=$newExecutable;ExistingDatabases=4;RequiresSharedDowntime=$true;RotateSharedAdministrator=[bool]$RotateAdministrator;Apply=[bool]$Apply;Source=$packageInfo.source;SHA256=$packageInfo.sha256}
$description | ConvertTo-Json
if (-not $Apply) { return }
if ($env:LASHEO_SHARED_ENGINE_UPGRADE_APPROVED -ne 'True') { throw 'Explicit approval for shared service downtime is required.' }
$backupRoot=Join-Path $privateRoot ('engine-update\before-service-'+(Get-Date -Format 'yyyyMMddTHHmmss'))
$backupFull=[IO.Path]::GetFullPath($backupRoot)
if (-not $backupFull.StartsWith([IO.Path]::GetFullPath($privateRoot)+[IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe cold-backup target.' }
if (Test-Path -LiteralPath $newInstall) {
    $stagedHash=(Get-FileHash -LiteralPath (Join-Path $newInstall 'bin\postgres.exe') -Algorithm SHA256).Hash
    $expectedHash=(Get-FileHash -LiteralPath (Join-Path $packageRoot 'bin\postgres.exe') -Algorithm SHA256).Hash
    if ($stagedHash -ne $expectedHash) { throw 'Staged installation differs from verified package; do not overwrite.' }
}
if (Get-ChildItem -LiteralPath $dataPath -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'External tablespaces/reparse paths need a separate backup plan.' }
New-Item -ItemType Directory -Path $backupRoot | Out-Null
$description | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot 'plan.json') -Encoding UTF8
$oldPath | Set-Content -LiteralPath (Join-Path $backupRoot 'service-path-before.txt') -Encoding UTF8
# Side-by-side program files, preserving the original binaries and configuration in full.
if (-not (Test-Path -LiteralPath $newInstall)) { Copy-Item -LiteralPath $packageRoot -Destination $newInstall -Recurse }
$nativeVersion=& (Join-Path $newInstall 'bin\postgres.exe') --version
if ($nativeVersion -ne 'postgres (PostgreSQL) 18.6') { throw 'Unexpected staged executable version.' }
$tasks=Get-ScheduledTask -TaskName 'LasheoLocal*' | Where-Object { $_.Settings.Enabled }
$tasks | Disable-ScheduledTask | Out-Null
$pathChanged=$false
try {
    & (Join-Path $backendPath '.venv\Scripts\python.exe') (Join-Path $backendPath 'scripts\local_operations.py') --job backup
    if ($LASTEXITCODE -ne 0) { throw 'Fresh encrypted backup failed.' }
    & (Join-Path $backendPath '.venv\Scripts\python.exe') (Join-Path $backendPath 'scripts\local_operations.py') --job restore
    if ($LASTEXITCODE -ne 0) { throw 'Fresh backup restore/role validation failed.' }
    Stop-Service -Name $service.Name
    # Cold copy includes all databases, roles and configuration; no live source folder is deleted or moved.
    Copy-Item -LiteralPath $dataPath -Destination (Join-Path $backupRoot 'data-cold') -Recurse
    $changed=Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$newPath}
    if ($changed.ReturnValue -ne 0) { throw 'Service path change failed.' }
    $pathChanged=$true
    Start-Service -Name $service.Name
    & (Join-Path $backendPath '.venv\Scripts\python.exe') (Join-Path $backendPath 'scripts\verify_engine_update.py')
    if ($LASTEXITCODE -ne 0) { throw 'Post-update validation failed; restore original binary path.' }
    if ($RotateAdministrator) {
        if ($env:LASHEO_SHARED_ADMIN_ROTATION_APPROVED -ne 'True') { throw 'Shared administrator rotation approval is required.' }
        & (Join-Path $backendPath '.venv\Scripts\python.exe') (Join-Path $backendPath 'scripts\rotate_shared_owner.py') --apply
        if ($LASTEXITCODE -ne 0) { throw 'Administrator rotation needs review; new credential is retained only in private storage.' }
    }
    foreach ($purpose in @('runtime','backup','restore')) {
        $envFile=Join-Path $privateRoot ('local-operation\'+$purpose+'-windows.env')
        Add-Content -LiteralPath $envFile -Value ('PG_BIN='+ (Join-Path $newInstall 'bin')) -Encoding UTF8
    }
    Write-Output 'Native PostgreSQL18.6 activated; source data and original binaries retained.'
} catch {
    if ($pathChanged) {
        Stop-Service -Name $service.Name -ErrorAction SilentlyContinue
        $current=Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-18'"
        Invoke-CimMethod -InputObject $current -MethodName Change -Arguments @{PathName=$oldPath} | Out-Null
    }
    Start-Service -Name $service.Name -ErrorAction SilentlyContinue
    throw
} finally {
    $tasks | Enable-ScheduledTask | Out-Null
}
