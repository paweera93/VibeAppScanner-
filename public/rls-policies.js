// Builds Supabase Row Level Security SQL for common access patterns. Pure function, so the
// generator page and the tests share it. Policies use (select auth.uid()) so Postgres
// evaluates it once per query instead of once per row, as Supabase recommends.

const NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export const PATTERNS = {
  own: 'Each user reads and changes only their own rows',
  'public-read': 'Anyone can read, only the owner can change',
  'submit-only': 'Anyone can submit, nobody can read (contact form, waitlist)',
  team: 'Members of the same team or organisation share rows',
  'members-read': 'Logged-in users can read, nobody can change from the app',
  'server-only': 'Only my server or Edge Functions can touch it',
};

const me = '(select auth.uid())';

function ownerPolicies(t, owner, { readRoles = 'authenticated', readUsing } = {}) {
  const mine = `${me} = ${owner}`;
  return [
    `create policy "${t}: read" on public.${t}\n  for select to ${readRoles}\n  using (${readUsing || mine});`,
    `create policy "${t}: add own rows" on public.${t}\n  for insert to authenticated\n  with check (${mine});`,
    `create policy "${t}: change own rows" on public.${t}\n  for update to authenticated\n  using (${mine})\n  with check (${mine});`,
    `create policy "${t}: delete own rows" on public.${t}\n  for delete to authenticated\n  using (${mine});`,
    `-- Fill the owner in automatically, and keep owner lookups fast.\nalter table public.${t} alter column ${owner} set default auth.uid();\ncreate index if not exists ${t}_${owner}_idx on public.${t} (${owner});`,
  ];
}

export function generatePolicies({ table, pattern, owner = 'user_id', team = 'team_id', members = 'team_members' }) {
  for (const [label, value] of [['Table name', table], ['Owner column', owner], ['Team column', team], ['Membership table', members]]) {
    if (!NAME.test(value || '')) return { error: `${label} should be lowercase letters, numbers and underscores, starting with a letter (for example my_table).` };
  }
  if (!PATTERNS[pattern]) return { error: 'Pick who should be able to see and change the rows.' };

  const t = table;
  const parts = [`-- ${PATTERNS[pattern]}: public.${t}`, `alter table public.${t} enable row level security;`];
  let explain;

  if (pattern === 'own') {
    parts.push(`-- Logged-out visitors get nothing.\n-- Tables created after 30 Oct 2026 also need this grant to work at all.\nrevoke all on public.${t} from anon;\ngrant select, insert, update, delete on public.${t} to authenticated;`);
    parts.push(...ownerPolicies(t, owner));
    explain = [
      `Logged-in users see and change only rows where ${owner} is their own user id.`,
      'Logged-out visitors can\'t read or write anything, even with your anon key.',
      `Nobody can create a row for someone else or hand a row over by changing ${owner}.`,
    ];
  } else if (pattern === 'public-read') {
    parts.push(`revoke all on public.${t} from anon;\ngrant select on public.${t} to anon;\ngrant select, insert, update, delete on public.${t} to authenticated;`);
    parts.push(...ownerPolicies(t, owner, { readRoles: 'anon, authenticated', readUsing: 'true' }));
    explain = [
      'Anyone, logged in or not, can read every row. Only use this for data that is meant to be public, like published posts or a product list.',
      `Only the user whose id is in ${owner} can change or delete a row.`,
      'Don\'t keep private columns (emails, phone numbers, internal notes) in this table: everyone can read every column. Put them in a separate table with the "own rows" pattern.',
    ];
  } else if (pattern === 'submit-only') {
    parts.push(`revoke all on public.${t} from anon, authenticated;\ngrant insert on public.${t} to anon, authenticated;`);
    parts.push(`create policy "${t}: anyone can submit" on public.${t}\n  for insert to anon, authenticated\n  with check (true);`);
    parts.push('-- No select policy: nobody can read submissions from the app.\n-- Read them in the Supabase dashboard, or from a server or Edge Function with the service key.');
    explain = [
      'Anyone can add a row, for example by submitting your contact or waitlist form.',
      'Nobody can read, change or delete rows from the app, so one visitor can\'t download everyone else\'s emails.',
      'In your app, insert without asking for the row back: don\'t chain .select() after .insert(), or it will fail.',
      'Bots can still submit junk. Add a hidden honeypot field or a captcha if that becomes a problem.',
    ];
  } else if (pattern === 'team') {
    const inTeam = `${team} in (\n    select m.${team} from public.${members} m\n    where m.user_id = ${me}\n  )`;
    parts.push(`revoke all on public.${t} from anon;\ngrant select, insert, update, delete on public.${t} to authenticated;`);
    for (const [cmd, label] of [['select', 'team members read'], ['insert', 'team members add'], ['update', 'team members change'], ['delete', 'team members delete']]) {
      const using = cmd === 'insert' ? '' : `\n  using (${inTeam})`;
      const check = cmd === 'insert' || cmd === 'update' ? `\n  with check (${inTeam})` : '';
      parts.push(`create policy "${t}: ${label}" on public.${t}\n  for ${cmd} to authenticated${using}${check};`);
    }
    parts.push(`-- The membership table needs RLS too: each user sees only their own memberships.\n-- Add and remove members from a server or Edge Function, not straight from the app.\nalter table public.${members} enable row level security;\nrevoke all on public.${members} from anon, authenticated;\ngrant select on public.${members} to authenticated;\ncreate policy "${members}: read own memberships" on public.${members}\n  for select to authenticated\n  using (user_id = ${me});\ncreate index if not exists ${members}_user_id_idx on public.${members} (user_id);`);
    explain = [
      `A user can see and change a row only if they belong to its team, according to public.${members} (columns user_id and ${team}).`,
      'Logged-out visitors get nothing.',
      'Users can\'t add themselves to a team. Do invites from a server or Edge Function, otherwise anyone could join any team.',
    ];
  } else if (pattern === 'members-read') {
    parts.push(`revoke all on public.${t} from anon, authenticated;\ngrant select on public.${t} to authenticated;`);
    parts.push(`create policy "${t}: logged-in users read" on public.${t}\n  for select to authenticated\n  using (true);`);
    explain = [
      'Anyone who is logged in can read every row. Logged-out visitors can\'t.',
      'Nobody can change the data from the app. Edit it in the dashboard or from your server.',
      'If anyone can sign up to your app, "logged in" means "anyone with an email address". Use this only for data that isn\'t sensitive.',
    ];
  } else {
    parts.push(`revoke all on public.${t} from anon, authenticated;`);
    parts.push('-- No policies on purpose: the app can\'t read or write this table at all.\n-- Your server and Edge Functions use the service_role key, which skips RLS.');
    explain = [
      'The browser can\'t touch this table, with or without logging in.',
      'Only code holding the service_role (secret) key can use it. Keep that key on the server, never in the app.',
    ];
  }

  const sql = parts.join('\n\n') + '\n';
  explain.push('Policies add up: if the table already has an older policy like using (true), it still lets everyone through. Check Authentication → Policies and delete any old ones you don\'t want.');
  const prompt = `Run this SQL in my Supabase project as a migration, exactly as written, to set up Row Level Security on the ${t} table. Don't disable RLS or grant extra access to anon to fix any errors that follow: tell me the error instead.\n\n${sql}`;
  return { sql, explain, prompt };
}
