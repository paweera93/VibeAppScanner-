// Email waitlist for people who want the full report when it launches.
// On Cloud Run it saves to Firestore through the REST API, using the service's own
// identity from the metadata server, so there are no keys and no dependencies.
// Without FIRESTORE_PROJECT (local runs, tests) it keeps emails in memory.

import { createHash } from 'node:crypto';

const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

export function normaliseEmail(input) {
  const email = String(input ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new Error('invalid email');
  return email;
}

export function createWaitlist(env = process.env) {
  return env.FIRESTORE_PROJECT ? new FirestoreWaitlist({ projectId: env.FIRESTORE_PROJECT }) : new MemoryWaitlist();
}

export class MemoryWaitlist {
  constructor() {
    this.entries = new Map();
  }
  async add(email, source) {
    if (!this.entries.has(email)) this.entries.set(email, { email, source, createdAt: new Date() });
  }
}

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export class FirestoreWaitlist {
  constructor({ projectId, fetchImpl = fetch }) {
    this.projectId = projectId;
    this.fetch = fetchImpl;
    this.token = null;
    this.tokenExpires = 0;
  }

  async accessToken() {
    if (this.token && Date.now() < this.tokenExpires) return this.token;
    const res = await this.fetch(METADATA_TOKEN_URL, { headers: { 'metadata-flavor': 'Google' } });
    if (!res.ok) throw new Error(`metadata token: ${res.status}`);
    const { access_token, expires_in } = await res.json();
    this.token = access_token;
    this.tokenExpires = Date.now() + (expires_in - 60) * 1000;
    return this.token;
  }

  async add(email, source) {
    // The document id is a hash of the email, so signing up twice is harmless.
    const id = createHash('sha256').update(email).digest('hex');
    const url =
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}` +
      `/databases/(default)/documents/waitlist?documentId=${id}`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        fields: {
          email: { stringValue: email },
          source: { stringValue: source },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    if (res.ok || res.status === 409) return; // 409: already on the list
    throw new Error(`firestore: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  }
}
