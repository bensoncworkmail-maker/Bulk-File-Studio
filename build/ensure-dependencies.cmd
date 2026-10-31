@echo off
setlocal
cd /d "%~dp0.."
where node.exe >nul 2>nul
if errorlevel 1 (
    echo Node.js is required on the build PC. Install Node.js LTS from https://nodejs.org/
    exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo npm is required on the build PC. Install Node.js LTS from https://nodejs.org/
    exit /b 1
)
node build\check-dependencies.js
if not errorlevel 1 exit /b 0
if /i "%~1"=="--check-only" exit /b 1
echo.
echo Installing the production and build dependencies declared in package.json...
echo This developer setup step may need Internet access. The installed app still runs offline.
call npm install --include=prod --include=dev
if errorlevel 1 (
    echo Dependency installation failed. See the npm error above; the build has not started.
    exit /b 1
)
node build\check-dependencies.js
exit /b %errorlevel%
