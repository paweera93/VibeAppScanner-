const form = document.getElementById('scan-form');
const input = document.getElementById('url');
const button = document.getElementById('scan-button');
const statusEl = document.getElementById('status');
const results = document.getElementById('results');

let lastScannedUrl = '';
const LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) {
    showStatus('Please enter your app’s address.', 'error');
    return;
  }
  button.disabled = true;
  results.hidden = true;
  showStatus('Scanning… this usually takes under a minute.');
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showStatus(data.error || 'Something went wrong. Please try again.', 'error');
    } else if (!data.reachable) {
      showStatus('We could not reach that site. Check the address and that the site is online.', 'error');
    } else {
      statusEl.hidden = true;
      lastScannedUrl = url;
      render(data);
    }
  } catch {
    showStatus('Something went wrong. Please try again.', 'error');
  } finally {
    button.disabled = false;
  }
});

function showStatus(text, kind = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
  statusEl.hidden = false;
}

function render(r) {
  const grade = document.getElementById('grade');
  grade.textContent = r.score.grade;
  grade.className = `grade grade-${r.score.grade.toLowerCase()}`;
  document.getElementById('score').textContent = r.score.value;
  document.getElementById('scanned-url').textContent = `${r.finalUrl} · ${r.scriptsScanned} scripts checked${r.usesSupabase ? ' · uses Supabase' : ''}`;

  const counts = document.getElementById('counts');
  counts.replaceChildren(
    ...['critical', 'high', 'medium', 'low'].map((s) => el('li', { className: `count sev-${s}` }, [el('strong', {}, [String(r.summary[s])]), ` ${LABELS[s]}`])),
  );

  const issues = document.getElementById('issues');
  issues.replaceChildren(
    ...(r.issues.length
      ? r.issues.map((i) => el('li', {}, [el('span', { className: `badge sev-${i.severity}` }, [LABELS[i.severity]]), ' ', i.title]))
      : [el('li', {}, ['No problems found in the free checks. Nice work.'])]),
  );

  const preview = document.getElementById('preview');
  preview.replaceChildren(
    ...r.preview.map((p) =>
      el('div', { className: 'preview-item' }, [
        el('h3', {}, ['Example fix: ', p.title]),
        p.detail ? el('p', {}, [p.detail]) : '',
        p.evidence ? el('p', { className: 'muted' }, ['Found: ', el('code', {}, [p.evidence])]) : '',
        el('p', {}, [el('strong', {}, ['How to fix: ']), p.fix]),
      ]),
    ),
  );

  const unlock = document.getElementById('unlock');
  unlock.hidden = r.lockedFixes === 0;
  document.getElementById('buy-block').hidden = !r.checkoutAvailable;
  document.getElementById('waitlist-block').hidden = Boolean(r.checkoutAvailable);
  document.getElementById('locked-count').textContent = r.lockedFixes ? `${r.lockedFixes} more ${r.lockedFixes === 1 ? 'fix' : 'fixes'} waiting.` : '';

  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('buy-button').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: lastScannedUrl }),
    });
    const data = await res.json();
    if (res.ok && /^(https:\/\/|\/report\.html\?id=)/.test(data.checkoutUrl || '')) {
      location.href = data.checkoutUrl;
      return;
    }
    showStatus(data.error || 'Checkout is not available right now. Please try again.', 'error');
  } catch {
    showStatus('Checkout is not available right now. Please try again.', 'error');
  }
  btn.disabled = false;
});

const waitlistForm = document.getElementById('waitlist-form');
const waitlistStatus = document.getElementById('waitlist-status');

waitlistForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(waitlistForm);
  const btn = document.getElementById('waitlist-button');
  btn.disabled = true;
  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: data.get('email'), website: data.get('website') }),
    });
    const body = await res.json();
    if (res.ok) {
      waitlistForm.hidden = true;
      waitlistStatus.textContent = 'Thanks! We’ll email you when full reports are ready.';
    } else {
      waitlistStatus.textContent = body.error || 'Something went wrong. Please try again.';
    }
  } catch {
    waitlistStatus.textContent = 'Something went wrong. Please try again.';
  } finally {
    btn.disabled = false;
  }
});

// Builds DOM with textContent only, so scan output can never inject HTML.
function el(tag, props, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}
