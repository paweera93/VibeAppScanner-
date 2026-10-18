const title = document.getElementById('title');
const line = document.getElementById('line');
const badge = new URLSearchParams(location.search).get('b') || '';

try {
  if (!/^[0-9a-f]{32}$/.test(badge)) throw new Error('bad id');
  const res = await fetch(`/api/badge/${badge}.json`);
  if (!res.ok) throw new Error('not found');
  const b = await res.json();
  const when = b.checkedAt ? new Date(b.checkedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  if (b.valid) {
    title.textContent = `${b.host} passed LeakPatrol's security check`;
    line.textContent = `Grade A on its latest check, ${when}.`;
  } else {
    title.textContent = `${b.host}: check not current`;
    line.textContent = when
      ? `This site's latest LeakPatrol check was on ${when}, and it no longer shows a current grade A.`
      : 'This site no longer has a current LeakPatrol check.';
  }
} catch {
  title.textContent = 'Badge not found';
  line.textContent = 'This LeakPatrol badge link is not valid.';
}
