# LeakPatrol on X: launch thread, first week, reply guide

Links use `?ref=x` so visits from X show up in the page-view logs.
Put the link in a reply to your own post rather than in the post itself: X shows posts with
outside links to fewer people.

## Pinned launch thread (post day 1, then pin it)

**1/4** (attach `x-launch.png`)
> Your app works. But is it leaking?
>
> AI tools like Lovable, Bolt, v0, Replit and Cursor let anyone ship a real app in an afternoon. They also often ship secret keys to the browser, skip database rules, or leave private files public.
>
> I built a free check for exactly that 🧵

**2/4**
> Paste your app's address and in about a minute you get:
>
> • an A–F grade
> • every problem, most serious first
> • a plain-English fix for each
>
> It looks for leaked API keys (OpenAI, Anthropic, Stripe, AWS, GitHub), Supabase service keys, public .env and .git files, source maps and missing security headers.

**3/4**
> It's read-only: it only looks at what any visitor's browser already downloads. It never logs in, never changes anything, and masks any key it finds.
>
> Only scan apps you own 🙏

**4/4**
> Try it, it's free and there's no sign-up:
> https://www.getleakpatrol.com/?ref=x
>
> Built by an SRE who got tired of seeing the same avoidable leaks. Feedback (and false alarms!) very welcome.

## First week: one post a day

**Day 2: the anon key myth**
> "Is my Supabase anon key in the frontend a problem?"
>
> No, it's meant to be public. The real question is whether Row Level Security is on for every table. Without it, anyone with that public key can read your whole database.
>
> The service_role key, though? Never in the browser. Ever.

**Day 3: the VITE_ trap**
> Vibe-coding gotcha: any environment variable starting with VITE_, NEXT_PUBLIC_ or REACT_APP_ gets bundled into the JavaScript every visitor downloads.
>
> If your OpenAI or Stripe secret key has one of those prefixes, it's public. Move the call to a server function instead.

**Day 4: how to check yourself (no tool needed)**
> 30-second check for leaked keys in your app:
>
> 1. Open your site
> 2. DevTools → Sources (or Network → JS files)
> 3. Search for "sk-", "sk_live", "service_role", "AKIA"
>
> Found one? Rotate it today, then move it server-side.

**Day 5: the .env file**
> Quick one: try opening yoursite.com/.env in a browser.
>
> If you see your keys instead of a 404 page, everyone else can too. Delete it from the public folder, block /.env at your host, and rotate every key that was in it.

**Day 6: what the fix looks like** (attach a screenshot of a fix from a test report)
> The part I care most about: every problem LeakPatrol finds comes with a fix written as a prompt you can paste straight back into Lovable, Bolt or Cursor.
>
> You shouldn't need to be a security engineer to fix what your AI tool got wrong.

**Day 7: invite**
> If you've shipped something with Lovable, Bolt, v0, Replit or Cursor this month, run it through the free check before your users find the problem for you 🛡️
>
> https://www.getleakpatrol.com/?ref=x

## Reply guide

Reply only where it genuinely helps the person. Keep the link out of most replies, and add it
only when they're clearly asking how to check. About 5–10 replies a day at most.

**Someone shares a new Lovable/Bolt/Cursor app**
> Congrats on shipping! 🎉 One thing worth a quick look before it gets traffic: make sure no API keys ended up in the frontend bundle. It's the most common slip with AI-built apps.

**Someone asks if their Supabase anon key is safe**
> The anon key is fine to be public. What matters is Row Level Security being on for every table, with policies like auth.uid() = user_id. Without RLS, the anon key can read everything.

**Someone mentions a surprise OpenAI/Anthropic bill**
> Ouch. Worth checking whether the API key is in your frontend JavaScript (DevTools → search "sk-"). If it is, rotate it right away and move the calls to a server function.

**Someone asks how to check their app's security** (link OK here)
> A few quick wins: no secret keys in the frontend, RLS on every Supabase table, no public .env, and basic security headers. I built a free read-only checker for exactly these if it helps: https://www.getleakpatrol.com/?ref=x

## Never
- Post or name anyone else's scan results.
- Scan someone's app without their permission, even to "help".
- Reply to the same person more than once with the link.
