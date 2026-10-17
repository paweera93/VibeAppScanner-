// Outgoing email through Resend's HTTP API (no dependencies).
// Off unless RESEND_API_KEY is set; then messages are only logged, so local runs and tests send nothing.
// Incoming mail for @getleakpatrol.com is handled separately by Cloudflare Email Routing.

export function emailConfig(env = process.env) {
  return {
    apiBase: env.RESEND_API_BASE || 'https://api.resend.com',
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM || 'LeakPatrol <hello@getleakpatrol.com>',
    replyTo: env.EMAIL_REPLY_TO || 'hello@getleakpatrol.com',
    // Where sign-up alerts go. hello@ forwards to the owner's inbox.
    notify: env.NOTIFY_EMAIL || 'hello@getleakpatrol.com',
    enabled: Boolean(env.RESEND_API_KEY),
  };
}

export async function sendEmail(cfg, { to, subject, text }) {
  if (!cfg.enabled) {
    console.log(JSON.stringify({ severity: 'INFO', event: 'email_skipped', subject }));
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${cfg.apiBase}/emails`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [to], reply_to: cfg.replyTo, subject, text }),
    });
    if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

export const waitlistWelcome = () => ({
  subject: "You're on the LeakPatrol list",
  text:
    `Thanks for signing up.\n\n` +
    `We'll send you one email when full LeakPatrol reports are ready: every fix for your app in plain English, ` +
    `with a copy-paste prompt for Lovable, Bolt, v0, Replit, Cursor or Claude Code.\n\n` +
    `In the meantime you can re-run the free scan any time at https://www.getleakpatrol.com\n\n` +
    `Questions? Just reply to this email.\n\n` +
    `LeakPatrol\n\n` +
    `--\nYou're getting this because this address was entered on www.getleakpatrol.com. ` +
    `If that wasn't you, ignore this email and you won't hear from us again. To be removed, reply "remove".\n`,
});

export const waitlistAlert = (email) => ({
  subject: `New waitlist sign-up: ${email}`,
  text: `${email} joined the LeakPatrol waitlist at ${new Date().toISOString()}.\n`,
});
