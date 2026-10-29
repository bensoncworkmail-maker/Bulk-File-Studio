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
    call npm install
    if errorlevel 1 (echo Installation failed. & pause & exit /b 1)
)
call npm run dist:win
if errorlevel 1 (echo Build failed. & pause & exit /b 1)
echo.
echo Build complete! EXE files are in the dist folder.
pause
endlocal
