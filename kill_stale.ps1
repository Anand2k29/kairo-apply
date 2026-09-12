# ── Kill stale KAIRO background listeners ──
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*listen_space_global.ps1*" -or $_.CommandLine -like "*Start_KAIRO*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Cleared stale background KAIRO listener processes."
