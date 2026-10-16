// Web server: serves the site from public/ and the scan API.
// One small service so the whole product runs as a single Cloud Run container.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, normaliseTarget } from './scan.js';
import { toFreeReport } from './report.js';
import { RateLimiter, TtlCache } from './limits.js';
import { createWaitlist, normaliseEmail } from './waitlist.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_TARGETS === '1'; // tests only

const perVisitor = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 }); // 5 scans/hour/IP
const perDomain = new TtlCache(10 * 60 * 1000); // reuse a domain's result for 10 minutes
const inFlight = new Map();
const signupLimit = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
const waitlist = createWaitlist();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
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
      if (url.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
      return await serveStatic(url.pathname, res);
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
  const free = toFreeReport(report);
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
  await waitlist.add(email, 'results');
  console.log(JSON.stringify({ severity: 'INFO', event: 'waitlist_signup' }));
  return sendJson(res, 200, { ok: true });
}

async function serveStatic(pathname, res) {
  if (pathname === '/') pathname = '/index.html';
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

function clientIp(req) {
  // Cloud Run appends the real client IP to X-Forwarded-For; earlier entries can be
  // forged by the client, so take the last one.
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',').at(-1) : req.socket.remoteAddress || 'unknown').trim();
}

function readJson(req, maxBytes) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, ...SECURITY_HEADERS });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), 'application/json');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(JSON.stringify({ severity: 'INFO', message: `listening on ${PORT}` })));
}
