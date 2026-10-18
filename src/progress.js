// "Proof it's fixed": a paid report remembers the problems it found the first time it was opened,
// and every later check marks each one fixed, still open, or new.
// The store only holds flat values, so the starting list is kept as a JSON string.

const key = (f) => `${f.id}|${f.title}`;
const slim = (f) => ({ id: f.id, title: f.title, severity: f.severity, category: f.category });

// Returns { progress, updates }: progress goes to the browser, updates are saved on the report record.
export function trackProgress(record, full, now = new Date()) {
  const current = full.findings.filter((f) => f.severity !== 'info');
  const updates = { lastGrade: full.score.grade, lastScore: full.score.value, lastCheckedAt: now };

  let baseline = parseBaseline(record.baselineFindings);
  const first = !baseline;
  if (!baseline) {
    baseline = current.map(slim);
    Object.assign(updates, { baselineFindings: JSON.stringify(baseline), baselineGrade: full.score.grade, baselineScore: full.score.value, baselineAt: now });
  } else if (full.deep && !record.baselineDeep) {
    // The database check only starts after the owner verifies the site. Its first results join the
    // starting list rather than showing up as "new" problems.
    const known = new Set(baseline.map(key));
    baseline = baseline.concat(current.filter((f) => f.category === 'supabase' && !known.has(key(f))).map(slim));
    Object.assign(updates, { baselineFindings: JSON.stringify(baseline), baselineDeep: true });
  }
  if (full.deep && !record.baselineDeep) updates.baselineDeep = true;

  const now_ = new Set(current.map(key));
  const before = new Set(baseline.map(key));
  const status = Object.fromEntries(current.map((f) => [key(f), before.has(key(f)) ? 'open' : 'new']));
  return {
    progress: {
      first,
      since: record.baselineAt || now,
      startGrade: record.baselineGrade || full.score.grade,
      startScore: record.baselineScore ?? full.score.value,
      fixed: baseline.filter((f) => !now_.has(key(f))).map(({ title, severity }) => ({ title, severity })),
      open: current.filter((f) => status[key(f)] === 'open').length,
      new: current.filter((f) => status[key(f)] === 'new').length,
      status,
    },
    updates,
  };
}

function parseBaseline(text) {
  if (!text) return null;
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

// A badge is only offered to verified owners whose latest check scored an A, and it says so only
// while that stays true and the check is recent.
export const BADGE_MAX_AGE_DAYS = 45;

export function badgeState(record, now = new Date()) {
  const checked = record.lastCheckedAt ? new Date(record.lastCheckedAt) : null;
  const fresh = checked && now - checked < BADGE_MAX_AGE_DAYS * 86_400_000;
  return { valid: Boolean(record.verified === true && record.lastGrade === 'A' && fresh), grade: record.lastGrade, checkedAt: checked, origin: record.origin };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function badgeSvg(state) {
  const right = state.valid
    ? `Grade A · ${state.checkedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : 'check not current';
  const leftW = 108;
  const rightW = Math.round(right.length * 6.6) + 20;
  const w = leftW + rightW;
  const color = state.valid ? '#2b8a3e' : '#6b7280';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" role="img" aria-label="Checked by LeakPatrol: ${esc(right)}">
<title>Checked by LeakPatrol: ${esc(right)}</title>
<rect width="${w}" height="24" rx="5" fill="${color}"/><rect width="${leftW}" height="24" rx="5" fill="#0d1020"/><rect x="${leftW - 6}" width="6" height="24" fill="#0d1020"/>
<path d="M14 5.5l5.5 2v4.2c0 3.2-2.3 6-5.5 6.8-3.2-.8-5.5-3.6-5.5-6.8V7.5z" fill="#8197ff"/><path d="M11.6 12l1.7 1.7 3.2-3.4" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" fill="#fff"><text x="25" y="16" font-weight="600">LeakPatrol</text><text x="${leftW + 10}" y="16">${esc(right)}</text></g>
</svg>`;
}
