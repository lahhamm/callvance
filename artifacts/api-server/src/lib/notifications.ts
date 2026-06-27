import { Resend } from "resend";
import twilio from "twilio";

export interface BookingNotificationParams {
  contactName: string | null;
  contactPhone: string | null;
  scheduledAt: Date;
  timezone: string;
  leadScore?: string | null;
  summary?: string | null;
  notes?: string | null;
}

/** Fire email + SMS (both fire-and-forget — never throws). */
export async function sendBookingNotifications(
  params: BookingNotificationParams,
  notificationEmail: string | null | undefined,
  notificationPhone: string | null | undefined,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (notificationEmail?.trim()) tasks.push(sendEmail(params, notificationEmail.trim()));
  if (notificationPhone?.trim()) tasks.push(sendSms(params, notificationPhone.trim()));
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[notifications] Notification failed (fire-and-forget):", r.reason);
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDateInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

function formatTimeInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}

// ─── email ────────────────────────────────────────────────────────────────────

async function sendEmail(params: BookingNotificationParams, to: string): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const dateStr = formatDateInTz(params.scheduledAt, params.timezone);
  const timeStr = formatTimeInTz(params.scheduledAt, params.timezone);
  const contactLabel = params.contactName || params.contactPhone || "Unknown";
  const scoreColor =
    params.leadScore === "Hot" ? "#ff4444" :
    params.leadScore === "Warm" ? "#ff8800" : "#888888";

  const html = `
    <div style="font-family:monospace;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;padding:32px;border:1px solid #1f1f1f;">
      <div style="color:#00ff88;font-size:18px;font-weight:bold;margin-bottom:24px;text-transform:uppercase;letter-spacing:2px;">
        ⚡ Callvance — New Booking
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;width:90px;">Lead</td>
          <td style="padding:8px 0;font-weight:bold;">${params.contactName || "Unknown"}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Phone</td>
          <td style="padding:8px 0;">${params.contactPhone || "—"}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Date</td>
          <td style="padding:8px 0;color:#00ff88;font-weight:bold;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Time</td>
          <td style="padding:8px 0;color:#00ff88;font-weight:bold;">${timeStr}</td>
        </tr>
        ${params.leadScore ? `
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;">Score</td>
          <td style="padding:8px 0;"><span style="color:${scoreColor};font-weight:bold;">${params.leadScore}</span></td>
        </tr>` : ""}
        ${params.summary ? `
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;vertical-align:top;">Summary</td>
          <td style="padding:8px 0;color:#aaa;line-height:1.6;">${params.summary}</td>
        </tr>` : ""}
        ${params.notes ? `
        <tr>
          <td style="padding:8px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:1px;vertical-align:top;">Notes</td>
          <td style="padding:8px 0;color:#aaa;">${params.notes}</td>
        </tr>` : ""}
      </table>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1f1f1f;color:#444;font-size:11px;">
        This booking was automatically created by your AI voice agent.
      </div>
    </div>
  `;

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "Callvance <onboarding@resend.dev>",
      to,
      subject: `New booking: ${contactLabel} — ${dateStr} at ${timeStr}`,
      html,
    });
    if (error) {
      console.error(`[email] Resend error sending to ${to}:`, error);
    } else {
      console.log(`[email] Booking notification sent to ${to}`);
    }
  } catch (err) {
    console.error(`[email] Failed to send email to ${to}:`, err);
  }
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

async function sendSms(params: BookingNotificationParams, to: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log("[sms] Twilio env vars not set — skipping SMS notification");
    return;
  }

  const dateStr = formatDateInTz(params.scheduledAt, params.timezone);
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: params.timezone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(params.scheduledAt);
  const contactLabel = params.contactName || params.contactPhone || "Unknown";
  const score = params.leadScore || "Unknown";

  const body =
    `New Callvance booking: ${contactLabel} — ${dateStr} at ${timeStr}. Score: ${score}. Check your dashboard.`;

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const msg = await client.messages.create({ body, from: TWILIO_PHONE_NUMBER, to });
    console.log(`[sms] Booking SMS sent to ${to} sid=${msg.sid}`);
  } catch (err) {
    console.error(`[sms] Failed to send SMS to ${to}:`, err);
  }
}
