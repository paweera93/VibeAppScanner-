# App Safety Scan

A read-only security scanner for apps built with Lovable, Bolt, v0, Replit and Cursor.
Give it a URL and it reports leaked secrets, Supabase misconfiguration, missing
security headers and exposed files, each with a plain-English fix.

## Usage

```sh
node src/cli.js myapp.lovable.app          # human-readable report
node src/cli.js myapp.lovable.app --json   # JSON for the website/API
npm test                                   # runs against built-in broken and clean demo apps
```

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
2. Website: landing page, scan form, results and report pages
3. Hosting: Cloud Run for the scanner, Cloudflare Pages for the site, rate limits
4. Payments (Lemon Squeezy) and owner verification
5. Launch
