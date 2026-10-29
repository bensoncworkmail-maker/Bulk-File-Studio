@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo Node.js / npm is required. Install the LTS version from https://nodejs.org/
    pause
    exit /b 1
)
if not exist "node_modules\electron" (
    echo Installing dependencies for first use...
    call npm install
    if errorlevel 1 (echo Installation failed. & pause & exit /b 1)
)
call npm start
if errorlevel 1 pause
endlocal
