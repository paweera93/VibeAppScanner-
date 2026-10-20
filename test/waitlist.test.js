import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseEmail } from '../src/waitlist.js';
import { FirestoreStore, encode, decode } from '../src/store.js';

test('normalises and validates emails', () => {
  assert.equal(normaliseEmail('  Me@Example.COM '), 'me@example.com');
  for (const bad of ['', 'nope', 'a@b', '<x>@evil.com', 'a b@c.com', 'x'.repeat(250) + '@a.com']) {
    assert.throws(() => normaliseEmail(bad), bad);
  }
});

test('Firestore values round-trip', () => {
  const data = { s: 'x', n: 3, b: true, d: new Date('2026-01-01T00:00:00Z'), z: null };
  assert.deepEqual(decode(encode(data)), data);
});

test('Firestore store uses the metadata token and reports duplicates', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('metadata.google.internal')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    return new Response('{}', { status: calls.length > 2 ? 409 : 200 });
  };
  const store = new FirestoreStore({ projectId: 'p1', fetchImpl });
  assert.equal(await store.create('waitlist', 'abc', { email: 'a@b.com' }), true);
  assert.equal(await store.create('waitlist', 'abc', { email: 'a@b.com' }), false);
  assert.equal(calls.filter((c) => c.url.includes('metadata')).length, 1, 'token is cached');
  assert.match(calls[1].url, /projects\/p1\/databases\/\(default\)\/documents\/waitlist\?documentId=abc$/);
  assert.equal(calls[1].opts.headers.authorization, 'Bearer tok');
});

test('Firestore store get returns null for missing docs and surfaces real errors', async () => {
  let status = 404;
  const fetchImpl = async (url) =>
    url.includes('metadata') ? Response.json({ access_token: 't', expires_in: 3600 }) : new Response('denied', { status });
  const store = new FirestoreStore({ projectId: 'p', fetchImpl });
  assert.equal(await store.get('reports', 'x'), null);
  status = 403;
  await assert.rejects(store.get('reports', 'x'), /403/);
});

test('existing sign-ups can get the checklist again, at most once a day', async () => {
  const { MemoryStore } = await import('../src/store.js');
  const { addToWaitlist, claimResend, RESEND_AFTER_MS } = await import('../src/waitlist.js');
  const store = new MemoryStore();
  assert.equal(await addToWaitlist(store, 'a@b.com', 'home'), true);
  assert.equal(await claimResend(store, 'a@b.com', new Date(Date.now() + 1000)), false, 'just signed up');
  assert.equal(await claimResend(store, 'a@b.com', new Date(Date.now() + RESEND_AFTER_MS + 1000)), true);
  assert.equal(await claimResend(store, 'a@b.com', new Date(Date.now() + RESEND_AFTER_MS + 2000)), false, 'once a day');
});
