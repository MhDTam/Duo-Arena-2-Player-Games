@echo off
title Duo Arena server
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm install || goto :err
)
echo Building the game client...
call npm run build || goto :err
echo.
echo ==================================================
echo  Duo Arena server is starting on port 8080
echo  On this PC open:  http://localhost:8080
echo  On your phone (same Wi-Fi), Settings - Game server:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo     %%a:8080
echo ==================================================
echo.
node server\index.js
pause
exit /b
:err
echo Something went wrong - see the message above.
pause
