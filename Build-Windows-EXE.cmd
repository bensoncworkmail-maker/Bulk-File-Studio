@echo off
setlocal
echo Developer build tool. Node.js and npm are only required on the build PC.
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
call npm run dist:win
if errorlevel 1 (echo Build failed. & pause & exit /b 1)
echo.
echo Build complete! EXE files are in the dist folder.
echo Installer: BulkFileStudio-Setup-VERSION-ARCH.exe
echo Portable:  BulkFileStudio-Portable-VERSION-ARCH.exe
echo Distribute these EXEs to users. Node.js and npm are not required on user PCs.
pause
endlocal
