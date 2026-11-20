// Coalition "arcade v2": "no video, no happened". Pure rules, no DOM, `random` is injectable.
// Every tunable number lives in CFG so coalition-sim.mjs can balance the game in one place.
export const CFG = {
  start: 100, costs: [10, 14, 18, 10], cap: 20,
  stipend: 3, hitContract: 48, hitOther: 15, far: .3, loafFar: .5, fatigue: .95,
  aaBase: .08, aaStep: .045, aaMax: .7, aaCover: .6, totAA: .5,
  contractShare: .6, success: .75,
  viewsPer: 10000, comboStep: .25, loaf: 2,
  travel: [1550, 1100, 1550, 2100], spacing: 350, groupGap: 1600, lead: 1600, tail: 2500,
  defenceLaunch: 3, defenceHit: .5, analyticShot: 8, analyticHit: .5, tenderMult: 2,
  conferenceMult: 3, conferenceAdvance: .3, tenderOther: .5, conferenceOk: .5, conferenceDelay: 2,
  trumpPay: 40, trumpFatigue: .95, pressViews: 60000, muskDur: 4500, muskViral: 2,
  ewChance: .35, ewDur: 9000, pressDur: 4000,
  cameoFrom: 3, cameoChance: .3, eventFrom: 2, eventChance: .4
};
// Camera slots stay stable throughout a wave. The editorial subjects rotate between waves.
export const SUBJECTS = ['arch', 'pier', 'cruiser', 'sam', 'hole'];
export const cameraSubjects = s => s.offer.subjects ?? SUBJECTS.slice(0, 3);
function drawSubjects(random) {
  const pool = SUBJECTS.slice();
  return Array.from({length: 3}, () => pool.splice(Math.floor(random() * pool.length), 1)[0]);
}

function deliverLeaks(s) {
  const due = (s.leaks ?? []).filter(l => l.due <= s.wave);
  s.leaks = (s.leaks ?? []).filter(l => l.due > s.wave);
  s.report.leaks = due;
  const bonus = due.reduce((sum, l) => sum + l.views, 0);
  const funding = due.reduce((sum, clip) => sum + (clip.funding ?? 0), 0);
  s.funds += funding;
  s.report.result.money += funding;
  s.views += bonus;
  s.report.result.views += bonus;
}

export const costs = CFG.costs;
const emptyStock = () => costs.map(() => 0);
export const saveVersion = 2;
export const SPONSORS = ['fund', 'defence', 'conference', 'tender', 'analytic'];
export const EVENTS = ['press', 'committee', 'rebate'];

const lastImpact = flights => Math.max(...flights.map(f => f.impact));
export const aaChance = (wave, type = 0) => Math.min(CFG.aaMax, CFG.aaBase + CFG.aaStep * (wave - 1)) * (type === 1 ? CFG.totAA : 1);
export const total = s => s.stock.reduce((a, b) => a + b, 0);
export const isOver = s => !total(s) && s.funds < Math.min(...CFG.costs);
export const contractOf = s => s.offer.cards[s.offer.pick].marker;
export const sponsorOf = s => s.offer.cards[s.offer.pick].id;

// Each plan: two sponsor cards, anti-air coverage per marker, and at most one cameo or event.
export function dealWave(s, random = Math.random) {
  const a = Math.floor(random() * SPONSORS.length);
  let b = Math.floor(random() * (SPONSORS.length - 1)); if (b >= a) b++;
  const m1 = Math.floor(random() * 3);
  let m2 = Math.floor(random() * 2); if (m2 >= m1) m2++;
  s.offer = { cards: [{ id: SPONSORS[a], marker: m1 }, { id: SPONSORS[b], marker: m2 }], pick: 0 };
  s.aa = [0, 1, 2].map(() => random() < CFG.aaCover);
  s.cameo = ''; s.deal = ''; s.event = '';
  if (s.wave >= CFG.cameoFrom && random() < CFG.cameoChance) s.cameo = random() < .5 ? 'musk' : 'trump';
  else if (s.wave >= CFG.eventFrom && random() < CFG.eventChance) s.event = EVENTS[Math.floor(random() * EVENTS.length)];
  if (s.cameo === 'trump') s.deal = 'pending';
  s.bought = emptyStock();
  s.offer.subjects = drawSubjects(random);
  s.offer.orbital = s.wave > 1 && random() < .08;
}

export const openingBudget = {easy: 140, normal: CFG.start, hard: 70};
export const donorRetention = {easy: .965, normal: CFG.fatigue, hard: .88};
export const offContractRate = difficulty => difficulty === 'hard' ? 8 : CFG.hitOther;
export function newSeason(random = Math.random, difficulty = 'normal') {
  const s = { version: saveVersion, difficulty, wave: 1, phase: 'plan', funds: openingBudget[difficulty], views: 0, bestCombo: 0, fatigue: 1,
    stock: emptyStock(), bought: emptyStock(), ious: [], offer: null, aa: [], cameo: '', deal: '', event: '',
    report: null, captures: [], live: null, cam: 0, runId: '', submitted: false };
  dealWave(s, random);
  return s;
}

export function pickSponsor(s, index) {
  if (s.phase !== 'plan' || ![0, 1].includes(index)) return false;
  s.offer.pick = index;
  return true;
}

export function purchase(s, id, delta = 1) {
  if (s.phase !== 'plan' || s.deal === 'pending' || !Number.isInteger(id) || id < 0 || id >= costs.length || ![1, -1].includes(delta)) return false;
  if (delta > 0) {
    if (s.funds < CFG.costs[id] || s.stock[id] >= CFG.cap) return false;
  } else if (!s.bought[id] || !s.stock[id]) return false;
  s.stock[id] += delta; s.bought[id] += delta; s.funds -= CFG.costs[id] * delta;
  return true;
}

// Trump's "peace deal": skip the wave for cash, donors tire twice as fast.
export function acceptDeal(s) {
  if (s.phase !== 'plan' || s.deal !== 'pending') return false;
  const gain = Math.round(CFG.trumpPay * s.fatigue);
  s.funds += gain; s.deal = 'signed';
  s.report = { wave: s.wave, skipped: true, result: { money: gain, views: 0, combo: 0 }, seed: [0, 0] };
  deliverLeaks(s);
  s.fatigue *= donorRetention[s.difficulty ?? 'normal'] * CFG.trumpFatigue;
  s.phase = isOver(s) ? 'over' : 'report';
  if (s.phase === 'over') s.runId ||= newId();
  return true;
}
export function declineDeal(s) {
  if (s.phase !== 'plan' || s.deal !== 'pending') return false;
  s.deal = 'declined';
  return true;
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? 'run-' + Math.random().toString(16).slice(2);

// Everything deterministic is rolled here. Filming is decided live by the player and fed to finishWave().
export function launch(s, random = Math.random) {
  if (s.phase !== 'plan' || s.deal === 'pending' || !total(s)) return false;
  const card = s.offer.cards[s.offer.pick], list = [];
  s.stock.forEach((n, type) => { for (let i = 0; i < n; i++) list.push(type) });
  let rebate = null;
  if (s.event === 'rebate' && list.length > 2) {
    const n = random() < .5 ? 1 : 2;
    const removed = list.splice(list.length - n, n);
    rebate = { items: [...new Set(removed)].map(type => ({type, n: removed.filter(id => id === type).length})) };
  }
  const flights = [];
  const headline = s.offer.cards[Math.floor(random() * s.offer.cards.length)].marker;
  let at = CFG.lead;
  for (let type = 0; type < costs.length; type++) {
    const count = list.filter(t => t === type).length;
    if (!count) continue;
    for (let k = 0; k < count; k++) {
      const others = [0, 1, 2].filter(m => m !== headline);
      const rMarker = random(), rOther = random(), rAA = random(), rHit = random();
      const marker = rMarker < CFG.contractShare ? headline : others[Math.floor(rOther * 2)];
      const start = at + k * CFG.spacing;
      const intercepted = s.aa[marker] && rAA < aaChance(s.wave, type);
      const success = !intercepted && rHit < CFG.success;
      flights.push({ type, marker, start, impact: start + CFG.travel[type], intercepted, success, decree: false });
    }
    at += (count - 1) * CFG.spacing + CFG.groupGap;
  }
  const end = lastImpact(flights);
  const report = { wave: s.wave, flights, units: flights.length, sponsor: card.id, contract: card.marker, fatigue: s.fatigue, offContract: offContractRate(s.difficulty),
    duration: end + CFG.tail, cameo: s.cameo, event: s.event, rebate, musk: null, ew: null, press: null, committee: null, decree: false, seed: [random(), random()] };
  if (s.cameo === 'musk') report.musk = { from: Math.round(.3 * end), dur: CFG.muskDur };
  if (s.cameo === 'trump' && s.deal === 'declined') {
    const wins = flights.filter(f => f.success);
    if (wins.length) { wins[Math.floor(random() * wins.length)].decree = true; report.decree = true; }
  }
  if (s.event === 'press') report.press = { at: Math.round((.25 + .3 * random()) * end), dur: CFG.pressDur };
  if (s.event === 'committee') report.committee = { at: Math.round((.3 + .3 * random()) * end) };
  // Drawn last so earlier rolls keep their order: EW cuts one drone off for a while.
  if (random() < CFG.ewChance) report.ew = { marker: Math.floor(random() * 3), at: Math.round(random() * .5 * end), dur: CFG.ewDur };
  assignScenes(cameraSubjects(s), flights, random);
  report.assignedScenes = true;
  const cruiser = flights.find(f => f.success && !f.decree && !f.extra && cameraSubjects(s)[f.marker] === 'cruiser');
  if (cruiser) report.duration = Math.max(report.duration, cruiser.impact + 3400);
  if (random() < .22) {
    const first = Math.min(...flights.map(f => f.start));
    const from = first + Math.floor(random() * (end-first));
    report.partnerPass = {from, to:from+2300};
  }
  report.decree = flights.some(f => f.decree);
  if (s.wave >= 2 && random() < .16) {
    report.cameraLoss = {camera:Math.floor(random()*3), at:Math.round(CFG.lead+1100+random()*Math.max(0,end-CFG.lead-1100))};
  }
  report.cuts = [{time:0,camera:s.cam === 4 ? 3 : s.cam}];
  s.report = report; s.captures = []; s.live = { resolved: [], pressMs: 0, stamps: 0 };
  s.stock = emptyStock(); s.bought = emptyStock();
  s.phase = 'watch';
  return true;
}

// Cast each remaining arcade event into an open camera slot, in playback order.
function assignScenes(subjects, flights, random) {
  const remaining = subjects.map(id => id === 'arch' ? 3 : 1);
  const extras = subjects.map(id => id === 'cruiser' ? 'tanker' : id === 'sam' ? 'truck' : null);
  for (const f of [...flights].sort((a,b) => a.impact - b.impact)) {
    if (!remaining[f.marker]) {
      const open = remaining.map((n,i) => n || extras[i] ? i : -1).filter(i => i >= 0);
      f.originalMarker = f.marker;
      if (!open.length) {
        f.noScene = true; f.success = false; f.intercepted = false; f.decree = false;
        continue;
      }
      f.marker = open[Math.floor(random() * open.length)];
      if (!remaining[f.marker]) f.extra = extras[f.marker];
    }
    if (f.success && !f.decree && !f.intercepted) {
      if (f.extra) extras[f.marker] = null;
      else remaining[f.marker]--;
    }
  }
}

// Money and views of one successful impact that was filmed as `kind` ('drone' | 'far' | 'none').
export function hitValue(r, f, kind) {
  if (kind === 'none' || f.decree) return { value: 0, pay: 0 };
  const base = f.marker === r.contract && !f.extra ? CFG.hitContract : (r.offContract ?? CFG.hitOther);
  let value = base * r.fatigue * (f.type === 2 ? CFG.loaf : 1);
  if (kind === 'far') value *= f.type === 2 ? CFG.loafFar : CFG.far;
  let pay;
  switch (r.sponsor) {
    case 'fund': if (kind === 'far') value = 0; pay = value; break;
    case 'defence': pay = value * CFG.defenceHit; break;
    case 'conference': pay = value * CFG.conferenceAdvance; break;
    case 'tender': value = f.type === 2 ? value * CFG.tenderMult : value * CFG.tenderOther; pay = value; break;
    case 'analytic': value *= CFG.analyticHit; pay = value; break;
    default: pay = value;
  }
  return { value, pay };
}

function waveCash(r, eventPay) {
  const launchBonus = r.sponsor === 'defence' ? CFG.defenceLaunch * r.fatigue * r.units : 0;
  return Math.round(eventPay + CFG.stipend * r.fatigue + launchBonus);
}

// Score of the wave so far: pure function of captures, so the live HUD and the final report always agree.
export function evaluate(s, captures, upTo = Infinity, extra = {}) {
  const r = s.report, fat = r.fatigue;
  const out = { hits: [], payNow: [], views: 0, money: 0, value: 0, filmed: 0, far: 0, none: 0, shot: 0, missed: 0, total: 0, combo: 0, best: 0, viral: false };
  const order = r.flights.map((f, i) => i).filter(i => r.flights[i].impact <= upTo).sort((a, b) => r.flights[a].impact - r.flights[b].impact);
  let views = 0;
  for (const i of order) {
    const f = r.flights[i];
    // Credit the change in rounded wave cash so the individual popups reconcile with the report.
    const before = waveCash(r, out.money);
    if (f.intercepted) {
      out.shot++;
      if (r.sponsor === 'analytic') out.money += CFG.analyticShot * fat;
      out.payNow[i] = waveCash(r, out.money) - before;
      continue;
    }
    if (!f.success) { out.missed++; continue; }
    out.total++;
    const kind = f.decree ? 'none' : (captures[i] ?? 'none');
    const { value, pay } = hitValue(r, f, kind);
    const hitViews = value * CFG.viewsPer * (1 + CFG.comboStep * out.combo);
    out.hits.push({ i, kind, value, pay, views: hitViews, combo: out.combo, decree: f.decree });
    views += hitViews; out.money += pay; out.value += value;
    out.payNow[i] = waveCash(r, out.money) - before;
    if (kind === 'drone') { out.filmed++; out.combo++ } else { if (kind === 'far') out.far++; else out.none++; out.combo = 0 }
    out.best = Math.max(out.best, out.combo);
    if (r.musk && kind === 'far' && f.impact >= r.musk.from && f.impact < r.musk.from + r.musk.dur) out.viral = true;
  }
  views += (extra.pressMs || 0) / 1000 * CFG.pressViews * fat;
  out.views = views * (out.viral ? CFG.muskViral : 1);
  return out;
}

export function finishWave(s, captures = s.captures, extra = {}, random = Math.random) {
  if (s.phase !== 'watch') return;
  const r = s.report, e = evaluate(s, captures, Infinity, extra);

  const iou = { paid: 0, postponed: 0 };
  s.ious = s.ious.filter(x => {
    if (x.due > r.wave) return true;
    if (x.ok) iou.paid += x.amount; else iou.postponed += x.amount;
    return false;
  });
  if (r.sponsor === 'conference') s.ious.push({ due: r.wave + CFG.conferenceDelay, amount: Math.round(CFG.conferenceMult * e.value), ok: random() < CFG.conferenceOk });
  const gain = waveCash(r, e.money) + iou.paid, views = Math.round(e.views);
  s.funds += gain; s.views += views; s.bestCombo = Math.max(s.bestCombo, e.best);
  r.result = { money: gain, views, combo: e.best, hits: e.total, filmed: e.filmed, far: e.far, none: e.none, shot: e.shot, missed: e.missed,
    viral: e.viral, iou, owed: s.ious.reduce((a, x) => a + x.amount, 0), pressMs: extra.pressMs || 0 };
  deliverLeaks(s);
  const partnerShots = e.hits.filter(h => {
    const time = r.flights[h.i].impact;
    return !h.decree && r.partnerPass && time >= r.partnerPass.from && time <= r.partnerPass.to;
  });
  r.partnerShots = partnerShots.map(h => h.i);
  r.partnerFunding = partnerShots.some(h => h.kind === 'none') ? Math.max(1,Math.round(CFG.hitOther*r.fatigue*.5)) : 0;
  s.funds += r.partnerFunding; r.result.money += r.partnerFunding;
  const unseen = e.hits.filter(h => h.kind === 'none' && !h.decree && !r.partnerShots.includes(h.i));
  if (unseen.length && random() < .4) {
    const {i} = unseen[Math.floor(random() * unseen.length)];
    const f = r.flights[i], ids = cameraSubjects(s);
    // Archive only this wave's small event script, never its images or previous reports.
    const film = { subjects: [...ids], aa: [...s.aa], wave: r.wave, seed: r.seed,
      assignedScenes: !!r.assignedScenes, flights: r.flights.filter(g => g.start <= f.impact + 1600),
      marker: f.marker, subject: f.extra ?? ids[f.marker], time: f.impact, duration: r.duration };
    (s.leaks ??= []).push({ source: s.wave, due: s.wave + 1 + Math.floor(random() * 2),
      film, views: Math.round(40000 + random() * 80000),
      funding: Math.max(1, Math.round(CFG.hitOther * r.fatigue * .5)) });
  }
  s.fatigue *= donorRetention[s.difficulty ?? 'normal'];
  s.phase = isOver(s) ? 'over' : 'report';
  if (s.phase === 'over') s.runId ||= newId();
}

export function nextWave(s, random = Math.random) {
  if (s.phase !== 'report') return;
  s.wave++; s.phase = 'plan'; s.report = null; s.captures = []; s.live = null;
  dealWave(s, random);
}
