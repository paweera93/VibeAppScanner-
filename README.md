# LeakPatrol

A read-only security scanner for apps built with Lovable, Bolt, v0, Replit and Cursor.
Give it a URL and it reports leaked secrets, Supabase misconfiguration, missing
security headers and exposed files, each with a plain-English fix.

## Usage

```sh
node src/cli.js myapp.lovable.app          # human-readable report
node src/cli.js myapp.lovable.app --json   # JSON for the website/API
node src/server.js                         # website + API on http://localhost:8080
npm test                                   # runs against built-in broken and clean demo apps
```

The website (`public/`) and API (`POST /api/scan`, `GET /healthz`) run as one container
(`Dockerfile`), ready for Cloud Run. The API returns the free report: score, counts, every
issue title and one example fix. Limits: 5 scans per visitor per hour, and a site's result is
reused for 10 minutes.

Requires Node 22+. No dependencies.

## What the free scan checks

| Check | Source |
| --- | --- |
| HTTPS and http→https redirect | `src/scan.js` |
| Security headers and cookie flags | `src/checks/headers.js` |
| Secrets in JS bundles (OpenAI, Anthropic, Stripe, AWS, GitHub, Supabase service key…) | `src/checks/bundles.js`, `src/patterns.js` |
| Supabase detection | `src/checks/bundles.js` |
| Public source maps | `src/checks/bundles.js` |
| Exposed `.env` and `.git` files | `src/checks/exposed-files.js` |

## Safety rules

- GET requests only, with timeouts and size caps. No writes, deletes, logins or brute force.
- Only same-origin scripts a browser would load anyway, plus a short fixed list of file probes.
- Local, private and cloud-metadata addresses are refused, including names that resolve to them.
- Leaked secrets are masked in every report and never stored.
- Deeper checks (for example reading Supabase tables with the anon key) will only run after the
  owner verifies the site with a DNS TXT record or a file. Not built yet.

## Roadmap

1. Scanner core (this) ✔
2. Website: landing page, scan form and free results ✔ (paid report page comes with payments)
3. Hosting: one Cloud Run service for site + API (rate limits built in)
4. Payments (Lemon Squeezy) and owner verification
5. Launch
