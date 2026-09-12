$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "KAIRO.lnk"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$TargetBat = Join-Path $ScriptDir "Start_KAIRO.bat"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBat
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "KAIRO - Autonomous Resume and Application Agent"
$Shortcut.IconLocation = "shell32.dll,220"
$Shortcut.Save()

Write-Host "SUCCESS: Created Desktop Shortcut for KAIRO on Windows Desktop!"
