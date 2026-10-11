@echo off
chcp 65001 >nul
title MedInsure Hub — AI Classifier Helper App
echo ===============================================================
echo   MedInsure Hub — Telegram AI Vacancy Classifier Helper App
echo   Online Mode (Live Sorter) ^| Offline Mode (Watermark Catch-Up)
echo ===============================================================
echo.

set "NODE_DIR=C:\Users\mrbys\AppData\Local\Programs\nodejs"
if exist "%NODE_DIR%" (
    set "PATH=%NODE_DIR%;%PATH%"
)

cd /d "%~dp0"

echo [1/3] Checking Python virtual environment...
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Python .venv not found!
    pause
    exit /b 1
)

echo [2/3] Starting Helper Backend Server (FastAPI on http://127.0.0.1:8765)...
start "MedInsure Helper Backend" /min cmd /c "cd /d "%~dp0" && .venv\Scripts\python.exe "helper application\server.py""

echo [3/3] Starting React Vite Frontend (http://localhost:5173)...
cd "helper application"
start "MedInsure Helper Frontend" cmd /c "npm run dev -- --host"

timeout /t 3 /nobreak >nul
echo.
echo ===============================================================
echo  Application is running!
echo  Open your browser at: http://localhost:5173
echo ===============================================================
start http://localhost:5173
