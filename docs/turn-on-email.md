# Turning on LeakPatrol emails

When someone joins the waitlist, the site sends them a "You're on the list" email and sends
you a "New waitlist sign-up" alert at hello@getleakpatrol.com (which Cloudflare forwards to
your inbox). Until the steps below are done, nothing is sent: sign-ups are still saved, and the
logs show `email_skipped`.

Sending goes through Resend (free for up to 3,000 emails a month). Receiving mail at
@getleakpatrol.com is separate and handled by Cloudflare Email Routing.

## 1. Resend account and domain

1. Sign up at resend.com.
2. Domains → Add domain → `getleakpatrol.com`, region **Ireland (eu-west-1)**.
3. Choose **Sign in to Cloudflare** to add the DNS records automatically, or copy them into
   Cloudflare by hand (DNS → Records). They go on `send.getleakpatrol.com` and
   `resend._domainkey.getleakpatrol.com`, so they don't touch the Email Routing records.
   For records added by hand, set Proxy status to **DNS only**.
4. Wait until the domain shows **Verified** (usually a few minutes).
5. API Keys → Create API key, permission **Sending access**, domain `getleakpatrol.com`.
   Copy it straight into step 2 below, not into chat.

## 2. Store the key in Google Secret Manager

```
printf '%s' 'PASTE_RESEND_KEY' | gcloud secrets create resend-api-key --data-file=- --project app-safety-scan
```

(If Secret Manager isn't enabled or the service account can't read secrets yet, run the first
and last commands from step 2 of `turn-on-payments.md`.)

## 3. Deploy with email on

```
gcloud run deploy app-safety-scan --source . --region europe-west1 --project app-safety-scan \
  --update-secrets RESEND_API_KEY=resend-api-key:latest
```

## 4. Test

Join the waitlist on the live site with your own email. You should get the confirmation, and
the sign-up alert should arrive in your inbox via hello@getleakpatrol.com.

To try it before the domain is verified, run the site on your computer with Resend's test
sender. It can only send to the email you signed up to Resend with:

```
RESEND_API_KEY='PASTE_KEY' EMAIL_FROM='LeakPatrol <onboarding@resend.dev>' NOTIFY_EMAIL='you@example.com' node src/server.js
```

Then join the waitlist at http://localhost:8080 with that same email.

If nothing arrives, check the logs for `email_failed`:

```
gcloud logging read 'jsonPayload.event="email_failed"' --project app-safety-scan --freshness 1d --format 'value(jsonPayload.message)'
```

To send the alerts somewhere else, add `--update-env-vars NOTIFY_EMAIL=you@example.com` to the deploy.
