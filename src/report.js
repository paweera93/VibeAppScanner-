// Turns a full scan into the free report: score, counts and a preview.
// The full findings list (with fixes) is what the paid report unlocks.

import { SEVERITY_ORDER } from './scan.js';

const PREVIEW_COUNT = 1;

export function toFreeReport(report) {
  if (!report.reachable) {
    return { target: report.target, reachable: false, error: 'We could not reach that site. Check the address and that the site is online.' };
  }
  const visible = report.findings.filter((f) => f.severity !== 'info');
  return {
    target: report.target,
    finalUrl: report.finalUrl,
    reachable: true,
    scannedAt: report.finishedAt,
    score: report.score,
    summary: report.summary,
    usesSupabase: report.usesSupabase,
    scriptsScanned: report.scriptsScanned,
    // Titles of every issue are shown so people see what's wrong; fixes are the paid part.
    issues: visible.map((f) => ({ severity: f.severity, category: f.category, title: f.title })),
    preview: visible.slice(0, PREVIEW_COUNT).map(({ severity, title, detail, evidence, fix }) => ({ severity, title, detail, evidence, fix })),
    lockedFixes: Math.max(0, visible.length - PREVIEW_COUNT),
    severityOrder: SEVERITY_ORDER,
  };
}
