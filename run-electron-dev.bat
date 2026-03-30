@echo off
setlocal
cd /d "%~dp0"

REM strictPort: Vite не переключается на 3001 — если порт занят старым Vite, освобождаем его.
echo Проверка порта 3000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} }"

REM Один Vite (порт 3000) + один Electron.
call npm run dev:electron
if errorlevel 1 (
  echo.
  echo Если снова «Port 3000 is already in use» — закрой другие окна dev или заверши процесс node.exe в диспетчере задач.
  pause
)
endlocal
