# MedInsure Hub — Telegram → Web Vacancies & Community Billboard

A static, bilingual (English / العربية) site on **GitHub Pages**. It shows medical insurance vacancies and community posts that admins publish in a **Telegram channel**. A **Supabase Edge Function** receives each post, an **AI classifier** (free Groq API) decides whether it is a job vacancy, and vacancies are stored verbatim.

```
Telegram channel ──webhook──▶ Supabase Edge Function ──▶ classifier (Groq, free)
                                                          │
                              vacancy? ──▶ Postgres: vacancies          (RLS)
                              noise?   ──▶ Postgres: classification_log (audit, private)
                                                          │
                       GitHub Pages (index / vacancies / community) ◀── anon read
```

| Path | Purpose |
|---|---|
| `index.html` | Hub landing page with live stats |
| `vacancies.html` | Vacancies billboard (search, copy, share, pagination) |
| `community.html` | Community feed + moderated submission form |
| `assets/js/config.js` | **Your Supabase URL, anon key, channel link and site name** |
| `supabase/migrations/0001_init.sql` | Tables, indexes, RLS policies |
| `supabase/migrations/0008_classification.sql` | Classifier audit log (`classification_log`) |
| `supabase/functions/telegram-webhook/index.ts` | Telegram webhook receiver + AI vacancy classifier |

> Until `config.js` is filled in, the site runs in **preview mode** with demo data.

---

## 1. Create the database

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and run the migrations **in order** (`0001` → `0008`), starting with the contents of `supabase/migrations/0001_init.sql`.
   (Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)

## 2. Create the Telegram bot

1. In Telegram, talk to **@BotFather** → `/newbot` → copy the **bot token**.
2. Add the bot to your channel as an **Administrator**. Without admin rights it won't receive channel posts.

## 3. Deploy the Edge Function

```bash
npm i -g supabase            # or: scoop install supabase
supabase login
supabase link --project-ref <your-project-ref>

# pick any long random string as the webhook secret
supabase secrets set TELEGRAM_WEBHOOK_SECRET=<random-secret>
# optional: only accept posts from your channel
supabase secrets set ALLOWED_CHAT_IDS=-1001234567890

supabase functions deploy telegram-webhook --no-verify-jwt
```

`--no-verify-jwt` is required because Telegram can't send a Supabase JWT. Instead, every request is checked against the secret token.

## 4. Enable the free AI classifier

Every post is checked by an LLM ("is this a job vacancy?") before it reaches the billboard. Non-vacancy posts are skipped and recorded in the private `classification_log` table. The default provider is **Groq**, which has a generous free tier — no budget needed.

1. Create a free API key at <https://console.groq.com/keys>.
2. Add it as a secret — in the dashboard: **Project Settings → Edge Functions → Secrets**, or with the CLI:

```bash
supabase secrets set CLASSIFIER_API_KEY=gsk_xxx
# optional overrides:
supabase secrets set CLASSIFIER_MODEL=openai/gpt-oss-120b
supabase secrets set CLASSIFIER_BASE_URL=https://api.groq.com/openai/v1
```

3. Redeploy the function so the new code + secret take effect.

> Without `CLASSIFIER_API_KEY` the classifier is off and every post is stored, exactly like the original behavior. If the classifier ever errors, the post is stored anyway (**fail-open**) — a real vacancy can never be lost to an API hiccup. Google Gemini's free tier also works: `CLASSIFIER_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/` and `CLASSIFIER_MODEL=gemini-2.0-flash`.

## 5. Point Telegram at the function

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<random-secret>" \
  -d 'allowed_updates=["channel_post","edited_channel_post"]'
```

To check it: `curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`

## 6. Configure & publish the site

1. Edit `assets/js/config.js`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Project Settings → API), `TELEGRAM_URL`, and the site names. The anon key is safe to make public because RLS controls access.
2. Push the repo to GitHub, then go to **Settings → Pages**, choose **Deploy from branch**, select `main` and `/ (root)`.

---

## Admin guide

| Action | How |
|---|---|
| Post a vacancy | Post anything in the channel. The AI classifier checks it and stores real vacancies exactly as written. |
| Post non-vacancy noise | No cleanup needed — the classifier skips it. Every verdict is auditable in Supabase → `classification_log`. |
| Post to Community | Include `#community` or `#reply` in the post. The tag is removed before publishing (tags bypass the classifier). |
| Edit a post | Edit it in Telegram. The website updates automatically. |
| Close a vacancy | **Reply** to the vacancy in the channel with `#close`. It's hidden from the site. |
| Hide/restore manually | Supabase → Table Editor → `vacancies` → toggle `is_active` |
| Approve web submissions | Supabase → Table Editor → `community_posts` → set `is_approved = true` |

> Telegram doesn't notify bots when a message is deleted, so deleting a post in Telegram does **not** remove it from the site. Use `#close` or the dashboard instead.

## Test the webhook manually

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <random-secret>" \
  -d '{"update_id":1,"channel_post":{"message_id":999,"date":1760000000,"chat":{"id":-100123,"type":"channel","title":"Test"},"text":"🚨 Claims Specialist\nNasr City\nWhatsApp: 01000000000"}}'
```

With the classifier enabled, that sample is a vacancy → stored in `vacancies`. Send a greeting or promo text instead and it returns `{"skipped":"not a vacancy"}` — check the verdict in `classification_log`.

## Helper Application (React + Vite + FastAPI + Telethon)

A local admin dashboard and MTProto companion app for Telegram channel monitoring and vacancy management:

- **Online Mode**: Real-time live listener (`Telethon`) capturing posts as they occur in `@medical_Insurance_1`.
- **Offline Mode**: Backfills channel history starting from the last stored message ID watermark cursor.
- **Local SQLite Cache**: Stores posts, AI classifier verdicts, reasoning, and metadata (`helper application/data/local_cache.db`).
- **Instant Supabase Sync**:
  - Overriding a post to **Noise** automatically sets `is_active: false` in Supabase (`vacancies`), immediately hiding it from the public billboard.
  - Overriding to **Vacancy** restores the post to the public billboard.
- **Quick Start**:
  Double-click `run_helper.bat` (or run `python helper application/server.py` and `npm run dev --prefix "helper application"`).
  Open GUI at <http://localhost:5173>.

## Auto Link Previews (Public Billboard & Helper App)

Both the public billboard (`vacancies.html`) and the Helper App inspect posts in real-time to generate rich action preview cards:

- 🟢 **WhatsApp Cards**: Direct click-to-chat cards for `wa.me` links and auto-detected Egyptian phone numbers (`010...`, `011...`, `012...`, `015...`).
- 🟣 **Application Form Cards**: Distinctive purple cards for Google Forms (`forms.gle`), Microsoft Forms, and Typeform with a direct "Open Form" action.
- 🔵 **LinkedIn Cards**: Branded cards for LinkedIn jobs (`linkedin.com/jobs/view/...`, `lnkd.in`), with automatic unwrapping of LinkedIn safety redirects.
- 🌐 **Web OpenGraph Cards**: External career websites enriched with OpenGraph titles, descriptions, and thumbnails via Microlink with in-memory caching.

## Run locally

```bash
npx -y serve .
```
Then open <http://localhost:3000>. ES modules don't work from `file://`, so you need a local server.

## Security notes
- The anon role can only **read** active vacancies and approved posts. It can only **insert** posts with `is_approved = false`, and only the columns `author_name`, `message`, and `source`, within length limits.
- Writes from Telegram use the service role key inside the Edge Function. That key is never sent to the browser.
- The web form also has a honeypot field and a 60-second cooldown per browser.

