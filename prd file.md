# Product Requirements Document (PRD)

## Telegram-to-Web Medical Insurance Community & Vacancies Billboard

---

## 1. Document Overview

* **Project Name:** Telegram Community & Vacancies Billboard Bridge
* **Target Audience:** Medical insurance professionals, job seekers, and channel community members in Cairo / Egypt.
* **Core Objective:** Provide a seamless, zero-friction pipeline where announcements and replies posted by an admin in a Telegram channel are automatically stored and published onto a public GitHub Pages web presence, separated into a **Vacancies Billboard** and a **Community Discussion Board**, utilizing Supabase Edge Functions for ingestion.

---

## 2. System Architecture & Tech Stack

* **Frontend Hosting:** GitHub Pages (Static HTML, Tailwind CSS, JavaScript).
* **Database & Backend-as-a-Service:** Supabase (PostgreSQL for storing raw text posts and community interactions, secured via Row Level Security).
* **Ingestion Layer:** Supabase Edge Function (Serverless Deno/TypeScript runtime serving as a Telegram Webhook receiver, capturing raw channel messages and writing them directly to Supabase without complex parsing).

---

## 3. Product Scope & Functional Requirements

### Module A: Vacancies Billboard

* **Source Input:** Admin sends raw, unstructured job posts (e.g., role titles, descriptions, salaries, shift times, and WhatsApp contact details) directly into the Telegram channel.
* **Storage Requirement (`vacancies` table):**
* `id` (UUID, Primary Key)
* `content` (Text): Stores the exact, raw admin post verbatim to preserve original line breaks, formatting, and emojis.
* `is_active` (Boolean): Manages visibility on the public web page.
* `created_at` (Timestamp): Records the exact posting time.


* **Web Presentation (`vacancies.html`):**
* Fetches active records from Supabase in descending order.
* Renders posts cleanly using CSS `whitespace-pre-line` to maintain the admin's original text structure.
* Displays a metadata footer showing origin and timestamp.



### Module B: Community Discussions & Replies

* **Source Input:** Community messages, Q&A, and replies handled via Telegram or submitted directly through the web portal.
* **Storage Requirement (`community_posts` table):**
* `id` (UUID, Primary Key)
* `author_name` (Text): Name or handle of the contributor.
* `message` (Text): The inquiry, reply, or discussion point.
* `is_approved` (Boolean): Moderation toggle.
* `created_at` (Timestamp).


* **Web Presentation (`community.html`):**
* Features an interactive submission form allowing users to post professional inquiries or community replies.
* Displays an up-to-date feed of approved community posts.



### Module C: Hub Landing Page (`index.html`)

* Acts as the primary entry point on GitHub Pages.
* Provides a clean navigational interface directing users to either the **Vacancies Billboard** or the **Community Board**.

### Module D: Telegram Ingestion Edge Function

* **Endpoint:** Supabase Edge Function configured as a Telegram Webhook receiver (`/telegram-webhook`).
* **Behavior:**
* Listens for incoming JSON payloads from Telegram channel posts.
* Captures the raw message text without complex regex or data parsing.
* Routes entries to the appropriate table (`vacancies` by default, or `community_posts` if tagged with `#community` / `#reply`).
* Persists records securely using the Supabase Service Role key.



---

## 4. Non-Functional Requirements

* **Simplicity & Low Friction:** Zero parsing constraints on incoming admin messages; raw storage ensures nothing gets lost or miscategorized.
* **Security:** Row Level Security (RLS) enabled on Supabase for public read access, with backend write actions secured via serverless environment controls.
* **Performance:** Lightweight static assets hosted globally via GitHub Pages combined with fast edge-computed webhooks for near-instant synchronization.