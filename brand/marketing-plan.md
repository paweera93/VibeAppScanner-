# LeakPatrol marketing plan

Goal while payments wait on the visa question: get people scanning their apps and joining the
email list, so there's an audience ready on the day the £9 report goes live.

## Where we're starting (18 Oct 2026)

Over the 3 days since launch (page views and scans include our own testing):

| | So far |
|---|---|
| Page views | ~480 |
| Scans | 21 |
| Email sign-ups from real visitors | 0 or 1 (the other 7 were our own tests) |
| Visits from X | 2 (both on 18 Oct, after the first replies) |

Every link we share carries `?ref=<channel>`, so the page-view logs show which channel works.

## Channels, best first

| Channel | Why | Who posts | Status |
|---|---|---|---|
| **X** (@leakpatrol) | Lovable/Bolt/Cursor builders hang out there; "drop your URL" threads welcome links | Claude drafts and posts after your OK | Running daily |
| **Hacker News: Show HN** | One good day can bring thousands of developers; works with a new account | You (HN wants the maker's own voice); draft below | Ready to post |
| **Discord: Lovable, Bolt, Supabase, Cursor servers** | Exactly our users; #showcase / #share-your-project channels allow it | You (needs your Discord account) | Draft below |
| **dev.to / Hashnode article** | Gets found on Google for months ("is my supabase anon key safe") | Claude writes; you publish under your account | Next |
| **Reddit**: r/lovable, r/SideProject, r/Supabase, r/vibecoding | Big, but new accounts get removed for links | You: 1–2 weeks of helpful comments first, no links | Warm-up |
| **Product Hunt** | One launch day, good for links back to the site | Prepare once we have a few happy users and the £9 report is live | Later |
| **Indie Hackers** | Builders who like "building in public" posts | You; draft can reuse the Show HN one | Later |

## X rules we found

- **Images beat plain text** for being noticed in the feed: each daily tip gets a 1200×675 image
  in the brand style (`brand/x-day3.png` and onwards). Post text stays short and useful on its own.
- **Links in a main post reach fewer people**, so put the link in a reply to your own post. In
  "drop your project" threads a link is welcome.
- Up to about 10 replies a day, only where they help. One link per account every few days.

## Draft: Show HN

**Title:** Show HN: LeakPatrol – free check for leaked keys in AI-built (Lovable/Bolt/Cursor) apps

**URL:** https://www.getleakpatrol.com/?ref=hn

**Text:**
> I'm an SRE, and I kept seeing the same mistakes in apps built with Lovable, Bolt, v0 and Cursor: OpenAI and Stripe secret keys bundled into the frontend JavaScript (anything prefixed VITE_ or NEXT_PUBLIC_ ships to every visitor), Supabase tables with Row Level Security off, public .env files and .git folders.
>
> LeakPatrol is a read-only check for those. Paste a URL and in about a minute you get an A–F grade and every finding, most serious first, each with a plain-English fix and a prompt you can paste back into the AI tool. It only fetches what any browser already downloads, never logs in or changes anything, and masks any key it finds.
>
> The database check (which tables can be read without logging in) only runs after you prove you own the site with a DNS record, meta tag or file.
>
> It's Node with no dependencies, on Cloud Run. I'd love feedback on false positives, and on checks you'd want added.

Best time: a weekday, 14:00–16:00 UK time. Stay around for 2–3 hours to answer comments.

## Draft: Discord #showcase

> Built a free safety check for Lovable / Bolt / v0 apps: paste your app's URL and it tells you if any secret keys ended up in the frontend, if your Supabase tables are readable without logging in, or if your .env is public. Read-only, no sign-up, about a minute. Each problem comes with a prompt you can paste back into Lovable to fix it.
> https://www.getleakpatrol.com/?ref=discord
> Feedback very welcome, especially false alarms!

Check each server's rules for self-promotion first, and post once per server.

## Weekly rhythm

| When | What |
|---|---|
| Every day | X: one tip post with image, up to ~10 helpful replies, 1–2 "drop your project" threads |
| Once a week | One article (dev.to/Hashnode), shared on X |
| Once a week | Progress check: page views, scans, sign-ups by channel (from the logs) |
| When payments go live | Email the list once, X thread, Product Hunt launch |
