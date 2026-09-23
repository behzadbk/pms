@echo off
chcp 65001 >nul
title Hamin PMS
cd /d "%~dp0"
rem  To change the web port, remove "rem" from the next line:
rem set PMS_PORT=8090
"%~dp0runtime\node\node.exe" "%~dp0app\launcher.mjs" start
echo.
pause
