# Product Requirements Document (PRD)

## Module E — AI Vacancy Classifier (Telegram → Supabase pipeline)

---

## 1. Document Overview

* **Project Name:** MedInsure Hub — AI Vacancy Classifier
* **Repo Location:** `D:\medical insurance vacancies`
* **Target Audience:** Medical insurance job seekers in Cairo / Egypt (consumers of the public billboard) and the channel admin.
* **Core Objective:** Automatically filter the Telegram channel feed so that **only real job vacancies** reach the public Vacancies Billboard. Every channel post is classified by a free LLM ("is this a job vacancy?"); vacancies are stored verbatim, non-vacancies are skipped and recorded in a private audit log.
* **Budget Constraint:** The entire project is out of budget — the classifier **must** use a free-tier API (Groq by default; Google Gemini free tier as documented alternative).

---

## 2. System Architecture & Tech Stack

```
Telegram channel ──webhook──▶ Supabase Edge Function (Deno) ──▶ LLM classifier (Groq, free)
                                                                    │
                                    verdict = vacancy? ──▶ public.vacancies   (content verbatim)
                                    verdict = noise?  ──▶ skipped; row written to
                                                                    public.classification_log (private audit)
```

* **Ingestion & classification layer:** single Supabase Edge Function `supabase/functions/telegram-webhook/index.ts` (Deno). The classifier is embedded in the existing webhook receiver — no separate bot, no polling, no extra hosting cost.
* **LLM:** any OpenAI-compatible `/chat/completions` endpoint. Default: **Groq** (`https://api.groq.com/openai/v1`, model `openai/gpt-oss-120b`, free tier).
* **Database:** Supabase Postgres. Existing tables `vacancies` and `community_posts` (migration `0001_init.sql`) are unchanged; a new private table `classification_log` is added by migration `0008_classification.sql`.

---

## 3. Functional Requirements

### FR-1: Classification before storage
* Every incoming `channel_post` (and `edited_channel_post`) without a `#community` / `#reply` tag must be sent to the LLM classifier before any database write.
* The classifier returns JSON only: `{"is_vacancy": true|false, "reason": "one short sentence"}`.
* **Verdict-only requirement:** the LLM decides yes/no and gives a one-line reason. It must NOT rewrite, summarize, translate or reformat the post. The stored `content` stays 100% verbatim (line breaks, emojis, formatting).

### FR-2: Routing rules
| Verdict / condition | Action |
|---|---|
| `is_vacancy = true` | Upsert into `public.vacancies` (existing behavior and schema, `onConflict: telegram_chat_id,telegram_message_id`) |
| `is_vacancy = false` | Do **not** store in `vacancies`. Write the verdict to `public.classification_log`. Return `{"skipped":"not a vacancy"}` |
| Post tagged `#community` / `#reply` | Tag wins — bypass the classifier, existing community routing applies |
| Reply tagged `#close` | Bypass the classifier, existing close behavior applies |

### FR-3: Fail-open policy (critical)
* If `CLASSIFIER_API_KEY` is unset → classifier disabled → store every post as a vacancy (exact legacy behavior) and log the reason `classifier disabled — stored as before`.
* If the classifier call fails (HTTP error, timeout, parse error) after **2 attempts** → store the post as a vacancy anyway and log `classifier failed: <error>`.
* **A real admin vacancy must never be lost to an API outage.**

### FR-4: Audit log
* Every classified post produces one row in `public.classification_log` (`telegram_chat_id`, `telegram_message_id`, `content` capped at 10 000 chars, `is_vacancy` — `null` on failure, `reason`, `model`, `created_at`, `updated_at`), upserted on the unique key so re-edits overwrite the previous verdict.
* The audit log must never break post processing: log write errors are caught and only console-logged.

### FR-5: Edit handling
* Edited posts are **re-classified**. If an edit flips a post from vacancy → non-vacancy, the stale row is deleted from `vacancies`. If it flips non-vacancy → vacancy, the upsert inserts it.

### FR-6: Model prompt requirements
The system prompt must:
* State the domain: bilingual (Arabic/English) Telegram channel, medical insurance careers in Egypt (Cairo area).
* Define vacancy = any post recruiting for a job or paid role (full/part-time, shifts, freelance) or asking applicants to send CV/WhatsApp.
* Define non-vacancy = service/company promotions, insurance offers, courses & trainings, news/legal updates, greetings, discussion, thank-yous, spam.
* End with the bias rule: *when genuinely ambiguous, return true* (channel is admin-curated; skipping a real vacancy is worse than letting noise through).

### FR-7: Request hardening
* `temperature: 0`, `max_tokens: 512` (headroom for reasoning models), per-attempt timeout `AbortSignal.timeout(8000)`, lenient JSON parsing (strip code fences, take outermost `{...}`).
* Send an explicit `User-Agent` header — Groq's Cloudflare edge blocks default library user-agents (verified: `Python-urllib` → HTTP 403 / error 1010).

---

## 4. Configuration (Supabase secrets)

| Secret | Required | Default | Notes |
|---|---|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | yes | — | already existing; validated via `x-telegram-bot-api-secret-token` header |
| `CLASSIFIER_API_KEY` | no | — | free Groq key (`https://console.groq.com/keys`). Unset = classifier off (legacy behavior) |
| `CLASSIFIER_MODEL` | no | `openai/gpt-oss-120b` | any Groq chat model; free-tier alternatives verified working: `openai/gpt-oss-20b`, `allam-2-7b`, `qwen/qwen3.8-27b` |
| `CLASSIFIER_BASE_URL` | no | `https://api.groq.com/openai/v1` | Gemini free tier: `https://generativelanguage.googleapis.com/v1beta/openai/` + model `gemini-2.0-flash` |
| `ALLOWED_CHAT_IDS` | no | — | existing; unchanged |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. The API key must never appear in the frontend (`assets/js/*`) or anywhere in the public GitHub Pages output.

---

## 5. Deployment Steps (agent-executable, no local toolchain required)

1. **Database:** Supabase Dashboard → SQL Editor → run contents of `supabase/migrations/0008_classification.sql` (creates `classification_log`, RLS enabled with no policies = service-role-only).
2. **Secrets:** Dashboard → Project Settings → Edge Functions → Secrets → set `CLASSIFIER_API_KEY`.
3. **Deploy function:** Dashboard → Edge Functions → `telegram-webhook` → replace code with `supabase/functions/telegram-webhook/index.ts` → Deploy. *(CLI alternative: `supabase functions deploy telegram-webhook --no-verify-jwt`.)*
4. **Verify** per Section 6.

---

## 6. Acceptance Criteria & Test Plan

### AC-1: Vacancy stored
POST the webhook with `{"update_id":1,"channel_post":{"message_id":999,"date":1760000000,"chat":{"id":-100123,"type":"channel","title":"Test"},"text":"🚨 Claims Specialist\nNasr City\nWhatsApp: 01000000000"}}`
→ HTTP 200 `{"stored":"vacancies"}`; row present in `vacancies` with content **byte-identical** to the input; audit row `is_vacancy = true` in `classification_log`.

### AC-2: Noise skipped
Same request with `"text":"🎉 مباركة بعيد الشهر رمضان مبارك"` (greeting)
→ HTTP 200 `{"skipped":"not a vacancy","reason":...}`; **no** row in `vacancies`; audit row `is_vacancy = false`.

### AC-3: Arabic course ad skipped
`"text":"📚 منصة تدريب مجاني لمراسلة التأمين الطبي - دورة مجانية"` → skipped, `is_vacancy = false`.

### AC-4: Tag precedence
`"text":"#community من عنده خبر يعلمنا"` → stored in `community_posts`, classifier not called.

### AC-5: Fail-open
Temporarily unset `CLASSIFIER_API_KEY` (or point `CLASSIFIER_BASE_URL` at a dead host) → any post is stored in `vacancies`; audit row has `is_vacancy = null` with the failure reason.

### AC-6: Edit re-classification
Send `edited_channel_post` for a message previously stored as vacancy, now a greeting → `vacancies` row deleted; audit row updated to `is_vacancy = false`.

### AC-7: End-to-end
Post a real vacancy in the live channel `@medical_Insurance_1` → appears on `vacancies.html` within one webhook round-trip. Post a greeting → does not appear; verdict visible in `classification_log`.

---

## 7. Non-Functional Requirements

* **Cost:** $0 marginal — Groq free tier; a short classification call per post.
* **Latency:** classification adds ~1–3 s per post (Groq); webhook must still answer Telegram with HTTP 200 quickly; per-attempt timeout 8 s, 2 attempts max.
* **Security:** RLS enabled on `classification_log` with no public policies; writes only via service role inside the Edge Function. Webhook requests authenticated by Telegram secret token. Secrets never shipped to the browser.
* **Resilience:** fail-open classification (FR-3); audit-log failures never fail post processing; JSON parsing tolerant of code fences and prose around the object.
* **Observability:** each request logs one JSON line to function logs: `{update_id, stored|skipped|closed, reason}` — filterable in Dashboard → Edge Functions → Logs.

---

## 8. Explicitly Out of Scope

* Backfilling historical channel messages (webhook covers new posts only).
* Structured field extraction (title/salary/skills columns) — verdict-only by design; content stays verbatim per the original PRD.
* Auto-moderation or deletion based on classifier output — non-vacancies are merely skipped and logged; humans own the audit table.
