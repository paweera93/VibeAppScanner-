import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseEmail, FirestoreWaitlist } from '../src/waitlist.js';

test('normalises and validates emails', () => {
  assert.equal(normaliseEmail('  Me@Example.COM '), 'me@example.com');
  for (const bad of ['', 'nope', 'a@b', '<x>@evil.com', 'a b@c.com', 'x'.repeat(250) + '@a.com']) {
    assert.throws(() => normaliseEmail(bad), bad);
  }
});

test('Firestore store uses the metadata token and treats duplicates as success', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('metadata.google.internal')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    return new Response('{}', { status: calls.length > 2 ? 409 : 200 });
  };
  const store = new FirestoreWaitlist({ projectId: 'p1', fetchImpl });
  await store.add('a@b.com', 'results');
  await store.add('a@b.com', 'results');
  assert.equal(calls.filter((c) => c.url.includes('metadata')).length, 1, 'token is cached');
  const write = calls[1];
  assert.match(write.url, /projects\/p1\/databases\/\(default\)\/documents\/waitlist\?documentId=[0-9a-f]{64}$/);
  assert.equal(write.opts.headers.authorization, 'Bearer tok');
  assert.equal(JSON.parse(write.opts.body).fields.email.stringValue, 'a@b.com');
});

test('Firestore store surfaces real errors', async () => {
  const fetchImpl = async (url) =>
    url.includes('metadata') ? Response.json({ access_token: 't', expires_in: 3600 }) : new Response('denied', { status: 403 });
  await assert.rejects(new FirestoreWaitlist({ projectId: 'p', fetchImpl }).add('a@b.com', 'x'), /403/);
});
