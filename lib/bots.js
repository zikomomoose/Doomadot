// Shared Dotbots coordination library.
//
// Self-contained on purpose: it takes a plain `pg.Pool` and has no
// dependency on any single bot's own code, so this file can be copied
// as-is into any future bot that shares the same Postgres database.
//
// Pattern: bots don't call each other directly. They enqueue rows in
// bot_jobs for whichever bot_name should handle them, and each bot runs
// a small poll loop (startWorker) that claims one job at a time with
// `FOR UPDATE SKIP LOCKED`, so multiple bots (or multiple instances of
// the same bot) can poll the same table without ever double-claiming a
// job. A finished job can carry `next_job`, which the worker enqueues
// automatically - that's how a pipeline chains across bots without a
// central orchestrator needing to babysit every step.

export async function ensureBotTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_jobs (
      id SERIAL PRIMARY KEY,
      bot_name TEXT NOT NULL,
      job_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      result JSONB,
      error TEXT,
      created_by TEXT,
      next_job JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_bot_jobs_claim ON bot_jobs(bot_name, status, created_at);
    CREATE TABLE IF NOT EXISTS bot_registry (
      name TEXT PRIMARY KEY,
      last_seen_at TIMESTAMPTZ,
      status TEXT DEFAULT 'idle',
      info JSONB
    );
    CREATE TABLE IF NOT EXISTS bot_events (
      id SERIAL PRIMARY KEY,
      bot_name TEXT NOT NULL,
      event TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function enqueueJob(pool, { botName, jobType, payload = {}, createdBy = null, nextJob = null }) {
  const { rows } = await pool.query(
    `INSERT INTO bot_jobs(bot_name,job_type,payload,created_by,next_job) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [botName, jobType, payload, createdBy, nextJob]
  );
  return rows[0];
}

export async function claimNextJob(pool, botName) {
  const { rows } = await pool.query(
    `UPDATE bot_jobs SET status='in_progress', started_at=now(), attempts=attempts+1
     WHERE id = (
       SELECT id FROM bot_jobs
       WHERE bot_name=$1 AND status='queued'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1
     ) RETURNING *`,
    [botName]
  );
  return rows[0];
}

export async function completeJob(pool, job, result) {
  await pool.query(`UPDATE bot_jobs SET status='done', result=$1, finished_at=now() WHERE id=$2`, [result ?? null, job.id]);
  if (job.next_job) {
    const { botName, bot_name, jobType, job_type, payload = {} } = job.next_job;
    await enqueueJob(pool, {
      botName: botName || bot_name,
      jobType: jobType || job_type,
      payload: { ...payload, prev_result: result },
      createdBy: job.bot_name,
    });
  }
}

export async function failJob(pool, job, errorMessage) {
  await pool.query(`UPDATE bot_jobs SET status='failed', error=$1, finished_at=now() WHERE id=$2`, [String(errorMessage).slice(0, 2000), job.id]);
}

export async function heartbeat(pool, botName, status = "idle", info = {}) {
  await pool.query(
    `INSERT INTO bot_registry(name,last_seen_at,status,info) VALUES ($1,now(),$2,$3)
     ON CONFLICT (name) DO UPDATE SET last_seen_at=excluded.last_seen_at,status=excluded.status,info=excluded.info`,
    [botName, status, info]
  );
}

export async function logEvent(pool, botName, event, detail = {}) {
  await pool.query(`INSERT INTO bot_events(bot_name,event,detail) VALUES ($1,$2,$3)`, [botName, event, detail]);
}

/**
 * Starts a poll loop for one bot. `handlers` maps job_type -> async (payload, job) => result.
 * Returns a stop() function.
 */
export function startWorker(pool, botName, handlers, { intervalMs = 5000 } = {}) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const job = await claimNextJob(pool, botName);
      if (!job) {
        await heartbeat(pool, botName, "idle");
        return;
      }
      await heartbeat(pool, botName, "busy", { job_id: job.id, job_type: job.job_type });
      try {
        const handler = handlers[job.job_type];
        if (!handler) throw new Error(`No handler registered for job_type "${job.job_type}"`);
        const result = await handler(job.payload, job);
        await completeJob(pool, job, result);
        await logEvent(pool, botName, "job_done", { job_id: job.id, job_type: job.job_type });
      } catch (e) {
        await failJob(pool, job, e.message);
        await logEvent(pool, botName, "job_failed", { job_id: job.id, job_type: job.job_type, error: e.message });
      }
    } catch (e) {
      console.error(`[${botName}] worker tick failed:`, e.message);
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick(); // don't wait a full interval for the first poll
  return () => { stopped = true; clearInterval(timer); };
}
