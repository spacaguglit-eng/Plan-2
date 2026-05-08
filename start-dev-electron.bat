@echo off
setlocal
cd /d "%~dp0"

echo Перезапуск Electron dev...
call npm run restart:dev:electron
if errorlevel 1 (
  echo.
  echo Не удалось запустить dev режим.
  pause
)
endlocal
