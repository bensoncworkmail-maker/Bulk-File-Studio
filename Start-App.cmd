@echo off
setlocal
echo Developer source launcher. End users should run the Setup or Portable EXE.
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo Node.js / npm is required. Install the LTS version from https://nodejs.org/
    pause
    exit /b 1
)
node -e "process.exit(require('./node_modules/electron/package.json').version===require('./package.json').devDependencies.electron?0:1)" >nul 2>nul
if errorlevel 1 (
    echo Dependencies are missing or outdated. Run npm install during development, then retry.
    echo Dependency setup needs Internet access. The installed app runs offline.
    pause
    exit /b 1
)
call npm start
if errorlevel 1 pause
endlocal
