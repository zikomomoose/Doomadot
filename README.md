# Dumadot

Dumadot is a local-first LinkedIn content agent that researches industry topics, plans content, writes drafts in your voice, quality-checks them, schedules posts, publishes to LinkedIn, and stores performance data.

## Included

- Dumadot dashboard and branding
- Persistent Voice & Brand profile
- Voice examples from your real posts
- Automatic 5-day content planner
- Research inbox using public RSS/news feeds
- Research → draft workflow
- Multiple post formats
- AI quality check and rewrite pass
- Draft editor
- Approval workflow
- Content calendar
- Per-post scheduling
- LinkedIn OAuth + publishing
- Published-post history
- Analytics and manual metric capture
- PostgreSQL persistence (survives restarts/redeploys, unlike a web service's local disk)
- Gemini 3.5 Flash-Lite support
- Master Auto-publish toggle
- Hard exclusion of CPS/CPL topics from automatic planning
- `start-dumadot.command` for easier macOS launching

## Important publishing rule

`AUTO_PUBLISH=false` is the default.

The dashboard contains the master **Auto-publish** toggle. When it is OFF, Dumadot may research, plan, generate, edit and schedule content, but scheduled automation will not publish to LinkedIn. Manual publishing from the dashboard remains available.

Automatic content planning has a server-side hard block for CPS/CPL topics. Those terms are not accepted as automatic planner content.

## Setup

1. Extract the ZIP.
2. Open Terminal in the extracted folder.
3. Copy your existing `.env` from the previous Dumadot installation into this folder. Do not share it publicly. You'll need a Postgres database — see `DATABASE_URL` below.
4. Run:

```bash
npm install
npm start
```

5. Open `http://localhost:3000`.
6. Connect LinkedIn.
7. Keep Auto-publish OFF while reviewing your first drafts.

You can also double-click `start-dumadot.command` on macOS.

## Environment

Required:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.5-flash-lite

LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback
LINKEDIN_VERSION=202603

DATABASE_URL=postgresql://user:password@host:5432/dbname
```

`DATABASE_URL` is a standard Postgres connection string. For local development, point it at any Postgres instance (e.g. `docker run -e POSTGRES_PASSWORD=devpass -p 5432:5432 postgres:17`, then `DATABASE_URL=postgresql://postgres:devpass@localhost:5432/postgres`). The schema is created automatically on first boot.

Optional:

```env
POST_TIME=10:30
TIMEZONE=Asia/Kolkata
AUTO_PUBLISH=false
CONTENT_PILLARS=Performance Marketing,AdTech,Affiliate Marketing,App Marketing & Growth,Industry Insights,Digirovers Insights
PORT=3000
```

## LinkedIn app configuration

Your LinkedIn Developer App must have the required products/scopes for Sign In with LinkedIn using OpenID Connect and Share on LinkedIn. The redirect URI must exactly match whatever `LINKEDIN_REDIRECT_URI` you configure — for local use that's `http://localhost:3000/auth/linkedin/callback`; for a deployed instance it must be that instance's public URL plus `/auth/linkedin/callback`, added as an authorized redirect URL in the LinkedIn Developer App settings.

## Data

Dumadot stores all data (posts, plans, voice examples, research, settings, the LinkedIn token) in the Postgres database at `DATABASE_URL`. The database, not the web process, is what needs to survive — the app itself can restart, redeploy, or move hosts freely without losing anything, as long as it points at the same database.

The ZIP does not include `.env`.

## Deploying (Render web service + Supabase Postgres, free)

Dumadot is a stateful Node process (an in-memory `setInterval` scheduler for auto-publishing) backed by Postgres, so it needs a host that keeps a process running — not a static-site/serverless platform like Netlify or Vercel. The web service runs on Render's free tier; the database runs on Supabase's free tier instead of Render's own Postgres, because Render's free Postgres is deleted 30 days after creation while Supabase's free projects only pause after a week of inactivity (and Dumadot's own scheduler pings the database every 60 seconds, which tends to keep it from ever going inactive).

1. Push this project to a GitHub repo.
2. [supabase.com](https://supabase.com) → **New project**. Free plan, any region. Save the database password you set — you'll need it in the connection string.
3. In the Supabase project → **Settings → Database → Connection string** (URI format). Copy it and fill in the password you set. This is your `DATABASE_URL` — it already requires SSL, which Dumadot handles automatically.
4. Render dashboard → **New → Web Service** → connect the repo. Environment: **Node**. Build command: `npm install`. Start command: `npm start`. Instance type: **Free**.
5. On the web service's **Environment** tab, add `DATABASE_URL` (the Supabase connection string from step 3), plus the rest of the vars from `.env.example` (`GEMINI_API_KEY`, `GEMINI_MODEL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_VERSION`); leave `PORT` unset, Render sets it automatically.
6. Deploy. Render gives you a `https://<your-app>.onrender.com` domain.
7. Add two more env vars using that domain: `APP_BASE_URL=https://<your-app>.onrender.com` and `LINKEDIN_REDIRECT_URI=https://<your-app>.onrender.com/auth/linkedin/callback`. Redeploy.
8. In your LinkedIn Developer App, add `https://<your-app>.onrender.com/auth/linkedin/callback` as an authorized redirect URL.
9. Open the Render URL and connect LinkedIn.

If your Supabase project does pause from inactivity, opening it once in the Supabase dashboard resumes it — no data is lost while paused, just temporarily unreachable.

**Remaining free-tier caveat:** the Render web service instance still spins down after ~15 minutes with no traffic and boots a fresh container on the next request — but since all data now lives in Supabase, not the container's local disk, your LinkedIn connection, posts, and settings survive that restart without any time limit on the database itself.

## Product architecture

Dumadot is deliberately structured as a local-first product now, while keeping the content engine independent enough to later become a multi-user SaaS.

Core loop:

Research → Plan → Write → Quality Check → Review → Schedule → Publish → Analyze → Learn

## Dotbots workforce (multi-bot coordination)

Dumadot is the first "Dotbot" wired to a shared job queue that lets multiple independent bots (each its own small process, potentially its own repo) coordinate through the same Postgres database instead of calling each other directly.

`lib/bots.js` is self-contained on purpose — it only needs a `pg.Pool` — so it can be copied as-is into any future bot that points at the same `DATABASE_URL`:

- `enqueueJob(pool, {botName, jobType, payload, nextJob})` — add a job for any bot to pick up.
- `startWorker(pool, botName, handlers)` — polls `bot_jobs` for that bot's queued work using `FOR UPDATE SKIP LOCKED`, so multiple bots (or instances) never double-claim a job.
- A completed job can carry `nextJob`, which the worker auto-enqueues on success — that's how a pipeline hands off across bots (e.g. a research-bot's finding becomes a job for Dumadot to write a post about) without a central orchestrator babysitting every step.
- `heartbeat`/`bot_registry` and `logEvent`/`bot_events` give a shared, queryable view of what every bot is doing.

Dumadot currently handles two job types: `generate_post` (wraps the existing draft pipeline) and `publish_post` (wraps publishing). Enqueue one from any other bot, or manually via:

```bash
curl -X POST https://<your-app>.onrender.com/api/bots/jobs \
  -H "Content-Type: application/json" \
  -d '{"botName":"dumadot","jobType":"generate_post","payload":{"topic":"..."}}'
```

`GET /api/bots/status` returns the registry, recent events, and per-bot job counts — a quick way to see the whole workforce's health from one endpoint.

## Troubleshooting

If LinkedIn says credentials are missing, verify `.env` exists in the same folder as `server.js`.

If the app fails to start with a connection error, verify `DATABASE_URL` is set and reachable — on Render, make sure the web service and the Postgres instance are linked (see Deploying above) and both show as running.

If Gemini returns a model error, verify:

```env
GEMINI_MODEL=gemini-3.5-flash-lite
```

Then restart Dumadot.

To stop the server, press `Ctrl+C` in the Terminal running Dumadot.
