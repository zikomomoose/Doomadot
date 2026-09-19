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
- SQLite persistence and v1 migration support
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
3. Copy your existing `.env` from the previous Dumadot installation into this folder. Do not share it publicly.
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
```

Optional:

```env
POST_TIME=10:30
TIMEZONE=Asia/Kolkata
AUTO_PUBLISH=false
CONTENT_PILLARS=Performance Marketing,AdTech,Affiliate Marketing,App Marketing & Growth,Industry Insights,Digirovers Insights
PORT=3000
DB_PATH=linkedin-agent.db
```

`DB_PATH` overrides where the SQLite file is written/read. Leave it unset for local use; set it to a mounted volume path (e.g. `/data/linkedin-agent.db`) when deploying to a host with persistent storage.

## LinkedIn app configuration

Your LinkedIn Developer App must have the required products/scopes for Sign In with LinkedIn using OpenID Connect and Share on LinkedIn. The redirect URI must exactly match whatever `LINKEDIN_REDIRECT_URI` you configure — for local use that's `http://localhost:3000/auth/linkedin/callback`; for a deployed instance it must be that instance's public URL plus `/auth/linkedin/callback`, added as an authorized redirect URL in the LinkedIn Developer App settings.

## Data

Dumadot stores local data in `linkedin-agent.db` (or `DB_PATH` if set). Do not delete it if you want to preserve posts, plans, voice examples, research and settings.

The ZIP does not include `.env` or `linkedin-agent.db`.

## Deploying (Render, free tier)

Dumadot is a stateful Node process (SQLite file + an in-memory `setInterval` scheduler for auto-publishing), so it needs a host that keeps a process running — not a static-site/serverless platform like Netlify or Vercel. Render's free Web Service works with no code changes:

1. Push this project to a GitHub repo.
2. Render dashboard → **New → Web Service** → connect the repo.
3. Environment: **Node**. Build command: `npm install`. Start command: `npm start`. Instance type: **Free**.
4. Set environment variables (Settings → Environment): everything from `.env.example` except `PORT` (Render sets that automatically) and `DB_PATH` (leave unset — the free tier has no attachable persistent volume, so just use the default local file).
5. Deploy. Render gives you a `https://<your-app>.onrender.com` domain.
6. Add two more env vars using that domain: `APP_BASE_URL=https://<your-app>.onrender.com` and `LINKEDIN_REDIRECT_URI=https://<your-app>.onrender.com/auth/linkedin/callback`. Redeploy.
7. In your LinkedIn Developer App, add `https://<your-app>.onrender.com/auth/linkedin/callback` as an authorized redirect URL.
8. Open the Render URL and connect LinkedIn.

**Free-tier caveat:** the instance spins down after ~15 minutes with no traffic and its local disk is not guaranteed to survive a restart or redeploy — so `linkedin-agent.db` (posts, the LinkedIn token, settings) can be wiped when it wakes back up. Use the built-in `GET /api/export` endpoint to periodically back up your data as JSON. If that data loss becomes a real problem, move to a host with a persistent volume (Railway, Fly.io — both paid) or a free-forever VM (Oracle Cloud Always Free) and set `DB_PATH` to a path on that persistent storage, per the `DB_PATH` note above.

## Product architecture

Dumadot is deliberately structured as a local-first product now, while keeping the content engine independent enough to later become a multi-user SaaS.

Core loop:

Research → Plan → Write → Quality Check → Review → Schedule → Publish → Analyze → Learn

## Troubleshooting

If LinkedIn says credentials are missing, verify `.env` exists in the same folder as `server.js`.

If Gemini returns a model error, verify:

```env
GEMINI_MODEL=gemini-3.5-flash-lite
```

Then restart Dumadot.

To stop the server, press `Ctrl+C` in the Terminal running Dumadot.
