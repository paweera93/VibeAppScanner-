---
title: Is your Supabase anon key safe in the frontend? Yes. Here's what isn't.
published: false
description: The anon key is meant to be public. Row Level Security, the service_role key, storage buckets and views are where AI-built apps actually leak.
tags: supabase, security, webdev, ai
canonical_url:
---

If you've built an app with Lovable, Bolt, v0 or Cursor on top of Supabase, you've probably opened DevTools, seen a long `eyJ...` key in your JavaScript, and felt your stomach drop.

Good news first: **that key is supposed to be there.** Here's what it actually does, and the four things that *do* leak data in AI-built Supabase apps.

## The anon key is public by design

Supabase gives every project two kinds of key:

| Key | Starts with | Where it belongs |
|---|---|---|
| anon / publishable | `eyJ...` (role `anon`) or `sb_publishable_` | The browser. Fine to ship. |
| service_role / secret | `eyJ...` (role `service_role`) or `sb_secret_` | Only on a server. Never in the browser. |

The anon key just identifies your project. On its own it grants nothing: what someone can do with it is decided entirely by your **Row Level Security (RLS)** policies.

That's also the catch. **The anon key is safe only if RLS is doing its job.**

## 1. Tables with RLS turned off

With RLS off, anyone who copies your anon key out of your JavaScript can read, and often write, the whole table with a single request. No login needed.

Check every table in the SQL editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
```

Anything showing `false` is open. Turn it on and add a policy that ties rows to their owner:

```sql
alter table public.profiles enable row level security;

create policy "Users read their own profile"
on public.profiles for select
using (auth.uid() = user_id);
```

Watch out for policies with `using (true)`. They turn RLS on but let everyone through, which AI tools sometimes generate to "fix" a permissions error.

## 2. The service_role key in the browser

The service_role (or `sb_secret_`) key **bypasses RLS completely**. If it's in your frontend, every table is open no matter how good your policies are.

AI tools usually put it there by accident: a `VITE_SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_...` variable, added to make an admin feature work. **Anything prefixed `VITE_`, `NEXT_PUBLIC_` or `REACT_APP_` is bundled into the JavaScript every visitor downloads.**

If you find it: rotate the key in Supabase (Settings → API) right away, then move the admin work into an Edge Function that reads the key from Supabase secrets.

## 3. Storage buckets

Storage has its own policies, separate from your table RLS, and they're easy to forget. A "public" bucket means anyone with a file's URL can download it. Fine for avatars, not for invoices, ID photos or exports.

In Storage, check which buckets are public, and give private ones policies on `storage.objects`, just like tables.

## 4. Views and functions that skip RLS

Two quieter ones:

- **Views** run with their creator's rights by default, so a view over a protected table can expose it. On Postgres 15+, create them with `with (security_invoker = on)`.
- **Functions marked `SECURITY DEFINER`** also run with their owner's rights. If one is callable through the API, check it only returns what the caller should see.

## The 2-minute check

1. Open your live app, then DevTools → Sources, and search for `service_role`, `sb_secret_`, `sk-` and `sk_live`. You should find none.
2. Run the SQL above. Every table should show `true`.
3. Look for `using (true)` in your policies.
4. Check which storage buckets are public.

If you'd rather not do it by hand, I built [LeakPatrol](https://www.getleakpatrol.com/?ref=devto), a free read-only check that looks for leaked keys, a public `.env` and missing security headers, and, once you prove you own the site, which Supabase tables can be read without logging in. Each finding comes with a prompt you can paste back into your AI tool to fix it.

The anon key was never the problem. What you've built around it is what counts.
