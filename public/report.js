const statusEl = document.getElementById('status');
const LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
const id = new URLSearchParams(location.search).get('id') || '';

load();

// Right after payment the confirmation from Lemon Squeezy can take a few seconds, so keep checking.
async function load(attempt = 0) {
  try {
    const res = await fetch(`/api/report?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (res.status === 202) {
      if (attempt >= 30) {
        statusEl.textContent = 'We are still waiting for your payment to be confirmed. Refresh this page in a minute. If it still does not load, reply to your receipt email.';
        return;
      }
      statusEl.textContent = 'Payment received, preparing your report…';
      setTimeout(() => load(attempt + 1), 3000);
      return;
    }
    if (!res.ok) {
      statusEl.textContent = data.error || 'Report not found. Check the link in your receipt email.';
      return;
    }
    if (!data.report.reachable) {
      statusEl.textContent = 'We could not reach your site just now. Refresh this page in a few minutes.';
      return;
    }
    statusEl.hidden = true;
    render(data.report);
    renderProgress(data.progress);
    renderVerification(data.report, data.verification);
    renderBadge(data.badge);
    document.getElementById('database-sql').textContent = data.databaseSql || '';
    document.getElementById('database-block').hidden = !data.report.usesSupabase;
  } catch {
    statusEl.textContent = 'Something went wrong. Please refresh the page.';
  }
}

function render(r) {
  const grade = document.getElementById('grade');
  grade.textContent = r.score.grade;
  grade.className = `grade grade-${r.score.grade.toLowerCase()}`;
  document.getElementById('score').textContent = r.score.value;
  document.getElementById('scanned-url').textContent = `${r.finalUrl} · checked ${new Date(r.scannedAt).toLocaleString()}`;
  document.getElementById('download').href = `/api/report?id=${encodeURIComponent(id)}&format=md`;

  document.getElementById('counts').replaceChildren(
    ...['critical', 'high', 'medium', 'low'].map((s) => el('li', { className: `count sev-${s}` }, [el('strong', {}, [String(r.summary[s])]), ` ${LABELS[s]}`])),
  );

  const list = document.getElementById('findings');
  list.replaceChildren(
    ...(r.findings.length
      ? r.findings.map((f, i) => {
          const promptId = `prompt-${i}`;
          return el('li', { className: 'preview-item' }, [
            el('h3', {}, [
              el('span', { className: `badge sev-${f.severity}` }, [LABELS[f.severity]]), ' ', f.title,
              f.status ? el('span', { className: `pill status-${f.status}` }, [f.status === 'new' ? 'New since your first check' : 'Still open']) : '',
            ]),
            f.detail ? el('p', {}, [f.detail]) : '',
            f.evidence ? el('p', { className: 'muted' }, ['Found: ', el('code', {}, [f.evidence])]) : '',
            el('p', {}, [el('strong', {}, ['How to fix: ']), f.fix]),
            f.prompt ? el('pre', { className: 'prompt', id: promptId }, [f.prompt]) : '',
            f.prompt ? el('button', { type: 'button', className: 'copy', dataset: { target: promptId } }, ['Copy prompt']) : '',
          ]);
        })
      : [el('li', {}, ['No problems found. Nice work.'])]),
  );

  if (r.builder) {
    document.getElementById('fix-intro').textContent =
      `Your app looks like it was built with ${r.builder}, so paste each prompt into ${r.builder}'s chat. Rotate any leaked key yourself in that service's dashboard.`;
  }

  if (r.headersPrompt) {
    document.getElementById('headers-prompt').textContent = r.headersPrompt;
    document.getElementById('headers-block').hidden = false;
  }
  document.getElementById('results').hidden = false;
}

const ORDINAL = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

function renderProgress(p) {
  const block = document.getElementById('progress-block');
  if (!p) return;
  const since = new Date(p.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  if (p.first) {
    block.hidden = false;
    document.getElementById('progress-line').textContent =
      'This is your starting point. Each time you come back, we re-check your site and tick off every problem you have fixed.';
    return;
  }
  if (!p.fixed.length && !p.open && !p.new) {
    document.getElementById('progress-line').textContent = `Still clean: no problems found since your first check on ${since}.`;
    block.hidden = false;
    return;
  }
  const grade = document.getElementById('grade').textContent;
  const better = ORDINAL[grade] > ORDINAL[p.startGrade];
  document.getElementById('progress-line').textContent =
    `Since your first check on ${since}: ✅ ${p.fixed.length} fixed · ⏳ ${p.open} still open` +
    (p.new ? ` · 🆕 ${p.new} new` : '') +
    (grade !== p.startGrade ? ` · grade ${p.startGrade} → ${grade}${better ? ' 🎉' : ''}` : '');
  document.getElementById('progress-fixed').replaceChildren(
    ...p.fixed.map((f) => el('li', {}, ['✅ ', el('s', {}, [f.title])])),
  );
  block.hidden = false;
}

function renderBadge(b) {
  if (!b) return;
  document.getElementById('badge-preview').src = b.image;
  document.getElementById('badge-code').textContent =
    `<a href="${b.page}" target="_blank" rel="noopener"><img src="${b.image}" alt="Checked by LeakPatrol: Grade A" height="24"></a>`;
  document.getElementById('badge-block').hidden = false;
}

document.getElementById('database-button').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const out = document.getElementById('database-status');
  const results = document.getElementById('database-results');
  btn.disabled = true;
  out.textContent = 'Checking…';
  try {
    const res = await fetch('/api/report/database', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, result: document.getElementById('database-result').value }),
    });
    const data = await res.json();
    if (!res.ok) {
      out.textContent = data.error || 'Something went wrong. Please try again.';
      results.hidden = true;
    } else {
      out.textContent = '';
      const s = data.summary;
      document.getElementById('database-summary').textContent =
        `${s.tables} table${s.tables === 1 ? '' : 's'}, ${s.protectedTables} with Row Level Security on, ${s.policies} polic${s.policies === 1 ? 'y' : 'ies'}, ${s.views} view${s.views === 1 ? '' : 's'}, ${s.buckets} storage bucket${s.buckets === 1 ? '' : 's'}. ` +
        (data.findings.length ? `${data.findings.length} thing${data.findings.length === 1 ? '' : 's'} to fix:` : 'Nothing to fix. Your database settings look good.');
      document.getElementById('database-findings').replaceChildren(
        ...data.findings.map((f, i) => {
          const promptId = `db-prompt-${i}`;
          return el('li', { className: 'preview-item' }, [
            el('h3', {}, [el('span', { className: `badge sev-${f.severity}` }, [LABELS[f.severity]]), ' ', f.title]),
            el('p', {}, [f.detail]),
            el('p', {}, [el('strong', {}, ['How to fix: ']), f.fix]),
            el('pre', { className: 'prompt', id: promptId }, [f.prompt]),
            el('button', { type: 'button', className: 'copy', dataset: { target: promptId } }, ['Copy prompt']),
          ]);
        }),
      );
      results.hidden = false;
    }
  } catch {
    out.textContent = 'Something went wrong. Please try again.';
  }
  btn.disabled = false;
});

function renderVerification(r, v) {
  const block = document.getElementById('verify-block');
  const forBadge = r.score.grade === 'A';
  block.hidden = !(r.usesSupabase || forBadge) || !v || v.verified;
  if (block.hidden) return;
  if (!r.usesSupabase) {
    document.getElementById('verify-title').textContent = 'Get your "Checked by LeakPatrol" badge';
    document.getElementById('verify-intro').textContent =
      'Your site scored an A. Prove you own it and you get a badge for your site that links to a page confirming your latest check.';
  }
  document.getElementById('verify-meta').textContent = v.meta;
  document.getElementById('verify-meta-prompt').textContent =
    `Add this exact tag inside the <head> of index.html, directly in the HTML file (not added by React or JavaScript), then publish:\n${v.meta}`;
  document.getElementById('verify-file-path').textContent = v.filePath;
  document.getElementById('verify-file-token').textContent = v.token;
  document.getElementById('verify-dns-name').textContent = v.dnsName;
  document.getElementById('verify-dns-value').textContent = v.dnsValue;
}

document.getElementById('verify-button').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const out = document.getElementById('verify-status');
  btn.disabled = true;
  out.textContent = 'Checking your site…';
  try {
    const res = await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await res.json();
    if (data.verified) {
      out.textContent = 'Verified. Running the database check…';
      document.getElementById('results').hidden = true;
      statusEl.hidden = false;
      statusEl.textContent = 'Checking your database…';
      await load();
      return;
    }
    out.textContent = data.error || 'Not verified yet.';
  } catch {
    out.textContent = 'Something went wrong. Please try again.';
  }
  btn.disabled = false;
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.copy');
  if (!btn) return;
  const text = document.getElementById(btn.dataset.target).textContent;
  const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Select the text and copy it';
  }
  setTimeout(() => (btn.textContent = label), 2000);
});

// Builds DOM with textContent only, so report content can never inject HTML.
function el(tag, props, children = []) {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const c of children) node.append(c);
  return node;
}
