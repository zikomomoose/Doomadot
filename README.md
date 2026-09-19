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

## Deploying (Railway)

Dumadot is a stateful Node process (SQLite file + an in-memory `setInterval` scheduler for auto-publishing), so it needs a host that keeps a process running with a persistent disk — not a static-site/serverless platform like Netlify or Vercel. Railway fits with no code changes beyond `DB_PATH` above:

1. Push this project to a GitHub repo, then in Railway: **New Project → Deploy from GitHub repo**.
2. Add a **Volume** to the service (Railway dashboard → service → Settings → Volumes), mounted at `/data`.
3. Set environment variables on the service (Settings → Variables): all the vars from `.env.example`, plus `DB_PATH=/data/linkedin-agent.db`, `LINKEDIN_REDIRECT_URI=https://<your-railway-domain>/auth/linkedin/callback`, and `APP_BASE_URL=https://<your-railway-domain>`.
4. Railway sets `PORT` automatically; `server.js` already reads it.
5. Deploy. Add the same `https://<your-railway-domain>/auth/linkedin/callback` as an authorized redirect URL in your LinkedIn Developer App.
6. Open the Railway domain, connect LinkedIn, and Dumadot's dashboard loads as it does locally.

Redeploys rebuild the container filesystem — only the mounted volume (`/data`) survives, which is why `DB_PATH` must point inside it.

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
