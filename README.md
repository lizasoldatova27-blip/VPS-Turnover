# VPS Turnover

Phone app for unit turnovers: units, tasks per person, a tick when work is done, and push notifications to chosen people.

## Put it online (free): GitHub + Vercel + Neon Postgres
1. Push this folder to a GitHub repository.
2. vercel.com → Add New → Project → import the repository → Deploy (no settings needed; Vercel detects Express from server.js).
3. In the Vercel project: Storage → Create Database → Neon (Postgres), free plan → Connect to the project.
   This adds `DATABASE_URL` automatically. Then Deployments → ⋯ → Redeploy.
4. Open the site. First sign-in: **Liza**, PIN **0000** — change it in People. Other people's PINs are shown in People.

Optional environment variables: `ADMIN_NAME`, `ADMIN_PIN`, `VAPID_SUBJECT` (mailto:you@company), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
(otherwise generated once and stored in the database).

Push notifications: Android — Chrome; iPhone (iOS 16.4+) — open in Safari, Share → Add to Home Screen, open from the icon, then More → Turn on notifications.

## Local run
    DATABASE_URL=postgres://user:pass@localhost/db npm start   # http://localhost:3000

## Demo without a server
    npm run build-demo   # dist/demo.html
