// Shared plan-phase bot for the balance simulation (coalition-sim.mjs) and the in-game autoplay. Pure, no DOM.
import {CFG, pickSponsor, purchase, acceptDeal, declineDeal} from './coalition-rules.js';

const worth = (id, q) => ({ fund: 1 + q * .3, defence: .9, conference: .8, tender: .7, analytic: 1 })[id] ?? 1;

// What the bot does in the plan phase, as a list of moves: {do: 'deal' | 'nodeal' | 'pick' | 'buy', i?, id?}.
// Pending Trump deal: accept when poor. Otherwise: pick a sponsor, spend everything (flamingo, tot, flamingo, loaf; cheapest as fallback).
// `q` is the skill the sponsor scoring assumes. `random` is accepted for symmetry and unused.
export function planMoves(s, random = Math.random, q = .8) {
  if (s.deal === 'pending') return [{ do: s.funds < 40 ? 'deal' : 'nodeal' }];
  const score = c => worth(c.id, q) * (s.aa[c.marker] ? .8 : 1.1) + (c.id === 'analytic' && s.wave > 6 ? .3 : 0) + (c.id === 'fund' && q < .5 ? -.4 : 0);
  const moves = [{ do: 'pick', i: score(s.offer.cards[1]) > score(s.offer.cards[0]) ? 1 : 0 }];
  let funds = s.funds; const stock = [...s.stock], pattern = [0, 1, 3, 2];
  const buy = id => { if (funds < CFG.costs[id] || stock[id] >= CFG.cap) return false; funds -= CFG.costs[id]; stock[id]++; moves.push({ do: 'buy', id }); return true };
  for (let i = 0; ; i++) {
    if (!buy(pattern[i % pattern.length])) { let bought = false; for (const id of CFG.costs.keys()) if (buy(id)) { bought = true; break } if (!bought) break }
  }
  return moves;
}

export function applyMove(s, m) {
  if (m.do === 'deal') return acceptDeal(s);
  if (m.do === 'nodeal') return declineDeal(s);
  if (m.do === 'pick') return pickSponsor(s, m.i);
  if (m.do === 'buy') return purchase(s, m.id, 1);
  return false;
}

// Read only the indicators on the camera tabs. A warning can also lead to a missed shot.
export function chooseCamera(tabs, current, holding) {
  const local = tabs.filter(tab => tab.id < 3 && tab.link === 'live' && tab.air > 0);
  const selected = local.find(tab => tab.id === current);
  if (holding && selected) return current;
  const warning = local.filter(tab => tab.warn).sort((a, b) => b.air - a.air)[0];
  if (warning) return warning.id;
  if (selected) return current;
  if (tabs.some(tab => tab.id === 4)) return 4;
  return 3;
}

export function preferredReward(s) {
  const {reward, orderOffer} = s.report;
  const batch = orderOffer.remaining / orderOffer.turns;
  const immediateValue = CFG.costs[orderOffer.type] * batch;
  return (s.funds < CFG.costs[0] && reward.cash > immediateValue) ||
    reward.cash >= immediateValue * orderOffer.turns ? 'cash' : 'order';
}
