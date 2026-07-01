import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  leadsTable,
  messagesTable,
  appointmentsTable,
  activityLogTable,
  scheduledMessagesTable,
  type Tenant,
} from "@workspace/db";
import {
  AGENTS_ADMIN_PASSWORD,
  agentsAdminAuth,
  agentsAdminOrOwnTenantAuth,
  generateAgentsAdminToken,
} from "../middlewares/agents-auth";
import { AGENT_KEYS, AGENT_DISPLAY_NAMES, type AgentKey } from "../lib/agents/provision";

const router = Router();

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// Random Orange County demo identity generator for demo endpoints.
const OC_FIRST = ["Aiden", "Bella", "Carlos", "Diana", "Ethan", "Fiona", "Gabriel", "Hana", "Isaac", "Julia", "Kevin", "Lucia"];
const OC_LAST = ["Nguyen", "Ramirez", "Patel", "Thompson", "Garcia", "Cohen", "Foster", "Alvarez", "Bennett", "Cruz"];
function randomOcName(): string {
  const f = OC_FIRST[Math.floor(Math.random() * OC_FIRST.length)];
  const l = OC_LAST[Math.floor(Math.random() * OC_LAST.length)];
  return `${f} ${l}`;
}
function randomOcNumber(): string {
  const area = Math.random() < 0.5 ? "949" : "714";
  const mid = String(Math.floor(100 + Math.random() * 900));
  const last = String(Math.floor(1000 + Math.random() * 9000));
  return `(${area}) ${mid}-${last}`;
}

// ── Public: login ────────────────────────────────────────────────────────────
router.post("/agents/auth/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  if (password === AGENTS_ADMIN_PASSWORD) {
    res.json({ type: "admin", token: generateAgentsAdminToken() });
    return;
  }

  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.portalPassword, password), eq(tenantsTable.isActive, true)))
    .limit(1);

  if (tenants[0]) {
    const t = tenants[0];
    res.json({
      type: "tenant",
      token: t.accessToken,
      tenantId: t.id,
      businessName: t.businessName,
    });
    return;
  }

  res.status(401).json({ error: "Invalid password" });
});

// ── Admin routes ─────────────────────────────────────────────────────────────
// The tenant list is admin-only (a tenant portal has no business seeing other
// tenants). Everything shaped /agents/tenants/:id[/...] accepts either the
// admin token or that specific tenant's own token — see agentsAdminOrOwnTenantAuth.

async function loadTenant(id: number): Promise<Tenant | null> {
  const rows = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  return rows[0] ?? null;
}

// GET /agents/tenants
router.get("/agents/tenants", agentsAdminAuth, async (_req, res) => {
  const tenants = await db.select().from(tenantsTable).orderBy(desc(tenantsTable.createdAt));
  const counts = await db
    .select({ tenantId: leadsTable.tenantId, count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .groupBy(leadsTable.tenantId);
  const countMap = new Map<number, number>(counts.map((c) => [c.tenantId, Number(c.count)]));

  res.json(
    tenants.map((t) => ({
      id: t.id,
      businessName: t.businessName,
      serviceType: t.serviceType,
      serviceArea: t.serviceArea,
      plan: t.plan,
      isDemo: t.isDemo,
      isActive: t.isActive,
      leadCount: countMap.get(t.id) ?? 0,
    })),
  );
});

// GET /agents/tenants/:id
router.get("/agents/tenants/:id", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json({
    id: t.id,
    businessName: t.businessName,
    serviceType: t.serviceType,
    serviceArea: t.serviceArea,
    twilioNumber: t.twilioNumber,
    timezone: t.timezone,
    plan: t.plan,
    googleCalendarId: t.googleCalendarId,
    accessToken: t.accessToken,
    isActive: t.isActive,
    isDemo: t.isDemo,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  });
});

// GET /agents/tenants/:id/metrics
router.get("/agents/tenants/:id/metrics", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const leads = await db.select().from(leadsTable).where(eq(leadsTable.tenantId, id));
  const outboundRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(eq(messagesTable.tenantId, id), eq(messagesTable.direction, "outbound")));
  const apptRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.tenantId, id));

  const leadsCaptured = leads.length;
  const repliesSent = Number(outboundRows[0]?.count ?? 0);
  const bookingsMade = Number(apptRows[0]?.count ?? 0);
  const missedRecovered = leads.filter(
    (l) => l.source === "missed_call" && (l.status === "booked" || l.status === "won"),
  ).length;
  const pipelineValue = leads
    .filter((l) => ["open", "qualified", "booked"].includes(l.status))
    .reduce((sum, l) => sum + (l.value ?? 0), 0);

  res.json({ leadsCaptured, repliesSent, bookingsMade, missedRecovered, pipelineValue });
});

// GET /agents/tenants/:id/agents
router.get("/agents/tenants/:id/agents", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const activity = await db
    .select()
    .from(activityLogTable)
    .where(eq(activityLogTable.tenantId, id))
    .orderBy(desc(activityLogTable.createdAt));

  const pending = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scheduledMessagesTable)
    .where(and(eq(scheduledMessagesTable.tenantId, id), eq(scheduledMessagesTable.status, "pending")));
  const hasPending = Number(pending[0]?.count ?? 0) > 0;

  const now = Date.now();
  const result = AGENT_KEYS.map((key: AgentKey) => {
    const latest = activity.find((a) => a.agentKey === key);
    let status: "working" | "waiting" | "idle" = "idle";
    if (latest && now - latest.createdAt.getTime() < 12_000) {
      status = "working";
    } else if (hasPending && (key === "followup" || key === "booking")) {
      status = "waiting";
    }
    return {
      agentKey: key,
      name: AGENT_DISPLAY_NAMES[key],
      enabled: true,
      status,
      currentTask: latest?.description ?? "Monitoring for new leads",
    };
  });

  res.json(result);
});

// GET /agents/tenants/:id/activity
router.get("/agents/tenants/:id/activity", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
  const rows = await db
    .select()
    .from(activityLogTable)
    .where(eq(activityLogTable.tenantId, id))
    .orderBy(desc(activityLogTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.id,
      agentKey: r.agentKey,
      action: r.action,
      description: r.description,
      leadId: r.leadId,
      createdAt: iso(r.createdAt),
    })),
  );
});

// GET /agents/tenants/:id/leads
router.get("/agents/tenants/:id/leads", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const rows = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, id))
    .orderBy(desc(leadsTable.createdAt));

  res.json(
    rows.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      jobType: l.jobType,
      urgency: l.urgency,
      temperature: l.temperature,
      status: l.status,
      summary: l.summary,
      value: l.value,
      source: l.source,
      createdAt: iso(l.createdAt),
    })),
  );
});

// POST /agents/tenants/:id/demo/missed-call
router.post("/agents/tenants/:id/demo/missed-call", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const number = randomOcNumber();
  const inserted = await db
    .insert(leadsTable)
    .values({
      tenantId: id,
      name: randomOcName(),
      phone: number,
      jobType: "unknown - awaiting reply",
      status: "new",
      temperature: "warm",
      location: "Orange County, CA",
      source: "missed_call",
      lastContactAt: new Date(),
    })
    .returning();
  const lead = inserted[0]!;

  await db.insert(activityLogTable).values([
    {
      tenantId: id,
      agentKey: "reception",
      action: "instant_reply",
      description: `Missed call from ${number} — sent instant reply`,
      leadId: lead.id,
    },
    {
      tenantId: id,
      agentKey: "lead",
      action: "route",
      description: "Routed new lead to Reception",
      leadId: lead.id,
    },
  ]);

  res.json({ ok: true, leadId: lead.id });
});

// POST /agents/tenants/:id/demo/inbound-text
router.post("/agents/tenants/:id/demo/inbound-text", agentsAdminOrOwnTenantAuth, async (req, res) => {
  const id = Number(req.params.id);
  const t = await loadTenant(id);
  if (!t) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const { body } = req.body as { body?: string };
  const text = body?.trim() || "Yeah my water heater is leaking, how soon can someone come out?";

  // Pick the most recent lead, or create one.
  const recent = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, id))
    .orderBy(desc(leadsTable.createdAt))
    .limit(1);
  let lead = recent[0] ?? null;
  if (!lead) {
    const number = randomOcNumber();
    const created = await db
      .insert(leadsTable)
      .values({
        tenantId: id,
        name: randomOcName(),
        phone: number,
        jobType: "unknown - awaiting reply",
        status: "new",
        temperature: "warm",
        location: "Orange County, CA",
        source: "missed_call",
        lastContactAt: new Date(),
      })
      .returning();
    lead = created[0]!;
  }

  await db.insert(messagesTable).values({
    tenantId: id,
    leadId: lead.id,
    direction: "inbound",
    body: text,
    status: "received",
  });

  await db.insert(activityLogTable).values([
    {
      tenantId: id,
      agentKey: "qualifier",
      action: "read",
      description: `Reading new text from ${lead.phone}`,
      leadId: lead.id,
    },
    {
      tenantId: id,
      agentKey: "qualifier",
      action: "tag",
      description: "Tagged lead as HOT — emergency water heater",
      leadId: lead.id,
    },
  ]);

  await db
    .update(leadsTable)
    .set({
      temperature: "hot",
      urgency: "emergency",
      status: "qualifying",
      lastContactAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, lead.id));

  res.json({ ok: true });
});

export default router;
