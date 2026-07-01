import { eq, and } from "drizzle-orm";
import {
  db,
  tenantsTable,
  leadsTable,
  conversationsTable,
  messagesTable,
  appointmentsTable,
  contentIdeasTable,
  activityLogTable,
  type Tenant,
} from "@workspace/db";
import { provisionTenant } from "./provision";

function minsAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000);
}
function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function seedDemoTenant(): Promise<Tenant> {
  // Idempotent: reuse existing demo tenant if present.
  const existing = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.businessName, "Apex Plumbing"), eq(tenantsTable.isDemo, true)))
    .limit(1);
  if (existing[0]) {
    console.log("[seed] Apex Plumbing demo tenant already exists, skipping");
    return existing[0];
  }

  console.log("[seed] Provisioning Apex Plumbing demo tenant…");
  const tenant = await provisionTenant({
    businessName: "Apex Plumbing",
    serviceType: "plumbing",
    serviceArea: "Orange County, CA",
    timezone: "America/Los_Angeles",
    plan: "pro",
    isDemo: true,
    portalPassword: "apexdemo",
  });

  try {
    const tid = tenant.id;

    // ── Leads ────────────────────────────────────────────────────────────────
    console.log("[seed] Inserting demo leads…");
    const leadSeed = [
      { name: "Marcus Delgado", phone: "(949) 555-0142", jobType: "water heater replacement", urgency: "soon", temperature: "hot", status: "qualified", value: 2200, source: "web_form", summary: "40-gal tank leaking, wants tankless quote." },
      { name: "Priya Nair", phone: "(714) 555-0198", jobType: "burst pipe emergency", urgency: "emergency", temperature: "hot", status: "booked", value: 1500, source: "missed_call", summary: "Kitchen pipe burst, water shut off, needs someone today." },
      { name: "Jordan Whitfield", phone: "(949) 555-0177", jobType: "drain cleaning", urgency: "soon", temperature: "warm", status: "qualifying", value: 350, source: "google_ads", summary: "Slow master bath drain, tried snake, no luck." },
      { name: "Elena Vasquez", phone: "(714) 555-0231", jobType: "whole-home repipe", urgency: "planning", temperature: "warm", status: "qualified", value: 8500, source: "referral", summary: "1970s house, galvanized lines, planning full repipe." },
      { name: "Tyler Brooks", phone: "(949) 555-0264", jobType: "faucet install", urgency: "planning", temperature: "cold", status: "new", value: 220, source: "web_form", summary: "New kitchen faucet supplied, needs install." },
      { name: "Sofia Kim", phone: "(714) 555-0289", jobType: "sump pump", urgency: "soon", temperature: "warm", status: "qualifying", value: 950, source: "google_ads", summary: "Garage floods when it rains, wants sump pump installed." },
      { name: "Devon Carter", phone: "(949) 555-0312", jobType: "gas line", urgency: "soon", temperature: "hot", status: "booked", value: 1800, source: "web_form", summary: "Running gas line for new outdoor kitchen." },
      { name: "Rachel O'Brien", phone: "(714) 555-0355", jobType: "toilet repair", urgency: "soon", temperature: "warm", status: "won", value: 180, source: "missed_call", summary: "Running toilet, constantly refilling — recovered from missed call." },
      { name: "Andre Mbeki", phone: "(949) 555-0388", jobType: "water heater replacement", urgency: "emergency", temperature: "hot", status: "won", value: 2650, source: "missed_call", summary: "No hot water, elderly parents at home — same-day install." },
      { name: "Grace Sullivan", phone: "(714) 555-0401", jobType: "drain cleaning", urgency: "planning", temperature: "cold", status: "lost", value: 150, source: "google_ads", summary: "Went with a cheaper competitor for a simple clog." },
    ];
    const insertedLeads = await db
      .insert(leadsTable)
      .values(
        leadSeed.map((l, i) => ({
          tenantId: tid,
          name: l.name,
          phone: l.phone,
          jobType: l.jobType,
          urgency: l.urgency,
          location: "Orange County, CA",
          status: l.status,
          temperature: l.temperature,
          summary: l.summary,
          value: l.value,
          source: l.source,
          lastContactAt: minsAgo(15 + i * 37),
          createdAt: minsAgo(60 + i * 90),
        })),
      )
      .returning();

    // ── Conversations + messages ─────────────────────────────────────────────
    console.log("[seed] Inserting demo conversations + messages…");
    const convoScripts: { leadIdx: number; msgs: { direction: "inbound" | "outbound"; body: string; agentKey?: string }[] }[] = [
      {
        leadIdx: 1,
        msgs: [
          { direction: "inbound", body: "HELP my kitchen pipe just burst, water everywhere!!" },
          { direction: "outbound", body: "Oh no — first, shut off your main water valve (usually near the street or garage). Have you done that?", agentKey: "reception" },
          { direction: "inbound", body: "Ok done. Water stopped. Can someone come today??" },
          { direction: "outbound", body: "Yes — we have an emergency tech available. Can I confirm your address in Orange County?", agentKey: "qualifier" },
          { direction: "inbound", body: "1420 Harbor Blvd, Costa Mesa" },
          { direction: "outbound", body: "Perfect. I've booked our tech for 2:30pm today. You'll get a confirmation text shortly.", agentKey: "booking" },
        ],
      },
      {
        leadIdx: 0,
        msgs: [
          { direction: "inbound", body: "Hi, my water heater is leaking. Looking to maybe switch to tankless." },
          { direction: "outbound", body: "Great choice — tankless saves space and gives endless hot water. Is your current unit gas or electric?", agentKey: "qualifier" },
          { direction: "inbound", body: "Gas, it's a 40 gallon in the garage" },
          { direction: "outbound", body: "Got it. A gas tankless swap in OC typically runs $2,000–$2,600 installed. Want me to schedule a free on-site quote?", agentKey: "qualifier" },
          { direction: "inbound", body: "Yes please, sometime this week" },
        ],
      },
      {
        leadIdx: 2,
        msgs: [
          { direction: "inbound", body: "My master bathroom drain is super slow. Tried a snake, didn't help." },
          { direction: "outbound", body: "Sounds like a deeper clog or buildup. Is it just that one drain or multiple slow drains?", agentKey: "qualifier" },
          { direction: "inbound", body: "Just that one sink" },
          { direction: "outbound", body: "We can hydro-jet or camera it. A standard drain cleaning is $150–$350. When works for you?", agentKey: "followup" },
        ],
      },
      {
        leadIdx: 5,
        msgs: [
          { direction: "inbound", body: "Every time it rains my garage floods. Need a sump pump." },
          { direction: "outbound", body: "We install those a lot in low-lying OC neighborhoods. Do you already have a pit, or would we dig one?", agentKey: "qualifier" },
          { direction: "inbound", body: "No pit, just bare concrete" },
          { direction: "outbound", body: "No problem — full install with pit runs about $950. I can get a tech out for an assessment this week. Sound good?", agentKey: "followup" },
          { direction: "inbound", body: "Yeah let's do it" },
        ],
      },
    ];

    for (const script of convoScripts) {
      const lead = insertedLeads[script.leadIdx]!;
      const convoRows = await db
        .insert(conversationsTable)
        .values({
          tenantId: tid,
          leadId: lead.id,
          channel: "sms",
          status: "open",
          lastMessageAt: minsAgo(5),
          createdAt: minsAgo(120),
        })
        .returning();
      const convo = convoRows[0]!;
      const total = script.msgs.length;
      await db.insert(messagesTable).values(
        script.msgs.map((m, i) => ({
          tenantId: tid,
          conversationId: convo.id,
          leadId: lead.id,
          direction: m.direction,
          body: m.body,
          status: m.direction === "outbound" ? "delivered" : "received",
          agentKey: m.agentKey ?? null,
          createdAt: minsAgo(90 - i * (85 / total)),
        })),
      );
    }

    // ── Appointments (next 7 days, tied to booked leads) ─────────────────────
    console.log("[seed] Inserting demo appointments…");
    await db.insert(appointmentsTable).values([
      { tenantId: tid, leadId: insertedLeads[1]!.id, scheduledAt: daysFromNow(0, 14), durationMinutes: 90, status: "confirmed", notes: "Emergency burst pipe repair — Costa Mesa." },
      { tenantId: tid, leadId: insertedLeads[6]!.id, scheduledAt: daysFromNow(2, 9), durationMinutes: 120, status: "confirmed", notes: "Gas line for outdoor kitchen." },
      { tenantId: tid, leadId: insertedLeads[8]!.id, scheduledAt: daysFromNow(4, 11), durationMinutes: 120, status: "confirmed", notes: "Water heater replacement — same-day follow-up install." },
    ]);

    // ── Content ideas ────────────────────────────────────────────────────────
    console.log("[seed] Inserting demo content ideas…");
    await db.insert(contentIdeasTable).values([
      { tenantId: tid, weekOf: minsAgo(60 * 24), platform: "instagram_reel", hook: "The #1 sign your water heater is about to fail 💧", caption: "Rusty water or popping sounds? OC homes with 10+ year old tanks are on borrowed time. Here's what to watch for before you're stuck with a cold shower. #OrangeCountyPlumbing #ApexPlumbing", cta: "DM us for a free water heater check.", status: "suggested" },
      { tenantId: tid, weekOf: minsAgo(60 * 24), platform: "facebook", hook: "Costa Mesa homeowners: your slab leak warning signs", caption: "Unexplained water bill spikes? Warm spots on the floor? Older OC slab foundations are prone to leaks. We catch them early with electronic detection — no jackhammering guesswork.", cta: "Call today for a leak inspection.", status: "suggested" },
      { tenantId: tid, weekOf: minsAgo(60 * 24), platform: "gbp", hook: "Now offering same-day service across Orange County", caption: "Burst pipe? No hot water? Apex Plumbing runs emergency trucks from Irvine to Huntington Beach. Licensed, insured, upfront pricing.", cta: "Book online or call 24/7.", status: "suggested" },
      { tenantId: tid, weekOf: minsAgo(60 * 24), platform: "instagram_reel", hook: "Why your OC garage keeps flooding when it rains 🌧️", caption: "Low-lying neighborhoods like Fountain Valley get hit hard. A properly installed sump pump saves your garage — and your car. Watch how a 2-hour install works.", cta: "Comment 'PUMP' for a quote.", status: "suggested" },
      { tenantId: tid, weekOf: minsAgo(60 * 24), platform: "facebook", hook: "Tankless vs. tank: what actually makes sense in OC", caption: "Endless hot water sounds great, but is tankless worth it for your home? We break down the real costs and savings for Orange County families.", cta: "Get a free tankless consult.", status: "suggested" },
    ]);

    // ── Activity log (~15 rows across all 6 agents, last hour) ────────────────
    console.log("[seed] Inserting demo activity log…");
    await db.insert(activityLogTable).values([
      { tenantId: tid, agentKey: "reception", action: "instant_reply", description: "Missed call from (714) 555-0198 — sent instant reply", leadId: insertedLeads[1]!.id, createdAt: minsAgo(58) },
      { tenantId: tid, agentKey: "lead", action: "route", description: "Routed new lead to Reception", leadId: insertedLeads[1]!.id, createdAt: minsAgo(57) },
      { tenantId: tid, agentKey: "qualifier", action: "tag", description: "Tagged lead as HOT — burst pipe emergency", leadId: insertedLeads[1]!.id, createdAt: minsAgo(55) },
      { tenantId: tid, agentKey: "booking", action: "book", description: "Booked emergency slot at 2:30pm for Priya Nair", leadId: insertedLeads[1]!.id, createdAt: minsAgo(52) },
      { tenantId: tid, agentKey: "reception", action: "reply", description: "Answered inbound text about tankless water heaters", leadId: insertedLeads[0]!.id, createdAt: minsAgo(46) },
      { tenantId: tid, agentKey: "qualifier", action: "qualify", description: "Collected fuel type and tank size from Marcus Delgado", leadId: insertedLeads[0]!.id, createdAt: minsAgo(44) },
      { tenantId: tid, agentKey: "followup", action: "schedule", description: "Scheduled 24-hour follow-up for slow-drain lead", leadId: insertedLeads[2]!.id, createdAt: minsAgo(38) },
      { tenantId: tid, agentKey: "content", action: "draft", description: "Drafted an Instagram reel: water heater failure signs", createdAt: minsAgo(34) },
      { tenantId: tid, agentKey: "lead", action: "route", description: "Routed Google Ads lead to Qualifier", leadId: insertedLeads[5]!.id, createdAt: minsAgo(30) },
      { tenantId: tid, agentKey: "qualifier", action: "qualify", description: "Confirmed no existing sump pit for Sofia Kim", leadId: insertedLeads[5]!.id, createdAt: minsAgo(28) },
      { tenantId: tid, agentKey: "followup", action: "nudge", description: "Sent 1-hour follow-up nudge to sump pump lead", leadId: insertedLeads[5]!.id, createdAt: minsAgo(24) },
      { tenantId: tid, agentKey: "reception", action: "recover", description: "Recovered missed call from (714) 555-0355 — toilet repair", leadId: insertedLeads[7]!.id, createdAt: minsAgo(18) },
      { tenantId: tid, agentKey: "booking", action: "book", description: "Scheduled gas line assessment for Devon Carter", leadId: insertedLeads[6]!.id, createdAt: minsAgo(12) },
      { tenantId: tid, agentKey: "content", action: "draft", description: "Drafted a GBP post: same-day service across OC", createdAt: minsAgo(8) },
      { tenantId: tid, agentKey: "qualifier", action: "tag", description: "Tagged lead as HOT — no hot water, same-day install", leadId: insertedLeads[8]!.id, createdAt: minsAgo(3) },
    ]);

    console.log("[seed] Apex Plumbing demo data seeded successfully");
  } catch (err) {
    console.error("[seed] Failed to seed demo data:", err);
  }

  return tenant;
}
