// Deep Supabase checks. These only run for owners who have verified their site.
// Using the public key from the app's own JavaScript (exactly what any visitor has), they ask
// Supabase which tables answer without a login. GET requests only; at most one row is read per
// table, and only its column names are kept. Row contents are never stored or shown.

import { get } from '../http.js';

const MAX_TABLES = 40;
const SENSITIVE_COLUMN = /e-?mail|phone|password|passwd|address|ssn|birth|dob|token|secret|api_?key|iban|card|salary|stripe|payment|ip_addr/i;

// rewrite lets tests point *.supabase.co at a local fake.
export async function checkSupabaseDeep(projects, { tableHints = [], rewrite = (u) => u } = {}) {
  const findings = [];
  for (const { url, key } of projects) {
    const base = rewrite(url).replace(/\/$/, '');
    // Anon keys are JWTs and go in both headers; new sb_publishable_ keys only in apikey.
    const headers = key.startsWith('eyJ') ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key };

    const tables = await listTables(base, headers, tableHints);
    const readable = [];
    for (const table of tables) {
      const hit = await probeTable(base, headers, table);
      if (hit) readable.push(hit);
    }
    for (const t of readable) {
      const sensitive = t.columns.filter((c) => SENSITIVE_COLUMN.test(c));
      findings.push({
        id: 'supabase-table-readable',
        category: 'supabase',
        severity: sensitive.length ? 'critical' : 'high',
        title: `Anyone can read your "${t.table}" table without logging in${t.rows ? ` (about ${t.rows.toLocaleString('en')} rows)` : ''}`,
        detail: sensitive.length
          ? `It has columns that look personal or secret: ${sensitive.join(', ')}.`
          : 'If this table is meant to be public (for example a list of products), you can ignore this.',
        evidence: `columns: ${t.columns.slice(0, 12).join(', ')}${t.columns.length > 12 ? ', …' : ''}`,
        fix: `In Supabase, turn on Row Level Security for "${t.table}" and add policies that only let each user read their own rows (for example auth.uid() = user_id). A table with RLS on and no policy is closed to everyone but your server.`,
      });
    }
    findings.push({
      id: 'supabase-tables-checked',
      category: 'supabase',
      severity: 'info',
      title: `Checked ${tables.length} Supabase table${tables.length === 1 ? '' : 's'} for reads without a login: ${readable.length} open`,
      detail: tables.length
        ? `Tables checked: ${tables.join(', ')}. Writes are not tested, because that would change your data. Check your insert, update and delete policies too.`
        : 'We could not find any table names. Check RLS by hand in the Supabase dashboard (Authentication > Policies).',
      fix: 'Review every table in Authentication > Policies in the Supabase dashboard.',
    });

    const auth = await get(`${base}/auth/v1/settings`, { headers, maxBytes: 64 * 1024 });
    const settings = auth.ok && auth.status === 200 ? parseJson(auth.body) : null;
    if (settings && settings.disable_signup === false && settings.mailer_autoconfirm === true) {
      findings.push({
        id: 'supabase-open-signup',
        category: 'supabase',
        severity: 'medium',
        title: 'Anyone can create an account without confirming an email address',
        detail: 'Policies that trust any logged-in user (the "authenticated" role) are open to anyone who signs up with a made-up email.',
        fix: 'In Supabase, go to Authentication > Providers > Email and turn on "Confirm email". Make sure no policy grants access just for being logged in.',
      });
    }
  }
  return findings;
}

// The REST API's OpenAPI description lists exposed tables when it is readable with the public key.
// Otherwise fall back to the table names the app's own JavaScript uses.
async function listTables(base, headers, hints) {
  const names = new Set();
  const spec = await get(`${base}/rest/v1/`, { headers: { ...headers, accept: 'application/openapi+json' }, maxBytes: 2 * 1024 * 1024 });
  const doc = spec.ok && spec.status === 200 ? parseJson(spec.body) : null;
  for (const path of Object.keys(doc?.paths || {})) {
    const m = path.match(/^\/([A-Za-z_]\w{0,62})$/);
    if (m) names.add(m[1]);
  }
  for (const t of hints) names.add(t);
  return [...names].slice(0, MAX_TABLES);
}

async function probeTable(base, headers, table) {
  const res = await get(`${base}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, {
    headers: { ...headers, prefer: 'count=estimated' },
    maxBytes: 64 * 1024,
  });
  if (!res.ok || res.status < 200 || res.status > 206) return null;
  const rows = parseJson(res.body);
  // An empty answer can mean RLS is filtering everything out, which is what we want to see.
  if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== 'object' || rows[0] === null) return null;
  const total = Number(res.headers.get('content-range')?.split('/')[1]);
  return { table, columns: Object.keys(rows[0]), rows: Number.isFinite(total) ? total : null };
}

function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
