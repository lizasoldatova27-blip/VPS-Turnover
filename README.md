# VPS Turnover

Phone app for unit turnovers: units, tasks per person, a tick when work is done, and push notifications to chosen people.

## Put it online (free): GitHub + Vercel + Neon Postgres
1. Push this folder to a GitHub repository.
2. vercel.com → Add New → Project → import the repository → Deploy (no settings needed; Vercel detects Express from server.js).
3. In the Vercel project: Storage → Create Database → Neon (Postgres), free plan → Connect to the project.
   This adds `DATABASE_URL` automatically. Then Deployments → ⋯ → Redeploy.
4. Open the site. First sign-in: **Liza**, PIN **0000** — change it in People. Other people's PINs are shown in People.

AI assistant: add `GEMINI_API_KEY` (from https://aistudio.google.com/apikey) in Vercel → Settings → Environment Variables, then Redeploy. Optional: `GEMINI_MODEL` (default gemini-flash-latest), `APP_TIMEZONE` (default America/Edmonton).

Optional environment variables: `ADMIN_NAME`, `ADMIN_PIN`, `VAPID_SUBJECT` (mailto:you@company), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
(otherwise generated once and stored in the database).

Push notifications: Android — Chrome; iPhone (iOS 16.4+) — open in Safari, Share → Add to Home Screen, open from the icon, then More → Turn on notifications.

## Local run
    DATABASE_URL=postgres://user:pass@localhost/db npm start   (dev.js)   # http://localhost:3000

## Demo without a server
    npm run build-demo   # dist/demo.html

## Auto-archive to Google Sheets

Every morning (Vercel Cron, `vercel.json`) units whose tasks are **all done for 30+ days** are copied
(one row per task) to the archive Google Sheet and moved to the app's Archive.

1. Open the sheet → Extensions → Apps Script → paste `google/archive-apps-script.gs` → Save.
2. Deploy → New deployment → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy → allow access.
3. Copy the Web app URL. In Vercel → Settings → Environment Variables add `SHEETS_WEBHOOK_URL` = that URL.
4. Optional: `CRON_SECRET` (any random text), `ARCHIVE_AFTER_DAYS` (default 30), `ARCHIVE_SHEET_URL`.
5. Redeploy. Admins can also press **Check now** on the Archive screen.
