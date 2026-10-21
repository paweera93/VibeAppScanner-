import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePolicies, PATTERNS } from '../public/rls-policies.js';

test('every pattern switches RLS on and keeps logged-out visitors out unless the pattern is public', () => {
  for (const pattern of Object.keys(PATTERNS)) {
    const { sql, error } = generatePolicies({ table: 'notes', pattern });
    assert.equal(error, undefined, pattern);
    assert.match(sql, /alter table public\.notes enable row level security;/);
    assert.match(sql, /revoke all on public\.notes from anon/);
    if (!['public-read', 'submit-only'].includes(pattern)) assert.doesNotMatch(sql, /to anon/, pattern);
  }
});

test('own rows: every write is checked against the owner column', () => {
  const { sql } = generatePolicies({ table: 'orders', pattern: 'own', owner: 'owner_id' });
  assert.match(sql, /for insert to authenticated\n  with check \(\(select auth\.uid\(\)\) = owner_id\)/);
  assert.match(sql, /for update to authenticated\n  using \(\(select auth\.uid\(\)\) = owner_id\)\n  with check/);
  assert.doesNotMatch(sql, /using \(true\)/);
});

test('submit-only grants insert and nothing to read', () => {
  const { sql } = generatePolicies({ table: 'waitlist', pattern: 'submit-only' });
  assert.match(sql, /grant insert on public\.waitlist to anon, authenticated;/);
  assert.doesNotMatch(sql, /for select/);
  assert.doesNotMatch(sql, /grant select/);
});

test('rejects names that could break or inject SQL', () => {
  for (const table of ['', 'Notes', 'notes; drop table users', '1notes', 'a"b']) {
    assert.ok(generatePolicies({ table, pattern: 'own' }).error, table);
  }
  assert.ok(generatePolicies({ table: 'notes', pattern: 'own', owner: 'x) or (true' }).error);
  assert.ok(generatePolicies({ table: 'notes', pattern: 'nope' }).error);
});

test('the prompt version tells the AI tool not to switch RLS off', () => {
  const { prompt, sql } = generatePolicies({ table: 'notes', pattern: 'team' });
  assert.match(prompt, /Don't disable RLS/);
  assert.ok(prompt.endsWith(sql));
});
