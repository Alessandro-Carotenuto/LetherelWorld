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

powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; for($i=0;$i -lt 20;$i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:8765/' -UseBasicParsing -TimeoutSec 1;if($r.StatusCode -eq 200 -and $r.Content -match '<title>La Confraternita'){exit 0}}catch{};Start-Sleep -Milliseconds 250};exit 1" >nul 2>nul
if errorlevel 1 (
  echo Il sito non ha risposto su http://127.0.0.1:8765/.
  echo Controlla che la porta 8765 sia libera e che Python sia avviato correttamente.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8765/#rovere"
