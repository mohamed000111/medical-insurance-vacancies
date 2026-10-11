@echo off
title MedInsure Hub - Backfill Jobs from Telegram
echo ===================================================
echo   MedInsure Hub - Backfilling last 50 jobs
echo ===================================================
.\.venv\Scripts\python scripts\telegram_listener.py --backfill 50
pause
