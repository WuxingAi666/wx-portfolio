@echo off
setlocal
cd /d "%~dp0.."
if exist "backend\.venv\Scripts\python.exe" goto default_python
if exist "D:\jiqixuexi\python.exe" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\start-local.ps1" -PythonExe "D:\jiqixuexi\python.exe"
  goto finished
)
:default_python
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\start-local.ps1"
:finished
pause
