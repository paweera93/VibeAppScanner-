// Tiny document store used for the waitlist and paid reports.
// On Cloud Run (FIRESTORE_PROJECT set) it talks to Firestore's REST API using the
// service's own identity from the metadata server: no keys, no dependencies.
// Otherwise (local runs, tests) it keeps documents in memory.

export function createStore(env = process.env) {
  return env.FIRESTORE_PROJECT ? new FirestoreStore({ projectId: env.FIRESTORE_PROJECT }) : new MemoryStore();
}

export class MemoryStore {
  constructor() {
    this.docs = new Map();
  }
  // Returns false if the document already exists.
  async create(collection, id, data) {
    const key = `${collection}/${id}`;
    if (this.docs.has(key)) return false;
    this.docs.set(key, { ...data });
    return true;
  }
  async get(collection, id) {
    const doc = this.docs.get(`${collection}/${id}`);
    return doc ? { ...doc } : null;
  }
  async update(collection, id, data) {
    const key = `${collection}/${id}`;
    this.docs.set(key, { ...this.docs.get(key), ...data });
  }
}

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export class FirestoreStore {
  constructor({ projectId, fetchImpl = fetch }) {
    this.base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
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

  async call(url, method, body) {
    const res = await this.fetch(url, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (res.ok || res.status === 404 || res.status === 409) return res;
    throw new Error(`firestore ${method}: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  }

  async create(collection, id, data) {
    const res = await this.call(`${this.base}/${collection}?documentId=${encodeURIComponent(id)}`, 'POST', { fields: encode(data) });
    return res.status !== 409;
  }

  async get(collection, id) {
    const res = await this.call(`${this.base}/${collection}/${encodeURIComponent(id)}`, 'GET');
    if (res.status === 404) return null;
    return decode((await res.json()).fields || {});
  }

  async update(collection, id, data) {
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    await this.call(`${this.base}/${collection}/${encodeURIComponent(id)}?${mask}`, 'PATCH', { fields: encode(data) });
  }
}

export function encode(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v === null) fields[k] = { nullValue: null };
    else if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

export function decode(fields) {
  const data = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('timestampValue' in v) data[k] = new Date(v.timestampValue);
    else if ('integerValue' in v) data[k] = Number(v.integerValue);
    else if ('doubleValue' in v) data[k] = v.doubleValue;
    else if ('booleanValue' in v) data[k] = v.booleanValue;
    else if ('nullValue' in v) data[k] = null;
    else data[k] = v.stringValue;
  }
  return data;
}
