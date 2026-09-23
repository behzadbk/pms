@echo off
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0runtime\node\node.exe" "%~dp0app\launcher.mjs" stop
timeout /t 3 >nul
