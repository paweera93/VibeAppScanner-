# Turning on LeakPatrol payments

Do this only after the immigration adviser has said whose name the Lemon Squeezy account should be in. Until then the site shows the email waitlist instead of the "Get the full report · £9" button.

## 1. Lemon Squeezy (in test mode first)

1. The agreed account holder signs up at lemonsqueezy.com and creates a store. Leave **Test mode** switched on (toggle at the bottom left).
2. Products → New product: name "LeakPatrol full report", price £9, single payment. Save it, open the variant, and note its **variant ID**.
3. Settings → Stores: note the **store ID**.
4. Settings → API: create an API key. Copy it straight into step 2 below, not into chat.
5. Settings → Webhooks → add:
   - URL: `https://getleakpatrol.com/api/webhooks/lemonsqueezy`
   - Signing secret: any long random string (for example from `openssl rand -hex 32`)
   - Events: tick **order_created** only

## 2. Store the two secrets in Google Secret Manager

```
gcloud services enable secretmanager.googleapis.com --project app-safety-scan
printf '%s' 'PASTE_API_KEY' | gcloud secrets create ls-api-key --data-file=- --project app-safety-scan
printf '%s' 'PASTE_SIGNING_SECRET' | gcloud secrets create ls-webhook-secret --data-file=- --project app-safety-scan
gcloud projects add-iam-policy-binding app-safety-scan --member=serviceAccount:262586335940-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

## 3. Deploy with payments on

Replace STORE_ID and VARIANT_ID:

```
gcloud run deploy app-safety-scan --source . --region europe-west1 --project app-safety-scan \
  --update-env-vars FIRESTORE_PROJECT=app-safety-scan,PAYMENTS_ENABLED=1,LEMONSQUEEZY_STORE_ID=STORE_ID,LEMONSQUEEZY_VARIANT_ID=VARIANT_ID \
  --update-secrets LEMONSQUEEZY_API_KEY=ls-api-key:latest,LEMONSQUEEZY_WEBHOOK_SECRET=ls-webhook-secret:latest
```

## 4. Test with a fake card

Scan a site with problems, click **Get the full report · £9**, and pay with the test card `4242 4242 4242 4242` (any future date, any CVC). You should land on your report page within a few seconds. In the Firestore console, the `reports` collection shows the order with `status: paid` and `testMode: true`.

## 5. Go live

Switch Lemon Squeezy out of test mode, create a live API key and live webhook (same URL and event), update the two secrets with `gcloud secrets versions add`, and redeploy.

To switch payments off at any time:

```
gcloud run services update app-safety-scan --region europe-west1 --project app-safety-scan --update-env-vars PAYMENTS_ENABLED=0
```
