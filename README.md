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

## Deploying (Render, free tier)

Dumadot is a stateful Node process (an in-memory `setInterval` scheduler for auto-publishing) backed by Postgres, so it needs a host that keeps a process running — not a static-site/serverless platform like Netlify or Vercel. Render's free Web Service plus free Postgres works with no further code changes:

1. Push this project to a GitHub repo.
2. Render dashboard → **New → PostgreSQL**. Pick the free plan, same region you'll use for the web service. **Note:** Render's free Postgres expires 30 days after creation and gets deleted unless you upgrade it to a paid plan before then — put a reminder in your calendar, or export your data (`GET /api/export`) before it expires if you don't plan to upgrade.
3. Render dashboard → **New → Web Service** → connect the repo. Environment: **Node**. Build command: `npm install`. Start command: `npm start`. Instance type: **Free**.
4. On the web service's **Environment** tab, link the database — use Render's "Add from Database" / connect-a-database option and pick the Postgres instance from step 2, which injects `DATABASE_URL` automatically (use the *internal* connection string if both are in the same region — faster, and doesn't need SSL). Then add the rest of the vars from `.env.example` (`GEMINI_API_KEY`, `GEMINI_MODEL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_VERSION`); leave `PORT` unset, Render sets it automatically.
5. Deploy. Render gives you a `https://<your-app>.onrender.com` domain.
6. Add two more env vars using that domain: `APP_BASE_URL=https://<your-app>.onrender.com` and `LINKEDIN_REDIRECT_URI=https://<your-app>.onrender.com/auth/linkedin/callback`. Redeploy.
7. In your LinkedIn Developer App, add `https://<your-app>.onrender.com/auth/linkedin/callback` as an authorized redirect URL.
8. Open the Render URL and connect LinkedIn.

**Free-tier caveat that's now much smaller:** the web service instance still spins down after ~15 minutes with no traffic and boots a fresh container on the next request — but since all data now lives in Postgres, not the container's local disk, your LinkedIn connection, posts, and settings survive that restart. The one real free-tier limit left is the 30-day Postgres expiration noted above.

## Product architecture

Dumadot is deliberately structured as a local-first product now, while keeping the content engine independent enough to later become a multi-user SaaS.

Core loop:

Research → Plan → Write → Quality Check → Review → Schedule → Publish → Analyze → Learn

## Troubleshooting

If LinkedIn says credentials are missing, verify `.env` exists in the same folder as `server.js`.

If the app fails to start with a connection error, verify `DATABASE_URL` is set and reachable — on Render, make sure the web service and the Postgres instance are linked (see Deploying above) and both show as running.

If Gemini returns a model error, verify:

```env
GEMINI_MODEL=gemini-3.5-flash-lite
```

Then restart Dumadot.

To stop the server, press `Ctrl+C` in the Terminal running Dumadot.
