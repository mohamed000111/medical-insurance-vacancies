# MedInsure Hub — Telegram → Web Vacancies & Community Billboard

A static, bilingual (English / العربية) site on **GitHub Pages**. It shows medical insurance vacancies and community posts that admins publish in a **Telegram channel**. A **Supabase Edge Function** receives the posts and stores them as-is.

```
Telegram channel ──webhook──▶ Supabase Edge Function ──▶ Postgres (RLS)
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
| `supabase/functions/telegram-webhook/index.ts` | Telegram webhook receiver |

> Until `config.js` is filled in, the site runs in **preview mode** with demo data.

---

## 1. Create the database

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and click **Run**.
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

## 4. Point Telegram at the function

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<random-secret>" \
  -d 'allowed_updates=["channel_post","edited_channel_post"]'
```

To check it: `curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`

## 5. Configure & publish the site

1. Edit `assets/js/config.js`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Project Settings → API), `TELEGRAM_URL`, and the site names. The anon key is safe to make public because RLS controls access.
2. Push the repo to GitHub, then go to **Settings → Pages**, choose **Deploy from branch**, select `main` and `/ (root)`.

---

## Admin guide

| Action | How |
|---|---|
| Post a vacancy | Post anything in the channel. It's stored exactly as written. |
| Post to Community | Include `#community` or `#reply` in the post. The tag is removed before publishing. |
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

## Run locally

```bash
npx -y serve .
```
Then open <http://localhost:3000>. ES modules don't work from `file://`, so you need a local server.

## Security notes
- The anon role can only **read** active vacancies and approved posts. It can only **insert** posts with `is_approved = false`, and only the columns `author_name`, `message`, and `source`, within length limits.
- Writes from Telegram use the service role key inside the Edge Function. That key is never sent to the browser.
- The web form also has a honeypot field and a 60-second cooldown per browser.
