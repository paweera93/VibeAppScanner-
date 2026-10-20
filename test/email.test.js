// Waitlist emails against a fake Resend API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let api, apiUrl, fake, failNext = false;
const sent = [];

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (failNext) return res.writeHead(500).end('down');
      sent.push({ auth: req.headers.authorization, ...JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"e1"}');
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    RESEND_API_KEY: 're_test',
    RESEND_API_BASE: `http://127.0.0.1:${fake.address().port}`,
    NOTIFY_EMAIL: 'owner@example.com',
  });
  const { createServer } = await import('../src/server.js');
  api = createServer();
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${api.address().port}`;
});

after(() => {
  api.close();
  fake.close();
});

const signup = (email, ip = '203.0.113.9') =>
  fetch(`${apiUrl}/api/waitlist`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email }) });

test('a new sign-up gets a confirmation and the owner gets an alert, once', async () => {
  assert.equal((await signup('Maker@Example.com')).status, 200);
  assert.equal(sent.length, 2);
  const welcome = sent.find((m) => m.to[0] === 'maker@example.com');
  const alert = sent.find((m) => m.to[0] === 'owner@example.com');
  assert.match(welcome.subject, /security checklist/);
  assert.match(welcome.text, /Row Level Security on every Supabase table/);
  assert.match(welcome.html, /Run all of these in a minute/);
  assert.match(welcome.from, /getleakpatrol\.com/);
  assert.equal(welcome.auth, 'Bearer re_test');
  assert.match(alert.subject, /maker@example\.com/);

  // Signing up again the same day sends nothing more.
  assert.equal((await signup('maker@example.com')).status, 200);
  assert.equal(sent.length, 2);
});

test('the sign-up still succeeds when the email service is down', async () => {
  failNext = true;
  assert.equal((await signup('second@example.com', '203.0.113.10')).status, 200);
  failNext = false;
});
