// Runs every free (passive, read-only) check against one URL and returns a report.

import { lookup } from 'node:dns/promises';
import { get } from './http.js';
import { checkHeaders } from './checks/headers.js';
import { checkBundles } from './checks/bundles.js';
import { checkExposedFiles } from './checks/exposed-files.js';
import { checkSupabaseDeep } from './checks/supabase.js';

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_PENALTY = { critical: 30, high: 15, medium: 5, low: 2, info: 0 };

export function normaliseTarget(input) {
  let s = String(input || '').trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) {
    throw new Error('Only http and https URLs can be scanned');
  }
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const url = new URL(s);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs can be scanned');
  url.hash = '';
  return url;
}

// deep: also run the Supabase database checks. Only for sites whose owner has verified them.
// supabaseRewrite: tests only, points *.supabase.co at a local fake.
export async function scan(input, { allowPrivate = false, deep = false, supabaseRewrite } = {}) {
  const target = normaliseTarget(input);
  await assertScannable(target.hostname, allowPrivate);
  const startedAt = new Date().toISOString();

  const page = await get(target.href);
  if (!page.ok) {
    return { target: target.href, startedAt, reachable: false, error: page.error, findings: [], score: null };
  }
  const finalUrl = new URL(page.url);
  if (!allowPrivate && isPrivateHost(finalUrl.hostname)) {
    throw new Error('Target redirected to a local or private address');
  }
  const origin = finalUrl.origin;

  const findings = [];
  findings.push(...(await checkTransport(target, page)));
  findings.push(...checkHeaders(page));
  const bundles = await checkBundles(page, { origin });
  findings.push(...bundles.findings);
  findings.push(...(await checkExposedFiles(origin)));
  if (deep && bundles.supabaseProjects.length) {
    findings.push(...(await checkSupabaseDeep(bundles.supabaseProjects, { tableHints: bundles.supabaseTables, rewrite: supabaseRewrite })));
  }

  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return {
    target: target.href,
    finalUrl: page.url,
    startedAt,
    finishedAt: new Date().toISOString(),
    reachable: true,
    status: page.status,
    scriptsScanned: bundles.scriptsScanned,
    usesSupabase: bundles.supabaseUrls.length > 0,
    deep,
    summary: summarise(findings),
    score: score(findings),
    findings,
  };
}

async function checkTransport(target, page) {
  const findings = [];
  if (!page.url.startsWith('https://')) {
    findings.push({
      id: 'no-https',
      category: 'transport',
      severity: 'high',
      title: 'Site is served without HTTPS',
      fix: 'Serve the site over HTTPS. Most hosts (Vercel, Netlify, Cloudflare) do this for free once you add your domain.',
    });
    return findings;
  }
  // Does plain http:// redirect to https://?
  const plain = new URL(page.url);
  plain.protocol = 'http:';
  const res = await get(plain.href, { redirect: 'manual', maxBytes: 16 * 1024 });
  if (res.ok && res.status === 200) {
    findings.push({
      id: 'no-https-redirect',
      category: 'transport',
      severity: 'medium',
      title: 'Plain http:// version does not redirect to https://',
      fix: 'Turn on "force HTTPS" at your host so every http:// request redirects to https://.',
    });
  }
  return findings;
}

export function summarise(findings) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export function score(findings) {
  // Count each finding id once so 10 missing-flag cookies don't sink the score.
  const worst = new Map();
  for (const f of findings) {
    const prev = worst.get(f.id);
    if (!prev || SEVERITY_PENALTY[f.severity] > SEVERITY_PENALTY[prev]) worst.set(f.id, f.severity);
  }
  let value = 100;
  for (const sev of worst.values()) value -= SEVERITY_PENALTY[sev];
  value = Math.max(0, value);
  const grade = value >= 90 ? 'A' : value >= 75 ? 'B' : value >= 60 ? 'C' : value >= 40 ? 'D' : 'F';
  return { value, grade };
}

export async function assertScannable(hostname, allowPrivate = false) {
  if (!allowPrivate && (isPrivateHost(hostname) || (await resolvesToPrivate(hostname)))) {
    throw new Error('Refusing to scan a local or private address');
  }
}

// A public-looking name can still point at an internal address (SSRF), so check DNS too.
async function resolvesToPrivate(hostname) {
  try {
    const addrs = await lookup(hostname, { all: true });
    return addrs.some((a) => isPrivateHost(a.address));
  } catch {
    return false; // Unresolvable: the fetch will fail and report it.
  }
}

export function isPrivateHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return h.includes(':');
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
