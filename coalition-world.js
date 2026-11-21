import {cruiserSinking} from './cruiser-sinking.js';
// The coalition's 3D stage: the real bridge scene (scene.js) with three targets, anti-air, flying units
// and the camera rig (three FPV drones plus a tripod on the far shore). No DOM besides the host element.
import * as T from 'three';
import {landscape} from './scene.js';
import {searchlights} from './searchlights.js';
import {model, randomCarType} from './models.js';
import {fireworks} from './effects.js';
import {tankerTraffic} from './tanker-traffic.js';
import {railTraffic} from './rail-traffic.js';
import {LANDFALL, groundHeight} from './terrain.js';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) };
const TYPES = ['flamingo', 'baby', 'loaf', 'neptune'];
const SCALE = [2, 1.9, 1.8, 1.65];
const BOOM = [1.7, 1.4, 3.4, 1.7];
const FAR_FOV = 14;

// Where each drone hovers, relative to its marker (x, up from the marker aim, z). All of them look north over the sea.
const DRONES = [{ off: [-8, 6.2, 14.5], seed: 1 }, { off: [2.5, 7.2, 18], seed: 2 }, { off: [9, 5.4, 15.5], seed: 3 }];

export function createStage(host) {
  const world = landscape(host);
  const scene = world.scene;
  const fx = fireworks(scene);
  const beams = searchlights(scene);
  const tankers = tankerTraffic(scene);
  const moveTrain = railTraffic(world, LANDFALL);
  const glCanvas = host.querySelector('canvas');

  const land = V(-41, groundHeight(-41, 14), 14), sea = V(22, .24, 31);
  const crater = V(17, world.deckTop(17), .7);
  const subjects = {
    arch: {point: V(0, 9.9, 2), radius: 7.2}, pier: {point: V(-12, 1.55, 1.4), radius: 2.1},
    cruiser: {point: sea.clone().add(V(0, 1.1, 0)), radius: 4}, sam: {point: land.clone().add(V(0, 1, 0)), radius: 2.4},
    hole: {point: crater, radius: 2.2}
  };
  const moored = tankers.moor(sea.clone().add(V(-5, 0, -3)));
  const supply = model('truck'); supply.position.copy(land).add(V(4, .3, 1)); scene.add(supply);
  const neighbours = {
    cruiser: {kind:'tanker', point:moored.position.clone().add(V(0,.65,0))},
    sam: {kind:'truck', point:supply.position.clone().add(V(0,.45,0))},
    arch: {kind:'pier', point:V(-12,1.55,1.4)},
    pier: {kind:'deck', point:V(-16,3.18,.7)},
    hole: {kind:'pier', point:V(18,1.55,1.4)}
  };
  let stories = [], archHits = 0, sceneTime = 0, trafficTime = 0, screenSmoke = false, closedRoad = false;
  let scars = [];
  world.onCollapseSplash(() => {
    for (const x of [-9,-4,2,8]) fx.splash(V(x,.15,0),3);
    fx.dust(V(0,.6,0),2.4);
  });
  let shots = [subjects.arch, subjects.pier, subjects.cruiser];

  /* ---------- a little traffic on the road deck so the bridge looks alive ---------- */
  const cars = Array.from({ length: 7 }, (_, i) => {
    const m = model(randomCarType()), dir = i % 2 ? -1 : 1; m.rotation.y = dir === 1 ? 0 : Math.PI;
    m.traverse(o => { if (o.isMesh) o.castShadow = true }); scene.add(m);
    return { m, dir, x: -110 + i * 33 + hash(i) * 12, speed: 5.5 + hash(i + 9) * 3 };
  });

  /* ---------- anti-air garrison ---------- */
  let aaUnits = [];
  function setBroadcast(ids, aa) {
    stories = ids;
    shots = ids.map(id => subjects[id]);
    moored.visible = ids.includes('cruiser'); supply.visible = ids.includes('sam');
    closedRoad = false; scars = []; archHits = 0;
    world.setDeckHoles(scars); world.setHits(0); for (const c of cars) c.m.visible = true;
    for (const u of aaUnits) u.m.removeFromParent();
    aaUnits = [];
    [0, 1, 2].forEach(i => {
      if (!aa?.[i] && !(i === 0 && ids.includes('sam')) && !(i === 2 && ids.includes('cruiser'))) return;
      const kind = ['sam', 'turret', 'cruiser'][i], m = model(kind);
      const at = [land, V(7.5, 3.3, 2.05), sea][i];
      m.position.copy(at); m.scale.setScalar(i === 2 ? 1.2 : .78); m.traverse(o => { if (o.isMesh) o.castShadow = true });
      scene.add(m);
      aaUnits.push({ m, i, base: at.y, muzzle: [1.5, .9, 1.1][i] * (i === 2 ? 1.2 : .78), yaw: -Math.PI / 2 });
    });
  }

  /* ---------- flights ---------- */
  let recs = [];
  const blazes = [];
  const airborne = [];
  const sinking = cruiserSinking(fx);
  // Units come in from far to the side over the sea, swing north of the bridge (in front of the drones) and
  // dive on the marker, so they cross the frame laterally for the last half of the flight.
  function plan(i, f, report) {
    const story = stories[f.marker];
    const previous = report.assignedScenes ? 0 : report.flights.filter(g => g.marker === f.marker && g.success && !g.decree && g.impact < f.impact).length;
    const extra = f.extra || previous > 0 && (story === 'cruiser' || story === 'sam' || previous % 2 === 1);
    const kind = extra ? neighbours[story].kind : story;
    const target = extra ? neighbours[story].point : shots[f.marker].point, side = hash(i + 5) < .5 ? -1 : 1, hit = f.success || f.intercepted;
    if (f.type === 3 && !f.noScene) {
      const end = target.clone();
      return { kind, S: V(end.x + side*12, -4, end.z+5), C: V(end.x+side*5, 0, end.z+2),
        E: end, sea: true, mesh: null, phase: 'pending', shots: 0, tI: f.start+.73*(f.impact-f.start) };
    }
    return { kind, S: V(target.x + side * (110 + hash(i * 1.7 + 3) * 50), 15 + hash(i + 2) * 15, 30 + hash(i * 3.1 + f.marker) * 40),
      C: V(target.x + side * (40 + hash(i + 9) * 15), 0, -70 + hash(i + 4) * 10),
      E: hit ? target.clone() : V(target.x - side * (8 + hash(i) * 4), .15, 8 + hash(i + 7) * 4), hit,
      weave: 1 + hash(i + 1) * 1.5, ph: hash(i) * 6.28, mesh: null, phase: 'pending', shots: 0, tI: f.start + .73 * (f.impact - f.start) };
  }
  const pt = (R, u, out = V()) => {
    const k = 1 - u, a = k * k, b = 2 * u * k, c = u * u;
    out.set(a * R.S.x + b * R.C.x + c * R.E.x, 0, a * R.S.z + b * R.C.z + c * R.E.z);
    if (R.sea) { out.y = R.S.y*k*k + R.E.y*(1-k*k) + Math.sin(Math.PI*u)*.65; return out }
    out.y = R.E.y + (R.S.y - R.E.y) * Math.pow(k, R.hit ? 1.3 : .6) + 2 * Math.sin(Math.PI * u);
    out.x += R.weave * Math.sin(u * 7 + R.ph) * k * k;
    return out;
  };
  const tmpA = V(), tmpB = V();
  function orient(m, R, u, t) {
    pt(R, Math.min(1, u), tmpA); pt(R, Math.min(1, u + .02), tmpB); tmpB.sub(tmpA);
    if (u >= .98) { pt(R, u - .02, tmpB); tmpB.multiplyScalar(-1).add(tmpA) }
    const yaw = Math.atan2(-tmpB.z, tmpB.x), pitch = Math.atan2(tmpB.y, Math.hypot(tmpB.x, tmpB.z));
    m.rotation.set(.22 * Math.sin(t * 1.7 + R.ph) + .15 * Math.sin(u * 7 + R.ph), yaw, pitch, 'YZX');
    for (const wing of m.userData.wings || []) wing.rotation.x = wing.scale.z * Math.sin(t * 14 + R.ph) * .32;
  }
  const muzzleOf = u => u.m.localToWorld(V(0, u.muzzle / u.m.scale.y, 0));
  function fireAA(R, f) {
    const u = aaUnits.find(a => a.i === f.marker); if (!u) return;
    const to = pt(R, Math.min(1, (R.tI - f.start) / (f.impact - f.start) - .03), V()), from = muzzleOf(u);
    if (u.i === 0 && R.shots === 0 && f.intercepted) {
      const flight = fx.launchAt(from, {m:R.mesh}, 0);
      flight.duration = Math.max(.1, (R.tI - R.clock) / 1000);
    } else fx.tracer(from, to, .9);
    if (u.i === 0) fx.flak(from, to.clone().sub(from), 6);
    if (u.i !== 0 && hash(R.shots + f.start) < .6) fx.flak(from, to.clone().sub(from), 4);
  }
  function startBlaze(i, p, k0, life, age = 0) { blazes.push({ p: p.clone(), k0, k: k0, life, age, t: 0 }) }
  function impact(R, f, i, silent, late = 0) {
    if (f.intercepted || !f.success || f.decree) return;
    const p = R.E, age = late / 1000;
    if (R.kind === 'cruiser') {
      const index = aaUnits.findIndex(u => u.i === 2);
      if (index >= 0) {
        const [ship] = aaUnits.splice(index, 1);
        if (!silent) fx.breakup(ship.m, V(0,1,0));
        sinking.start(ship.m, age, silent);
      } else if (!silent) fx.splash(sea, 1.8);
      return;
    }
    if (R.kind === 'tanker') {
      if (moored.visible) {
        moored.visible = false;
        if (!silent) { fx.explosion(p, 3); fx.splash(p, 2.4); fx.spill(p, 2, 50) }
        startBlaze(i,p,1.6,12500,late);
      } else if (!silent) fx.splash(p,1.8);
      return;
    }
    if (R.kind === 'sam') {
      const at = aaUnits.findIndex(u => u.i === 0);
      if (at >= 0) { const [u] = aaUnits.splice(at,1); if (!silent) fx.breakup(u.m,V(0,1,0)); u.m.removeFromParent() }
    }
    if (R.kind === 'truck' && supply.visible) {
      if (!silent) fx.throwCar(supply.clone(),p); supply.visible = false;
    }
    if (R.kind === 'arch') world.setHits(Math.min(3, ++archHits), silent);
    if (['deck','hole','pier'].includes(R.kind) || archHits >= 3) {
      if (!silent) for (const c of cars) if (c.m.visible && Math.abs(c.x-p.x)<8) fx.throwCar(c.m.clone(),p);
      for (const c of cars) c.m.visible = false;
      closedRoad = true;
      if (R.kind === 'pier' && Math.abs(p.x) <= 18) {
        if (!scars.some(s => s.fallenSide === Math.sign(p.x))) scars.push({fallenSide:Math.sign(p.x),fallenAt:sceneTime-age});
      } else if (!scars.some(s => s.point?.distanceTo(p)<1)) scars.push({point:p.clone()});
      world.setDeckHoles(scars);
    }
    if (R.sea && !silent) fx.splash(p,2.5);
    if (!silent) {
      const p = R.E.clone(), k = BOOM[f.type];
      fx.explosion(p, k); fx.sparks(p, k * .8, 28, 0xfff0c0); fx.dust(p, k * .6);
      if (f.type === 2) { fx.explosion(p.clone().add(V(1.2, .8, .6)), k * .6); setTimeout(() => fx.explosion(p.clone().add(V(-1.5, .4, -.5)), k * .55), 260) }
    }
    startBlaze(i, R.E, f.type === 2 ? 1.5 : 1, f.type === 2 ? 9000 : 6500, late);

  }
  function updateFlights(dt, elapsed, report) {
    airborne.length = 0;
    const flights = report?.flights ?? [];
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i]; if (elapsed < f.start) continue;
      const R = recs[i] ??= plan(i, f, report), dur = f.impact - f.start;
      if (R.phase === 'done') continue;
      if (R.phase === 'pending') {
        if (elapsed < f.start) continue;
        if (elapsed > f.impact + 400) { R.phase = 'done'; impact(R, f, i, true, Math.max(0, elapsed - f.impact)); continue }
        R.mesh = model(TYPES[f.type]); R.mesh.scale.setScalar(SCALE[f.type]); R.mesh.traverse(o => { if (o.isMesh) o.castShadow = true }); scene.add(R.mesh); R.phase = 'fly';
      }
      if (R.phase === 'fly') {
        const u = Math.min(1, Math.max(0, (elapsed - f.start) / dur)), m = R.mesh;
        R.clock = elapsed;
        if (elapsed <= f.impact && (f.intercepted || hash(i + 87) > .45)) {
          while (R.shots < 3 && elapsed >= R.tI - [720,480,260][R.shots]) { fireAA(R,f); R.shots++ }
        }
        if (f.intercepted) {
          const uI = (R.tI - f.start) / dur;
          if (elapsed >= R.tI) {
            const p = pt(R, uI, V()), fwd = pt(R, uI + .02, V()).sub(p).normalize();
            const k = [1, .9, 2, 1][f.type];
            fx.explosion(p, k); if (f.type === 0) fx.feathers(p, 0xff7fb0, 16);
            R.vel = fwd.multiplyScalar(11).setY(2); R.spin = V((Math.random() - .5) * 6, (Math.random() - .5) * 8, (Math.random() - .5) * 6);
            R.blaze = { p: p.clone(), k: .55, t: 0 }; R.phase = 'wreck'; m.position.copy(p);
            continue;
          }
        } else if (elapsed >= f.impact) {
          if (f.success) impact(R, f, i, false);
          else { fx.splash(R.E, [1.1, 1, 1.8, 2][f.type]); }
          m.removeFromParent(); R.mesh = null; R.phase = 'done'; continue;
        }
        pt(R, u, m.position);
        if(R.sea) m.rotation.set(0, Math.atan2(R.S.z-R.E.z, R.E.x-R.S.x), -.14*Math.sin(Math.PI*u));
        else orient(m, R, u, elapsed / 1000);
        airborne.push({ m, f, i, hp:1 });
      }
      if (R.phase === 'wreck') {
        const m = R.mesh, v = R.vel; v.y -= 15 * dt; v.multiplyScalar(1 - .5 * dt);
        m.position.addScaledVector(v, dt); m.rotation.x += R.spin.x * dt; m.rotation.y += R.spin.y * dt; m.rotation.z += R.spin.z * dt;
        R.blaze.p.copy(m.position); fx.blaze(R.blaze, dt);
        const ground = Math.max(.15, groundHeight(m.position.x, m.position.z) + .2);
        if (m.position.y <= ground || elapsed > f.impact + 3500) {
          if (ground < .4) fx.splash(m.position, [1.1, 1, 1.8, 2][f.type]); else fx.explosion(m.position, [.6, .5, 1, .6][f.type]);
          m.removeFromParent(); R.mesh = null; R.phase = 'done';
        }
      }
    }
    for (let j = blazes.length - 1; j >= 0; j--) {
      const b = blazes[j]; b.age += dt * 1000;
      if (b.age >= b.life) { blazes.splice(j, 1); continue }
      b.k = b.k0 * Math.pow(1 - b.age / b.life, 1.2) + .1; fx.blaze(b, dt);
    }
  }
  function resetWave() {
    for (const R of recs) { if (R.mesh) R.mesh.removeFromParent() }
    sinking.clear(); fx.clear();
    recs = []; blazes.length = 0; airborne.length = 0;

  }

  /* ---------- camera rig ---------- */
  const state = { pos: V(), prev: V(), vel: V(), pitch: 0, roll: 0, fov: 75, init: false };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sines = (t, seed, parts) => parts.reduce((a, [f, amp], k) => a + amp * Math.sin(t * f * 6.2832 + seed * 7.3 + k * 2.1), 0);
  const gustAt = (seed, t) => { // one jolt every 7-13 s
    const slot = Math.floor(t / 9.5 + seed * .37), start = (slot + hash(slot * 3 + seed) * .6) * 9.5 - seed * 3.5, age = t - start;
    return age >= 0 && age < .6 ? Math.exp(-age * 7) * Math.sin(age * 34) * (hash(slot + seed * 11) > .5 ? 1 : -1) : 0;
  };
  function cameraPose(cam, t, orbital) {
    const calm = reduced.matches ? .25 : 1;
    if (cam < 3) {
      const D = DRONES[cam], a = shots[cam].point, s = D.seed;
      const gust = gustAt(s, t) * calm;
      const pos = V(a.x + D.off[0], a.y + D.off[1], a.z + D.off[2]);
      pos.x += calm * (sines(t, s, [[.11, .55], [.23, .3]]) + sines(t, s + 3, [[3.9, .035], [7.4, .02]])) + gust * .7;
      pos.y += calm * (sines(t, s + 1, [[.17, .4], [.31, .2]]) + sines(t, s + 4, [[5.3, .04], [9.1, .02]])) + gust * .45;
      pos.z += calm * (sines(t, s + 2, [[.13, .5], [.27, .25]]) + sines(t, s + 5, [[4.6, .03], [8.2, .02]])) - gust * .6;
      const tgt = a.clone(); tgt.x += calm * (sines(t, s + 6, [[.19, .9], [3.1, .06]]) + gust * .6); tgt.y += calm * (sines(t, s + 7, [[.15, .5], [4.3, .05]]) + gust * .4);
      const roll = calm * (sines(t, s + 8, [[.21, .036], [.47, .014], [5.1, .009]]) + gust * .05);
      return { position: pos, target: tgt, fov: 75, roll };
    }
    if (orbital) {
      const drift = reduced.matches ? 0 : 3 * Math.sin(t * .055);
      return { position: V(drift, 89, 44), target: V(drift, 2, 0), fov: 32, roll: -.035 };
    }
    const ts = t * .6;
    return { position: V(-352, 10.2, 200), target: V(1.5 + .05 * Math.sin(ts), 5.2 + .03 * Math.sin(ts * 1.3), .5), fov: FAR_FOV, roll: 0 };
  }

  /* ---------- per-frame ---------- */
  const proj = V();
  let real = 0;
  function step({ dt, real: realT, elapsed, report, cam, orbital, reverse = false, satelliteSubject }) {
    real = realT;
    sceneTime += dt;
    screenSmoke = !!report && report.wave >= 2 && (report.seed?.[0] < .4 || report.wave % 4 === 0) && elapsed >= 1400 && elapsed < Math.min(report.duration,11500);
    if (!screenSmoke && !closedRoad) trafficTime += dt;
    // camera
    const el = host.clientWidth / Math.max(1, host.clientHeight);
    const pose = cameraPose(cam, realT, orbital);
    if (satelliteSubject != null) {
      const point = shots[satelliteSubject].point;
      pose.target = point.clone(); pose.position = point.clone().add(V(8*Math.sin(realT*.12),56,23)); pose.fov = 30;
    }
    if (reverse) {
      const point = shots[cam].point;
      pose.target = point.clone(); pose.position = point.clone().add(V(-8, 5, -19)); pose.roll = 0; pose.fov = 49;
    }
    if (el < 1 && pose.fov > 40) pose.fov = Math.min(100, pose.fov + (1 - el) * 45);
    state.fov = pose.fov;
    world.setPose(pose);
    if (!state.init) { state.prev.copy(pose.position); state.init = true }
    state.vel.copy(pose.position).sub(state.prev).divideScalar(Math.max(.001, dt || .016)); state.prev.copy(pose.position);
    state.pos.copy(pose.position);
    const fwd = pose.target.clone().sub(pose.position).normalize();
    state.pitch = Math.asin(fwd.y) * 57.2958; state.roll = pose.roll * 57.2958;
    // world
    updateFlights(dt, elapsed, report);
    sinking.tick(dt);
    for (const c of cars) { if (!screenSmoke && !closedRoad) c.x += c.dir * c.speed * dt; if (Math.abs(c.x) > 130) c.x = -c.dir * 130; c.m.position.set(c.x, world.deckTop(c.x) + .06, c.dir * .8) }
    for (const u of aaUnits) {
      let best = null, bd = 1e9;
      for (const a of airborne) { const d = a.m.position.distanceTo(u.m.position); if (d < bd && d < 110) { bd = d; best = a } }
      const want = best ? Math.atan2(u.m.position.z - best.m.position.z, best.m.position.x - u.m.position.x) : -Math.PI / 2;
      let diff = want - u.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); u.yaw += diff * Math.min(1, dt * 6);
      u.m.rotation.y = u.yaw;
      if (u.i === 2) { u.m.position.y = u.base + Math.sin(realT * 1.3) * .05; u.m.rotation.z = Math.sin(realT * .9) * .03 }
    }
    beams.update(sceneTime*1000, Math.max(screenSmoke ? .8 : 0, 1-world.daylight()), airborne);
    fx.tick(dt, []);
  }
  function render(gameTime) {
    tankers.move(trafficTime); tankers.draw(sceneTime); moveTrain(trafficTime);
    world.draw(sceneTime, trafficTime, screenSmoke, gameTime);
  }
  const gameTime = t => t * .45;

  /* ---------- queries for the OSD ---------- */
  const screen = p => { const s = world.screenPoint(p); return s };
  return {
    world, fx, glCanvas,
    step, render: () => render(gameTime(real)), setBroadcast, resetWave,
    lessonFinale(on) {
      world.setHits(0, true);
      world.setHits(on ? 3 : Math.min(archHits,3), !on);
      if (on) world.setPose({position:V(-36,20,50),target:V(0,2,0),fov:35,roll:0});
    },
    renderLesson(dt) {
      sceneTime += dt; fx.tick(dt,[]); world.draw(sceneTime,trafficTime,false,gameTime(real));
    },
    telemetry: () => ({ pos: state.pos, vel: state.vel, pitch: state.pitch, roll: state.roll, fov: state.fov }),
    // screen position and apparent size of marker i for the current camera, or null when it is off screen
    project(i) {
      const s = screen(shots[i].point); if (!s) return null;
      const cam = world.camera, d = cam.position.distanceTo(shots[i].point);
      const pxPerM = host.clientHeight / (2 * d * Math.tan(cam.fov * Math.PI / 360));
      return { x: s.x, y: s.y, dist: d, half: shots[i].radius * pxPerM };
    },
    incoming() {
      const out = [];
      for (const a of airborne) { const s = screen(a.m.position); if (s) out.push({ x: s.x, y: s.y, marker: a.f.marker, type: a.f.type, dist: world.camera.position.distanceTo(a.m.position) }) }
      return out;
    },
    snapshot: () => world.snapshot(),
    setMaxPixelRatio: r => world.setMaxPixelRatio(r)
  };
}
