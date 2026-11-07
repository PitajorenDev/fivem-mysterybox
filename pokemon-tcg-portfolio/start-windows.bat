@echo off
rem Dubbelklik om de TCG Portfolio app te starten op Windows.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is niet geinstalleerd. Download de LTS-versie via https://nodejs.org en start dit bestand opnieuw.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Eerste keer: onderdelen installeren...
  call npm install || (pause & exit /b 1)
)
echo App bouwen...
call npm run build || (pause & exit /b 1)
start "" http://localhost:3001
echo.
echo De app draait. Laat dit venster open; sluit het om de app te stoppen.
node server/index.js
pause
