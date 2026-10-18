// Secret patterns that should never appear in browser JavaScript.
// Each entry: id, name, severity, regex (global), and a short fix hint.
// Publishable/public keys (Stripe pk_, Supabase anon) are deliberately NOT here.

export const SECRET_PATTERNS = [
  {
    id: 'openai-key',
    name: 'OpenAI API key',
    severity: 'critical',
    regex: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}\b/g,
    fix: 'Revoke the key in the OpenAI dashboard, then call OpenAI from a server function (for example a Supabase Edge Function) instead of the browser. Set a monthly spend limit too, so a leaked key cannot run up an unlimited bill.',
  },
  {
    id: 'anthropic-key',
    name: 'Anthropic API key',
    severity: 'critical',
    regex: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/g,
    fix: 'Revoke the key in the Anthropic Console, then call the API from a server function instead of the browser. Set a monthly spend limit too, so a leaked key cannot run up an unlimited bill.',
  },
  {
    id: 'google-ai-key',
    name: 'Google API key',
    severity: 'high',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    fix: 'Restrict the key to your domain and to the APIs you need in Google Cloud Console. If it is a Gemini key, move the calls to a server function, rotate it and set a budget alert or quota so a leaked key cannot run up an unlimited bill.',
  },
  {
    id: 'stripe-secret',
    name: 'Stripe secret key',
    severity: 'critical',
    regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g,
    fix: 'Roll the key in the Stripe dashboard immediately. Only the publishable key (pk_live_...) belongs in the browser.',
  },
  {
    id: 'stripe-secret-test',
    name: 'Stripe test secret key',
    severity: 'medium',
    regex: /\b(?:sk|rk)_test_[0-9A-Za-z]{20,}\b/g,
    fix: 'Move Stripe secret keys to a server function. Test keys cannot move money, but they expose your test account.',
  },
  {
    id: 'aws-access-key',
    name: 'AWS access key ID',
    severity: 'critical',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    fix: 'Deactivate the key in AWS IAM and use a server-side function or pre-signed URLs instead.',
  },
  {
    id: 'github-token',
    name: 'GitHub token',
    severity: 'critical',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g,
    fix: 'Revoke the token in GitHub settings. Tokens must never be shipped to the browser.',
  },
  {
    id: 'slack-token',
    name: 'Slack token',
    severity: 'high',
    regex: /\bxox[abpors]-[A-Za-z0-9-]{10,}\b/g,
    fix: 'Revoke the token in your Slack app settings and send messages from a server function.',
  },
  {
    id: 'sendgrid-key',
    name: 'SendGrid API key',
    severity: 'high',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    fix: 'Delete the key in SendGrid and send email from a server function.',
  },
  {
    id: 'resend-key',
    name: 'Resend API key',
    severity: 'high',
    regex: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{24}\b/g,
    fix: 'Delete the key in Resend and send email from a server function.',
  },
  {
    id: 'private-key',
    name: 'Private key block',
    severity: 'critical',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    fix: 'Remove the private key from the front-end bundle and rotate it.',
  },
  {
    id: 'automation-webhook',
    name: 'Automation webhook URL',
    severity: 'medium',
    // Zapier catch hooks, Make (and old Integromat) hooks, Pipedream, n8n Cloud, and self-hosted n8n's default UUID paths.
    regex: /\bhttps:\/\/hooks\.zapier\.com\/hooks\/catch\/\d+\/[A-Za-z0-9]+\/?|\bhttps:\/\/hook\.(?:[a-z0-9]+\.)?(?:make|integromat)\.com\/[A-Za-z0-9]{20,}|\bhttps:\/\/[a-z0-9]+\.m\.pipedream\.net\b|\bhttps:\/\/[a-z0-9-]+\.app\.n8n\.cloud\/webhook(?:-test)?\/[A-Za-z0-9_-]+|\bhttps?:\/\/[A-Za-z0-9.-]+(?::\d+)?\/webhook(?:-test)?\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
    fix: 'Anyone can call this URL to trigger your automation (n8n, Make, Zapier or Pipedream) with any data they like. Call it from a server function instead, or require a secret header and check it at the start of the workflow.',
  },
];

export function maskSecret(value) {
  if (value.length <= 12) return value.slice(0, 3) + '…';
  return value.slice(0, 8) + '…' + value.slice(-4);
}
