# Feature ideas from X

Ideas spotted while finding posts to reply to on X. Each one notes where it came from and whether
LeakPatrol already covers it. Newest first.

| Added | Idea | Seen in | Already covered? |
|---|---|---|---|
| 2026-10-18 | **"Checked by LeakPatrol" badge.** Apps that score A can add a small badge or link to their site. It gives builders something to show off when they share their app, and it sends visitors and links back to us. Only the owner can share their own result, never us. | @Joi2James's "drop your project URL" thread (40+ indie apps sharing links) | No |
| 2026-10-18 | **Re-scan and alert.** Builders keep shipping, so a check from last week goes out of date. Offer a weekly re-scan with an email when the grade drops. This also gives people a reason to join the email list. | Same thread | No |
| 2026-10-18 | **Put the name in the link preview.** On X, most link cards read "Name — what it does". Ours shows only "Is your vibe-coded app leaking secrets?", without the LeakPatrol name. | Same thread | No (`og:title` in `public/index.html`) |
| 2026-10-18 | **Public Supabase storage buckets.** Check whether buckets can be listed or their files read without a login. Buckets have their own policies, separate from table RLS, and people forget them. | Reply to @minigendev_en's RLS post (someone pointed out buckets "get missed a lot") | Partly: the RLS fix prompt mentions buckets (`src/fix-prompts.js`), but nothing scans them |
| 2026-10-18 | **Supabase views and RPC functions.** List the views and functions the anon key can see in the public API spec, and warn that views skip RLS unless they use `security_invoker = on`, and SECURITY DEFINER functions skip it too. Read the list only and never call the functions. | Same thread; our own reply to @minigendev_en | No |
| 2026-10-18 | **Writable tables (advice only).** @minigendev_en's tables could be written as well as read. We can't test writes without changing data, so when a table is readable, add a line saying it's probably writable too and how to check. | @minigendev_en | No: we only report reads |
| 2026-10-18 | **Webhook URLs in the JavaScript.** Detect n8n, Make, Zapier and Pipedream webhook URLs in the bundle. Anyone can call them to trigger the automation. | @FlowsbyKola's Lovable + n8n booking page | **Built 2026-10-18** (`automation-webhook` in `src/patterns.js`) |
| 2026-10-18 | **"Set a spend limit" in AI-key fixes.** When an OpenAI, Anthropic or Google key is found, the fix should also say to set a hard monthly spend limit, not just rotate the key. | OpenCode breach threads (one user was reported to have been charged $400 on a leaked Anthropic key) | **Built 2026-10-18** (fixes and prompts for AI keys) |
| 2026-10-18 | **Probe `/.git/HEAD` too.** Bots scan for `/.env`, `/.git/HEAD` and `/.env.production`. We probe `/.git/config`, which can be blocked while HEAD is still served. | @Borotos00 (Portuguese post about bot scans) | **Built 2026-10-18** (`src/checks/exposed-files.js`) |
| 2026-10-18 | **Explainer: Supabase's 30 Oct Data API change.** From 30 Oct, new tables are no longer exposed to the Data/GraphQL API automatically. A short page or post saying what this means for older apps (existing tables stay exposed). Content, not a scanner check. | @chikuos_hq | n/a |
