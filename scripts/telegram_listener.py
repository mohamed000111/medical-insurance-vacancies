#!/usr/bin/env python3
"""
MedInsure Hub — Telegram Channel Listener & Backfiller
Listens to public Telegram channels and pushes posts to the Supabase AI Classifier webhook.
"""

import os
import sys
import time
import argparse
import asyncio
import requests
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from telethon import TelegramClient, events
from telethon.tl.types import Channel

# Load environment variables from .env
load_dotenv()

API_ID = os.getenv("TG_API_ID")
API_HASH = os.getenv("TG_API_HASH")
PHONE = os.getenv("TG_PHONE")
CHANNEL_USERNAME = os.getenv("TG_CHANNEL", "medical_Insurance_1")
WEBHOOK_URL = os.getenv(
    "WEBHOOK_URL",
    "https://amwesufvpwxxyhgagicy.supabase.co/functions/v1/telegram-webhook"
)
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "Mr@secure!29809292201632")
SESSION_NAME = "medinsure_session"


def send_to_webhook(message_id: int, date_timestamp: int, chat_id: int, chat_title: str, text: str):
    """Sends a Telegram message payload to the Supabase webhook."""
    if not text or not text.strip():
        return {"skipped": "empty text"}

    payload = {
        "update_id": int(time.time()),
        "channel_post": {
            "message_id": message_id,
            "date": date_timestamp,
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
        "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
        "User-Agent": "MedInsureHub-Listener/1.0"
    }

    try:
        res = requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=15)
        if res.status_code == 200:
            return res.json()
        return {"error": f"HTTP {res.status_code}: {res.text[:120]}"}
    except Exception as e:
        return {"error": str(e)}


async def run_backfill(client: TelegramClient, channel_entity, limit: int):
    """Fetches the latest N messages from the channel and sends them to the webhook."""
    print(f"\n🚀 Fetching the last {limit} posts from @{CHANNEL_USERNAME}...")
    chat_id = channel_entity.id
    chat_title = getattr(channel_entity, "title", CHANNEL_USERNAME)

    count_stored = 0
    count_skipped = 0
    count_empty = 0

    # Fetch in chronological order (oldest first up to newest)
    messages = []
    async for msg in client.iter_messages(channel_entity, limit=limit):
        messages.append(msg)
    messages.reverse()

    for i, msg in enumerate(messages, 1):
        text = msg.text or msg.message or ""
        if not text.strip():
            count_empty += 1
            continue

        date_ts = int(msg.date.timestamp()) if msg.date else int(time.time())
        snippet = text.replace("\n", " ")[:60]

        print(f"[{i}/{len(messages)}] Post #{msg.id}: \"{snippet}...\"", end=" → ")
        result = send_to_webhook(msg.id, date_ts, chat_id, chat_title, text)

        if result.get("stored"):
            print(f"✅ STORED (Vacancy)")
            count_stored += 1
        elif result.get("skipped") == "not a vacancy":
            reason = result.get("reason", "Filtered")
            print(f"⏸️ SKIPPED (Noise: {reason})")
            count_skipped += 1
        elif result.get("closed"):
            print(f"🔒 CLOSED")
        else:
            print(f"ℹ️ {result}")

        # Gentle pause between requests to be nice to API
        await asyncio.sleep(0.5)

    print("\n" + "=" * 50)
    print(f"🎉 Backfill Complete!")
    print(f"   • Real Vacancies Stored: {count_stored}")
    print(f"   • Noise/Greetings Skipped: {count_skipped}")
    print(f"   • Empty/Media Skipped: {count_empty}")
    print("=" * 50 + "\n")


async def run_listener(client: TelegramClient, channel_entity):
    """Listens in real-time for new messages published to the channel."""
    chat_id = channel_entity.id
    chat_title = getattr(channel_entity, "title", CHANNEL_USERNAME)

    print(f"\n📡 LIVE LISTENER ACTIVE on @{CHANNEL_USERNAME}")
    print("   Waiting for new posts... (Press Ctrl+C to stop)\n")

    @client.on(events.NewMessage(chats=channel_entity))
    async def handler(event):
        msg = event.message
        text = msg.text or msg.message or ""
        if not text.strip():
            return

        snippet = text.replace("\n", " ")[:70]
        date_ts = int(msg.date.timestamp()) if msg.date else int(time.time())
        print(f"⚡ New Post #{msg.id}: \"{snippet}...\"")

        result = send_to_webhook(msg.id, date_ts, chat_id, chat_title, text)
        if result.get("stored"):
            print(f"   ↳ ✅ STORED on Website as Vacancy!")
        elif result.get("skipped"):
            print(f"   ↳ ⏸️ SKIPPED ({result.get('skipped')}: {result.get('reason', '')})")
        else:
            print(f"   ↳ ℹ️ Webhook result: {result}")

    await client.run_until_disconnected()


async def main():
    parser = argparse.ArgumentParser(description="MedInsure Hub Telegram Listener & Backfiller")
    parser.add_argument("--backfill", type=int, default=0, help="Number of past posts to backfill (e.g. 30)")
    parser.add_argument("--listen", action="store_true", help="Start real-time listener (default if no backfill)")
    args = parser.parse_args()

    if not API_ID or not API_HASH:
        print("\n❌ Missing TG_API_ID or TG_API_HASH in .env file!")
        print("   1. Go to https://my.telegram.org and log in.")
        print("   2. Click 'API development tools'.")
        print("   3. Create an app and copy your api_id and api_hash into .env file:")
        print("      TG_API_ID=12345678")
        print("      TG_API_HASH=abcdef1234567890...\n")
        sys.exit(1)

    print("🔌 Connecting to Telegram...")
    client = TelegramClient(SESSION_NAME, int(API_ID), API_HASH)

    phone_provider = lambda: ((PHONE or "").strip() or input("\n📱 Enter your Telegram phone number (with country code, e.g. +201012345678): ").strip())
    await client.start(phone=phone_provider)
    print("✅ Telegram Connected successfully!")

    print(f"🔍 Finding channel @{CHANNEL_USERNAME}...")
    try:
        channel_entity = await client.get_entity(CHANNEL_USERNAME)
    except Exception as e:
        print(f"❌ Could not find channel @{CHANNEL_USERNAME}: {e}")
        sys.exit(1)

    # If --backfill was requested
    if args.backfill > 0:
        await run_backfill(client, channel_entity, args.backfill)

    # Run listener if --listen is given or if backfill was not specified
    if args.listen or args.backfill == 0:
        await run_listener(client, channel_entity)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Listener stopped.")
