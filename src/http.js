// Small, polite HTTP client: GET only, timeouts, size caps, identifying user agent.

export const USER_AGENT =
  'LeakPatrol/0.1 (+read-only security check; contact: abuse@leakpatrol.example)';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export async function get(url, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect,
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    const body = await readCapped(res, maxBytes);
    return {
      ok: true,
      url: res.url || url,
      status: res.status,
      headers: res.headers,
      body,
      redirected: res.redirected,
    };
  } catch (err) {
    return { ok: false, url, error: err.name === 'AbortError' ? 'timeout' : String(err.cause?.code || err.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}
