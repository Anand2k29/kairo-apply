@echo off
title 🤖 KAIRO Background Listener
cd /d "%~dp0"
echo.
echo  ===================================================================
echo    🤖 KAIRO Continuous Global Voice ^& 3x Spacebar Listener
echo  ===================================================================
echo.
echo  Listening in background for "Hello KAIRO" or 3x Rapid Spacebar...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0listen_space_global.ps1"
pause
