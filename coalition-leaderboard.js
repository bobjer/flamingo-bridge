// Coalition leaderboard client. Ranks by views, separate table and endpoint from the bridge records.
// Fails gracefully: when the API (Cloudflare D1) is unreachable the card just says it is unavailable.
import {tr} from './language.js';
import {fmtViews, wavesWord} from './coalition-copy.js';

const url = '/api/coalition-records';
export function showCoalitionBoard(card, run, onSaved = () => {}) {
 card.querySelector('.records')?.remove();
 const box = document.createElement('section'); box.className = 'records c-records';
 const heading = document.createElement('strong'), form = document.createElement('form'), input = document.createElement('input'),
  button = document.createElement('button'), list = document.createElement('ol'), status = document.createElement('small');
 status.setAttribute('role', 'status');
 heading.textContent = tr('Топ-10 за переглядами', 'Top 10 by views');
 input.placeholder = tr('Ваш псевдонім', 'Your nickname'); input.setAttribute('aria-label', input.placeholder); input.required = true; input.maxLength = 24; input.autocomplete = 'nickname';
 button.textContent = tr('Записати', 'Submit'); button.type = 'submit';
 form.append(input, button); box.append(heading);
 if (run.id && !run.submitted) box.append(form);
 box.append(status, list); card.append(box);
 let posting = false;
 async function load(submit) {
  if (submit) { posting = true; button.disabled = true }
  try {
   const response = await fetch(url, submit ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: run.id, name: input.value.trim(), waves: run.waves, views: run.views, combo: run.combo, assisted: !!run.assisted }) } : {});
   if (!response.ok || !/json/.test(response.headers.get('content-type') || '')) throw Error();
   const rows = await response.json();
   if (!Array.isArray(rows)) throw Error();
   if (!submit && posting) return;
   list.replaceChildren(...rows.map(row => { const li = document.createElement('li'); li.textContent = row.name + ' · ' + fmtViews(row.views) + ' · ' + wavesWord(row.waves) + (row.assisted ? ' · ' + tr('Автогра', 'Autoplay') : ''); return li }));
   status.textContent = submit ? tr('Результат збережено', 'Score saved') : rows.length ? '' : tr('Поки немає рекордів', 'No scores yet');
   if (submit) { form.hidden = true; onSaved() }
  } catch {
   status.textContent = tr('Лідерборд недоступний', 'Leaderboard unavailable');
   if (submit) { button.disabled = false; posting = false }
  }
 }
 form.onsubmit = e => { e.preventDefault(); if (input.value.trim() && !posting) load(true) };
 load(false);
}
