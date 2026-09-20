import bcrypt from "bcryptjs";
import crypto from "crypto";

// Portable shared-auth module - copied verbatim into every dotarmy app that
// needs a login wall. All apps point AUTH_DATABASE_URL at the same Postgres
// (the Supabase project Duma and Sela already share) so one set of
// credentials works across every dotarmy service, even though each app's
// own business data stays in its own tables/database.

export async function ensureAuthTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT,
      claim_token TEXT,
      claim_token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
}

function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString("hex"); }

export async function createUserInvite(pool, { email, name, role = "member" }) {
  email = String(email).trim().toLowerCase();
  const claimToken = randomToken(24);
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const r = await pool.query(
    `INSERT INTO users(email,name,role,claim_token,claim_token_expires_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (email) DO UPDATE SET claim_token=$4, claim_token_expires_at=$5, role=$3, name=COALESCE(EXCLUDED.name,users.name)
     RETURNING id,email,name,role,claim_token`,
    [email, name || null, role, claimToken, expires]
  );
  return r.rows[0];
}

export async function getUserByClaimToken(pool, token) {
  const r = await pool.query(`SELECT * FROM users WHERE claim_token=$1 AND claim_token_expires_at > now()`, [token]);
  return r.rows[0] || null;
}

export async function setPasswordAndClaim(pool, userId, password) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(`UPDATE users SET password_hash=$1, claim_token=NULL, claim_token_expires_at=NULL WHERE id=$2`, [hash, userId]);
}

export async function verifyLogin(pool, email, password) {
  const r = await pool.query(`SELECT * FROM users WHERE email=$1`, [String(email || "").trim().toLowerCase()]);
  const user = r.rows[0];
  if (!user || !user.password_hash) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

export async function createSession(pool, userId, days = 30) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + days * 24 * 3600 * 1000);
  await pool.query(`INSERT INTO sessions(token,user_id,expires_at) VALUES ($1,$2,$3)`, [token, userId, expires]);
  return { token, expires };
}

export async function getSessionUser(pool, token) {
  if (!token) return null;
  const r = await pool.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at > now()`,
    [token]
  );
  return r.rows[0] || null;
}

export async function destroySession(pool, token) {
  if (token) await pool.query(`DELETE FROM sessions WHERE token=$1`, [token]);
}

export function requireAuth(pool, { cookieName = "dotarmy_session" } = {}) {
  return async (req, res, next) => {
    const token = req.cookies?.[cookieName];
    const user = await getSessionUser(pool, token);
    if (!user) {
      if (req.path.startsWith("/api")) return res.status(401).json({ error: "Not logged in." });
      return res.redirect("/login");
    }
    req.user = user;
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });
  next();
}

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0e0b1a;color:#f3f1fb}
  .card{width:min(360px,90vw);background:#171229;border:1px solid #2c2648;border-radius:16px;padding:28px;box-shadow:0 20px 60px #00000055}
  h1{font-size:20px;margin:0 0 6px}.sub{color:#a39cc0;font-size:13px;margin-bottom:20px}
  input{width:100%;box-sizing:border-box;border:1px solid #3a3460;border-radius:10px;padding:11px 12px;background:#0e0b1a;color:#fff;margin-bottom:12px;font:inherit}
  button{width:100%;border:0;border-radius:10px;padding:11px;background:linear-gradient(135deg,#a78bfa,#60a5fa);color:#0e0b1a;font-weight:800;cursor:pointer;font:inherit}
  .err{color:#f38ba8;font-size:13px;margin-bottom:10px;min-height:16px}
  .ok{color:#7ee0a8;font-size:13px;margin-bottom:10px}
  </style></head><body>${body}</body></html>`;
}

function loginPage(appName) {
  return page(`Log in · ${appName}`, `<div class="card">
    <h1>${appName}</h1><div class="sub">Sign in to continue.</div>
    <div id="err" class="err"></div>
    <input id="email" type="email" placeholder="Email" autocomplete="username">
    <input id="password" type="password" placeholder="Password" autocomplete="current-password">
    <button onclick="doLogin()">Log in</button>
    <script>
    async function doLogin(){
      const email=document.getElementById('email').value.trim();
      const password=document.getElementById('password').value;
      const err=document.getElementById('err'); err.textContent='';
      try{
        const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
        const x=await r.json();
        if(!r.ok) throw new Error(x.error||'Login failed');
        window.location.href='/';
      }catch(e){ err.textContent=e.message }
    }
    document.getElementById('password').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
    </script>
  </div>`);
}

function claimPage(token, email) {
  return page("Set your password", `<div class="card">
    <h1>Welcome</h1><div class="sub">Set a password for <b>${email}</b> to finish setting up your account.</div>
    <div id="err" class="err"></div>
    <input id="password" type="password" placeholder="New password (min 8 characters)" autocomplete="new-password">
    <input id="password2" type="password" placeholder="Confirm password" autocomplete="new-password">
    <button onclick="doClaim()">Set password &amp; log in</button>
    <script>
    async function doClaim(){
      const password=document.getElementById('password').value;
      const password2=document.getElementById('password2').value;
      const err=document.getElementById('err'); err.textContent='';
      if(password!==password2){ err.textContent='Passwords do not match'; return }
      try{
        const r=await fetch('/api/claim/${token}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
        const x=await r.json();
        if(!r.ok) throw new Error(x.error||'Could not set password');
        const r2=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'${email}',password})});
        if(!r2.ok) throw new Error('Password set - please log in.');
        window.location.href='/';
      }catch(e){ err.textContent=e.message }
    }
    </script>
  </div>`);
}

export function attachAuthRoutes(app, pool, { cookieName = "dotarmy_session", appName = "Dotarmy" } = {}) {
  // One-time bootstrap: works only while the shared users table is empty,
  // so it's safe to leave deployed permanently rather than remove after use.
  app.post("/api/bootstrap-admin", async (req, res) => {
    try {
      const countRow = await pool.query(`SELECT count(*)::int as n FROM users`);
      if (countRow.rows[0].n > 0) return res.status(403).json({ error: "Already initialized - use an admin account to invite more users." });
      const { email, name } = req.body || {};
      if (!email) return res.status(400).json({ error: "email is required." });
      const invited = await createUserInvite(pool, { email, name, role: "admin" });
      res.json({ ok: true, email: invited.email, claimPath: `/claim/${invited.claim_token}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/login", (req, res) => res.send(loginPage(appName)));
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body || {};
    const user = await verifyLogin(pool, email, password);
    if (!user) return res.status(401).json({ error: "Invalid email or password." });
    const { token, expires } = await createSession(pool, user.id);
    res.cookie(cookieName, token, { httpOnly: true, secure: true, sameSite: "lax", expires });
    res.json({ ok: true, name: user.name, role: user.role });
  });
  app.post("/api/logout", async (req, res) => {
    await destroySession(pool, req.cookies?.[cookieName]);
    res.clearCookie(cookieName);
    res.json({ ok: true });
  });
  app.get("/claim/:token", async (req, res) => {
    const user = await getUserByClaimToken(pool, req.params.token);
    if (!user) return res.status(400).send("This invite link is invalid or has expired. Ask your admin for a new one.");
    res.send(claimPage(req.params.token, user.email));
  });
  app.post("/api/claim/:token", async (req, res) => {
    const user = await getUserByClaimToken(pool, req.params.token);
    if (!user) return res.status(400).json({ error: "This invite link is invalid or has expired." });
    const { password } = req.body || {};
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    await setPasswordAndClaim(pool, user.id, password);
    res.json({ ok: true });
  });
  app.get("/api/me", async (req, res) => {
    const user = await getSessionUser(pool, req.cookies?.[cookieName]);
    res.json(user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null);
  });
  const auth = requireAuth(pool, { cookieName });
  app.post("/api/admin/users", auth, requireAdmin, async (req, res) => {
    try {
      const { email, name, role } = req.body || {};
      if (!email) return res.status(400).json({ error: "email is required." });
      const invited = await createUserInvite(pool, { email, name, role: role === "admin" ? "admin" : "member" });
      res.json({ ok: true, email: invited.email, claimPath: `/claim/${invited.claim_token}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/users", auth, requireAdmin, async (req, res) => {
    const r = await pool.query(`SELECT id,email,name,role,created_at,(claim_token IS NOT NULL) as pending_claim FROM users ORDER BY id`);
    res.json(r.rows);
  });
  app.post("/api/admin/users/:id/reinvite", auth, requireAdmin, async (req, res) => {
    const u = await pool.query(`SELECT email,name,role FROM users WHERE id=$1`, [Number(req.params.id)]);
    if (!u.rows[0]) return res.status(404).json({ error: "User not found." });
    const invited = await createUserInvite(pool, u.rows[0]);
    res.json({ ok: true, email: invited.email, claimPath: `/claim/${invited.claim_token}` });
  });
}
