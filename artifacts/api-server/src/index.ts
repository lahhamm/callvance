import app from "./app";
import { logger } from "./lib/logger";
import { syncInProgressCalls } from "./routes/calls";
import { logNotificationConfig } from "./lib/notifications";
import { seedDemoTenant } from "./lib/agents/seed";
import { pool } from "@workspace/db";

// ── Startup migrations ─────────────────────────────────────────────────────
// Additive-only, all idempotent (IF NOT EXISTS). Add new columns here rather
// than requiring a manual `drizzle-kit push` step on every deploy.
async function runMigrations() {
  try {
    await pool.query(`
      ALTER TABLE availability_settings
        ADD COLUMN IF NOT EXISTS notification_phone TEXT;
    `);

    // ── Callvance Agents tables (independent from Receptionist product) ──────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        business_name TEXT NOT NULL,
        service_type TEXT NOT NULL DEFAULT '',
        service_area TEXT DEFAULT '',
        twilio_number TEXT,
        timezone TEXT NOT NULL DEFAULT 'America/New_York',
        plan TEXT NOT NULL DEFAULT 'starter',
        google_calendar_id TEXT,
        google_refresh_token TEXT,
        access_token TEXT NOT NULL UNIQUE,
        portal_password TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_configs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        agent_key TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        config JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        name TEXT,
        phone TEXT NOT NULL,
        job_type TEXT,
        urgency TEXT,
        location TEXT,
        budget TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        temperature TEXT,
        summary TEXT,
        value INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        last_contact_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        channel TEXT NOT NULL DEFAULT 'sms',
        status TEXT NOT NULL DEFAULT 'open',
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        conversation_id INTEGER,
        lead_id INTEGER,
        direction TEXT NOT NULL,
        body TEXT NOT NULL,
        twilio_sid TEXT,
        status TEXT,
        agent_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        lead_id INTEGER,
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        status TEXT NOT NULL DEFAULT 'confirmed',
        google_event_id TEXT,
        reminder_24_sent BOOLEAN NOT NULL DEFAULT FALSE,
        reminder_2_sent BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        lead_id INTEGER,
        conversation_id INTEGER,
        kind TEXT NOT NULL,
        run_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload JSONB,
        attempts INTEGER NOT NULL DEFAULT 0,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_ideas (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        week_of TIMESTAMPTZ,
        platform TEXT NOT NULL,
        hook TEXT,
        caption TEXT,
        cta TEXT,
        status TEXT NOT NULL DEFAULT 'suggested',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        agent_key TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        lead_id INTEGER,
        meta JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.error({ err }, "Startup migration failed — server will still start but schema may be incomplete");
  }
}

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await runMigrations();
seedDemoTenant().catch((err) => logger.error({ err }, "Demo tenant seed failed"));
logNotificationConfig();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Poll BlandAI every 30 seconds for any stuck in-progress calls.
  // This is the primary completion mechanism since dev webhooks are unreliable
  // (they require BlandAI to reach the Replit dev URL which can be flaky).
  setInterval(() => { syncInProgressCalls().catch(() => {}); }, 30_000);
  // Also run once immediately on startup to resolve any calls stuck from before
  setTimeout(() => { syncInProgressCalls().catch(() => {}); }, 3_000);
});
