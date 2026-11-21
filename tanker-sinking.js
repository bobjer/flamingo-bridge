import * as T from 'three';
import {waterTurmoil} from './water-turmoil.js';

// A destroyed oil tanker: one hit and it is a floating bomb. The whole ship burns, blows up again and again,
// rolls onto its side, settles by the stern and goes under. Everything runs on an `age` advanced by tick(dt).
export const TANKER_SINK_TOTAL = 20;   // wreck gone at END, churning water lingers after
const END = 14;              // wreck removed
const FIRE_END = 12.5;       // deck fires and smoke stop
const OIL_END = 13;          // burning oil on the water stops
const OIL_FADE = 3;          // oil fires fade out over the last seconds before OIL_END
const SINK_START = 2, SINK_END = 12.5, SINK_DROP = 3.4;
const ROLL_MAX = .95, ROLL_TIME = 11;
const TRIM_MAX = .5, TRIM_TIME = 12;   // stern-down trim magnitude (applied as -rotation.x, see pose)
const LURCHES = [1.5, 4.2, 7.6];       // moments of a sharp roll wobble
const WOBBLE = .06;
const DRIFT_TIME = 5;                  // the drift velocity dies away over this long
const WATERLINE = -.1;                 // hull top below this world y counts as submerged
const BOOMS = [                        // secondary explosions: age, scale, thrown pieces
  {t: 1.5, k: 1.8, pieces: 2}, {t: 3.2, k: 1.55, pieces: 1}, {t: 5, k: 1.3, pieces: 1},
  {t: 7.2, k: 1.15, pieces: 0}, {t: 9.5, k: 1, pieces: 0}
];
const DECK_Z = [-2, -.7, .6, 1.9];
const DECK_Y = .65;
const OIL_SITES = 6, OIL_RADIUS = 2.6;
const rnd = () => Math.random();
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x) };

export function tankerSinking(fx) {
  const wrecks = [];
  const turmoil = waterTurmoil(fx);
  const tmpA = new T.Vector3(), tmpB = new T.Vector3(), tmpQuat = new T.Quaternion(), tmpScale = new T.Vector3();
  // points on the hull whose highest world y says whether the ship is still showing above the water
  const TOP_REFS = [[0, 1.6, -2.2], [0, .6, 3], [.9, .6, 3], [-.9, .6, 3], [.9, .6, -3], [-.9, .6, -3], [.9, .6, 0], [-.9, .6, 0]]
    .map(a => new T.Vector3(...a));

  // displacement of the wreck from its starting point after `t` seconds of decaying drift
  function driftAt(w, t, out) {
    if (!w.drift) return out.set(0, 0, 0);
    const u = 1 - Math.min(t, DRIFT_TIME) / DRIFT_TIME;
    return out.copy(w.drift).multiplyScalar(DRIFT_TIME / 3 * (1 - u * u * u));
  }

  function pose(w) {
    const t = w.age;
    let roll = ROLL_MAX * ease(t / ROLL_TIME);
    for (const l of LURCHES) if (t > l) { const d = t - l; roll += WOBBLE * Math.exp(-d * 2.4) * Math.sin(d * 6.5) * (1 + roll * .5) }
    w.inner.rotation.z = w.sign * roll;
    // rotation about +x raises the -z end, so the stern (bridge end, -z) settles with a negative angle
    w.inner.rotation.x = -TRIM_MAX * ease(t / TRIM_TIME);
    const sink = clamp01((t - SINK_START) / (SINK_END - SINK_START));
    w.inner.position.y = -SINK_DROP * sink * sink;
    w.pivot.position.copy(w.base).add(driftAt(w, t, tmpA));
    w.pivot.updateMatrixWorld(true);
  }

  function hullTop(w) {
    let top = -1e9;
    for (const r of TOP_REFS) top = Math.max(top, w.inner.localToWorld(tmpA.copy(r)).y);
    return top;
  }

  function deckSite(w, z = DECK_Z[Math.floor(rnd() * DECK_Z.length)], out = new T.Vector3()) {
    return w.clone.localToWorld(out.set(0, DECK_Y, z));
  }

  function throwPiece(w, z, life) {
    if (!w.templates.length) return;
    const src = w.templates[Math.floor(rnd() * w.templates.length)];
    const m = src.clone(false);
    m.geometry = src.geometry; m.material = src.material;
    m.position.z = z;
    w.inner.add(m); w.inner.updateMatrixWorld(true);   // piece() reparents to the scene keeping the world transform
    const a = rnd() * Math.PI * 2, sp = 3 + rnd() * 4;
    fx.piece(m, tmpB.set(Math.cos(a) * sp, 5 + rnd() * 4, Math.sin(a) * sp), {burn: true, life});
  }

  function boom(w, index) {
    const b = BOOMS[index];
    const z = DECK_Z[Math.floor(rnd() * DECK_Z.length)] + (rnd() - .5) * .6;
    const p = deckSite(w, z, new T.Vector3());
    fx.explosion(p, b.k);
    fx.sparks(p, b.k * .8, 26, 0xffd27a);
    const side = new T.Vector3(1, 0, 0).applyQuaternion(w.quat).setY(0).normalize();
    fx.splash(p.clone().addScaledVector(side, (rnd() < .5 ? -1 : 1) * 1.3).setY(0), 1.2);
    for (let i = 0; i < b.pieces; i++) throwPiece(w, z, 6);
  }

  function finish(w) {
    w.pivot.removeFromParent();   // geometry and materials are shared with the live fleet: nothing to dispose
    w.clone.removeFromParent();
  }

  function tick(dt) {
    turmoil.tick(dt);
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i];
      w.age += dt;
      const t = w.age;
      if (t >= END) { finish(w); wrecks.splice(i, 1); continue }
      pose(w);
      while (w.nextBoom < BOOMS.length && t >= BOOMS[w.nextBoom].t) boom(w, w.nextBoom++);
      if (!w.spilled && t >= 10) { w.spilled = true; fx.spill(w.pivot.position.clone().setY(.7), 1.6, 60) }
      // the hull top slips under: a last surge of bubbles
      if (!w.under && hullTop(w) < WATERLINE) {
        w.under = true;
        const p = w.pivot.position;
        fx.splash(tmpA.set(p.x, 0, p.z), 2);
        fx.sparks(tmpA.set(p.x, 0, p.z), .9, 18, 0xffd27a);
      }
      if (t <= FIRE_END) {
        const kDeck = 1.5 - .5 * ease(t / FIRE_END);
        w.smokeClock -= dt;
        const smokeNow = w.smokeClock <= 0;
        if (smokeNow) w.smokeClock = .3;
        for (let s = 0; s < w.deck.length; s++) {
          const site = w.deck[s];
          deckSite(w, DECK_Z[s], site.p); site.k = kDeck;
          if (site.p.y > -.05) fx.blaze(site, dt);
        }
        if (smokeNow) {
          const p = deckSite(w, undefined, new T.Vector3());
          if (p.y > -.05) fx.smokeColumn(p, .8, .2);
        }
      }
      if (t <= OIL_END) {
        const fade = clamp01((OIL_END - t) / OIL_FADE);
        driftAt(w, t, tmpB);
        for (const o of w.oil) {
          if (t < o.delay) continue;
          o.p.set(w.base.x + o.dx + tmpB.x, .15, w.base.z + o.dz + tmpB.z);
          o.k = .9 * fade;
          if (o.k > .05) fx.blaze(o, dt);
        }
      }
    }
  }

  return {
    start(ship, opts = {}) {
      const {elapsed = 0, quiet = false, drift = null} = opts;
      if (elapsed >= TANKER_SINK_TOTAL) return;
      ship.updateWorldMatrix(true, false);
      ship.matrixWorld.decompose(tmpA, tmpQuat, tmpScale);
      const base = tmpA.clone(), quat = tmpQuat.clone(), scl = tmpScale.clone();
      const axis = new T.Vector3(0, 0, 1).applyQuaternion(quat).setY(0).normalize();
      {
        const d = new T.Vector3();
        if (drift) d.copy(drift).multiplyScalar(DRIFT_TIME / 3 * (1 - Math.pow(1 - Math.min(8.5, DRIFT_TIME) / DRIFT_TIME, 3)));
        const at = base.clone().add(d).setY(.05);
        turmoil.start(at, {radius: 3.4, duration: 7, intensity: 1.3, delay: 8.5, elapsed, quiet});
        turmoil.start(at.clone().addScaledVector(axis, -2.4), {radius: 2.4, duration: 6, intensity: 1, delay: 11, elapsed, quiet});
      }
      if (elapsed >= END) return;
      const centre = base.clone().setY(base.y + .7);

      // t = 0: the blast
      if (!quiet && elapsed < .4) {
        fx.explosion(centre, 3);
        fx.explosion(centre.clone().addScaledVector(axis, 1.4), 1.6);
        fx.explosion(centre.clone().addScaledVector(axis, -1.4), 1.5);
        fx.sparks(centre, 1.6, 36, 0xffd27a);
        fx.smokeColumn(centre, 2);
        fx.splash(centre, 2.4);
        fx.spill(centre, 2.2, 70);
      }

      // the wreck lives in the topmost ancestor (the scene), where world transforms are valid
      let scene = ship.parent;
      while (scene?.parent) scene = scene.parent;
      if (!scene) return;   // nowhere to put a wreck: the one-shot effects were all there is

      const pivot = new T.Group();
      pivot.position.copy(base); pivot.quaternion.copy(quat); pivot.scale.copy(scl);
      const inner = new T.Group(); inner.rotation.order = 'ZXY'; pivot.add(inner);
      const clone = ship.clone(true);
      clone.visible = true;
      clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.set(1, 1, 1);
      inner.add(clone);
      scene.add(pivot);

      // small deck boxes (the red deck-material ones) double as debris templates
      const templates = [];
      for (const c of clone.children) {
        if (!c.isMesh) continue;
        c.geometry.computeBoundingBox();
        c.geometry.boundingBox.getSize(tmpB);
        if (tmpB.length() < 2) templates.push(c);
      }
      const dd = drift ? drift.clone() : null;
      let nextBoom = 0;
      while (nextBoom < BOOMS.length && BOOMS[nextBoom].t <= elapsed) nextBoom++;
      const w = {
        age: elapsed, base, quat, pivot, inner, clone, templates, drift: dd, sign: rnd() < .5 ? -1 : 1,
        deck: DECK_Z.map(() => ({p: new T.Vector3(), k: 1.5, t: 0})),
        oil: Array.from({length: OIL_SITES}, (_, n) => {
          const a = rnd() * Math.PI * 2, r = (.5 + .5 * Math.sqrt(rnd())) * OIL_RADIUS;
          return {p: new T.Vector3(), k: .9, t: 0, dx: Math.cos(a) * r, dz: Math.sin(a) * r, delay: n * .25};
        }),
        smokeClock: 0, nextBoom, spilled: elapsed >= 10, under: false
      };
      pose(w);
      w.under = hullTop(w) < WATERLINE;

      // t = 0: deck pieces fly off as burning debris
      if (!quiet && elapsed < 1.5) {
        for (let n = 0; n < 3 + Math.floor(rnd() * 2); n++) throwPiece(w, DECK_Z[Math.floor(rnd() * DECK_Z.length)], Math.max(1.5, 8 - elapsed));
      }
      wrecks.push(w);
    },
    tick,
    clear() { for (const w of wrecks) finish(w); wrecks.length = 0; turmoil.clear() }
  };
}
