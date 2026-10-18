import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackProgress, badgeState, badgeSvg } from '../src/progress.js';

const f = (id, title, severity = 'high', category = 'secrets') => ({ id, title, severity, category });
const full = (findings, grade, deep = false) => ({ findings, score: { grade, value: 50 }, deep });

test('first check becomes the starting point', () => {
  const { progress, updates } = trackProgress({}, full([f('openai-key', 'OpenAI key'), f('x', 'info thing', 'info')], 'D'));
  assert.equal(progress.first, true);
  assert.equal(progress.fixed.length, 0);
  assert.equal(progress.open, 1);
  assert.equal(JSON.parse(updates.baselineFindings).length, 1, 'info findings are not tracked');
  assert.equal(updates.baselineGrade, 'D');
});

test('later checks mark problems fixed, still open or new', () => {
  const start = trackProgress({}, full([f('openai-key', 'OpenAI key'), f('exposed-env', '.env is public', 'critical', 'exposure')], 'F'));
  const record = { ...start.updates };
  const later = trackProgress(record, full([f('exposed-env', '.env is public', 'critical', 'exposure'), f('missing-csp', 'No CSP', 'medium', 'headers')], 'C'));
  assert.equal(later.progress.first, false);
  assert.deepEqual(later.progress.fixed, [{ title: 'OpenAI key', severity: 'high' }]);
  assert.equal(later.progress.open, 1);
  assert.equal(later.progress.new, 1);
  assert.equal(later.progress.startGrade, 'F');
  assert.equal(later.progress.status['missing-csp|No CSP'], 'new');
  assert.equal(later.progress.status['exposed-env|.env is public'], 'open');
});

test('database findings that appear after verification join the starting point', () => {
  const start = trackProgress({}, full([f('openai-key', 'OpenAI key')], 'D'));
  const deep = trackProgress(start.updates, full([f('openai-key', 'OpenAI key'), f('supabase-table-readable', 'profiles readable', 'critical', 'supabase')], 'F', true));
  assert.equal(deep.progress.new, 0);
  assert.equal(deep.updates.baselineDeep, true);
});

test('badge is honest: verified, grade A and recent', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  const good = { verified: true, lastGrade: 'A', lastCheckedAt: new Date('2026-10-17T12:00:00Z'), origin: 'https://x.com' };
  assert.equal(badgeState(good, now).valid, true);
  assert.equal(badgeState({ ...good, verified: false }, now).valid, false);
  assert.equal(badgeState({ ...good, lastGrade: 'B' }, now).valid, false);
  assert.equal(badgeState({ ...good, lastCheckedAt: new Date('2026-08-01T00:00:00Z') }, now).valid, false);
  assert.match(badgeSvg(badgeState(good, now)), /Grade A · 17 Oct 2026/);
  assert.match(badgeSvg(badgeState({ ...good, lastGrade: 'C' }, now)), /check not current/);
});
