# LeakPatrol

A read-only security scanner for apps built with Lovable, Bolt, v0, Replit and Cursor.
Give it a URL and it reports leaked secrets, Supabase misconfiguration, missing
security headers and exposed files, each with a plain-English fix.

## Usage

```sh
node src/cli.js myapp.lovable.app          # human-readable report
node src/cli.js myapp.lovable.app --json   # JSON for the website/API
node src/cli.js myapp.lovable.app --full   # full report (Markdown) with AI fix prompts
node src/cli.js myapp.lovable.app --deep   # add the Supabase database checks (your own sites only)
node src/server.js                         # website + API on http://localhost:8080
PAYMENTS_DEMO=1 node src/server.js         # same, with the paid flow unlocked free (local only)
npm test                                   # runs against built-in broken and clean demo apps
```

The website (`public/`) and API (`POST /api/scan`, `GET /healthz`) run as one container
(`Dockerfile`), ready for Cloud Run. The API returns the free report: score, counts, every
issue title and one example fix. Limits: 5 scans per visitor per hour, and a site's result is
reused for 10 minutes.

`POST /api/waitlist` stores emails of people who want the full report. With
`FIRESTORE_PROJECT` set it writes to Firestore (collection `waitlist`, one document per
email) using the Cloud Run service account; without it, emails stay in memory. A new sign-up gets a
confirmation email and the owner gets an alert at `NOTIFY_EMAIL` (set it to a real inbox),
sent through Resend once `RESEND_API_KEY` is set (`src/email.js`, setup in `docs/turn-on-email.md`).

Paid reports (`POST /api/checkout`, `POST /api/webhooks/lemonsqueezy`, `GET /api/report?id=`)
are off unless `PAYMENTS_ENABLED=1` and `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`,
`LEMONSQUEEZY_VARIANT_ID` and `LEMONSQUEEZY_WEBHOOK_SECRET` are set. The buyer gets a private
link (`/report.html?id=...`) that re-scans their site each time it's opened.

If the site uses Supabase, the report page offers owner verification (`POST /api/verify`). The owner
adds a meta tag to `index.html`, a `/leakpatrol-verification.txt` file, or a DNS TXT record, each
holding a code unique to their report. Once verified, the report also runs the database checks
(`src/checks/supabase.js`): which tables answer without a login, and whether anyone can sign up
without confirming an email.

Requires Node 22+. No dependencies.

## Visitor numbers

Every page view logs one `pageview` line (page and where the visitor came from; no IP, no cookies).
Bots are skipped. Add `?ref=x` or `?ref=reddit` to links you share to see which ones work.

```sh
# Page views in the last 7 days, grouped by source
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.event="pageview"' \
  --project app-safety-scan --freshness 7d --format 'value(jsonPayload.from)' | sort | uniq -c | sort -rn
# Scans, waitlist sign-ups and paid reports in the last 7 days
for e in scan waitlist_signup report_paid; do echo "$e: $(gcloud logging read "jsonPayload.event=\"$e\"" \
  --project app-safety-scan --freshness 7d --format 'value(timestamp)' | wc -l)"; done
```

## What the free scan checks

| Check | Source |
| --- | --- |
| HTTPS and http→https redirect | `src/scan.js` |
| Security headers and cookie flags | `src/checks/headers.js` |
| Secrets in JS bundles (OpenAI, Anthropic, Stripe, AWS, GitHub, Supabase service key…) | `src/checks/bundles.js`, `src/patterns.js` |
| Supabase detection | `src/checks/bundles.js` |
| Public source maps | `src/checks/bundles.js` |
| Exposed `.env` and `.git` files | `src/checks/exposed-files.js` |
| Supabase tables readable without login, open sign-up (verified owners, paid report) | `src/checks/supabase.js` |

## Safety rules

- GET requests only, with timeouts and size caps. No writes, deletes, logins or brute force.
- Only same-origin scripts a browser would load anyway, plus a short fixed list of file probes.
- Local, private and cloud-metadata addresses are refused, including names that resolve to them.
- Leaked secrets are masked in every report and never stored.
- Database checks (reading Supabase tables with the public anon key from the site's own
  JavaScript) only run after the owner verifies the site. They send GET requests to the
  project's `*.supabase.co` address only, read at most one row per table (40 tables at most),
  and keep only column names and an estimated row count. Row contents are never stored or shown.
  Writes are never tested.

## Roadmap

1. Scanner core (this) ✔
2. Website: landing page, scan form and free results ✔ (paid report page comes with payments)
3. Hosting: one Cloud Run service for site + API (rate limits built in) ✔
4. Email waitlist under the locked fixes ✔
5. Paid report and Lemon Squeezy checkout ✔ (off until switched on)
6. Owner verification and deep Supabase checks ✔
7. Launch
