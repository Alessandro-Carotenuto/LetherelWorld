@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if not errorlevel 1 (
  start "" /min python -m http.server 8765 --bind 127.0.0.1
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python non trovato. Installa Python 3 per aprire il sito in locale.
    pause
    exit /b 1
  )
  start "" /min py -m http.server 8765 --bind 127.0.0.1
)

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/#rovere"
