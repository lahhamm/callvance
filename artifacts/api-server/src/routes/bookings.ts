import { Router } from "express";
import { db, bookingsTable, availabilityTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";

const router = Router();

function serializeBooking(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    scheduledAt: b.scheduledAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

async function sendBookingEmail(booking: {
  contactName?: string | null;
  contactPhone?: string | null;
  scheduledAt: Date;
  notes?: string | null;
}, notificationEmail: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const formattedTime = booking.scheduledAt.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const html = `
    <div style="font-family:monospace;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;padding:32px;border:1px solid #1f1f1f;">
      <div style="color:#00ff88;font-size:18px;font-weight:bold;margin-bottom:24px;text-transform:uppercase;letter-spacing:2px;">
        ⚡ Callvance — New Booking
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Lead</td><td style="padding:8px 0;font-weight:bold;">${booking.contactName || "Unknown"}</td></tr>
        <tr><td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Phone</td><td style="padding:8px 0;">${booking.contactPhone || "—"}</td></tr>
        <tr><td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Time</td><td style="padding:8px 0;color:#00ff88;font-weight:bold;">${formattedTime}</td></tr>
        ${booking.notes ? `<tr><td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;vertical-align:top;">Notes</td><td style="padding:8px 0;color:#aaa;">${booking.notes}</td></tr>` : ""}
      </table>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1f1f1f;color:#444;font-size:11px;">
        This booking was automatically created by your AI voice agent.
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Callvance <onboarding@resend.dev>",
        to: notificationEmail,
        subject: `New booking: ${booking.contactName || "Lead"} — ${formattedTime}`,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", err);
    } else {
      console.log(`[email] Booking confirmation sent to ${notificationEmail}`);
    }
  } catch (err) {
    console.error("[email] Failed to send email:", err);
  }
}

router.get("/bookings", async (_req, res) => {
  const bookings = await db.select().from(bookingsTable).orderBy(desc(bookingsTable.scheduledAt));
  res.json(bookings.map(serializeBooking));
});

router.get("/bookings/upcoming", async (_req, res) => {
  const now = new Date();
  const bookings = await db.select().from(bookingsTable)
    .where(and(gte(bookingsTable.scheduledAt, now), eq(bookingsTable.status, "confirmed")))
    .orderBy(bookingsTable.scheduledAt);
  res.json(bookings.map(serializeBooking));
});

router.post("/bookings", async (req, res) => {
  const { contactId, contactName, contactPhone, callId, scheduledAt, notes } = req.body as {
    contactId?: number;
    contactName?: string;
    contactPhone?: string;
    callId?: number;
    scheduledAt: string;
    notes?: string;
  };

  if (!scheduledAt) {
    res.status(400).json({ error: "scheduledAt is required" });
    return;
  }

  const inserted = await db.insert(bookingsTable).values({
    contactId,
    contactName,
    contactPhone,
    callId,
    scheduledAt: new Date(scheduledAt),
    notes,
    status: "confirmed",
  }).returning();

  const booking = inserted[0];

  const availRows = await db.select().from(availabilityTable).limit(1);
  if (availRows[0]?.notificationEmail) {
    await sendBookingEmail(booking, availRows[0].notificationEmail);
  }

  res.status(201).json(serializeBooking(booking));
});

router.patch("/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, scheduledAt, notes } = req.body as {
    status?: string;
    scheduledAt?: string;
    notes?: string;
  };

  const updated = await db.update(bookingsTable).set({
    ...(status && { status }),
    ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
    ...(notes !== undefined && { notes }),
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, id)).returning();

  if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeBooking(updated[0]));
});

router.delete("/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(bookingsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(bookingsTable.id, id));
  res.json({ ok: true });
});

export { sendBookingEmail };
export default router;
