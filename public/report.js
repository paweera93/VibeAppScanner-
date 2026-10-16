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
    renderVerification(data.report, data.verification);
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
            el('h3', {}, [el('span', { className: `badge sev-${f.severity}` }, [LABELS[f.severity]]), ' ', f.title]),
            f.detail ? el('p', {}, [f.detail]) : '',
            f.evidence ? el('p', { className: 'muted' }, ['Found: ', el('code', {}, [f.evidence])]) : '',
            el('p', {}, [el('strong', {}, ['How to fix: ']), f.fix]),
            f.prompt ? el('pre', { className: 'prompt', id: promptId }, [f.prompt]) : '',
            f.prompt ? el('button', { type: 'button', className: 'copy', dataset: { target: promptId } }, ['Copy prompt']) : '',
          ]);
        })
      : [el('li', {}, ['No problems found. Nice work.'])]),
  );

  if (r.headersPrompt) {
    document.getElementById('headers-prompt').textContent = r.headersPrompt;
    document.getElementById('headers-block').hidden = false;
  }
  document.getElementById('results').hidden = false;
}

function renderVerification(r, v) {
  const block = document.getElementById('verify-block');
  block.hidden = !r.usesSupabase || !v || v.verified;
  if (block.hidden) return;
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
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Select the text and copy it';
  }
  setTimeout(() => (btn.textContent = 'Copy prompt'), 2000);
});

// Builds DOM with textContent only, so report content can never inject HTML.
function el(tag, props, children = []) {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const c of children) node.append(c);
  return node;
}
