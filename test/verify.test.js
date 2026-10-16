// Owner verification and the deep Supabase check, end to end through the demo checkout.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, serve, serveSupabase } from './demo-apps.js';
import { hasMetaTag, checkOwnership } from '../src/verify.js';
import { checkSupabaseDeep } from '../src/checks/supabase.js';

let api, apiUrl, demo, demoUrl, supa;
const app = { ...APPS.broken, files: { ...APPS.broken.files } };

before(async () => {
  supa = await serveSupabase();
  Object.assign(process.env, { ALLOW_PRIVATE_TARGETS: '1', PAYMENTS_DEMO: '1', SUPABASE_TEST_BASE: supa.url });
  const { createServer } = await import('../src/server.js');
  api = createServer();
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${api.address().port}`;
  ({ server: demo, url: demoUrl } = await serve(app));
});

after(() => {
  api.close();
  demo.close();
  supa.server.close();
});

const post = (path, body) => fetch(apiUrl + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('meta tag matching', () => {
  assert.ok(hasMetaTag('<head><meta name="leakpatrol-verification" content="lp-abc"></head>', 'lp-abc'));
  assert.ok(hasMetaTag("<meta content='lp-abc' name='LeakPatrol-Verification' />", 'lp-abc'));
  assert.ok(!hasMetaTag('<meta name="leakpatrol-verification" content="lp-other">', 'lp-abc'));
  assert.ok(!hasMetaTag('<p>leakpatrol-verification lp-abc</p>', 'lp-abc'));
});

test('ownership by file and by DNS; an SPA fallback page does not count', async () => {
  const origin = new URL(demoUrl).origin;
  const noDns = async () => [];
  // The SPA answers /leakpatrol-verification.txt with index.html, which must not verify.
  assert.equal(await checkOwnership(origin, 'lp-file', { allowPrivate: true, resolveTxtImpl: noDns }), null);

  const fileApp = { ...app, files: { ...app.files, '/leakpatrol-verification.txt': 'lp-file\n' } };
  const { server, url } = await serve(fileApp);
  try {
    assert.equal(await checkOwnership(new URL(url).origin, 'lp-file', { allowPrivate: true, resolveTxtImpl: noDns }), 'file');
  } finally {
    server.close();
  }

  const dns = async () => [['leakpatrol-verification=lp-dns']];
  assert.equal(await checkOwnership(origin, 'lp-dns', { allowPrivate: true, resolveTxtImpl: dns }), 'dns');
});

test('deep Supabase check finds open tables and keeps only column names', async () => {
  supa.requests.length = 0;
  const findings = await checkSupabaseDeep([{ url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'eyJx.eyJy.z' }], {
    tableHints: ['orders'],
    rewrite: () => supa.url,
  });
  const open = findings.filter((f) => f.id === 'supabase-table-readable');
  assert.deepEqual(open.map((f) => [f.title.match(/"(\w+)"/)[1], f.severity]).sort(), [
    ['orders', 'high'],
    ['products', 'high'],
    ['profiles', 'critical'],
  ]);
  const profiles = open.find((f) => f.title.includes('profiles'));
  assert.match(profiles.title, /about 42 rows/);
  assert.match(profiles.evidence, /email/);
  assert.ok(!JSON.stringify(findings).includes('someone@example.com'), 'row values must never appear in the report');
  assert.ok(findings.some((f) => f.id === 'supabase-open-signup'));
  assert.match(findings.find((f) => f.id === 'supabase-tables-checked').title, /Checked 4 Supabase tables.*3 open/);
  assert.ok(supa.requests.every((r) => r.method === 'GET' && r.headers.apikey === 'eyJx.eyJy.z'));
});

test('report stays basic until the owner verifies, then adds the database check', async () => {
  const { checkoutUrl } = await (await post('/api/checkout', { url: demoUrl })).json();
  const id = new URLSearchParams(checkoutUrl.split('?')[1]).get('id');

  const before = await (await fetch(`${apiUrl}/api/report?id=${id}`)).json();
  assert.equal(before.report.deep, false);
  assert.equal(before.verification.verified, false);
  assert.match(before.verification.token, /^lp-[0-9a-f]{24}$/);
  assert.ok(!before.report.findings.some((f) => f.id === 'supabase-table-readable'));

  // Not verified yet: the token isn't on the site.
  const miss = await (await post('/api/verify', { id })).json();
  assert.equal(miss.verified, false);
  assert.ok(miss.error);

  // Unknown ids are refused.
  assert.equal((await post('/api/verify', { id: '0'.repeat(32) })).status, 404);

  app.files['/'] = app.files['/'].replace('<head>', `<head>${before.verification.meta}`);
  assert.deepEqual(await (await post('/api/verify', { id })).json(), { verified: true, method: 'meta' });

  const after = await (await fetch(`${apiUrl}/api/report?id=${id}`)).json();
  assert.equal(after.report.deep, true);
  assert.equal(after.verification.verified, true);
  assert.ok(!('token' in after.verification));
  const open = after.report.findings.filter((f) => f.id === 'supabase-table-readable');
  assert.ok(open.some((f) => f.severity === 'critical' && f.prompt.includes('"profiles"')));
});
