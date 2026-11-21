import {tr} from './language.js';

export const fmtMoney = amount => tr(amount + ' млн €', '€' + amount + 'M');

export const units = () => [tr('Фламінго', 'Flamingo'), tr('Малюк', 'Maliuk'), tr('Паляниця', 'Palianytsia'), tr('Нептун', 'Neptune')];
export const unitHints = () => [tr('базовий', 'basic'), tr('швидкий, ППО збиває вдвічі рідше', 'fast, anti-air hits it half as often'), tr('оплата ×2, дальня камера дає 50%', 'pays ×2, far camera gets 50%'), tr('виходить з води з тризубом', 'rises from the water with a trident')];
export function subjectName(id) {
  return ({arch: tr('Арка', 'Arch'), pier: tr('Опора', 'Pier'), cruiser: tr('Крейсер', 'Cruiser'),
    sam: tr('ЗРК', 'SAM'), tanker: tr('Танкер','Tanker'), truck: tr('Вантажівка','Truck'), hole: tr('Діра в покритті', 'Road crater')})[id];
}
export const aaNames = () => [tr('С-400', 'S-400'), tr('Турель', 'Turret'), tr('Крейсер', 'Cruiser')];

export function fmtViews(n) {
  const group = x => tr(x.replace('.', ','), x);
  if (n >= 1e9) return group((n / 1e9).toFixed(1)) + 'B';
  if (n >= 1e6) return group((n / 1e6).toFixed(1)) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}

export function sponsor(id) {
  return ({
    fund: { name: tr('Фонд Сталої Демократії', 'Stable Democracy Foundation'), rule: tr('Платить за маркер, але лише «у якості для річного звіту». Дальня камера дає 0.', 'Pays for the marker, but only “in report-grade quality”. The far camera pays 0.'), quote: tr('Зарево — не якість.', 'A glow is not quality.') },
    defence: { name: tr('Оборонний концерн', 'Defence Concern'), rule: tr('3 млн € за кожен запущений юніт, навіть збитий. Зняті влучання платять вдвічі менше.', '€3M for every launched unit, even a shot-down one. Filmed hits pay half.'), quote: tr('Освоєння бюджету — теж результат.', 'Spending the budget is also a result.') },
    conference: { name: tr('Конференція партнерів', 'Partners’ Conference'), rule: tr('30% авансом, решта ×3 через дві хвилі. Можливо.', '30% up front, the rest ×3 in two waves. Maybe. (50% it is “postponed to next year”.)'), quote: tr('Ми вас дуже цінуємо. Заочно.', 'We value you greatly. In absentia.') },
    tender: { name: tr('Міжнародний тендер', 'International Tender'), rule: tr('Паляниці ×2. Решта — «не відповідає ТЗ», 50%.', 'Palianytsia ×2. The rest is “non-compliant with the terms”: 50%.'), quote: tr('У технічному завданні прописано паляницю.', 'The terms of reference specify Palianytsia.') },
    analytic: { name: tr('Аналітичний центр', 'Analytical Centre'), rule: tr('8 млн € за кожен збитий юніт плюс зняте за половину ціни.', '€8M for every shot-down unit plus filmed hits at half price.'), quote: tr('Нам потрібні дані про неефективність.', 'We need data on inefficiency.') }
  })[id];
}

export const cameo = {
  musk: () => ({ title: tr('Прошивку оновлено', 'Firmware updated'), line: tr('«Ви ж просили свободу слова»', '“You did ask for free speech”') }),
  trump: () => ({ title: tr('Піс діл', 'Peace deal'), line: tr('Пропусти хвилю й отримай гроші. Втома донорів зросте вдвічі.', 'Skip the wave and take the cash. Donor fatigue doubles.') })
};

// ---------- "Donor report" phrase generator. Facts in, two satirical lines out ----------
function facts(r, s) {
  const x = r.result;
  return { wave: r.wave, hits: x.hits, filmed: x.filmed, far: x.far, none: x.none, shot: x.shot, missed: x.missed, units: r.units,
    views: fmtViews(x.views), rawViews: x.views, funds: s.funds, money: x.money, combo: x.combo, tired: Math.round((1 - s.fatigue) * 100) };
}
// `when` filters templates that would be a lie (or too honest); `uk`/`en` build the line.
const lines = [
  { uk: f => `Влучань: ${f.hits}. Підтверджено: ${f.filmed}. Освоєно: 100%.`, en: f => `Hits: ${f.hits}. Confirmed: ${f.filmed}. Absorbed: 100%.`, when: f => f.hits > 0 },
  { uk: () => 'Донор задоволений: у нього нова презентація.', en: () => 'The donor is satisfied: he has a new slide deck.' },
  { uk: f => `Перегляди: ${f.views}. Результат: незмінний.`, en: f => `Views: ${f.views}. Outcome: unchanged.`, when: f => f.rawViews > 0 },
  { uk: f => `Знято ${f.filmed} з ${f.hits}. Решту вважайте легендою.`, en: f => `Filmed ${f.filmed} of ${f.hits}. Consider the rest a legend.`, when: f => f.hits > f.filmed && f.filmed > 0 },
  { uk: f => `Збито: ${f.shot}. У звіті це «ППО проявила ініціативу».`, en: f => `Shot down: ${f.shot}. The report says “air defence showed initiative”.`, when: f => f.shot > 0 },
  { uk: f => `Бюджет: ${fmtMoney(f.funds)}. Куди він дівся, теж піде у звіт.`, en: f => `Budget: ${fmtMoney(f.funds)}. Where it went will also go in the report.` },
  { uk: f => `Комбо ×${f.combo}. Донор попросив те саме, але без вибухів.`, en: f => `Combo ×${f.combo}. The donor asked for the same, minus the explosions.`, when: f => f.combo >= 3 },
  { uk: f => `Дальня камера: ${f.far}. Зарево — не доказ, але ілюстрація на слайді.`, en: f => `Far camera: ${f.far}. A glow is no proof, but it makes a fine slide.`, when: f => f.far > 0 },
  { uk: f => `Не знято: ${f.none}. Формально цього не було.`, en: f => `Not filmed: ${f.none}. Officially, it never happened.`, when: f => f.none > 0 },
  { uk: f => `Втома донорів: ${f.tired}%. Цього тижня вони вже дивилися інше.`, en: f => `Donor fatigue: ${f.tired}%. This week they have already watched something else.`, when: f => f.tired > 0 },
  { uk: f => `Запущено: ${f.units}. Звітність: «успішно».`, en: f => `Launched: ${f.units}. Reporting: “successful”.` },
  { uk: () => 'Показники зросли. Які саме, уточнюється.', en: () => 'Indicators went up. Which ones is being clarified.' },
  { uk: f => `Перегляди ${f.views}. Донор шукає, що саме подивилися.`, en: f => `Views ${f.views}. The donor is looking for what exactly was watched.`, when: f => f.rawViews > 0 },
  { uk: () => 'Звіт передано в комісію. Комісія його перенесла.', en: () => 'The report went to the committee. The committee postponed it.' },
  { uk: () => 'Відео немає. Питань теж немає. Ідеальна звітність.', en: () => 'No footage. No questions either. Perfect reporting.', when: f => f.filmed === 0 && f.far === 0 },
  { uk: () => 'Влучань немає. Є «ризики, враховані в наступному кошторисі».', en: () => 'No hits. Only “risks accounted for in the next estimate”.', when: f => f.hits === 0 },
  { uk: f => `Освоєно ${fmtMoney(f.money)}. Це вже, мабуть, перемога.`, en: f => `Absorbed ${fmtMoney(f.money)}. That already counts as a win, probably.`, when: f => f.money > 0 },
  { uk: () => 'Ефективність зросла на «цифру, яку ми ще порахуємо».', en: () => 'Efficiency rose by “a number we will still calculate”.' }
];
export function donorLines(r, s) {
  const f = facts(r, s), pool = lines.filter(l => !l.when || l.when(f));
  const a = Math.floor(r.seed[0] * pool.length);
  let b = Math.floor(r.seed[1] * (pool.length - 1)); if (b >= a) b++;
  return [pool[a], pool[b]].filter(Boolean).map(l => tr(l.uk(f), l.en(f)));
}
export const reportTemplateCount = lines.length;

const endings = [
  () => tr('Спонсори пішли на іншу війну.', 'The sponsors moved on to another war.'),
  () => tr('Звіт прийнято. Гроші — ні.', 'The report was accepted. The money was not.'),
  () => tr('Підсумок: показники є, змін немає.', 'Bottom line: indicators exist, changes do not.'),
  () => tr('Програму визнано успішною та закрито.', 'The programme was declared a success and closed.'),
  () => tr('Дякуємо за співпрацю. Нова презентація вже в дорозі.', 'Thank you for your cooperation. A new deck is on the way.')
];
export function ending(s) { return endings[Math.abs(Math.round(s.views / 1000) + s.wave) % endings.length]() }
export function wavesWord(n) {
  const m = n % 10, c = n % 100;
  return tr(n + (m === 1 && c !== 11 ? ' хвиля' : m >= 2 && m <= 4 && (c < 12 || c > 14) ? ' хвилі' : ' хвиль'), n + (n === 1 ? ' wave' : ' waves'));
}
export function caption(s) {
  return wavesWord(s.wave) + tr('. ', '. ') + tr(fmtViews(s.views) + ' переглядів. 0 змін. ', fmtViews(s.views) + ' views. 0 changes. ') + ending(s);
}

// Cartoon badges of the units for the buy buttons.
const glyphs = [
  '<path fill="#f787b4" d="m-21 -9 14 5-8-13L3-4q6 2 7-6 0-9 7-9 6 0 6 6l-5-1q-2 1-2 6Q13 4 3 7-6 10-12 5l-10 2 7-6z"/><path fill="#ffe5b3" d="m21-16 7 5-5 1-4-4z"/>',
  '<path fill="#76d5c9" d="M-18 9q-5-14 5-19l12-5 13 6q8 6 5 18z"/><circle cx="0" cy="-3" r="10" fill="#ffe4bc"/><path fill="#7bdaca" d="m-11-8 4-11 9 2 10 9z"/><circle cx="-4" cy="-3" r="1.4"/><circle cx="4" cy="-3" r="1.4"/><path d="M-8 8h16l5 7h-25z" fill="#4a9d99"/>',
  '<path fill="#d49b4e" d="M-21 4q0-18 20-20 18-2 23 12l-1 12q-19 9-40 0z"/><path fill="none" stroke="#ffe1a2" stroke-width="3" d="m-11-9 5 8m3-12 5 9m3-9 5 7"/>',
  '<path fill="none" stroke="#f4c660" stroke-width="3.5" stroke-linecap="round" d="M0 16v-33m-10 3v6q0 7 10 7t10-7v-6"/><path d="M-24 11q6-6 12 0t12 0 12 0 12 0" fill="none" stroke="#75e2eb" stroke-width="3"/>'
];
export const icon = id => '<svg aria-hidden="true" viewBox="-30 -23 60 46">' + glyphs[id] + '</svg>';

export function chanceTitle(id) {
 const titles = {
  poland: ['Ракета залетіла в Польщу. Спонсори знову на лінії.','A missile lands in Poland. The sponsors are back on the line.'],
  election: ['Макрон програв вибори. Новий кабінет переглядає кошторис.','Macron loses the election. The new cabinet reviews the budget.'],
  filmclub: ['Кіноклуб показав ваш ефір. Наступний перегляд уже з аншлагом.','A film club screens your broadcast. The next showing sells out.'],
  syndication: ['Телеканал купує права на наступну хвилю.','A TV network buys the rights to your next wave.'],
  audit: ['Бухгалтер знайшов другу таблицю витрат. Почалася перевірка.','An accountant finds a second expense sheet. The audit begins.'],
  festival: ['Приз глядацьких симпатій! Донори передивляються сезон.','Audience award! The donors are watching the season again.'],
  comeback: ['Ефір зірвали. Влучання все одно стало хітом.','The broadcast went sideways. The hit went viral anyway.'],
  double: ['Трамп зірвав угоду, Маск — зв’язок. А кадри все одно розійшлися.','Trump sank the deal. Musk cut the feed. The story still got out.']
 };
 return tr(...(titles[id] ?? ['Несподіваний поворот','An unexpected turn']));
}
