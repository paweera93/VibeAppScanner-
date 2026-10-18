// Web server: serves the site from public/ and the scan API.
// One small service so the whole product runs as a single Cloud Run container.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, normaliseTarget } from './scan.js';
import { toFreeReport, toFullReport, renderMarkdown } from './report.js';
import { RateLimiter, TtlCache } from './limits.js';
import { addToWaitlist, normaliseEmail } from './waitlist.js';
import { createStore } from './store.js';
import { paymentsConfig, newReportId, createCheckout, verifySignature, paidOrderFrom, REPORT_ID_RE } from './payments.js';
import { newVerifyToken, checkOwnership, instructions } from './verify.js';
import { emailConfig, sendEmail, waitlistWelcome, waitlistAlert, reportReady } from './email.js';
import { trackProgress, badgeState, badgeSvg } from './progress.js';
import { DATABASE_SQL, parseDatabaseResult, analyseDatabase } from './sqlcheck.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_TARGETS === '1'; // tests only
// Tests only: send Supabase API calls to a local fake instead of *.supabase.co.
const SUPABASE_TEST_BASE = ALLOW_PRIVATE ? process.env.SUPABASE_TEST_BASE : undefined;
const supabaseRewrite = SUPABASE_TEST_BASE ? () => SUPABASE_TEST_BASE : undefined;
// The site's one public address. Page requests to the bare domain are sent here.
const CANONICAL_HOST = process.env.CANONICAL_HOST || 'www.getleakpatrol.com';
const BARE_HOST = CANONICAL_HOST.replace(/^www\./, '');

const perVisitor = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 }); // 5 scans/hour/IP
const perDomain = new TtlCache(10 * 60 * 1000); // reuse a domain's result for 10 minutes
const inFlight = new Map();
const signupLimit = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
const checkoutLimit = new RateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const fullScans = new TtlCache(10 * 60 * 1000); // paid reports re-scan at most every 10 minutes
const verifyLimit = new RateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
const databaseLimit = new RateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });
const store = createStore();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8' };
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      // Only GET/HEAD: redirecting a POST (a payment webhook, say) would drop its body.
      if (String(req.headers.host || '').toLowerCase() === BARE_HOST && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(301, { location: `https://${CANONICAL_HOST}${req.url}`, ...SECURITY_HEADERS });
        return res.end();
      }
      if (url.pathname === '/api/scan' && req.method === 'POST') return await handleScan(req, res);
      if (url.pathname === '/api/waitlist' && req.method === 'POST') return await handleWaitlist(req, res);
      if (url.pathname === '/api/checkout' && req.method === 'POST') return await handleCheckout(req, res);
      if (url.pathname === '/api/webhooks/lemonsqueezy' && req.method === 'POST') return await handleWebhook(req, res);
      if (url.pathname === '/api/report' && req.method === 'GET') return await handleReport(url, res);
      if (url.pathname === '/api/verify' && req.method === 'POST') return await handleVerify(req, res);
      if (url.pathname === '/api/report/database' && req.method === 'POST') return await handleDatabaseCheck(req, res);
      if (url.pathname.startsWith('/api/badge/') && req.method === 'GET') return await handleBadge(url, res);
      if (url.pathname === '/api/config' && req.method === 'GET') return sendJson(res, 200, { checkoutAvailable: paymentsConfig().enabled });
      if (url.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
      return await serveStatic(url, req, res);
    } catch (err) {
      console.error(JSON.stringify({ severity: 'ERROR', message: err.stack || String(err) }));
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  });
}

async function handleScan(req, res) {
  const body = await readJson(req, 4096);
  let target;
  try {
    target = normaliseTarget(body?.url);
  } catch {
    return sendJson(res, 400, { error: 'Please enter a valid website address, like myapp.lovable.app' });
  }

  const key = target.origin;
  const cached = perDomain.get(key);
  if (cached) return sendJson(res, 200, cached);

  const ip = clientIp(req);
  if (!perVisitor.allow(ip)) {
    return sendJson(res, 429, { error: 'You have run 5 scans in the last hour. Please try again later.' });
  }

  // Two people scanning the same site at once share one scan.
  let pending = inFlight.get(key);
  if (!pending) {
    pending = scan(target.href, { allowPrivate: ALLOW_PRIVATE }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  let report;
  try {
    report = await pending;
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const free = { ...toFreeReport(report), checkoutAvailable: paymentsConfig().enabled };
  if (report.reachable) perDomain.set(key, free);
  console.log(JSON.stringify({ severity: 'INFO', event: 'scan', origin: key, score: report.score?.value ?? null, findings: report.findings.length }));
  return sendJson(res, 200, free);
}

async function handleWaitlist(req, res) {
  const body = await readJson(req, 1024);
  // Bots fill every field; people never see this one.
  if (body?.website) return sendJson(res, 200, { ok: true });
  let email;
  try {
    email = normaliseEmail(body?.email);
  } catch {
    return sendJson(res, 400, { error: 'Please enter a valid email address.' });
  }
  if (!signupLimit.allow(clientIp(req))) {
    return sendJson(res, 429, { error: 'Too many sign-ups from your connection. Please try again later.' });
  }
  const isNew = await addToWaitlist(store, email, 'results');
  console.log(JSON.stringify({ severity: 'INFO', event: 'waitlist_signup', isNew }));
  if (isNew) {
    // Sent before replying: Cloud Run may pause the container once the response is out.
    // A failed email is logged but never fails the sign-up, which is already saved.
    const cfg = emailConfig();
    const results = await Promise.allSettled([
      sendEmail(cfg, { to: email, ...waitlistWelcome() }),
      sendEmail(cfg, { to: cfg.notify, ...waitlistAlert(email) }),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.error(JSON.stringify({ severity: 'ERROR', event: 'email_failed', message: String(r.reason?.message || r.reason) }));
    }
  }
  return sendJson(res, 200, { ok: true });
}

async function handleCheckout(req, res) {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return sendJson(res, 503, { error: 'Full reports are not on sale yet.' });
  const body = await readJson(req, 4096);
  let target;
  try {
    target = normaliseTarget(body?.url);
  } catch {
    return sendJson(res, 400, { error: 'Please scan a valid website address first.' });
  }
  if (!checkoutLimit.allow(clientIp(req))) {
    return sendJson(res, 429, { error: 'Too many checkout attempts. Please try again later.' });
  }
  const reportId = newReportId();
  if (cfg.demo) {
    await store.create('reports', reportId, { origin: target.origin, status: 'paid', paidAt: new Date(), testMode: true, verifyToken: newVerifyToken(), createdAt: new Date() });
    return sendJson(res, 200, { checkoutUrl: `/report.html?id=${reportId}` });
  }
  await store.create('reports', reportId, { origin: target.origin, status: 'pending', verifyToken: newVerifyToken(), createdAt: new Date() });
  const checkoutUrl = await createCheckout(cfg, { reportId, origin: target.origin });
  console.log(JSON.stringify({ severity: 'INFO', event: 'checkout_created', origin: target.origin }));
  return sendJson(res, 200, { checkoutUrl });
}

async function handleWebhook(req, res) {
  const cfg = paymentsConfig();
  const raw = await readRaw(req, 1024 * 1024);
  if (!raw || !verifySignature(raw, req.headers['x-signature'], cfg.webhookSecret)) {
    console.log(JSON.stringify({ severity: 'WARNING', event: 'webhook_bad_signature' }));
    return sendJson(res, 401, { error: 'bad signature' });
  }
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return sendJson(res, 400, { error: 'bad json' });
  }
  const order = paidOrderFrom(event);
  if (order) {
    const report = await store.get('reports', order.reportId);
    if (report) {
      await store.update('reports', order.reportId, {
        status: 'paid', paidAt: new Date(), orderId: order.orderId, orderNumber: order.orderNumber, email: order.email, testMode: order.testMode,
      });
      console.log(JSON.stringify({ severity: 'INFO', event: 'report_paid', origin: report.origin, testMode: order.testMode }));
      // Email the report link once. Lemon Squeezy retries webhooks, so skip reports that were already paid.
      if (report.status !== 'paid' && order.email) {
        const reportUrl = `${cfg.publicUrl}/report.html?id=${order.reportId}`;
        try {
          await sendEmail(emailConfig(), { to: order.email, ...reportReady({ origin: report.origin, reportUrl, orderNumber: order.orderNumber, total: order.total, testMode: order.testMode, logoUrl: `${cfg.publicUrl}/logo.png` }) });
        } catch (err) {
          // The report is already unlocked, and the buyer lands on it after checkout, so a failed email is only logged.
          console.error(JSON.stringify({ severity: 'ERROR', event: 'email_failed', message: String(err?.message || err) }));
        }
      }
    } else {
      console.log(JSON.stringify({ severity: 'WARNING', event: 'webhook_unknown_report', orderId: order.orderId }));
    }
  }
  // Always 200 for a valid signature, so Lemon Squeezy doesn't retry events we ignore.
  return sendJson(res, 200, { ok: true });
}

async function handleReport(url, res) {
  const id = url.searchParams.get('id') || '';
  if (!REPORT_ID_RE.test(id)) return sendJson(res, 404, { error: 'Report not found.' }, { 'cache-control': 'no-store' });
  const record = await store.get('reports', id);
  if (!record) return sendJson(res, 404, { error: 'Report not found.' }, { 'cache-control': 'no-store' });
  if (record.status !== 'paid') return sendJson(res, 202, { status: 'pending' }, { 'cache-control': 'no-store' });

  // Paid reports re-scan the site, so after fixing things the buyer can reload and see the new grade.
  // Verified owners also get the database checks.
  const deep = record.verified === true;
  const cacheKey = `${record.origin}|${deep ? 'deep' : 'basic'}`;
  let full = fullScans.get(cacheKey);
  if (!full) {
    full = toFullReport(await scan(record.origin, { allowPrivate: ALLOW_PRIVATE, deep, supabaseRewrite }));
    if (full.reachable) fullScans.set(cacheKey, full);
  }
  if (url.searchParams.get('format') === 'md') {
    return send(res, 200, renderMarkdown(full), 'text/markdown; charset=utf-8', {
      'cache-control': 'no-store',
      'content-disposition': 'attachment; filename="leakpatrol-report.md"',
    });
  }
  let verification = { verified: true, method: record.verifyMethod };
  if (!deep) {
    let token = record.verifyToken;
    if (!token) {
      token = newVerifyToken(); // reports bought before verification existed
      await store.update('reports', id, { verifyToken: token });
    }
    verification = { verified: false, ...instructions(record.origin, token) };
  }
  // Progress against the first check, and a badge once a verified owner reaches an A.
  let progress = null;
  let badge = null;
  if (full.reachable) {
    const tracked = trackProgress(record, full);
    progress = tracked.progress;
    const updated = { ...record, ...tracked.updates };
    if (badgeState(updated).valid) {
      if (!record.badgeId) {
        tracked.updates.badgeId = newReportId();
        await store.create('badges', tracked.updates.badgeId, { reportId: id, createdAt: new Date() });
      }
      const badgeId = tracked.updates.badgeId || record.badgeId;
      const base = paymentsConfig().publicUrl;
      badge = { page: `${base}/verified.html?b=${badgeId}`, image: `${base}/api/badge/${badgeId}.svg` };
    }
    await store.update('reports', id, tracked.updates);
  }
  const findings = full.findings.map((f) => ({ ...f, status: progress?.status[`${f.id}|${f.title}`] }));
  if (progress) delete progress.status;
  return sendJson(res, 200, { status: 'paid', report: { ...full, findings }, verification, progress, badge, databaseSql: DATABASE_SQL }, { 'cache-control': 'no-store' });
}

// The buyer pastes the result of DATABASE_SQL from their Supabase SQL editor. Nothing is stored.
async function handleDatabaseCheck(req, res) {
  const body = await readJson(req, 512 * 1024);
  const id = String(body?.id || '');
  if (!REPORT_ID_RE.test(id)) return sendJson(res, 404, { error: 'Report not found.' });
  const record = await store.get('reports', id);
  if (!record || record.status !== 'paid') return sendJson(res, 404, { error: 'Report not found.' });
  if (!databaseLimit.allow(clientIp(req))) return sendJson(res, 429, { error: 'Too many checks. Please wait a few minutes and try again.' });
  const db = parseDatabaseResult(body?.result);
  if (!db) {
    return sendJson(res, 400, { error: 'That doesn\'t look like the result of our query. Run the whole query, then copy the single value in the "leakpatrol" column and paste it here.' });
  }
  const result = analyseDatabase(db);
  console.log(JSON.stringify({ severity: 'INFO', event: 'database_check', origin: record.origin, tables: result.summary.tables, findings: result.findings.length }));
  return sendJson(res, 200, result, { 'cache-control': 'no-store' });
}

// Public: /api/badge/<id>.svg (the image) and /api/badge/<id>.json (for the verification page).
async function handleBadge(url, res) {
  const m = url.pathname.match(/^\/api\/badge\/([0-9a-f]{32})\.(svg|json)$/);
  if (!m) return sendJson(res, 404, { error: 'Badge not found.' });
  const link = await store.get('badges', m[1]);
  const record = link && (await store.get('reports', link.reportId));
  if (!record) return sendJson(res, 404, { error: 'Badge not found.' });
  const state = badgeState(record);
  const cache = { 'cache-control': 'public, max-age=3600' };
  if (m[2] === 'svg') return send(res, 200, badgeSvg(state), 'image/svg+xml', cache);
  return sendJson(res, 200, { valid: state.valid, grade: state.grade, checkedAt: state.checkedAt, host: new URL(record.origin).host }, cache);
}

async function handleVerify(req, res) {
  const body = await readJson(req, 1024);
  const id = String(body?.id || '');
  if (!REPORT_ID_RE.test(id)) return sendJson(res, 404, { error: 'Report not found.' });
  const record = await store.get('reports', id);
  if (!record || record.status !== 'paid') return sendJson(res, 404, { error: 'Report not found.' });
  if (record.verified) return sendJson(res, 200, { verified: true, method: record.verifyMethod });
  if (!record.verifyToken) return sendJson(res, 409, { error: 'Reload the report page first.' });
  if (!verifyLimit.allow(clientIp(req))) {
    return sendJson(res, 429, { error: 'Too many checks. Please wait a few minutes and try again.' });
  }

  let method;
  try {
    method = await checkOwnership(record.origin, record.verifyToken, { allowPrivate: ALLOW_PRIVATE });
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  if (!method) {
    return sendJson(res, 200, {
      verified: false,
      error: 'We could not find your code yet. Make sure the change is published (not just saved in the editor), then try again. DNS changes can take up to an hour.',
    });
  }
  await store.update('reports', id, { verified: true, verifiedAt: new Date(), verifyMethod: method });
  console.log(JSON.stringify({ severity: 'INFO', event: 'site_verified', origin: record.origin, method }));
  return sendJson(res, 200, { verified: true, method });
}

async function serveStatic(url, req, res) {
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  if (pathname.endsWith('.html')) logPageView(pathname, url, req);
  const file = normalize(join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'Not found', 'text/plain');
  try {
    const data = await readFile(file);
    return send(res, 200, data, TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    const data = await readFile(join(PUBLIC_DIR, '404.html')).catch(() => 'Not found');
    return send(res, 404, data, 'text/html; charset=utf-8');
  }
}

// Cookie-free visit counting: one log line per page view, with where the visitor came from.
// No IP or personal data is logged. Count them in Cloud Logging (see README).
function logPageView(path, url, req) {
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|preview|curl|wget|python|monitor|uptime/i.test(ua)) return;
  let from = url.searchParams.get('ref') || url.searchParams.get('utm_source') || '';
  if (!from) {
    try {
      from = new URL(req.headers.referer).hostname;
    } catch {
      from = 'direct';
    }
  }
  console.log(JSON.stringify({ severity: 'INFO', event: 'pageview', path, from: from.slice(0, 60) }));
}

function clientIp(req) {
  // Cloud Run appends the real client IP to X-Forwarded-For; earlier entries can be
  // forged by the client, so take the last one.
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',').at(-1) : req.socket.remoteAddress || 'unknown').trim();
}

async function readJson(req, maxBytes) {
  const raw = await readRaw(req, maxBytes);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

function readRaw(req, maxBytes) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
    req.on('close', () => resolve(size > maxBytes ? null : Buffer.concat(chunks)));
  });
}

function send(res, status, body, type, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': type, ...SECURITY_HEADERS, ...extraHeaders });
  res.end(body);
}

function sendJson(res, status, obj, extraHeaders) {
  send(res, status, JSON.stringify(obj), 'application/json', extraHeaders);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(JSON.stringify({ severity: 'INFO', message: `listening on ${PORT}` })));
}
