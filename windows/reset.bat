@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo This deletes ALL local data (database) and starts fresh with demo data.
set /p ok=Type YES to continue: 
if /I not "%ok%"=="YES" exit /b
"%~dp0runtime\node\node.exe" "%~dp0app\launcher.mjs" reset
pause
