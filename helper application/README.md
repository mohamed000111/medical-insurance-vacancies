# MedInsure Hub — AI Vacancy Classifier Helper Application

A modern desktop helper and control panel for **MedInsure Hub** built with **React**, **Vite**, **Telegram API (Telethon)**, and the **Supabase AI Classifier Pipeline**.

---

## 🌟 Core Features & Operational Modes

### 1. 🟢 Online Mode (Real-Time Listener & Sorter)
* **Active Listener:** Uses Telethon to listen to real-time posts appearing on `@medical_Insurance_1`.
* **Zero-Latency AI Sorting:** Every incoming post is immediately classified by the AI pipeline:
  * **Real Vacancies:** Stored verbatim into the local database and published to the website (`public.vacancies`).
  * **Noise / Greetings:** Skipped from the billboard, stored in local database with reasoning, and recorded in private cloud audit log (`public.classification_log`).
* **Visual & Audio Radar:** Pulse indicator showing socket health, live ticker of captured posts, and an optional pleasant audio chime when a vacancy is caught.

### 2. 🟠 Offline Mode (Watermark-Driven Catch-Up Classifier)
* **Cursor Watermark Persistence:** Automatically tracks and displays the **Last Processed Message Number** (`#XXXX`).
* **Resume from Watermark:** Start catch-up with one click directly from where you left off, or specify a custom message ID.
* **Batch Controls:** Choose batch sizes (25, 50, 100, 250, or All unprocessed).
* **Live Progress Engine:** Striped animated progress bar, live throughput stats, and real-time ticker displaying the post snippet and verdict.
* **Non-Blocking Resilience:** Watermark advances after each processed message so progress is never lost even if stopped or interrupted.

### 3. 💾 Local Database Explorer & Audit Store
* **Persistent SQLite Store:** Stores all captured Telegram posts, verbatim text, classification verdicts, models, and timestamps locally in `data/local_cache.db`.
* **Bilingual Full-Text Search:** Search by English and Arabic keywords (e.g., `مطلوب`, `مطالبات`, `claims`, `auditor`, `010...`).
* **Filters:** Filter by Verdict (`All`, `✅ Vacancies Only`, `⏸️ Noise Only`) and Mode (`Online Captured`, `Offline Captured`).
* **Inspection & Override:**
  * View verbatim formatted posts with emojis, line breaks, and contacts.
  * Direct clickable links to the live post on Telegram (`https://t.me/medical_Insurance_1/{id}`).
  * Re-run AI classification on any specific message.
  * Manual verdict override (mark as vacancy or mark as noise).
  * One-click data export to **JSON** or **CSV**.

### 4. 🧪 AI Classifier Sandbox Playground
* Test draft job announcements and recruitment texts before posting them to the live channel.
* Shows real-time verdict (`Vacancy` vs `Noise`), rationale, and API latency in milliseconds.

---

## 🚀 How to Run the Application

### Option A: Double-Click Launcher (Windows)
Simply double-click the included batch file in the repository root:
```cmd
run_helper.bat
```
This automatically:
1. Starts the FastAPI backend server on `http://127.0.0.1:8765`.
2. Starts the React Vite frontend on `http://localhost:5173`.
3. Opens your default web browser to the dashboard.

### Option B: Manual Command Line

#### 1. Start the Backend:
```bash
# In the workspace root
.venv\Scripts\python.exe "helper application\server.py"
```

#### 2. Start the Frontend:
```bash
cd "helper application"
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🛠️ Architecture & Tech Stack

```
Telegram Channel (@medical_Insurance_1)
        │ (Telethon MTProto API)
        ▼
Helper Backend (FastAPI / SQLite / data/local_cache.db)
  ├── 🟢 Online Listener (events.NewMessage)
  ├── 🟠 Offline Catch-Up (iter_messages min_id=watermark)
  └── 📡 Server-Sent Events (SSE: /api/events)
        │
        ├──▶ Supabase AI Classifier Webhook (Groq LLM)
        │     ├── Verdict = true  ──▶ public.vacancies
        │     └── Verdict = false ──▶ public.classification_log
        │
        ▼
React + Vite GUI (http://localhost:5173)
  ├── Live Pulse & Mode Switcher
  ├── Metrics & Watermark Editor
  ├── Local Database Grid & Verbatim Inspector
  └── Sandbox Playground & Activity Telemetry
```
