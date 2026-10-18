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

export async function sendEmail(cfg, { to, subject, text, html }) {
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
      body: JSON.stringify({ from: cfg.from, to: [to], reply_to: cfg.replyTo, subject, text, ...(html && { html }) }),
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

// Sent to the buyer once the payment webhook arrives. The report link is the only key to a paid
// report, so this email is how buyers get back to it later.
export const reportReady = ({ origin, reportUrl, orderNumber, total, testMode, logoUrl }) => {
  const host = new URL(origin).host;
  return {
    subject: `${testMode ? '[TEST] ' : ''}Your LeakPatrol report for ${host}`,
    text:
      `Thanks for your order (#${orderNumber}).\n\n` +
      `Your full report for ${origin} is here:\n${reportUrl}\n\n` +
      `Keep this email: the link above is how you get back to your report. Anyone with the link can open it, so share it carefully.\n\n` +
      `The report re-checks your site every time you open it, so after you apply a fix, open it again to see your new grade.\n\n` +
      `Questions, or a fix that didn't work? Just reply to this email.\n\n` +
      `LeakPatrol\n`,
    html: reportReadyHtml({ host, origin, reportUrl, orderNumber, total, testMode, logoUrl }),
  };
};

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Table layout and inline styles, because many email apps ignore <style> blocks and flexbox.
// Colours match the site: navy header like the hero, blue accent like the buttons.
function reportReadyHtml({ host, origin, reportUrl, orderNumber, total, testMode, logoUrl }) {
  const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  const row = (label, value) =>
    `<tr><td style="padding:10px 0;border-top:1px solid #e2e6f0;color:#586079;font-size:14px;">${label}</td>` +
    `<td align="right" style="padding:10px 0;border-top:1px solid #e2e6f0;color:#0f1222;font-size:14px;font-weight:600;">${value}</td></tr>`;
  const step = (n, title, body) =>
    `<tr><td valign="top" width="36" style="padding:0 0 16px;"><div style="width:26px;height:26px;border-radius:13px;background:#e8ecff;color:#4c6ef5;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</div></td>` +
    `<td style="padding:0 0 16px;font-size:14px;line-height:1.5;color:#586079;"><strong style="color:#0f1222;">${title}</strong><br>${body}</td></tr>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Your LeakPatrol report</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;">Your full report for ${esc(host)} is ready. Order #${esc(orderNumber)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
${testMode ? `<tr><td style="padding:0 0 12px;text-align:center;font-size:12px;color:#b08800;font-weight:600;">TEST ORDER: no money was taken</td></tr>` : ''}
<tr><td style="background:#0d1020;border-radius:14px 14px 0 0;padding:22px 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px;"><img src="${esc(logoUrl)}" width="40" height="40" alt="" style="display:block;border-radius:10px;border:0;"></td>
    <td style="color:#f1f3fa;font-size:20px;font-weight:700;letter-spacing:-0.2px;">LeakPatrol</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;padding:32px 28px 8px;border-left:1px solid #e2e6f0;border-right:1px solid #e2e6f0;">
  <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:#0f1222;">Thanks for your order</h1>
  <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#586079;">Your full report for <strong style="color:#0f1222;">${esc(host)}</strong> is ready, with every problem we found, a plain-English fix and a copy-paste prompt for your AI tool.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
    ${row('Order number', `#${esc(orderNumber)}`)}
    ${row('Website', esc(host))}
    ${row('Product', 'LeakPatrol full report')}
    ${total ? row('Paid', esc(total)) : ''}
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>
    <td style="background:#4c6ef5;border-radius:10px;"><a href="${esc(reportUrl)}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Open your report</a></td>
  </tr></table>
  <p style="margin:0 0 28px;font-size:13px;line-height:1.5;color:#586079;">Keep this email: the button above is how you get back to your report. Anyone with the link can open it, so share it carefully.</p>
  <h2 style="margin:0 0 14px;font-size:16px;color:#0f1222;">What to do next</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${step(1, 'Start at the top', 'Problems are sorted most serious first. Fix the critical ones before anything else.')}
    ${step(2, 'Paste the prompt', 'Each fix comes with a prompt you can paste straight into Lovable, Bolt, v0, Replit or Cursor.')}
    ${step(3, 'Open the report again', 'It re-checks your site every time, so you can see each fix take effect and your grade go up.')}
  </table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e2e6f0;border-top:0;border-radius:0 0 14px 14px;padding:16px 28px 24px;">
  <p style="margin:0;font-size:14px;line-height:1.5;color:#586079;">Questions, or a fix that didn't work? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 28px;text-align:center;font-size:12px;line-height:1.5;color:#586079;">
  LeakPatrol · <a href="https://www.getleakpatrol.com" style="color:#586079;">getleakpatrol.com</a><br>
  Your payment receipt comes separately from Lemon Squeezy, our payment provider.
</td></tr>
</table></td></tr></table>
</body></html>`;
}
