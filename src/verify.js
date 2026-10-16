// Owner verification: proves the buyer controls the site before the deep (database) checks run.
// Any one of three ways works, so people on Lovable/Bolt subdomains (no DNS access) can verify too:
//   1. a meta tag in the home page's HTML
//   2. a file at /leakpatrol-verification.txt
//   3. a DNS TXT record on the site's hostname

import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { get } from './http.js';
import { assertScannable } from './scan.js';

export const META_NAME = 'leakpatrol-verification';
export const FILE_PATH = '/leakpatrol-verification.txt';

export function newVerifyToken() {
  return 'lp-' + randomBytes(12).toString('hex');
}

export function instructions(origin, token) {
  const host = new URL(origin).hostname;
  return {
    token,
    meta: `<meta name="${META_NAME}" content="${token}">`,
    filePath: FILE_PATH,
    fileUrl: origin + FILE_PATH,
    dnsName: host,
    dnsValue: `${META_NAME}=${token}`,
  };
}

// Returns the method that worked ('meta', 'file' or 'dns'), or null.
export async function checkOwnership(origin, token, { allowPrivate = false, resolveTxtImpl = resolveTxt } = {}) {
  const { hostname } = new URL(origin);
  await assertScannable(hostname, allowPrivate);

  const home = await get(origin + '/', { maxBytes: 512 * 1024 });
  if (home.ok && home.status === 200 && sameSite(home.url, hostname) && hasMetaTag(home.body, token)) return 'meta';

  // Single-page apps answer every path with index.html, so the file must be just the token.
  const file = await get(origin + FILE_PATH, { maxBytes: 4 * 1024 });
  if (file.ok && file.status === 200 && sameSite(file.url, hostname) && file.body.trim() === token) return 'file';

  try {
    const records = await resolveTxtImpl(hostname);
    if (records.some((parts) => parts.join('').trim() === `${META_NAME}=${token}`)) return 'dns';
  } catch {
    // No TXT records (or DNS failed): not verified this way.
  }
  return null;
}

export function hasMetaTag(html, token) {
  for (const [tag] of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const name = tag.match(/\bname\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    const content = tag.match(/\bcontent\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (name?.toLowerCase() === META_NAME && content === token) return true;
  }
  return false;
}

// Redirects are followed, but the token must come from the same site (www. or not),
// so a redirect to a page someone else controls can't verify a site they don't own.
function sameSite(url, hostname) {
  const strip = (h) => h.toLowerCase().replace(/^www\./, '');
  try {
    return strip(new URL(url).hostname) === strip(hostname);
  } catch {
    return false;
  }
}
