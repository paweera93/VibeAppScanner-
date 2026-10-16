// In-memory limits. Fine for one Cloud Run instance; move to Firestore/Redis if we scale out.

export class RateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  allow(key, now = Date.now()) {
    const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.#prune(now);
    return true;
  }

  #prune(now) {
    for (const [k, times] of this.hits) {
      if (!times.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
  }
}

export class TtlCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  get(key, now = Date.now()) {
    const item = this.items.get(key);
    if (!item) return undefined;
    if (now - item.at > this.ttlMs) {
      this.items.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key, value, now = Date.now()) {
    this.items.set(key, { value, at: now });
    if (this.items.size > 5_000) this.items.delete(this.items.keys().next().value);
  }
}
