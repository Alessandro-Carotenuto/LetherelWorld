@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -Command "try{$a=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/ambience' -TimeoutSec 1;if($a.version -eq 5){exit 0};exit 2}catch{exit 1}" >nul 2>nul
if %errorlevel%==0 goto open_site
if %errorlevel%==2 (
  echo Un vecchio server LetherelWorld occupa la porta 8765. Chiudilo e riprova.
  pause
  exit /b 1
)

where python >nul 2>nul
if not errorlevel 1 (
  start "" /min python local-admin\music-dashboard\server.py
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python non trovato. Installa Python 3 per aprire il sito in locale.
    pause
    exit /b 1
  )
  start "" /min py -3 local-admin\music-dashboard\server.py
)

powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; for($i=0;$i -lt 20;$i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:8765/' -UseBasicParsing -TimeoutSec 1;if($r.StatusCode -eq 200 -and $r.Content -match '<title>La Confraternita'){$a=Invoke-WebRequest -Uri 'http://127.0.0.1:8765/api/ambience' -UseBasicParsing -TimeoutSec 1;if(($a.Content | ConvertFrom-Json).version -eq 5){exit 0}}}catch{};Start-Sleep -Milliseconds 250};exit 1" >nul 2>nul
if errorlevel 1 (
  echo Il server LetherelWorld non ha risposto su http://127.0.0.1:8765/.
  echo Chiudi eventuali vecchi server sulla porta 8765 e riprova.
  pause
  exit /b 1
)

:open_site
start "" "http://127.0.0.1:8765/#rovere"
