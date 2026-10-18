import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, serve } from './demo-apps.js';

let api, apiUrl, demo, demoUrl;

before(async () => {
  process.env.ALLOW_PRIVATE_TARGETS = '1';
  const { createServer } = await import('../src/server.js');
  api = createServer();
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${api.address().port}`;
  ({ server: demo, url: demoUrl } = await serve(APPS.broken));
});

after(() => {
  api.close();
  demo.close();
});

const postScan = (url, headers = {}) =>
  fetch(`${apiUrl}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ url }) });

test('serves the landing page with security headers', async () => {
  const res = await fetch(apiUrl + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Is your vibe-coded app <span class="accent">leaking secrets\?/);
  assert.ok(res.headers.get('content-security-policy'));
});

test('serves sitemap, robots.txt and llms.txt for search engines', async () => {
  const sitemap = await fetch(apiUrl + '/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /xml/);
  const xml = await sitemap.text();
  assert.match(xml, /lovable-security-check\.html/);
  assert.ok(!xml.includes('report.html'), 'private report pages stay out of the sitemap');
  assert.match(await (await fetch(apiUrl + '/robots.txt')).text(), /Sitemap: https:\/\/www\.getleakpatrol\.com\/sitemap\.xml/);
  assert.match(await (await fetch(apiUrl + '/llms.txt')).text(), /^# LeakPatrol/);
});

test('blocks path traversal', async () => {
  const res = await fetch(apiUrl + '/..%2f..%2fpackage.json');
  assert.equal(res.status, 404);
});

test('free report shows issues but locks the fixes', async () => {
  const res = await postScan(demoUrl, { 'x-forwarded-for': '203.0.113.1' });
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.score.grade, 'F');
  assert.ok(r.issues.length > 3);
  assert.equal(r.preview.length, 1);
  assert.equal(r.lockedFixes, r.issues.length - 1);
  assert.ok(r.issues.every((i) => !('fix' in i)), 'issue list must not include fixes');
});

test('rejects bad input', async () => {
  const res = await postScan('ftp://example.com', { 'x-forwarded-for': '203.0.113.2' });
  assert.equal(res.status, 400);
});

test('rate limits a visitor after 5 scans, using the last X-Forwarded-For entry', async () => {
  // Distinct targets so the cache doesn't answer. Spoofed first entries must not reset the limit.
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const res = await postScan(`${demoUrl}?n=${i}`.replace('127.0.0.1', `127.0.0.${i + 2}`), { 'x-forwarded-for': `10.0.0.${i}, 198.51.100.7` });
    statuses.push(res.status);
  }
  assert.equal(statuses.at(-1), 429);
});

const postWaitlist = (body, ip) =>
  fetch(`${apiUrl}/api/waitlist`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });

test('waitlist accepts a valid email and rejects a bad one', async () => {
  assert.equal((await postWaitlist({ email: 'maker@example.com' }, '203.0.113.50')).status, 200);
  assert.equal((await postWaitlist({ email: 'not-an-email' }, '203.0.113.50')).status, 400);
});

test('waitlist rate limits one visitor', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await postWaitlist({ email: `p${i}@example.com` }, '203.0.113.60')).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

test('payments are off by default', async () => {
  const res = await fetch(`${apiUrl}/api/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'example.com' }) });
  assert.equal(res.status, 503);
});

test('serves the about page and the link preview image', async () => {
  assert.equal((await fetch(apiUrl + '/about.html')).status, 200);
  const img = await fetch(apiUrl + '/og-image.png');
  assert.equal(img.headers.get('content-type'), 'image/png');
});

test('config says whether checkout is on', async () => {
  assert.deepEqual(await (await fetch(apiUrl + '/api/config')).json(), { checkoutAvailable: false });
});

test('the bare domain redirects pages to www, but not POSTs', async () => {
  const { request } = await import('node:http');
  const call = (method, path) =>
    new Promise((resolve) => {
      const req = request(`${apiUrl}${path}`, { method, headers: { host: 'getleakpatrol.com' } }, (res) => {
        res.resume();
        resolve(res);
      });
      req.end();
    });
  const page = await call('GET', '/about.html?ref=x');
  assert.equal(page.statusCode, 301);
  assert.equal(page.headers.location, 'https://www.getleakpatrol.com/about.html?ref=x');
  assert.notEqual((await call('POST', '/api/webhooks/lemonsqueezy')).statusCode, 301);
  // www itself is served normally.
  assert.equal((await fetch(apiUrl + '/', { headers: { host: 'www.getleakpatrol.com' } })).status, 200);
});
