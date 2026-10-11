@echo off
chcp 65001 >nul
title MedInsure Helper Launcher
set "NODE_DIR=C:\Users\mrbys\AppData\Local\Programs\nodejs"
if exist "%NODE_DIR%" (
    set "PATH=%NODE_DIR%;%PATH%"
)
cd /d "%~dp0\.."
call run_helper.bat
