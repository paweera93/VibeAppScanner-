// Security headers and cookie flags on the main page response.

const HEADER_RULES = [
  {
    header: 'content-security-policy',
    id: 'missing-csp',
    title: 'No Content-Security-Policy header',
    severity: 'medium',
    fix: "Add a Content-Security-Policy header. A safe starting point for most single-page apps is: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; then add the domains your app really calls (for example your Supabase URL in connect-src).",
  },
  {
    header: 'x-frame-options',
    id: 'missing-frame-protection',
    title: 'Page can be embedded in other sites (clickjacking)',
    severity: 'low',
    // Satisfied by CSP frame-ancestors too.
    satisfiedBy: (h) => /frame-ancestors/i.test(h.get('content-security-policy') || ''),
    fix: "Add X-Frame-Options: DENY, or frame-ancestors 'none' in your Content-Security-Policy.",
  },
  {
    header: 'x-content-type-options',
    id: 'missing-nosniff',
    title: 'No X-Content-Type-Options header',
    severity: 'low',
    fix: 'Add X-Content-Type-Options: nosniff.',
  },
  {
    header: 'referrer-policy',
    id: 'missing-referrer-policy',
    title: 'No Referrer-Policy header',
    severity: 'low',
    fix: 'Add Referrer-Policy: strict-origin-when-cross-origin.',
  },
  {
    header: 'permissions-policy',
    id: 'missing-permissions-policy',
    title: 'No Permissions-Policy header',
    severity: 'info',
    fix: 'Add Permissions-Policy: camera=(), microphone=(), geolocation=() unless your app needs those features.',
  },
];

export function checkHeaders(page) {
  const findings = [];
  const h = page.headers;

  for (const rule of HEADER_RULES) {
    if (h.get(rule.header)) continue;
    if (rule.satisfiedBy && rule.satisfiedBy(h)) continue;
    findings.push({
      id: rule.id,
      category: 'headers',
      severity: rule.severity,
      title: rule.title,
      fix: rule.fix,
    });
  }

  const isHttps = page.url.startsWith('https://');
  if (isHttps && !h.get('strict-transport-security')) {
    findings.push({
      id: 'missing-hsts',
      category: 'headers',
      severity: 'low',
      title: 'No Strict-Transport-Security header',
      fix: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.',
    });
  }

  const poweredBy = h.get('x-powered-by');
  if (poweredBy) {
    findings.push({
      id: 'x-powered-by',
      category: 'headers',
      severity: 'info',
      title: 'Server reveals its framework',
      detail: `X-Powered-By: ${poweredBy}`,
      fix: 'Remove the X-Powered-By header so attackers learn less about your stack.',
    });
  }

  findings.push(...checkCookies(h.getSetCookie?.() || [], isHttps));
  return findings;
}

function checkCookies(setCookies, isHttps) {
  const findings = [];
  for (const raw of setCookies) {
    const name = raw.split('=')[0].trim();
    const lower = raw.toLowerCase();
    const missing = [];
    if (isHttps && !/;\s*secure/.test(lower)) missing.push('Secure');
    if (!/;\s*httponly/.test(lower)) missing.push('HttpOnly');
    if (!/;\s*samesite=/.test(lower)) missing.push('SameSite');
    if (missing.length) {
      findings.push({
        id: 'cookie-flags',
        category: 'cookies',
        severity: missing.includes('HttpOnly') && /sess|auth|token/i.test(name) ? 'medium' : 'low',
        title: `Cookie "${name}" is missing ${missing.join(', ')}`,
        fix: 'Set cookies with Secure; HttpOnly; SameSite=Lax (or Strict) unless your front-end must read them.',
      });
    }
  }
  return findings;
}
