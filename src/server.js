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

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_TARGETS === '1'; // tests only

const perVisitor = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 }); // 5 scans/hour/IP
const perDomain = new TtlCache(10 * 60 * 1000); // reuse a domain's result for 10 minutes
const inFlight = new Map();
const signupLimit = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
const checkoutLimit = new RateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const fullScans = new TtlCache(10 * 60 * 1000); // paid reports re-scan at most every 10 minutes
const store = createStore();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.png': 'image/png' };
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
      if (url.pathname === '/api/scan' && req.method === 'POST') return await handleScan(req, res);
      if (url.pathname === '/api/waitlist' && req.method === 'POST') return await handleWaitlist(req, res);
      if (url.pathname === '/api/checkout' && req.method === 'POST') return await handleCheckout(req, res);
      if (url.pathname === '/api/webhooks/lemonsqueezy' && req.method === 'POST') return await handleWebhook(req, res);
      if (url.pathname === '/api/report' && req.method === 'GET') return await handleReport(url, res);
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
  await addToWaitlist(store, email, 'results');
  console.log(JSON.stringify({ severity: 'INFO', event: 'waitlist_signup' }));
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
    await store.create('reports', reportId, { origin: target.origin, status: 'paid', paidAt: new Date(), testMode: true, createdAt: new Date() });
    return sendJson(res, 200, { checkoutUrl: `/report.html?id=${reportId}` });
  }
  await store.create('reports', reportId, { origin: target.origin, status: 'pending', createdAt: new Date() });
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
        status: 'paid', paidAt: new Date(), orderId: order.orderId, email: order.email, testMode: order.testMode,
      });
      console.log(JSON.stringify({ severity: 'INFO', event: 'report_paid', origin: report.origin, testMode: order.testMode }));
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
  let full = fullScans.get(record.origin);
  if (!full) {
    full = toFullReport(await scan(record.origin, { allowPrivate: ALLOW_PRIVATE }));
    if (full.reachable) fullScans.set(record.origin, full);
  }
  if (url.searchParams.get('format') === 'md') {
    return send(res, 200, renderMarkdown(full), 'text/markdown; charset=utf-8', {
      'cache-control': 'no-store',
      'content-disposition': 'attachment; filename="leakpatrol-report.md"',
    });
  }
  return sendJson(res, 200, { status: 'paid', report: full }, { 'cache-control': 'no-store' });
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
