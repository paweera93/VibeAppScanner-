// Email waitlist for people who want to hear when full reports launch.

import { createHash } from 'node:crypto';

const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

export function normaliseEmail(input) {
  const email = String(input ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new Error('invalid email');
  return email;
}

// The document id is a hash of the email, so signing up twice is harmless.
// Returns true only for a new sign-up, so emails go out once per address.
export async function addToWaitlist(store, email, source) {
  const now = new Date();
  return store.create('waitlist', waitlistId(email), { email, source, createdAt: now, lastSentAt: now });
}

const waitlistId = (email) => createHash('sha256').update(email).digest('hex');

// Someone already on the list who signs up again gets the checklist again, at most once a day,
// so the form can't be used to flood an inbox.
export const RESEND_AFTER_MS = 24 * 60 * 60 * 1000;

export async function claimResend(store, email, now = new Date()) {
  const id = waitlistId(email);
  const doc = await store.get('waitlist', id);
  const last = doc?.lastSentAt || doc?.createdAt;
  if (last && now - new Date(last) < RESEND_AFTER_MS) return false;
  await store.update('waitlist', id, { lastSentAt: now });
  return true;
}
