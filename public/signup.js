// Checklist sign-up boxes (home page and guides). Each form says where it is in data-source,
// so we can tell which pages bring sign-ups.
for (const form of document.querySelectorAll('form[data-signup]')) {
  const status = form.parentElement.querySelector('.signup-status');
  const button = form.querySelector('button');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    button.disabled = true;
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), website: data.get('website'), source: form.dataset.source }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        form.hidden = true;
        status.textContent = 'Sent! Check your inbox (and the Promotions or Updates tab) for the checklist.';
      } else {
        status.textContent = body.error || 'Something went wrong. Please try again.';
        button.disabled = false;
      }
    } catch {
      status.textContent = 'Something went wrong. Please try again.';
      button.disabled = false;
    }
  });
}
