// Deep database check without access: the buyer runs DATABASE_SQL in their Supabase SQL editor,
// pastes the one-cell result back, and analyseDatabase() explains it. We never see their keys,
// never connect to their database, and don't store what they paste.

export const DATABASE_SQL = `-- LeakPatrol database check. Read-only: it only looks at settings, never at your data.
select json_build_object(
  'tables', (select coalesce(json_agg(json_build_object('name', c.relname, 'rls', c.relrowsecurity)), '[]')
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('r', 'p')),
  'policies', (select coalesce(json_agg(json_build_object('table', tablename, 'name', policyname, 'cmd', cmd,
               'roles', roles, 'permissive', permissive, 'using', qual, 'check', with_check)), '[]')
               from pg_policies where schemaname = 'public'),
  'views', (select coalesce(json_agg(json_build_object('name', c.relname,
            'invoker', coalesce(array_to_string(c.reloptions, ',') ~* 'security_invoker=(true|on|1)', false))), '[]')
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm')),
  'functions', (select coalesce(json_agg(json_build_object('name', p.proname)), '[]')
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef),
  'buckets', (select coalesce(json_agg(json_build_object('name', name, 'public', public)), '[]') from storage.buckets)
) as leakpatrol;`;

// Accepts what people actually copy out of the Supabase SQL editor: the bare JSON cell, the cell
// wrapped in quotes, or the whole result row ("Copy as JSON").
export function parseDatabaseResult(text) {
  let value = String(text || '').trim();
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === 'object' && 'leakpatrol' in value) {
    value = typeof value.leakpatrol === 'string' ? parseDatabaseResult(value.leakpatrol) : value.leakpatrol;
  }
  if (!value || typeof value !== 'object' || !Array.isArray(value.tables)) return null;
  const list = (k) => (Array.isArray(value[k]) ? value[k] : []);
  return { tables: list('tables'), policies: list('policies'), views: list('views'), functions: list('functions'), buckets: list('buckets') };
}

const PUBLIC_ROLES = new Set(['public', 'anon']);
const isTrue = (expr) => typeof expr === 'string' && /^\(?\s*true\s*\)?$/i.test(expr.trim());
const name = (v) => String(v ?? '').slice(0, 63);

export function analyseDatabase(db) {
  const findings = [];
  const policiesByTable = new Map();
  for (const p of db.policies) {
    const t = name(p.table);
    policiesByTable.set(t, [...(policiesByTable.get(t) || []), p]);
  }

  for (const t of db.tables) {
    const table = name(t.name);
    if (t.rls === false) {
      findings.push({
        id: 'db-rls-off', severity: 'critical', title: `Row Level Security is off on "${table}"`,
        detail: 'Anyone with your public anon key, which is in your app\'s JavaScript, can read and change every row in this table without logging in.',
        fix: `Turn on RLS for "${table}" and add policies so users can only reach their own rows.`,
        prompt: `In my Supabase project, Row Level Security is turned off on the table "${table}". Please enable RLS on it (ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY) and add policies so a logged-in user can only read and change their own rows, for example using auth.uid() = user_id. If some rows really are meant to be public, add a separate read-only policy for just those. Show me the SQL before applying it.`,
      });
    }
  }

  for (const p of db.policies) {
    if (p.permissive === 'RESTRICTIVE') continue;
    const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles || '').replace(/[{}]/g, '').split(',')).map((r) => r.trim());
    const anyone = roles.some((r) => PUBLIC_ROLES.has(r));
    const loggedIn = !anyone && roles.includes('authenticated');
    const cmd = String(p.cmd || 'ALL').toUpperCase();
    const writes = cmd !== 'SELECT';
    const openUsing = isTrue(p.using);
    const openCheck = isTrue(p.check);
    if (!(openUsing || (writes && openCheck)) || !(anyone || loggedIn)) continue;
    const table = name(p.table);
    const who = anyone ? 'Anyone, without logging in,' : 'Any logged-in user';
    const what = writes ? (cmd === 'ALL' ? 'read and change' : cmd.toLowerCase()) : 'read';
    findings.push({
      id: 'db-open-policy',
      severity: anyone ? (writes ? 'critical' : 'high') : (writes ? 'high' : 'medium'),
      title: `${who} can ${what} every row in "${table}"`,
      detail: `The policy "${name(p.name)}" allows this with a condition of "true". That is fine only if this table is meant to be fully public, like a product list.`,
      fix: `Replace the "true" condition with one that ties rows to their owner, such as auth.uid() = user_id.`,
      prompt: `In my Supabase project the policy "${name(p.name)}" on the table "${table}" uses the condition "true" for ${cmd}, so ${anyone ? 'anyone, even without logging in,' : 'any logged-in user'} can ${what} every row. Please rewrite it so users can only ${what} their own rows (for example auth.uid() = user_id). If part of this table really must be public, explain which columns and use a view or a separate policy for just those. Show me the SQL before applying it.`,
    });
  }

  for (const v of db.views) {
    if (v.invoker) continue;
    const view = name(v.name);
    findings.push({
      id: 'db-view-definer', severity: 'high', title: `The view "${view}" can skip Row Level Security`,
      detail: 'Views run with their creator\'s rights unless they are created with security_invoker, so a view over a protected table can expose its rows through the API.',
      fix: `Recreate "${view}" with (security_invoker = on), or remove it from the public schema if the app doesn't need it.`,
      prompt: `In my Supabase project the view "${view}" in the public schema runs with its owner's rights, so it can bypass Row Level Security on the tables it reads. Please run ALTER VIEW public."${view}" SET (security_invoker = on); (Postgres 15+), then check the app still works. If the view isn't used by the app, suggest removing it.`,
    });
  }

  for (const f of db.functions) {
    const fn = name(f.name);
    findings.push({
      id: 'db-definer-function', severity: 'medium', title: `The function "${fn}" runs with its owner's rights`,
      detail: 'SECURITY DEFINER functions in the public schema can be called through the API and skip Row Level Security. That is sometimes intended, but each one needs checking.',
      fix: `Check "${fn}" only returns or changes what the caller should reach, or make it SECURITY INVOKER.`,
      prompt: `In my Supabase project the function public."${fn}" is SECURITY DEFINER, so it bypasses Row Level Security when called through the API. Please review it: if it doesn't need elevated rights, change it to SECURITY INVOKER. If it does, make sure it checks auth.uid() and only touches the caller's own data, set search_path explicitly, and revoke EXECUTE from anon if logged-out users shouldn't call it.`,
    });
  }

  for (const b of db.buckets) {
    if (!b.public) continue;
    const bucket = name(b.name);
    findings.push({
      id: 'db-public-bucket', severity: 'medium', title: `The storage bucket "${bucket}" is public`,
      detail: 'Anyone with a file\'s address can download it. That is fine for avatars or product images, not for invoices, ID photos or exports.',
      fix: `If "${bucket}" holds anything private, make it private and add policies on storage.objects.`,
      prompt: `In my Supabase project the storage bucket "${bucket}" is public. If it stores anything private, please make it private and add policies on storage.objects so users can only read and upload their own files (for example in a folder named after auth.uid()), and switch the app to signed URLs for downloads.`,
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const protectedTables = db.tables.filter((t) => t.rls === true).length;
  return {
    findings,
    summary: { tables: db.tables.length, protectedTables, policies: db.policies.length, views: db.views.length, buckets: db.buckets.length },
  };
}
