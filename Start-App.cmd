@echo off
setlocal
echo Developer source launcher. End users should run the Setup or Portable EXE.
cd /d "%~dp0"
call "%~dp0build\ensure-dependencies.cmd" --check-only
if errorlevel 1 (
    echo Dependencies are not ready. Run npm install --include=prod --include=dev and retry.
    pause
    exit /b 1
)
call npm start
if errorlevel 1 pause
endlocal
