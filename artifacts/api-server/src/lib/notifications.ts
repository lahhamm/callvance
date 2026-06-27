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

/** Log which notification services are configured. Call once at startup. */
export function logNotificationConfig(): void {
  const resendKey = process.env.RESEND_API_KEY;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  console.log("[notifications] ── Service configuration ──");
  console.log(`[notifications]   RESEND_API_KEY:       ${resendKey ? `✓ set (${resendKey.slice(0, 8)}…)` : "✗ NOT SET — email notifications disabled"}`);
  console.log(`[notifications]   TWILIO_ACCOUNT_SID:   ${twilioSid ? `✓ set (${twilioSid.slice(0, 8)}…)` : "✗ NOT SET — SMS notifications disabled"}`);
  console.log(`[notifications]   TWILIO_AUTH_TOKEN:    ${twilioToken ? "✓ set" : "✗ NOT SET — SMS notifications disabled"}`);
  console.log(`[notifications]   TWILIO_PHONE_NUMBER:  ${twilioPhone ? `✓ set (${twilioPhone})` : "✗ NOT SET — SMS notifications disabled"}`);
}

/** Fire email + SMS (both fire-and-forget — never throws). */
export async function sendBookingNotifications(
  params: BookingNotificationParams,
  notificationEmail: string | null | undefined,
  notificationPhone: string | null | undefined,
): Promise<void> {
  console.log(`[notifications] sendBookingNotifications called — email="${notificationEmail ?? "none"}" phone="${notificationPhone ?? "none"}"`);

  const tasks: Promise<void>[] = [];
  if (notificationEmail?.trim()) {
    console.log(`[notifications] Queuing email to ${notificationEmail.trim()}`);
    tasks.push(sendEmail(params, notificationEmail.trim()));
  } else {
    console.log(`[notifications] Skipping email — notificationEmail is empty/null`);
  }

  if (notificationPhone?.trim()) {
    console.log(`[notifications] Queuing SMS to ${notificationPhone.trim()}`);
    tasks.push(sendSms(params, notificationPhone.trim()));
  } else {
    console.log(`[notifications] Skipping SMS — notificationPhone is empty/null`);
  }

  if (tasks.length === 0) {
    console.log(`[notifications] No notifications to send (both email and phone are empty)`);
    return;
  }

  console.log(`[notifications] Awaiting ${tasks.length} notification task(s)…`);
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[notifications] Notification task rejected (fire-and-forget):", r.reason);
    }
  }
  console.log(`[notifications] All notification tasks settled`);
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
  console.log(`[email] Attempting to send to="${to}" RESEND_API_KEY=${RESEND_API_KEY ? `set (${RESEND_API_KEY.slice(0, 8)}…)` : "NOT SET"}`);

  if (!RESEND_API_KEY) {
    console.log("[email] ✗ RESEND_API_KEY not set — skipping email notification. Add RESEND_API_KEY to your environment variables.");
    return;
  }

  const dateStr = formatDateInTz(params.scheduledAt, params.timezone);
  const timeStr = formatTimeInTz(params.scheduledAt, params.timezone);
  const contactLabel = params.contactName || params.contactPhone || "Unknown";
  const scoreColor =
    params.leadScore === "Hot" ? "#ff4444" :
    params.leadScore === "Warm" ? "#ff8800" : "#888888";

  const subject = `New booking: ${contactLabel} — ${dateStr} at ${timeStr}`;
  console.log(`[email] Building email — subject="${subject}" contactLabel="${contactLabel}" date="${dateStr}" time="${timeStr}" score="${params.leadScore ?? "none"}"`);

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
    console.log(`[email] Calling Resend API to send to "${to}"…`);
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: "Callvance <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
    if (error) {
      console.error(`[email] ✗ Resend API error sending to "${to}":`, JSON.stringify(error));
    } else {
      console.log(`[email] ✓ Email sent successfully to "${to}" — Resend id=${data?.id ?? "unknown"}`);
    }
  } catch (err) {
    console.error(`[email] ✗ Exception while sending email to "${to}":`, err);
  }
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

async function sendSms(params: BookingNotificationParams, to: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  console.log(`[sms] Attempting to send to="${to}" TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID ? `set (${TWILIO_ACCOUNT_SID.slice(0, 8)}…)` : "NOT SET"} TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN ? "set" : "NOT SET"} TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER ?? "NOT SET"}`);

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    const missing = [
      !TWILIO_ACCOUNT_SID && "TWILIO_ACCOUNT_SID",
      !TWILIO_AUTH_TOKEN && "TWILIO_AUTH_TOKEN",
      !TWILIO_PHONE_NUMBER && "TWILIO_PHONE_NUMBER",
    ].filter(Boolean).join(", ");
    console.log(`[sms] ✗ Missing env vars: ${missing} — skipping SMS notification. Add these to your environment variables.`);
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

  console.log(`[sms] Sending SMS: from="${TWILIO_PHONE_NUMBER}" to="${to}" body="${body}"`);

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const msg = await client.messages.create({ body, from: TWILIO_PHONE_NUMBER, to });
    console.log(`[sms] ✓ SMS sent successfully to "${to}" — Twilio sid=${msg.sid} status=${msg.status}`);
  } catch (err) {
    console.error(`[sms] ✗ Exception while sending SMS to "${to}":`, err);
  }
}
