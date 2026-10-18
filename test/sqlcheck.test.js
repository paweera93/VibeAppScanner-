import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDatabaseResult, analyseDatabase, DATABASE_SQL } from '../src/sqlcheck.js';

const DB = {
  tables: [{ name: 'profiles', rls: false }, { name: 'orders', rls: true }, { name: 'products', rls: true }, { name: 'notes', rls: true }],
  policies: [
    { table: 'orders', name: 'own orders', cmd: 'SELECT', roles: ['authenticated'], permissive: 'PERMISSIVE', using: '(auth.uid() = user_id)', check: null },
    { table: 'products', name: 'public read', cmd: 'SELECT', roles: ['anon'], permissive: 'PERMISSIVE', using: 'true', check: null },
    { table: 'notes', name: 'anyone writes', cmd: 'ALL', roles: ['public'], permissive: 'PERMISSIVE', using: 'true', check: 'true' },
    { table: 'orders', name: 'any user updates', cmd: 'UPDATE', roles: ['authenticated'], permissive: 'PERMISSIVE', using: 'true', check: 'true' },
    { table: 'orders', name: 'restrictive', cmd: 'SELECT', roles: ['anon'], permissive: 'RESTRICTIVE', using: 'true', check: null },
  ],
  views: [{ name: 'order_totals', invoker: false }, { name: 'safe_view', invoker: true }],
  functions: [{ name: 'admin_stats' }],
  buckets: [{ name: 'avatars', public: true }, { name: 'invoices', public: false }],
};

test('parses the shapes people copy out of the Supabase SQL editor', () => {
  const json = JSON.stringify(DB);
  assert.equal(parseDatabaseResult(json).tables.length, 4);
  assert.equal(parseDatabaseResult(JSON.stringify(json)).tables.length, 4, 'cell copied with quotes');
  assert.equal(parseDatabaseResult(JSON.stringify([{ leakpatrol: DB }])).tables.length, 4, 'row copied as JSON');
  assert.equal(parseDatabaseResult(JSON.stringify([{ leakpatrol: json }])).tables.length, 4, 'row with the cell as text');
  assert.equal(parseDatabaseResult('not json'), null);
  assert.equal(parseDatabaseResult('{"hello": 1}'), null);
});

test('explains every risky setting, worst first', () => {
  const { findings, summary } = analyseDatabase(DB);
  const titles = findings.map((f) => f.title);
  assert.equal(findings[0].severity, 'critical');
  assert.ok(titles.includes('Row Level Security is off on "profiles"'));
  assert.ok(titles.includes('Anyone, without logging in, can read and change every row in "notes"'));
  assert.ok(titles.includes('Anyone, without logging in, can read every row in "products"'));
  assert.ok(titles.includes('Any logged-in user can update every row in "orders"'));
  assert.ok(titles.includes('The view "order_totals" can skip Row Level Security'));
  assert.ok(titles.includes('The function "admin_stats" runs with its owner\'s rights'));
  assert.ok(titles.includes('The storage bucket "avatars" is public'));
  assert.ok(!titles.some((t) => /own orders|safe_view|invoices|restrictive/.test(t)), 'safe settings are not flagged');
  assert.ok(findings.every((f) => f.fix && f.prompt));
  assert.deepEqual(summary, { tables: 4, protectedTables: 3, policies: 5, views: 2, buckets: 2 });
});

test('the query only reads settings', () => {
  assert.match(DATABASE_SQL, /^-- LeakPatrol/);
  assert.ok(!/\b(insert|update|delete|drop|alter|grant|create)\b/i.test(DATABASE_SQL.replace(/^--.*$/m, '')));
});
