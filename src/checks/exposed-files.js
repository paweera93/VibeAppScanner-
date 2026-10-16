// Probe a short, fixed list of files that should never be public.
// Single-page apps often answer every path with index.html, so each probe
// validates the body looks like the real file before reporting it.

import { get } from '../http.js';

const PROBES = [
  {
    path: '/.env',
    id: 'exposed-env',
    severity: 'critical',
    title: 'Your .env file is public',
    looksReal: (b) => /^\s*[A-Z][A-Z0-9_]*\s*=\s*\S/m.test(b) && !/<html|<!doctype/i.test(b),
    fix: 'Delete the file from your public folder or block it at your host, then rotate every key that was in it.',
  },
  { path: '/.env.local', id: 'exposed-env', severity: 'critical', title: 'Your .env.local file is public' },
  { path: '/.env.production', id: 'exposed-env', severity: 'critical', title: 'Your .env.production file is public' },
  {
    path: '/.git/config',
    id: 'exposed-git',
    severity: 'high',
    title: 'Your .git folder is public, so your full source history can be downloaded',
    looksReal: (b) => /\[core\]/.test(b) && !/<html/i.test(b),
    fix: 'Block /.git at your web server or host and make sure the deploy does not upload it.',
  },
];

// Inherit validators/fixes from the first probe with the same id.
for (const p of PROBES) {
  const base = PROBES.find((q) => q.id === p.id);
  p.looksReal ??= base.looksReal;
  p.fix ??= base.fix;
}

export async function checkExposedFiles(origin) {
  const findings = [];
  for (const probe of PROBES) {
    const res = await get(origin + probe.path, { maxBytes: 64 * 1024 });
    if (!res.ok || res.status !== 200) continue;
    if (!probe.looksReal(res.body)) continue;
    findings.push({
      id: probe.id,
      category: 'exposure',
      severity: probe.severity,
      title: probe.title,
      evidence: origin + probe.path,
      fix: probe.fix,
    });
  }
  return findings;
}
