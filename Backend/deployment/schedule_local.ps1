$ErrorActionPreference='Stop'
$backendPath=Split-Path -Parent $PSScriptRoot
$pythonPath=Join-Path $backendPath '.venv\Scripts\pythonw.exe'
$jobScript=Join-Path $backendPath 'scripts\local_operations.py'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 90) -Hidden
$specifications=@(
    @{Name='Maintenance';Job='maintenance';Minutes=5},
    @{Name='Backup';Job='backup';Minutes=30},
    @{Name='Probe';Job='probe';Minutes=5}
)
foreach ($item in $specifications) {
    $taskName='LasheoLocal'+$item.Name
    $existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing -and $existing.Description -ne 'Beauty Manager local operation; user-authorized six controls') { throw "Existing task is not owned by this setup: $taskName" }
    $action=New-ScheduledTaskAction -Execute $pythonPath -Argument ('"'+$jobScript+'" --job '+$item.Job) -WorkingDirectory $backendPath
    $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes $item.Minutes)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Beauty Manager local operation; user-authorized six controls' -Force | Out-Null
}
$action=New-ScheduledTaskAction -Execute $pythonPath -Argument ('"'+$jobScript+'" --job restore') -WorkingDirectory $backendPath
$trigger=New-ScheduledTaskTrigger -Daily -At '03:00'
Register-ScheduledTask -TaskName LasheoLocalRestore -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Beauty Manager local operation; user-authorized six controls' -Force | Out-Null
$action=New-ScheduledTaskAction -Execute $pythonPath -Argument ('"'+$jobScript+'" --job startup') -WorkingDirectory $backendPath
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
Register-ScheduledTask -TaskName LasheoLocalStartup -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Beauty Manager local operation; user-authorized six controls' -Force | Out-Null
Get-ScheduledTask -TaskName 'LasheoLocal*' | Select-Object TaskName,State
