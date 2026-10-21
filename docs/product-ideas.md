# New product ideas (beyond LeakPatrol)

Ideas for other things to build, collected while browsing X, dev.to and our own launch.
LeakPatrol feature ideas live in `docs/feature-ideas.md`; this file is for separate products or big add-ons.

How to read the scores (1–5): **Pain** = how clearly people complain about it, **Fit** = how much we can reuse
(the scanner, the Lovable/Bolt/Cursor audience, our X/dev.to/SEO channels), **Effort** = 5 is quickest to build.
The evidence is a handful of posts, not proof that people will pay. The next step for each idea is a cheap test, such as a
landing page with a sign-up box or a free version, before building the whole thing.

## Ranked shortlist

| # | Idea | Pain | Fit | Effort | Next cheap test |
|---|---|---|---|---|---|
| 1 | Ship-ready check | 3 | 5 | 5 | Add 5 launch checks to the free scan and see whether people use them |
| 2 | Free Supabase RLS policy generator | 4 | 5 | 4 | **Built 2026-10-21**: /supabase-rls-policy-generator.html. Watch visits and sign-ups from `guide-supabase-rls-policy-generator` |
| 3 | AI spend guard | 4 | 3 | 3 | Landing page + sign-up count |
| 4 | Fewer wasted Lovable credits | 4 | 3 | 4 | Free "one bug, one prompt" page |
| 5 | "Where your customers talk" finder | 4 | 2 | 3 | Try it on LeakPatrol first |
| 6 | Weekly "did my last deploy break it?" monitor | 3 | 5 | 3 | Already planned as LeakPatrol re-scan alerts |

## Details

### 1. Ship-ready check (launch checklist for AI-built apps)
- **Problem:** people launch apps from Lovable/Bolt/Cursor without the boring launch basics. These include a link preview with the app's name, page titles and descriptions, a sitemap, a privacy page, a working 404 page, analytics, and email that doesn't land in spam.
- **Evidence:** our own launch. Our link preview was missing our name, we had to add the sitemap, structured data and llms.txt by hand, and our sign-up emails had problems. "Just launched" posts on X rarely have a good preview card.
- **Why us:** it's the same "paste your URL, get a grade" flow and the same audience. It could be a second tab in LeakPatrol, or a sister site.
- **Money:** a free grade, with the full fix list as part of the £9 report or a separate one-off payment.

### 2. Free Supabase RLS policy generator / tester
- **Problem:** people know they need RLS but don't know which policy to write ("users can only read their own rows", "public read, owner write", team access). AI tools often "fix" errors by disabling RLS.
- **Evidence:** @minigendev_en's open tables, RLS questions in reply threads, and the Supabase 30 Oct change creating permission errors on new tables.
- **Why us:** we already have the SQL analysis (`src/sqlcheck.js`) and the Supabase guides. A free generator page ranks for "supabase rls policy example" searches and feeds the checklist sign-up.
- **Money:** free; it's a traffic and sign-up engine for LeakPatrol.

### 3. AI spend guard
- **Problem:** leaked or runaway OpenAI/Anthropic keys run up surprise bills (one user in the OpenCode breach threads was reported to have been charged $400). Spend limits exist but people don't set them, and they don't get alerts on spikes.
- **Evidence:** OpenCode breach threads; "surprise AI bill" posts.
- **Risk:** it needs read access to the provider's billing or usage, and people are wary of handing over keys. The providers may add better alerts themselves.
- **Money:** monthly subscription (monitoring is naturally recurring).

### 4. Fewer wasted Lovable/Bolt credits
- **Problem:** "I can use 100 credits in under an hour" (@sricherukuri22, 21 Oct). The advice in replies is to write one precise prompt per bug, with the file name and the exact error (@harjjotsinghh).
- **Idea:** a helper that turns "it's broken" plus the error into one precise prompt, and a cheat sheet of prompts that don't waste credits.
- **Risk:** Lovable could build this in; only a small fee is realistic. Best as a free tool that brings visitors to LeakPatrol.

### 5. "Where your customers talk" finder
- **Problem:** building is easy now, but getting the product in front of people isn't ("distribution has never been harder", @ivantinkers). Founders don't know which communities and threads to post in.
- **Evidence:** @arnau_dev offering free reports in a "drop your startup" thread (21 Oct); @rcmisk on skipping crowded subreddits; our own result of ~25 referred visits and no outside sign-ups in 4 days.
- **Risk:** crowded (others already sell this), and Reddit/X block automated reading. Low fit with what we've built.

### 6. Weekly "did my last deploy break it?" monitor
- **Problem:** builders keep shipping with AI, and each new version can bring back a leaked key or an open table.
- **Why us:** it's the planned LeakPatrol re-scan alert (see feature-ideas.md). It's listed here because it's the easiest way to monthly income.

## Log (add new ideas here as they come up)

| Date | Idea | Where it came from |
|---|---|---|
| 2026-10-21 | Ideas 1–6 above | X searches (Lovable credits, distribution, drop-your-startup threads) and our own launch |
| 2026-10-21 | "PromptShipped": a directory of vibe-coded apps that make money (someone already built it, @nvr_settle). A "secure apps" directory could pair with the LeakPatrol badge. | X search |
| 2026-10-21 | VICE: a security audit CLI (secrets, Supabase RLS, XSS/SQLi) for developers. A competitor for technical users, but it confirms demand. Our edge is no install and plain English. | @Clement_mondary |
