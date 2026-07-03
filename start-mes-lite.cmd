@echo off
setlocal
title MES Lite Launcher

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo HATA: npm.cmd bulunamadi. Node.js kurulumunu kontrol edin.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
if errorlevel 1 (
  echo.
  echo HATA: MES Lite servisleri baslatilamadi.
  pause
  exit /b 1
)

echo.
echo Bu pencereyi kapatabilirsiniz. Servisler arka planda calismaya devam eder.
pause
