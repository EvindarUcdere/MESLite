@echo off
setlocal
title MES Lite Launcher

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo HATA: npm.cmd bulunamadi. Node.js kurulumunu kontrol edin.
  pause
  exit /b 1
)

if not exist "%~dp0backend\package.json" (
  echo HATA: backend klasoru bulunamadi.
  pause
  exit /b 1
)

echo MES Lite servisleri baslatiliyor...
start "MES Lite Backend" /D "%~dp0backend" cmd.exe /k npm.cmd run dev
start "MES Lite Web" /D "%~dp0web" cmd.exe /k npm.cmd run dev -- --host 0.0.0.0
start "MES Lite Expo" /D "%~dp0mobile" cmd.exe /k npm.cmd run phone

echo.
echo Uc terminal acildi. Bu pencereyi kapatabilirsiniz.
echo Backend: http://localhost:4000
echo Web:     http://localhost:5173
echo Expo:    exp://10.103.7.51:8081
pause
