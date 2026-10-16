// Lemon Squeezy checkout for the £9 full report.
// Lemon Squeezy is the merchant of record: it takes the payment and handles VAT.
// Flow: we create a report id, open a checkout carrying that id, and Lemon Squeezy's
// order_created webhook marks the report paid. The buyer lands on /report.html?id=...
//
// Payments stay off unless PAYMENTS_ENABLED=1 and every setting below is present.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function paymentsConfig(env = process.env) {
  const cfg = {
    apiBase: env.LEMONSQUEEZY_API_BASE || 'https://api.lemonsqueezy.com',
    apiKey: env.LEMONSQUEEZY_API_KEY,
    storeId: env.LEMONSQUEEZY_STORE_ID,
    variantId: env.LEMONSQUEEZY_VARIANT_ID,
    webhookSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET,
    publicUrl: (env.PUBLIC_URL || 'https://getleakpatrol.com').replace(/\/$/, ''),
  };
  cfg.enabled = env.PAYMENTS_ENABLED === '1' && Boolean(cfg.apiKey && cfg.storeId && cfg.variantId && cfg.webhookSecret);
  return cfg;
}

// 128 random bits: the id is also the key to the report, so it must be unguessable.
export function newReportId() {
  return randomBytes(16).toString('hex');
}

export const REPORT_ID_RE = /^[0-9a-f]{32}$/;

export async function createCheckout(cfg, { reportId, origin }) {
  const res = await fetch(`${cfg.apiBase}/v1/checkouts`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { custom: { report_id: reportId } },
          product_options: {
            description: `Full LeakPatrol report for ${origin}`,
            redirect_url: `${cfg.publicUrl}/report.html?id=${reportId}`,
            receipt_button_text: 'Open your report',
            receipt_link_url: `${cfg.publicUrl}/report.html?id=${reportId}`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(cfg.storeId) } },
          variant: { data: { type: 'variants', id: String(cfg.variantId) } },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`lemonsqueezy checkout: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const url = (await res.json())?.data?.attributes?.url;
  if (!url) throw new Error('lemonsqueezy checkout: no url in response');
  return url;
}

export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(String(signature));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Returns { reportId, orderId, email, testMode } for a paid order, otherwise null.
export function paidOrderFrom(event) {
  if (event?.meta?.event_name !== 'order_created') return null;
  const attrs = event.data?.attributes || {};
  const reportId = event.meta.custom_data?.report_id;
  if (attrs.status !== 'paid' || !REPORT_ID_RE.test(reportId || '')) return null;
  return { reportId, orderId: String(event.data.id), email: attrs.user_email || '', testMode: Boolean(event.meta.test_mode) };
}
