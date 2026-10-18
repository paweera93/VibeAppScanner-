// End-to-end paid flow against a fake Lemon Squeezy API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { APPS, serve } from './demo-apps.js';

const SECRET = 'whsec_test';
let api, apiUrl, demo, demoUrl, fakeLs, fakeResend;
const checkoutRequests = [];
const sentEmails = [];

before(async () => {
  fakeLs = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      checkoutRequests.push({ headers: req.headers, body: JSON.parse(body) });
      res.writeHead(201, { 'content-type': 'application/vnd.api+json' });
      res.end(JSON.stringify({ data: { attributes: { url: 'https://leakpatrol.lemonsqueezy.com/checkout/custom/abc' } } }));
    });
  });
  await new Promise((r) => fakeLs.listen(0, '127.0.0.1', r));
  fakeResend = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      sentEmails.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"1"}');
    });
  });
  await new Promise((r) => fakeResend.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    RESEND_API_KEY: 're_test',
    RESEND_API_BASE: `http://127.0.0.1:${fakeResend.address().port}`,
    ALLOW_PRIVATE_TARGETS: '1',
    PAYMENTS_ENABLED: '1',
    LEMONSQUEEZY_API_BASE: `http://127.0.0.1:${fakeLs.address().port}`,
    LEMONSQUEEZY_API_KEY: 'test-key',
    LEMONSQUEEZY_STORE_ID: '1',
    LEMONSQUEEZY_VARIANT_ID: '2',
    LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
  });
  const { createServer } = await import('../src/server.js');
  api = createServer();
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${api.address().port}`;
  ({ server: demo, url: demoUrl } = await serve(APPS.broken));
});

after(() => {
  api.close();
  demo.close();
  fakeLs.close();
  fakeResend.close();
});

const post = (path, body, headers = {}) =>
  fetch(apiUrl + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

function webhook(event, secret = SECRET) {
  const raw = JSON.stringify(event);
  return post('/api/webhooks/lemonsqueezy', raw, { 'x-signature': createHmac('sha256', secret).update(raw).digest('hex') });
}

const orderEvent = (reportId, status = 'paid') => ({
  meta: { event_name: 'order_created', test_mode: true, custom_data: { report_id: reportId } },
  data: { id: '99', attributes: { status, order_number: 1042, total_formatted: '£9.00', user_email: 'buyer@example.com' } },
});

test('scan result says checkout is available', async () => {
  const r = await (await post('/api/scan', JSON.stringify({ url: demoUrl }))).json();
  assert.equal(r.checkoutAvailable, true);
});

test('buy, pay, and read the full report', async () => {
  const res = await post('/api/checkout', JSON.stringify({ url: demoUrl }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).checkoutUrl, 'https://leakpatrol.lemonsqueezy.com/checkout/custom/abc');

  const sent = checkoutRequests.at(-1);
  assert.equal(sent.headers.authorization, 'Bearer test-key');
  const reportId = sent.body.data.attributes.checkout_data.custom.report_id;
  assert.match(reportId, /^[0-9a-f]{32}$/);
  assert.match(sent.body.data.attributes.product_options.redirect_url, new RegExp(`/report.html\\?id=${reportId}$`));
  assert.equal(sent.body.data.relationships.variant.data.id, '2');

  // Before the webhook arrives the report is pending.
  assert.equal((await fetch(`${apiUrl}/api/report?id=${reportId}`)).status, 202);

  // Forged and unpaid webhooks don't unlock it.
  assert.equal((await webhook(orderEvent(reportId), 'wrong-secret')).status, 401);
  assert.equal((await webhook(orderEvent(reportId, 'pending'))).status, 200);
  assert.equal((await fetch(`${apiUrl}/api/report?id=${reportId}`)).status, 202);

  assert.equal((await webhook(orderEvent(reportId))).status, 200);
  // The buyer gets one email with their report link and order number, even if the webhook is retried.
  assert.equal((await webhook(orderEvent(reportId))).status, 200);
  const toBuyer = sentEmails.filter((e) => e.to[0] === 'buyer@example.com');
  assert.equal(toBuyer.length, 1);
  assert.match(toBuyer[0].text, new RegExp(`/report\\.html\\?id=${reportId}`));
  assert.match(toBuyer[0].text, /#1042/);
  assert.match(toBuyer[0].subject, /^\[TEST\] Your LeakPatrol report/);
  assert.match(toBuyer[0].html, /Open your report/);
  assert.match(toBuyer[0].html, /£9\.00/);
  assert.ok(toBuyer[0].html.includes(`/report.html?id=${reportId}`));

  const report = await fetch(`${apiUrl}/api/report?id=${reportId}`);
  assert.equal(report.status, 200);
  assert.equal(report.headers.get('cache-control'), 'no-store');
  const body = await report.json();
  const { report: full } = body;
  assert.equal(full.score.grade, 'F');
  assert.ok(full.findings.some((f) => f.prompt));
  // The first open is the starting point for progress tracking.
  assert.equal(body.progress.first, true);
  assert.ok(full.findings.filter((f) => f.severity !== 'info').every((f) => f.status === 'open'));
  assert.match(body.databaseSql, /pg_policies/);
  assert.equal(body.badge, null, 'no badge for an F');

  // Deep database check from a pasted query result.
  const pasted = JSON.stringify({ tables: [{ name: 'profiles', rls: false }], policies: [], views: [], functions: [], buckets: [] });
  const db = await post('/api/report/database', JSON.stringify({ id: reportId, result: pasted }));
  assert.equal(db.status, 200);
  const dbBody = await db.json();
  assert.equal(dbBody.findings[0].title, 'Row Level Security is off on "profiles"');
  assert.equal((await post('/api/report/database', JSON.stringify({ id: reportId, result: 'hello' }))).status, 400);
  assert.equal((await post('/api/report/database', JSON.stringify({ id: '0'.repeat(32), result: pasted }))).status, 404);

  const md = await fetch(`${apiUrl}/api/report?id=${reportId}&format=md`);
  assert.match(await md.text(), /^# LeakPatrol report/);
});

test('unknown badges are 404', async () => {
  assert.equal((await fetch(`${apiUrl}/api/badge/${'a'.repeat(32)}.svg`)).status, 404);
  assert.equal((await fetch(`${apiUrl}/api/badge/nope.svg`)).status, 404);
});

test('unknown or malformed report ids are 404', async () => {
  assert.equal((await fetch(`${apiUrl}/api/report?id=${'0'.repeat(32)}`)).status, 404);
  assert.equal((await fetch(`${apiUrl}/api/report?id=../../etc`)).status, 404);
});

test('serves the report page', async () => {
  const res = await fetch(apiUrl + '/report.html');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Fix these, top first/);
});
