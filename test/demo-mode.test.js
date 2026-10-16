import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsConfig } from '../src/payments.js';

test('demo mode works locally but never on Cloud Run', () => {
  assert.equal(paymentsConfig({ PAYMENTS_DEMO: '1' }).enabled, true);
  assert.equal(paymentsConfig({ PAYMENTS_DEMO: '1', K_SERVICE: 'app-safety-scan' }).enabled, false);
});

test('demo checkout unlocks the report straight away', async () => {
  process.env.PAYMENTS_DEMO = '1';
  process.env.ALLOW_PRIVATE_TARGETS = '1';
  const { createServer } = await import('../src/server.js');
  const { APPS, serve } = await import('./demo-apps.js');
  const api = createServer();
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${api.address().port}`;
  const { server, url } = await serve(APPS.broken);
  try {
    const res = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    const { checkoutUrl } = await res.json();
    assert.match(checkoutUrl, /^\/report\.html\?id=[0-9a-f]{32}$/);
    const report = await fetch(base + '/api/report?' + checkoutUrl.split('?')[1]);
    assert.equal(report.status, 200);
  } finally {
    api.close();
    server.close();
  }
});
