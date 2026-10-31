@echo off
setlocal
echo Developer build tool. Node.js and npm are only required on the build PC.
cd /d "%~dp0"
call "%~dp0build\ensure-dependencies.cmd"
if errorlevel 1 (
    echo Dependency setup did not complete. Fix the error above and retry.
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
