import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { scan, isPrivateHost, normaliseTarget, score } from '../src/scan.js';
import { APPS, serve } from './demo-apps.js';

const servers = [];
after(() => servers.forEach((s) => s.close()));

async function scanApp(name) {
  const { server, url } = await serve(APPS[name]);
  servers.push(server);
  return scan(url, { allowPrivate: true });
}

test('broken demo app: finds every planted problem', async () => {
  const r = await scanApp('broken');
  const ids = new Set(r.findings.map((f) => f.id));

  for (const id of ['openai-key', 'stripe-secret', 'supabase-service-key', 'supabase-detected', 'exposed-env', 'public-source-map', 'missing-csp', 'no-https', 'cookie-flags', 'x-powered-by']) {
    assert.ok(ids.has(id), `expected finding ${id}, got ${[...ids].join(', ')}`);
  }
  assert.equal(r.usesSupabase, true);
  assert.equal(r.scriptsScanned, 2, 'should follow the lazy-loaded chunk');
  assert.equal(r.score.grade, 'F');
  assert.equal(r.findings[0].severity, 'critical', 'findings are sorted worst first');
});

test('broken demo app: secrets are masked in the report', async () => {
  const r = await scanApp('broken');
  const text = JSON.stringify(r);
  assert.ok(!text.includes('TESTONLYabcdefghijklmnopqrstuvwxyz'), 'full OpenAI key must not appear');
  assert.ok(!text.includes('TESTONLY1234567890abcdefgh'), 'full Stripe key must not appear');
});

test('clean demo app: anon key alone is not flagged as a leak', async () => {
  const r = await scanApp('clean');
  const ids = r.findings.map((f) => f.id);
  assert.ok(!ids.includes('supabase-service-key'));
  assert.ok(!ids.includes('exposed-env'), 'SPA fallback for /.env must not be reported');
  assert.ok(!ids.includes('missing-csp'));
  assert.ok(ids.includes('supabase-detected'));
  assert.equal(r.summary.critical, 0);
});

test('refuses private and local targets by default', async () => {
  await assert.rejects(scan('http://127.0.0.1:9/'), /private/);
  await assert.rejects(scan('localhost:3000'), /private/);
  assert.equal(isPrivateHost('10.1.2.3'), true);
  assert.equal(isPrivateHost('192.168.0.1'), true);
  assert.equal(isPrivateHost('169.254.169.254'), true);
  assert.equal(isPrivateHost('fcbarcelona.com'), false);
  assert.equal(isPrivateHost('example.com'), false);
});

test('normaliseTarget adds https and rejects other schemes', () => {
  assert.equal(normaliseTarget('myapp.lovable.app').href, 'https://myapp.lovable.app/');
  assert.throws(() => normaliseTarget('ftp://x.com'));
});

test('score counts each finding type once', () => {
  const many = Array.from({ length: 10 }, () => ({ id: 'cookie-flags', severity: 'low' }));
  assert.equal(score(many).value, 98);
});

test('full report gives every finding a fix and AI prompts', async () => {
  const { toFullReport, renderMarkdown } = await import('../src/report.js');
  const { server, url } = await serve(APPS.broken);
  try {
    const full = toFullReport(await scan(url, { allowPrivate: true }));
    assert.ok(full.findings.every((f) => f.fix));
    const secret = full.findings.find((f) => f.category === 'secrets');
    assert.match(secret.prompt, /server-side function/);
    assert.ok(full.headersPrompt.includes('Content-Security-Policy'));
    const md = renderMarkdown(full);
    assert.match(md, /^# LeakPatrol report/);
    assert.ok(!/sk-proj-[A-Za-z0-9_-]{40}/.test(md), 'full secrets must never appear in the report');
  } finally {
    server.close();
  }
});
