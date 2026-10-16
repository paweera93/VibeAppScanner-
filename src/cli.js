#!/usr/bin/env node
// Usage: node src/cli.js <url> [--json]

import { scan, SEVERITY_ORDER } from './scan.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const allowPrivate = args.includes('--allow-private');
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('Usage: app-safety-scan <url> [--json]');
  process.exit(2);
}

try {
  const report = await scan(target, { allowPrivate });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  process.exit(report.reachable ? 0 : 1);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(2);
}

function printReport(r) {
  if (!r.reachable) {
    console.log(`Could not reach ${r.target}: ${r.error}`);
    return;
  }
  console.log(`\nApp Safety Scan: ${r.finalUrl}`);
  console.log(`Score: ${r.score.value}/100 (grade ${r.score.grade})`);
  console.log(`Scripts scanned: ${r.scriptsScanned}${r.usesSupabase ? ' · uses Supabase' : ''}`);
  console.log(SEVERITY_ORDER.map((s) => `${s}: ${r.summary[s]}`).join('  '));
  console.log('');
  for (const f of r.findings) {
    console.log(`[${f.severity.toUpperCase()}] ${f.title}`);
    if (f.detail) console.log(`    ${f.detail}`);
    if (f.evidence) console.log(`    Found: ${f.evidence}`);
    console.log(`    Fix: ${f.fix}`);
  }
}
