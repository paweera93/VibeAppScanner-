import { generatePolicies } from './rls-policies.js';

const form = document.querySelector('#rls-form');
const out = document.querySelector('#rls-output');
const error = document.querySelector('#rls-error');
const teamFields = document.querySelector('#rls-team-fields');
const ownerField = document.querySelector('#rls-owner-field');
let result;

function update() {
  const data = Object.fromEntries(new FormData(form));
  teamFields.hidden = data.pattern !== 'team';
  ownerField.hidden = !['own', 'public-read'].includes(data.pattern);
  result = generatePolicies({
    table: data.table.trim().toLowerCase(),
    pattern: data.pattern,
    owner: data.owner.trim().toLowerCase() || 'user_id',
    team: data.team.trim().toLowerCase() || 'team_id',
    members: data.members.trim().toLowerCase() || 'team_members',
  });
  error.textContent = result.error || '';
  out.hidden = Boolean(result.error);
  if (result.error) return;
  out.querySelector('#rls-sql').textContent = result.sql;
  const list = out.querySelector('#rls-explain');
  list.replaceChildren(...result.explain.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
}

form.addEventListener('input', update);
form.addEventListener('submit', (e) => { e.preventDefault(); update(); });

out.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-copy]');
  if (!btn || !result || result.error) return;
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy === 'prompt' ? result.prompt : result.sql);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Select the text and copy it';
  }
  setTimeout(() => (btn.textContent = label), 2000);
});

update();
