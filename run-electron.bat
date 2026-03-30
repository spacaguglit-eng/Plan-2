@echo off
setlocal
cd /d "%~dp0"

REM Сборка + один процесс Electron (без Vite). Повторный запуск — то же окно (single instance в main.js).
call npm run build
if errorlevel 1 (
  echo Сборка не удалась.
  exit /b 1
)
call npm run electron
endlocal
