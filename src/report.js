// Turns a full scan into the free report: score, counts and a preview.
// The full findings list (with fixes) is what the paid report unlocks.

import { SEVERITY_ORDER } from './scan.js';
import { promptFor, HEADERS_PROMPT } from './fix-prompts.js';

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

// The paid report: every finding with its fix and a copy-paste prompt for an AI coding tool.
export function toFullReport(report) {
  if (!report.reachable) return toFreeReport(report);
  const headerTitles = report.findings.filter((f) => f.category === 'headers' && f.severity !== 'info').map((f) => f.title);
  return {
    target: report.target,
    finalUrl: report.finalUrl,
    reachable: true,
    scannedAt: report.finishedAt,
    score: report.score,
    summary: report.summary,
    usesSupabase: report.usesSupabase,
    scriptsScanned: report.scriptsScanned,
    findings: report.findings.map(({ id, severity, category, title, detail, evidence, fix }) => ({
      id, severity, category, title, detail, evidence, fix, prompt: promptFor({ id, category, title }),
    })),
    headersPrompt: headerTitles.length ? HEADERS_PROMPT(headerTitles) : null,
  };
}

export function renderMarkdown(full) {
  if (!full.reachable) return `# LeakPatrol report\n\nCould not reach ${full.target}.\n`;
  const lines = [
    `# LeakPatrol report: ${full.finalUrl}`,
    '',
    `**Grade ${full.score.grade}** (${full.score.value}/100) · scanned ${full.scannedAt} · ${full.scriptsScanned} scripts checked${full.usesSupabase ? ' · uses Supabase' : ''}`,
    '',
    SEVERITY_ORDER.map((s) => `${s}: ${full.summary[s]}`).join(' · '),
    '',
    'Fix from the top down. Each prompt can be pasted into Lovable, Bolt, v0, Cursor or Claude Code.',
  ];
  let n = 0;
  for (const f of full.findings) {
    lines.push('', `## ${++n}. [${f.severity.toUpperCase()}] ${f.title}`, '');
    if (f.detail) lines.push(f.detail, '');
    if (f.evidence) lines.push(`Found: \`${f.evidence}\``, '');
    lines.push(`**How to fix:** ${f.fix}`);
    if (f.prompt) lines.push('', '**Prompt for your AI tool:**', '', '```text', f.prompt, '```');
  }
  if (full.headersPrompt) {
    lines.push('', '## One prompt for all the missing security headers', '', '```text', full.headersPrompt, '```');
  }
  if (!full.findings.length) lines.push('', 'No problems found. Nice work.');
  return lines.join('\n') + '\n';
}
