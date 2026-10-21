# Reddit posts (owner posts these; browser automation can't reach reddit.com)

Rules of thumb that keep new accounts from being removed:
- Read each subreddit's rules (sidebar) first. Some ban links in posts: then put the link in a comment only if someone asks.
- Lead with something useful. The link is the footnote, not the point.
- Answer every comment for the first two hours. That's what lifts a post.
- One subreddit per day, not all at once (Reddit flags the same link posted everywhere).
- Don't use the LeakPatrol brand as your username's voice: write as a person ("I").

---

## 1. r/Supabase (post first: the 30 Oct change is news right now)

**Title:** Heads up: the Oct 30 Data API change won't lock down your existing tables

**Body:**

From 30 Oct, new tables in `public` won't be granted to anon/authenticated automatically, which is a good change. But it's easy to read it as "my project is now secure", so worth spelling out what it doesn't do:

- **Existing tables keep their grants.** If a table is readable with the anon key today, it still is on the 31st.
- **RLS works exactly the same.** RLS off, or a `using (true)` policy, is just as open as before.
- **New tables will throw permission errors** until you grant them. Watch out for AI tools "fixing" that by granting everything to anon or disabling RLS.

Two queries I'd run before the 30th:

```sql
-- tables with RLS off
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- what logged-out visitors can do
select table_name, string_agg(privilege_type, ', ') as privileges
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name;
```

Any table in the second list with RLS off in the first is open to anyone with your anon key (which is in your frontend).

I wrote up the details, including the grant + policy pattern for new tables, here: https://www.getleakpatrol.com/supabase-october-30-change.html?ref=reddit

Happy to answer questions on edge cases (views, SECURITY DEFINER functions, storage).

---

## 2. r/lovable (a day or two later)

**Title:** The two most common security leaks in Lovable apps (and how to check yours in 2 minutes)

**Body:**

Security write-ups on AI-built apps keep finding the same two problems. Lovable apps usually work perfectly, which is exactly why these slip through:

**1. Secret keys in the frontend.** Lovable apps are Vite + React, and anything in a `VITE_` variable is bundled into the JavaScript every visitor downloads. Open your live app → DevTools → Sources → search all files for `sk-`, `sk_live`, `service_role`. You should find nothing.

**2. Supabase tables without Row Level Security.** The anon key in your app is meant to be public. RLS is what protects your data. In Supabase → SQL editor:
`select tablename, rowsecurity from pg_tables where schemaname = 'public';`
Every row should say `true`. Also look for policies with `using (true)`: they turn RLS on but let everyone through.

If you find either: rotate the key, move the call into a Supabase Edge Function, and ask Lovable to "enable RLS on every table with policies so users can only read and change their own rows".

I built a free read-only checker that does this from the outside in about a minute, if you'd rather not do it by hand: https://www.getleakpatrol.com/?ref=reddit (no sign-up). Feedback welcome, especially false alarms.

---

## 3. r/SideProject (later in the week)

**Title:** I built a free security check for apps made with Lovable, Bolt and Cursor

**Body:**

AI tools let anyone ship a real app in an afternoon. They also regularly ship the OpenAI/Stripe secret key to the browser, leave Supabase tables readable by anyone, or publish the `.env` file.

LeakPatrol: paste your app's URL and in about a minute you get an A–F grade and every problem, most serious first, each with a plain-English fix and a prompt you can paste back into your AI tool. Read-only, no sign-up, any key it finds is masked.

https://www.getleakpatrol.com/?ref=reddit

What I'd love feedback on: false positives, and checks you'd want added.
