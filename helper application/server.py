#!/usr/bin/env python3
"""
MedInsure Hub — Helper Application Backend Server
FastAPI backend powering the React/Vite GUI with Telegram API & Supabase AI Classifier.
Supports:
  1. Online Mode: Real-time listener and automatic vacancy sorter
  2. Offline Mode: Watermark-driven batch classifier starting from last processed message
  3. Local SQLite database for persistence & classifier audit results
  4. Real-time SSE streaming to the React GUI
"""

import os
import sys
import json
import time
import asyncio
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from telethon import TelegramClient, events
from telethon.tl.types import Channel

# ── Load environment variables ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

TG_API_ID = os.getenv("TG_API_ID")
TG_API_HASH = os.getenv("TG_API_HASH")
TG_PHONE = os.getenv("TG_PHONE")
TG_CHANNEL = os.getenv("TG_CHANNEL", "medical_Insurance_1")
WEBHOOK_URL = os.getenv(
    "WEBHOOK_URL",
    "https://amwesufvpwxxyhgagicy.supabase.co/functions/v1/telegram-webhook"
)
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "Mr@secure!29809292201632")
SESSION_NAME = str(PROJECT_ROOT / "medinsure_session")

# ── Local Database Setup ──
DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "local_cache.db"


def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Settings / Watermark table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Classified messages archive
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            chat_id INTEGER,
            chat_title TEXT,
            date_ts INTEGER,
            text TEXT,
            is_vacancy INTEGER,
            reason TEXT,
            model TEXT,
            status TEXT,
            mode_captured TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    # Activity and error logs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            level TEXT,
            message TEXT,
            details TEXT
        )
    """)

    # Default settings
    defaults = {
        "last_message_id": "0",
        "channel_username": TG_CHANNEL,
        "webhook_url": WEBHOOK_URL,
        "webhook_secret": WEBHOOK_SECRET,
        "auto_sync_supabase": "true",
        "audio_alert_enabled": "true",
    }
    for k, v in defaults.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    conn.commit()
    conn.close()


init_db()


def add_log(level: str, message: str, details: Optional[Dict[str, Any]] = None):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    dt_str = json.dumps(details or {}, ensure_ascii=False)
    cursor.execute(
        "INSERT INTO activity_logs (timestamp, level, message, details) VALUES (?, ?, ?, ?)",
        (now, level, message, dt_str)
    )
    conn.commit()
    conn.close()

    # Broadcast event to SSE subscribers
    broadcast_event("log", {
        "timestamp": now,
        "level": level,
        "message": message,
        "details": details or {}
    })


def get_setting(key: str, default: str = "") -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()


# ── Global State & SSE Broadcaster ──
sse_clients: List[asyncio.Queue] = []
app = FastAPI(title="MedInsure Hub Helper API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AppState:
    online_active: bool = False
    offline_active: bool = False
    offline_cancelled: bool = False
    offline_progress: Dict[str, Any] = {}
    tg_client: Optional[TelegramClient] = None
    channel_entity: Any = None
    user_info: Dict[str, Any] = {}
    online_task: Optional[asyncio.Task] = None
    offline_task: Optional[asyncio.Task] = None

state = AppState()


def broadcast_event(event_type: str, data: Any):
    payload = json.dumps({"type": event_type, "data": data}, ensure_ascii=False)
    message = f"event: {event_type}\ndata: {payload}\n\n"
    for q in list(sse_clients):
        try:
            q.put_nowait(message)
        except Exception:
            pass


# ── Supabase & AI Classifier Webhook Sender ──
def send_to_classifier_webhook(message_id: int, date_ts: int, chat_id: int, chat_title: str, text: str):
    """Sends a Telegram post to the Supabase AI Classifier webhook."""
    webhook_url = get_setting("webhook_url", WEBHOOK_URL)
    webhook_secret = get_setting("webhook_secret", WEBHOOK_SECRET)

    payload = {
        "update_id": int(time.time()),
        "channel_post": {
            "message_id": message_id,
            "date": date_ts,
            "chat": {
                "id": chat_id,
                "title": chat_title,
                "type": "channel"
            },
            "text": text
        }
    }

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "x-telegram-bot-api-secret-token": webhook_secret,
        "User-Agent": "MedInsureHub-Helper/1.0"
    }

    start_time = time.time()
    try:
        res = requests.post(webhook_url, json=payload, headers=headers, timeout=20)
        latency = round((time.time() - start_time) * 1000)
        if res.status_code == 200:
            data = res.json()
            is_vac = True if data.get("stored") == "vacancies" else (False if data.get("skipped") == "not a vacancy" else None)
            reason = data.get("reason", "Vacancy detected" if is_vac else ("Noise filtered" if is_vac is False else "Community/Special"))
            return {
                "success": True,
                "is_vacancy": is_vac,
                "reason": reason,
                "model": "groq-edge-classifier",
                "raw": data,
                "latency_ms": latency
            }
        return {
            "success": False,
            "error": f"HTTP {res.status_code}: {res.text[:100]}",
            "is_vacancy": None,
            "reason": f"Webhook error HTTP {res.status_code}",
            "latency_ms": latency
        }
    except Exception as e:
        latency = round((time.time() - start_time) * 1000)
        return {
            "success": False,
            "error": str(e),
            "is_vacancy": None,
            "reason": f"Connection error: {str(e)[:100]}",
            "latency_ms": latency
        }


def sync_override_to_supabase(msg_id: int, is_vacancy: bool, text: str = "", chat_id: int = -1002698758122):
    """Syncs a manual verdict override to Supabase.
    If is_vacancy is False: deactivates/removes the post from public.vacancies via #close reply command.
    If is_vacancy is True: upserts/restores the post into public.vacancies.
    """
    webhook_url = get_setting("webhook_url", WEBHOOK_URL)
    webhook_secret = get_setting("webhook_secret", WEBHOOK_SECRET)
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "x-telegram-bot-api-secret-token": webhook_secret,
        "User-Agent": "MedInsureHub-Helper/1.0"
    }

    if not is_vacancy:
        # User marked as NOISE -> Deactivate and remove from Supabase vacancies sheet
        # Send "#close" reply command to the webhook:
        # The Supabase Edge Function sets is_active = false in public.vacancies,
        # which immediately hides/removes it from the public vacancies billboard.
        close_payload = {
            "update_id": int(time.time()),
            "channel_post": {
                "message_id": int(time.time()),
                "date": int(time.time()),
                "chat": { "id": chat_id, "type": "channel", "title": "Channel" },
                "text": "#close",
                "reply_to_message": {
                    "message_id": msg_id,
                    "date": int(time.time()),
                    "chat": { "id": chat_id, "type": "channel" }
                }
            }
        }
        try:
            res = requests.post(webhook_url, json=close_payload, headers=headers, timeout=12)
            return {"ok": True, "action": "deactivated_from_sheet", "status": res.status_code, "response": res.text[:120]}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    else:
        # User marked as VACANCY -> Restore/upsert into Supabase vacancies sheet
        vac_payload = {
            "update_id": int(time.time()),
            "channel_post": {
                "message_id": msg_id,
                "date": int(time.time()),
                "chat": { "id": chat_id, "type": "channel", "title": "Channel" },
                "text": text or "Vacancy restored by admin"
            }
        }
        try:
            res = requests.post(webhook_url, json=vac_payload, headers=headers, timeout=12)
            return {"ok": True, "action": "upserted_to_sheet", "status": res.status_code, "response": res.text[:120]}
        except Exception as e:
            return {"ok": False, "error": str(e)}


def store_classified_message(
    msg_id: int,
    chat_id: int,
    chat_title: str,
    date_ts: int,
    text: str,
    verdict: Dict[str, Any],
    mode: str
):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    is_vac_int = None
    if verdict.get("is_vacancy") is True:
        is_vac_int = 1
    elif verdict.get("is_vacancy") is False:
        is_vac_int = 0

    reason = verdict.get("reason", "")
    model = verdict.get("model", "classifier")
    status = "synced" if verdict.get("success") else "failed"

    cursor.execute("""
        INSERT INTO messages (
            id, chat_id, chat_title, date_ts, text,
            is_vacancy, reason, model, status, mode_captured,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            is_vacancy = excluded.is_vacancy,
            reason = excluded.reason,
            model = excluded.model,
            status = excluded.status,
            mode_captured = excluded.mode_captured,
            updated_at = excluded.updated_at
    """, (
        msg_id, chat_id, chat_title, date_ts, text,
        is_vac_int, reason, model, status, mode,
        now, now
    ))
    conn.commit()
    conn.close()

    # Broadcast new message event
    broadcast_event("message_classified", {
        "id": msg_id,
        "chat_id": chat_id,
        "chat_title": chat_title,
        "date_ts": date_ts,
        "text": text,
        "is_vacancy": verdict.get("is_vacancy"),
        "reason": reason,
        "model": model,
        "status": status,
        "mode_captured": mode,
        "updated_at": now
    })


# ── Telegram Client Management ──
async def get_telegram_client() -> TelegramClient:
    if state.tg_client and state.tg_client.is_connected():
        return state.tg_client

    if not TG_API_ID or not TG_API_HASH:
        raise ValueError("Missing TG_API_ID or TG_API_HASH in .env")

    state.tg_client = TelegramClient(SESSION_NAME, int(TG_API_ID), TG_API_HASH)
    await state.tg_client.connect()

    if not await state.tg_client.is_user_authorized():
        raise PermissionError("Telegram session is not authorized. Please authenticate using scripts/telegram_listener.py.")

    me = await state.tg_client.get_me()
    state.user_info = {
        "id": me.id,
        "first_name": getattr(me, "first_name", ""),
        "last_name": getattr(me, "last_name", ""),
        "username": getattr(me, "username", ""),
        "phone": getattr(me, "phone", "")
    }

    # Resolve target channel
    channel_name = get_setting("channel_username", TG_CHANNEL)
    try:
        state.channel_entity = await state.tg_client.get_entity(channel_name)
    except Exception as e:
        add_log("error", f"Could not find channel @{channel_name}: {e}")
        state.channel_entity = None

    return state.tg_client


# ── Mode 1: Online Mode (Real-time Listener) ──
async def start_online_listener():
    client = await get_telegram_client()
    if not state.channel_entity:
        raise ValueError(f"Channel @{get_setting('channel_username', TG_CHANNEL)} could not be resolved.")

    channel_name = get_setting("channel_username", TG_CHANNEL)
    chat_id = state.channel_entity.id
    chat_title = getattr(state.channel_entity, "title", channel_name)

    @client.on(events.NewMessage(chats=state.channel_entity))
    async def new_message_handler(event):
        if not state.online_active:
            return

        msg = event.message
        text = msg.text or msg.message or ""
        if not text.strip():
            return

        msg_id = msg.id
        date_ts = int(msg.date.timestamp()) if msg.date else int(time.time())

        # Update watermark if newer
        current_watermark = int(get_setting("last_message_id", "0"))
        if msg_id > current_watermark:
            set_setting("last_message_id", str(msg_id))
            broadcast_event("watermark_updated", {"last_message_id": msg_id})

        add_log("info", f"🟢 [Online Mode] Incoming post #{msg_id} on @{channel_name}", {
            "msg_id": msg_id,
            "snippet": text.replace("\n", " ")[:60]
        })

        # Send to classifier webhook
        verdict = send_to_classifier_webhook(msg_id, date_ts, chat_id, chat_title, text)

        # Store in local database
        store_classified_message(msg_id, chat_id, chat_title, date_ts, text, verdict, "online")

        is_vac = verdict.get("is_vacancy")
        log_type = "success" if is_vac else ("warning" if is_vac is False else "info")
        add_log(
            log_type,
            f"🎯 [Online Mode] Post #{msg_id} -> {'✅ VACANCY' if is_vac else ('⏸️ NOISE' if is_vac is False else 'ℹ️ SPECIAL')}: {verdict.get('reason')}",
            {"msg_id": msg_id, "verdict": verdict}
        )

    state.online_active = True
    add_log("success", f"🟢 Online Mode Activated: Listening for live posts on @{channel_name}")
    broadcast_event("online_status", {"active": True, "channel": channel_name})


async def stop_online_listener():
    state.online_active = False
    if state.tg_client:
        # Remove event handlers
        state.tg_client.remove_event_handler(None)
    add_log("info", "⚪ Online Mode Stopped: Real-time listener is paused.")
    broadcast_event("online_status", {"active": False})


# ── Mode 2: Offline Mode (Catch-Up Classifier from Watermark) ──
async def run_offline_classifier(from_message_id: int, limit: Optional[int] = None):
    try:
        client = await get_telegram_client()
        if not state.channel_entity:
            raise ValueError("Channel could not be resolved.")

        channel_name = get_setting("channel_username", TG_CHANNEL)
        chat_id = state.channel_entity.id
        chat_title = getattr(state.channel_entity, "title", channel_name)

        state.offline_active = True
        state.offline_cancelled = False

        add_log("info", f"🟠 [Offline Mode] Starting catch-up from message #{from_message_id} on @{channel_name}...")

        # Count or estimate messages to process
        messages = []
        async for msg in client.iter_messages(state.channel_entity, min_id=from_message_id, reverse=True, limit=limit):
            if state.offline_cancelled:
                break
            messages.append(msg)

        total_msgs = len(messages)
        add_log("info", f"🟠 [Offline Mode] Found {total_msgs} message(s) to classify since #{from_message_id}")

        processed_count = 0
        vacancies_count = 0
        noise_count = 0

        state.offline_progress = {
            "active": True,
            "processed": 0,
            "total": total_msgs,
            "vacancies": 0,
            "noise": 0,
            "current_id": from_message_id
        }
        broadcast_event("offline_progress", state.offline_progress)

        for msg in messages:
            if state.offline_cancelled:
                add_log("warning", "🟠 [Offline Mode] Batch processing was paused/cancelled by user.")
                break

            text = msg.text or msg.message or ""
            msg_id = msg.id
            date_ts = int(msg.date.timestamp()) if msg.date else int(time.time())

            if not text.strip():
                # Update watermark anyway
                set_setting("last_message_id", str(msg_id))
                processed_count += 1
                continue

            # Classify
            verdict = send_to_classifier_webhook(msg_id, date_ts, chat_id, chat_title, text)
            store_classified_message(msg_id, chat_id, chat_title, date_ts, text, verdict, "offline")

            # Update the watermark after each message so progress is saved!
            set_setting("last_message_id", str(msg_id))

            is_vac = verdict.get("is_vacancy")
            if is_vac is True:
                vacancies_count += 1
            elif is_vac is False:
                noise_count += 1

            processed_count += 1
            state.offline_progress = {
                "active": True,
                "processed": processed_count,
                "total": total_msgs,
                "vacancies": vacancies_count,
                "noise": noise_count,
                "current_id": msg_id,
                "snippet": text.replace("\n", " ")[:60],
                "verdict": verdict
            }
            broadcast_event("offline_progress", state.offline_progress)
            broadcast_event("watermark_updated", {"last_message_id": msg_id})

            # Gentle pause between requests to respect rate limits
            await asyncio.sleep(0.4)

        state.offline_active = False
        state.offline_progress["active"] = False
        broadcast_event("offline_progress", state.offline_progress)

        add_log(
            "success",
            f"🎉 [Offline Mode] Catch-Up Complete! Processed: {processed_count}/{total_msgs} | Vacancies: {vacancies_count} | Noise: {noise_count}",
            {"processed": processed_count, "vacancies": vacancies_count, "noise": noise_count}
        )

    except Exception as e:
        state.offline_active = False
        add_log("error", f"❌ [Offline Mode] Error during batch classification: {e}")
        broadcast_event("offline_progress", {"active": False, "error": str(e)})


# ── FastAPI Endpoints ──

@app.on_event("startup")
async def startup_event():
    try:
        client = await get_telegram_client()
        # If watermark is 0, initialize to latest message id
        current_watermark = int(get_setting("last_message_id", "0"))
        if current_watermark == 0 and state.channel_entity:
            latest = await client.get_messages(state.channel_entity, limit=1)
            if latest:
                latest_id = latest[0].id
                set_setting("last_message_id", str(latest_id))
                add_log("info", f"Initialized watermark last_message_id to latest channel post #{latest_id}")
    except Exception as e:
        add_log("warning", f"Telegram startup note: {e}")


@app.get("/api/status")
async def get_status():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM messages")
    total_messages = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as count FROM messages WHERE is_vacancy = 1")
    vacancies_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM messages WHERE is_vacancy = 0")
    noise_count = cursor.fetchone()["count"]
    conn.close()

    watermark = int(get_setting("last_message_id", "0"))
    channel_name = get_setting("channel_username", TG_CHANNEL)

    return {
        "online_active": state.online_active,
        "offline_active": state.offline_active,
        "offline_progress": state.offline_progress,
        "last_message_id": watermark,
        "channel_username": channel_name,
        "channel_title": getattr(state.channel_entity, "title", channel_name) if state.channel_entity else channel_name,
        "telegram_user": state.user_info,
        "total_messages": total_messages,
        "vacancies_count": vacancies_count,
        "noise_count": noise_count,
        "webhook_url": get_setting("webhook_url", WEBHOOK_URL),
    }


@app.post("/api/mode/online/start")
async def api_start_online():
    if state.online_active:
        return {"ok": True, "message": "Online listener already active"}
    try:
        await start_online_listener()
        return {"ok": True, "message": "Online mode activated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mode/online/stop")
async def api_stop_online():
    await stop_online_listener()
    return {"ok": True, "message": "Online mode stopped"}


class OfflineStartRequest(BaseModel):
    from_message_id: Optional[int] = None
    limit: Optional[int] = None


@app.post("/api/mode/offline/start")
async def api_start_offline(req: OfflineStartRequest, background_tasks: BackgroundTasks):
    if state.offline_active:
        return {"ok": False, "message": "Offline classification is already running"}

    start_id = req.from_message_id
    if start_id is None:
        start_id = int(get_setting("last_message_id", "0"))

    # Spawn background task
    asyncio.create_task(run_offline_classifier(start_id, req.limit))
    return {
        "ok": True,
        "message": f"Offline mode started from message #{start_id}",
        "from_message_id": start_id,
        "limit": req.limit
    }


@app.post("/api/mode/offline/stop")
async def api_stop_offline():
    state.offline_cancelled = True
    return {"ok": True, "message": "Offline classifier stop requested"}


@app.get("/api/messages")
async def list_messages(
    search: Optional[str] = Query(None),
    verdict: Optional[str] = Query("all"),  # all | vacancy | noise | pending
    mode: Optional[str] = Query("all"),     # all | online | offline
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200)
):
    conn = get_db()
    cursor = conn.cursor()

    conditions = []
    params = []

    if search and search.strip():
        conditions.append("(text LIKE ? OR reason LIKE ?)")
        params.extend([f"%{search.strip()}%", f"%{search.strip()}%"])

    if verdict == "vacancy":
        conditions.append("is_vacancy = 1")
    elif verdict == "noise":
        conditions.append("is_vacancy = 0")
    elif verdict == "pending":
        conditions.append("is_vacancy IS NULL")

    if mode in ["online", "offline"]:
        conditions.append("mode_captured = ?")
        params.append(mode)

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Count total
    cursor.execute(f"SELECT COUNT(*) as total FROM messages {where_sql}", params)
    total = cursor.fetchone()["total"]

    # Select page
    offset = (page - 1) * page_size
    cursor.execute(
        f"SELECT * FROM messages {where_sql} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [page_size, offset]
    )
    rows = cursor.fetchall()
    conn.close()

    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "chat_id": r["chat_id"],
            "chat_title": r["chat_title"],
            "date_ts": r["date_ts"],
            "text": r["text"],
            "is_vacancy": True if r["is_vacancy"] == 1 else (False if r["is_vacancy"] == 0 else None),
            "reason": r["reason"],
            "model": r["model"],
            "status": r["status"],
            "mode_captured": r["mode_captured"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1
    }


@app.get("/api/messages/{msg_id}")
async def get_message(msg_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    return {
        "id": row["id"],
        "chat_id": row["chat_id"],
        "chat_title": row["chat_title"],
        "date_ts": row["date_ts"],
        "text": row["text"],
        "is_vacancy": True if row["is_vacancy"] == 1 else (False if row["is_vacancy"] == 0 else None),
        "reason": row["reason"],
        "model": row["model"],
        "status": row["status"],
        "mode_captured": row["mode_captured"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }


@app.post("/api/messages/{msg_id}/reclassify")
async def reclassify_message(msg_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")

    verdict = send_to_classifier_webhook(
        row["id"], row["date_ts"], row["chat_id"], row["chat_title"], row["text"]
    )
    store_classified_message(
        row["id"], row["chat_id"], row["chat_title"], row["date_ts"], row["text"],
        verdict, row["mode_captured"] or "manual"
    )
    add_log("info", f"🔄 Re-classified message #{msg_id} -> {verdict.get('reason')}")
    return {"ok": True, "verdict": verdict}


class OverrideRequest(BaseModel):
    is_vacancy: bool
    reason: Optional[str] = "Manual admin override"


@app.post("/api/messages/{msg_id}/override")
async def override_verdict(msg_id: int, req: OverrideRequest):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    # Fetch existing message details for Supabase sync
    cursor.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
    existing = cursor.fetchone()

    cursor.execute("""
        UPDATE messages
        SET is_vacancy = ?, reason = ?, model = 'manual-override', status = 'manual', updated_at = ?
        WHERE id = ?
    """, (1 if req.is_vacancy else 0, req.reason, now, msg_id))
    conn.commit()
    conn.close()

    # Sync verdict change to Supabase:
    # If False (Noise): removes/deactivates from public.vacancies
    # If True (Vacancy): upserts/restores to public.vacancies
    chat_id = existing["chat_id"] if existing and existing["chat_id"] else -1002698758122
    text = existing["text"] if existing and existing["text"] else ""
    sync_result = sync_override_to_supabase(msg_id, req.is_vacancy, text, chat_id)

    status_desc = "VACANCY (synced to Supabase sheet)" if req.is_vacancy else "NOISE (deactivated from Supabase sheet)"
    add_log("info", f"✏️ Overrode post #{msg_id} -> {status_desc}", {"supabase_sync": sync_result})
    broadcast_event("message_updated", {
        "id": msg_id, 
        "is_vacancy": req.is_vacancy, 
        "reason": req.reason,
        "supabase_sync": sync_result
    })
    return {"ok": True, "supabase_sync": sync_result}



class WatermarkRequest(BaseModel):
    last_message_id: int


@app.get("/api/watermark")
async def get_watermark():
    val = int(get_setting("last_message_id", "0"))
    return {"last_message_id": val}


@app.post("/api/watermark")
async def set_watermark(req: WatermarkRequest):
    set_setting("last_message_id", str(req.last_message_id))
    add_log("info", f"📌 Watermark updated to message #{req.last_message_id}")
    broadcast_event("watermark_updated", {"last_message_id": req.last_message_id})
    return {"ok": True, "last_message_id": req.last_message_id}


@app.get("/api/logs")
async def get_logs(limit: int = 50):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()

    logs = []
    for r in rows:
        try:
            details = json.loads(r["details"]) if r["details"] else {}
        except Exception:
            details = {}
        logs.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "level": r["level"],
            "message": r["message"],
            "details": details
        })
    return {"logs": logs}


class TestClassifyRequest(BaseModel):
    text: str


@app.post("/api/test-classify")
async def test_classify(req: TestClassifyRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    res = send_to_classifier_webhook(
        99999999, int(time.time()), -1002698758122, "Test Sandbox", req.text
    )
    return res


@app.get("/api/export")
async def export_data(format: str = Query("json")):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()

    data = [dict(r) for r in rows]
    if format == "csv":
        import io, csv
        output = io.StringIO()
        if data:
            writer = csv.DictWriter(output, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=medinsure_classified.csv"}
        )
    return JSONResponse(data)


@app.get("/api/settings")
async def get_settings_endpoint():
    return {
        "channel_username": get_setting("channel_username", TG_CHANNEL),
        "webhook_url": get_setting("webhook_url", WEBHOOK_URL),
        "webhook_secret": get_setting("webhook_secret", WEBHOOK_SECRET),
        "auto_sync_supabase": get_setting("auto_sync_supabase", "true") == "true",
        "last_message_id": int(get_setting("last_message_id", "0")),
    }


class UpdateSettingsRequest(BaseModel):
    channel_username: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    auto_sync_supabase: Optional[bool] = None
    last_message_id: Optional[int] = None


@app.post("/api/settings")
async def update_settings_endpoint(req: UpdateSettingsRequest):
    if req.channel_username is not None:
        set_setting("channel_username", req.channel_username)
    if req.webhook_url is not None:
        set_setting("webhook_url", req.webhook_url)
    if req.webhook_secret is not None:
        set_setting("webhook_secret", req.webhook_secret)
    if req.auto_sync_supabase is not None:
        set_setting("auto_sync_supabase", "true" if req.auto_sync_supabase else "false")
    if req.last_message_id is not None:
        set_setting("last_message_id", str(req.last_message_id))

    add_log("info", "⚙️ Application settings updated")
    return {"ok": True}


# ── Server-Sent Events (SSE) Stream ──
@app.get("/api/events")
async def sse_endpoint(request: Request):
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        sse_clients.append(queue)
        try:
            # Send initial ping
            yield "event: connected\ndata: {\"status\":\"connected\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield data
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat
                    yield ": ping\n\n"
        finally:
            if queue in sse_clients:
                sse_clients.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


if __name__ == "__main__":
    import uvicorn
    print("\n🚀 Starting MedInsure Hub Helper Backend on http://127.0.0.1:8765...")
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
