// Find the app's JavaScript bundles, then look for leaked secrets, Supabase config
// and public source maps. Only fetches same-origin files a browser would load anyway.

import { get } from '../http.js';
import { SECRET_PATTERNS, maskSecret } from '../patterns.js';

const MAX_SCRIPTS = 25;

export function findScriptUrls(html, baseUrl) {
  const urls = new Set();
  const re = /<(?:script[^>]*\ssrc|link[^>]*\srel=["']?(?:modulepreload|preload)["']?[^>]*\shref)=["']([^"']+)["']/gi;
  const reHrefFirst = /<link[^>]*\shref=["']([^"']+\.m?js(?:\?[^"']*)?)["'][^>]*\srel=["']?(?:modulepreload|preload)/gi;
  for (const m of html.matchAll(re)) urls.add(m[1]);
  for (const m of html.matchAll(reHrefFirst)) urls.add(m[1]);
  return [...urls].map((u) => safeUrl(u, baseUrl)).filter(Boolean);
}

// Vite/webpack chunks reference sibling chunks by relative path.
function findChunkRefs(js, scriptUrl) {
  const refs = new Set();
  for (const m of js.matchAll(/["'`]((?:\.{1,2}\/|\/)?(?:assets\/|_next\/static\/chunks\/|static\/js\/)?[\w./-]+\.m?js)["'`]/g)) {
    const ref = m[1];
    if (!/[-.][\w]{6,}\.m?js$/.test(ref)) continue; // hashed chunk names only
    refs.add(safeUrl(ref, scriptUrl));
  }
  return [...refs].filter(Boolean);
}

function safeUrl(u, base) {
  try {
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

export async function checkBundles(page, { origin }) {
  const findings = [];
  const queue = findScriptUrls(page.body, page.url).filter((u) => new URL(u).origin === origin);
  const seen = new Set();
  const scripts = [];

  // Inline scripts count too.
  const inline = [...page.body.matchAll(/<script(?![^>]*\ssrc)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  if (inline.trim()) scripts.push({ url: page.url + ' (inline script)', body: inline });

  while (queue.length && seen.size < MAX_SCRIPTS) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await get(url);
    if (!res.ok || res.status !== 200) continue;
    scripts.push({ url, body: res.body });
    for (const ref of findChunkRefs(res.body, url)) {
      if (!seen.has(ref) && new URL(ref).origin === origin) queue.push(ref);
    }
    const mapRef = res.body.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m);
    if (mapRef && !mapRef[1].startsWith('data:')) {
      const mapUrl = safeUrl(mapRef[1], url);
      if (mapUrl && !seen.has(mapUrl)) {
        seen.add(mapUrl);
        const map = await get(mapUrl, { maxBytes: 256 * 1024 });
        if (map.ok && map.status === 200 && /"sources"\s*:/.test(map.body)) {
          findings.push({
            id: 'public-source-map',
            category: 'exposure',
            severity: 'low',
            title: 'Source maps are public, so anyone can read your original source code',
            evidence: mapUrl,
            fix: 'Turn off production source maps (Vite: build.sourcemap = false) or block *.map files at your host.',
          });
        }
      }
    }
  }

  const secretHits = new Map();
  const supabase = { urls: new Set(), anonKeys: new Map(), publishableKeys: new Set(), serviceRoleKeys: [], secretKeys: [], tables: new Set() };

  for (const s of scripts) {
    for (const p of SECRET_PATTERNS) {
      for (const m of s.body.matchAll(p.regex)) {
        const key = p.id + ':' + m[0];
        if (!secretHits.has(key)) secretHits.set(key, { pattern: p, value: m[0], file: s.url });
      }
    }
    for (const m of s.body.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) supabase.urls.add(m[0]);
    for (const m of s.body.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
      const { role, ref } = jwtClaims(m[0]);
      if (role === 'anon') supabase.anonKeys.set(ref, m[0]);
      if (role === 'service_role') supabase.serviceRoleKeys.push({ value: m[0], file: s.url });
    }
    for (const m of s.body.matchAll(/\bsb_secret_[A-Za-z0-9_-]{20,}/g)) supabase.secretKeys.push({ value: m[0], file: s.url });
    for (const m of s.body.matchAll(/\bsb_publishable_[A-Za-z0-9_-]{20,}/g)) supabase.publishableKeys.add(m[0]);
    // supabase.from("orders"): the tables the app reads, used by the verified-owner database check.
    for (const m of s.body.matchAll(/(?<!storage|Array|Buffer)\.from\(\s*["'`]([A-Za-z_]\w{0,62})["'`]\s*\)/g)) supabase.tables.add(m[1]);
  }

  for (const { pattern, value, file } of secretHits.values()) {
    findings.push({
      id: pattern.id,
      category: 'secrets',
      severity: pattern.severity,
      title: `${pattern.name} is visible in your JavaScript`,
      evidence: `${maskSecret(value)} in ${file}`,
      fix: pattern.fix,
    });
  }

  for (const { value, file } of [...supabase.serviceRoleKeys, ...supabase.secretKeys]) {
    findings.push({
      id: 'supabase-service-key',
      category: 'secrets',
      severity: 'critical',
      title: 'Supabase service key is visible in your JavaScript (bypasses all security rules)',
      evidence: `${maskSecret(value)} in ${file}`,
      fix: 'Rotate the service key in Supabase (Settings > API) right away. The browser must only use the anon or publishable key. Move any admin work into an Edge Function.',
    });
  }

  if (supabase.urls.size) {
    findings.push({
      id: 'supabase-detected',
      category: 'supabase',
      severity: 'info',
      title: 'App uses Supabase, so its safety depends on Row Level Security',
      detail: `Project: ${[...supabase.urls].join(', ')}. The anon key in your JavaScript is public by design; anyone can use it to call your database directly.`,
      fix: 'Make sure RLS is enabled on every table and each policy only allows what the logged-in user should see. The full report checks which tables are readable without logging in (after you verify you own the site).',
    });
  }

  // The public key for each project: the anon JWT whose ref matches, else a publishable key.
  const projects = [...supabase.urls].map((url) => {
    const ref = new URL(url).hostname.split('.')[0];
    const key = supabase.anonKeys.get(ref) || (supabase.urls.size === 1 ? [...supabase.publishableKeys][0] : undefined);
    return { url, key };
  }).filter((p) => p.key);

  return {
    findings,
    scriptsScanned: scripts.length,
    supabaseUrls: [...supabase.urls],
    supabaseProjects: projects,
    supabaseTables: [...supabase.tables],
  };
}

function jwtClaims(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) || {};
  } catch {
    return {};
  }
}
