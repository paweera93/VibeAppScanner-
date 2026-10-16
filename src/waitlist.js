// Email waitlist for people who want to hear when full reports launch.

import { createHash } from 'node:crypto';

const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

export function normaliseEmail(input) {
  const email = String(input ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new Error('invalid email');
  return email;
}

// The document id is a hash of the email, so signing up twice is harmless.
export async function addToWaitlist(store, email, source) {
  const id = createHash('sha256').update(email).digest('hex');
  await store.create('waitlist', id, { email, source, createdAt: new Date() });
}
