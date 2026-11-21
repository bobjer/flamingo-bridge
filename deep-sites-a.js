// Deepstrike 3D site models, part A: 0 Oil works, 1 Power station, 2 Depot, 3 Market, 4 Airfield, 5 Jammer.
// Contract: see deep-sites.js. Low-poly Lambert style matching fire-replay.js, muted dusk palette.
import * as THREE from 'three';

function mulberry32(a) {
  a = a >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAR = 0x2b2826, BURNT = 0x3d3834, ASH = 0x57524b;

// Unit gable prism: x,z in [-.5,.5], y from -.5 (eaves) to .5 (ridge at z=0).
function gableGeo() {
  const v = [
    [-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, 0], [-.5, .5, 0], // back slope (z<0)
    [-.5, -.5, .5], [.5, -.5, .5],
  ];
  const tri = (a, b, c) => [...v[a], ...v[b], ...v[c]];
  const pos = [
    ...tri(0, 2, 1), ...tri(0, 3, 2),          // back slope
    ...tri(4, 5, 2), ...tri(4, 2, 3),          // front slope
    ...tri(0, 4, 3),                           // left gable
    ...tri(1, 2, 5),                           // right gable
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function kit(seed, salt) {
  const rng = mulberry32((seed >>> 0) * 2654435761 + salt);
  const geos = [], mats = new Map(), group = new THREE.Group();
  const track = g => (geos.push(g), g);
  const box = track(new THREE.BoxGeometry(1, 1, 1));
  const cyl = track(new THREE.CylinderGeometry(1, 1, 1, 16));
  const cone = track(new THREE.ConeGeometry(1, 1, 10));
  const gable = track(gableGeo());
  const tcyl = (rt, rb, seg = 18) => track(new THREE.CylinderGeometry(rt, rb, 1, seg));
  const mat = c => {
    let m = mats.get(c);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); }
    return m;
  };
  const basic = c => {
    const key = 'b' + c;
    let m = mats.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(key, m); }
    return m;
  };
  // base-anchored placement: y0 is the bottom, h the height
  function put(geo, color, x, y0, z, w, h, d, parent = group) {
    const m = new THREE.Mesh(geo, typeof color === 'object' ? color : mat(color));
    m.position.set(x, y0 + h / 2, z);
    m.scale.set(w, h, d);
    parent.add(m);
    return m;
  }
  function hcyl(color, x, y, z, r, len, parent = group) {
    const m = put(cyl, color, x, 0, z, r, len, r, parent);
    m.position.y = y; m.rotation.z = Math.PI / 2;
    return m;
  }
  function pivot(x, y, z, parent = group) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
  }
  function beam(a, b, t, color) {
    const m = new THREE.Mesh(box, mat(color));
    group.add(m);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.scale.set(t, t, a.distanceTo(b));
    m.lookAt(b);
    return m;
  }
  function scorch(x, z, r, color = 0x1f1d1b) {
    const m = put(cyl, color, x, 0.12, z, r, .06, r);
    m.visible = false;
    return m;
  }
  const char = (m, c = CHAR) => { m.material = mat(c); };
  const charGroup = (g, c = CHAR) => g.traverse(o => { if (o.isMesh) o.material = mat(c); });
  const r = (a, b) => a + (b - a) * rng();
  const pick = arr => arr[Math.floor(rng() * arr.length) % arr.length];
  function finish({ radius = 55, aim, fireSpots, levels }) {
    let applied = 0;
    return {
      group, radius, aim, fireSpots,
      applyDamage(severity) {
        const s = Math.max(0, Math.min(3, severity | 0));
        while (applied < s) levels[applied++]();
      },
      dispose() {
        for (const g of geos) g.dispose();
        for (const m of mats.values()) m.dispose();
        geos.length = 0; mats.clear();
      },
    };
  }
  return { rng, r, pick, group, box, cyl, cone, gable, tcyl, mat, basic, put, hcyl, pivot, beam, scorch, char, charGroup, finish, track };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- 0 Oil works
function oilWorks(seed) {
  const k = kit(seed, 101);
  const { put, box, cyl, cone, rng, r } = k;
  put(box, 0x6f7066, 0, -.2, 0, 100, .2, 76);
  put(box, 0x8a8678, 0, .0, 39, 100, .1, 4); // access road
  const tanks = [];
  for (let i = 0; i < 9; i++) {
    const x = (i % 3 - 1) * 28, z = (Math.floor(i / 3) - 1) * 21;
    const wall = put(cyl, 0xa8afa7, x, 0, z, 3.5, 10, 3.5);
    put(cyl, 0x797f74, x, 0, z, 3.6, .8, 3.6);
    const roof = put(cyl, 0xcacbc0, x, 8.2 + r(0, 1.4), z, 3.3, .45, 3.3);
    put(box, 0x6e6555, x + 3.7, 0, z, .3, 8, .3); // ladder
    tanks.push({ wall, roof, x, z, h: 10, ry: roof.position.y, scorch: k.scorch(x, z, 6.5) });
  }
  // pipe racks
  for (const z of [-10.5, 10.5]) {
    for (let x = -40; x <= 40; x += 10) put(box, 0x5e5a50, x, 0, z, .5, 3.6, .5);
    put(box, 0x8a5a3c, 0, 3.6, z - .5, 82, .5, .5);
    put(box, 0x6a7a80, 0, 3.6, z + .5, 82, .5, .5);
    put(box, 0x9a8f78, 0, 4.2, z, 82, .45, .45);
  }
  const rack = put(box, 0x8a5a3c, 0, 4.7, 0, 3, .4, 82); // cross-link between racks
  // flare stack
  const flare = k.pivot(-46, 0, -30);
  put(cyl, 0x77736a, 0, 0, 0, .6, 32, .6, flare);
  put(box, 0x5e5a50, 0, 0, 0, 3, 1, 3, flare);
  const flame = put(cone, 0xff8a2a, 0, 32, 0, .9, 2.2, .9, flare);
  flame.material = k.basic(0xff8a2a);
  // striped water tower (landmark, orange accent)
  const tx = 42, tz = -30;
  for (const dx of [-2, 2]) for (const dz of [-2, 2]) put(box, 0x6e6555, tx + dx, 0, tz + dz, .7, 18, .7);
  put(cyl, 0xc26b47, tx, 17, tz, 4.7, 6, 4.7);
  put(cyl, 0xece0bc, tx, 18.6, tz, 4.73, 1.5, 4.73);
  put(cyl, 0xc26b47, tx, 20.6, tz, 4.73, 1.0, 4.73);
  put(cone, 0x776e5c, tx, 23, tz, 4.9, 1.8, 4.9);
  // buildings
  const ctrl = put(box, 0x8b8a80, -42, 0, 26, 12, 4.5, 7);
  put(box, 0xc26b47, -42, 4.5, 26, 12.6, .5, 7.6);
  put(box, 0x4b5258, -42, 1, 29.6, 3, 2.6, .2);
  put(box, 0x7d7f74, 42, 0, 26, 7, 3.2, 5);
  put(cyl, 0x7f8480, 30, 0, 33, 1.6, 3, 1.6);
  const burn = [tanks[4], tanks[1], tanks[7], tanks[3], tanks[5], tanks[0], tanks[8], tanks[2], tanks[6]];
  const crumple = (t, f) => {
    t.wall.scale.set(3.5 * (1 - .12 * f), t.h * (1 - .22 * f), 3.5 * (1 + .06 * f));
    t.wall.position.y = t.wall.scale.y / 2; t.wall.rotation.z = .06 * f;
    k.char(t.wall, [0x838278, 0x726b60, 0x5c574f][Math.min(2, f - 1)]);
    t.h = t.wall.scale.y;
  };
  const sink = (t, drop, tilt, c) => {
    t.roof.position.y = Math.max(2, t.ry - drop); t.roof.rotation.z = tilt; t.roof.rotation.x = tilt * .4;
    k.char(t.roof, c);
  };
  return k.finish({
    aim: V(0, 9, 0),
    fireSpots: [V(0, 10, 0), V(-28, 9, 0), V(28, 9, 21), V(0, 5, -10.5), V(-46, 32, -30)],
    levels: [
      () => { sink(tanks[4], .8, .18, 0x675d51); tanks[4].scorch.visible = true; },
      () => {
        sink(tanks[4], 2.6, .34, 0x49423c);
        for (const i of [1, 3, 7]) { sink(tanks[i], 1.4, .22, 0x675d51); tanks[i].scorch.visible = true; }
        crumple(tanks[4], 2); crumple(tanks[7], 1);
        flare.rotation.z = -.12;
      },
      () => {
        for (const t of tanks) { sink(t, 3.4 + rng(), .3 + rng() * .15, 0x2c2826); t.scorch.visible = true; }
        for (const i of [0, 2, 3, 5, 6, 8]) crumple(tanks[i], 1 + (i & 1));
        crumple(tanks[4], 3);
        flare.rotation.z = -.42; k.char(flame, 0x3a2a20);
        k.char(ctrl, BURNT); rack.rotation.x = .06; rack.position.y -= .6;
      },
    ],
  });
}

// ---------------------------------------------------------------- 1 Power station
function powerStation(seed) {
  const k = kit(seed, 202);
  const { put, box, cyl, cone, r } = k;
  put(box, 0x6a6c64, 0, -.2, 0, 100, .2, 74);
  // boiler house + hall
  put(box, 0x7a7872, -21, 0, 0, 16, 28, 20);
  put(box, 0x5a5e62, -21, 28, 0, 17, .8, 21);
  put(box, 0x7f7d78, -2, 0, 0, 22, 15, 26);
  put(box, 0x4f5459, 4, 3, 13.1, 6, 6, .3); // dark louvre
  const roofPivot = k.pivot(-2, 15, 0);
  const roof = put(box, 0x5d6168, 0, 0, 0, 23, .8, 27, roofPivot);
  put(box, 0x6b6f75, 0, .8, 0, 8, 1.2, 8, roofPivot); // roof vent
  for (const z of [-9, -4, 4, 9]) put(box, 0x6a6c64, -21, 6, z, 17, .6, .6);
  // cooling towers
  const towers = [];
  const tA = k.tcyl(9.5, 13, 22), tB = k.tcyl(10.6, 9.5, 22), tRim = k.tcyl(10.9, 10.6, 22);
  for (const z of [-19, 19]) {
    const g = k.pivot(29, 0, z);
    const lo = put(tA, 0xa6a39a, 0, 0, 0, 1, 16, 1, g);
    const upGroup = k.pivot(0, 16, 0, g);
    const up = put(tB, 0xa6a39a, 0, 0, 0, 1, 10, 1, upGroup);
    put(tRim, 0x8f8c84, 0, 10, 0, 1, .6, 1, upGroup);
    const crack = put(box, 0x2e2c29, 0, 1, 10.1, .5, 8, .4, upGroup); crack.visible = false;
    towers.push({ g, lo, upGroup, up, crack, z });
  }
  // striped stacks (red/white accent)
  const bandGeos = [];
  for (let i = 0; i < 6; i++) bandGeos.push(k.tcyl(2.6 - (i + 1) * .16, 2.6 - i * .16, 14));
  const stacks = [];
  for (const z of [-12, 12]) {
    const g = k.pivot(-38, 0, z);
    for (let i = 0; i < 6; i++) put(bandGeos[i], i % 2 ? 0xe4dfd0 : 0xb8453a, 0, i * 8.3, 0, 1, 8.3, 1, g);
    put(box, 0x77736a, 0, 0, 0, 6, 1.2, 6, g);
    stacks.push(g);
  }
  // transformer yard
  const trans = [];
  for (let i = 0; i < 6; i++) {
    const x = -14 + (i % 3) * 7, z = -31 + Math.floor(i / 3) * 6;
    trans.push(put(box, 0x8a8f8c, x, 0, z, 4, 3.4, 3.2));
    put(box, 0xb8453a, x, 3.4, z, 1, 1.2, 1);
  }
  put(box, 0x4c5054, -7, 0, -26, 28, .15, 2); // cable trench
  // coal yard
  const heaps = [];
  for (const [x, z, s] of [[-18, 28, 8], [-4, 30, 6.5], [-30, 30, 5.5]]) heaps.push(put(cone, 0x2c2c2b, x, 0, z, s, s * .75, s));
  const conv = k.beam(V(-18, 2, 20), V(-21, 14, 9), 1.6, 0x4a4a46);
  // pylons + lines
  const py = [];
  for (const z of [-30, 0, 30]) {
    put(k.tcyl(.5, 1.6, 4), 0x82868a, 47, 0, z, 1, 24, 1).rotation.y = Math.PI / 4;
    put(box, 0x82868a, 47, 21, z, 9, .4, .4);
    put(box, 0x82868a, 47, 16, z, 7, .4, .4);
    py.push(z);
  }
  const lines = [];
  for (let i = 0; i < 2; i++) for (const [dx, y] of [[-4.5, 21], [4.5, 21], [-3.5, 16], [3.5, 16]])
    lines.push(k.beam(V(47 + dx, y, py[i]), V(47 + dx, y - 1.4, py[i + 1]), .14, 0x2c2e30));
  const dark = [0x6d6b64, 0x4f4d48, 0x34322f];
  return k.finish({
    aim: V(-8, 16, 0),
    fireSpots: [V(-2, 16, 0), V(-21, 29, 0), V(-12, 3, -29), V(29, 27, -19), V(-18, 5, 28)],
    levels: [
      () => {
        roofPivot.rotation.z = .1; roofPivot.rotation.x = .05; roofPivot.position.y -= .9;
        k.char(roof, 0x44464a);
        stacks[0].scale.y = .88; stacks[0].rotation.z = -.07;
        towers[0].up.material = k.mat(dark[0]); towers[0].crack.visible = true;
      },
      () => {
        roofPivot.rotation.z = .3; roofPivot.rotation.x = .12; roofPivot.position.y -= 3.2;
        stacks[0].scale.y = .75; stacks[0].rotation.z = -.2;
        stacks[1].scale.y = .9; stacks[1].rotation.x = .16;
        towers[0].upGroup.scale.set(.93, 1, .93); towers[0].upGroup.rotation.z = .05;
        towers[1].up.material = k.mat(dark[1]); towers[1].crack.visible = true;
        for (const t of trans.slice(0, 2)) k.char(t, BURNT);
        lines[1].rotation.z = .15; lines[2].visible = false;
      },
      () => {
        roofPivot.rotation.z = .5; roofPivot.rotation.x = .2; roofPivot.position.y -= 4.5;
        stacks[0].rotation.z = -1.2; stacks[0].scale.y = .7;
        stacks[1].rotation.x = .38; stacks[1].scale.y = .72;
        for (const t of towers) {
          t.up.material = k.mat(dark[2]); t.lo.material = k.mat(dark[0]);
          t.upGroup.rotation.z = (t.z < 0 ? .12 : -.12); t.upGroup.scale.set(.9, .85, .9); t.crack.visible = true;
        }
        for (const t of trans) k.char(t, BURNT);
        for (const h of heaps) k.char(h, 0x1b1b1a);
        lines[5].visible = false; lines[6].rotation.y = .1;
        k.char(conv, BURNT);
      },
    ],
  });
}

// ---------------------------------------------------------------- 2 Depot
function depot(seed) {
  const k = kit(seed, 303);
  const { put, box, cyl, gable, rng, r, pick } = k;
  put(box, 0x77766a, 0, -.2, 0, 96, .2, 72);
  put(box, 0x8d8b7d, 0, 0, 6, 90, .08, 5); // yard lane
  const whs = [];
  for (const z of [-26, -10]) for (const x of [-22, 22]) {
    const len = 34 + r(0, 4), wall = put(box, 0x86806f, x, 0, z, len, 6, 11);
    const pv = k.pivot(x, 6, z);
    const roof = put(gable, pick([0x5e6670, 0x6d5b4d, 0x596458]), 0, 0, 0, len + 1, 3.2, 12.4, pv);
    for (let i = -1; i <= 1; i++) put(box, 0xd0902f, x + i * 10, 0, z + 5.55, 6, 4.2, .2); // doors (accent)
    whs.push({ wall, pv, roof, x, z, len });
  }
  // containers
  const conts = [];
  const cc = [0x6e7f8c, 0x8c5f4f, 0x6b7a5e, 0xb88a35, 0x7d6a58, 0x5a6a7a];
  for (let cx = 0; cx < 4; cx++) for (let cz = 0; cz < 4; cz++) {
    const x = -41 + cx * 8.5, z = 11 + cz * 5.5, n = 1 + Math.floor(rng() * 3);
    for (let t = 0; t < n; t++) {
      const m = put(box, pick(cc), x + r(-.3, .3), t * 2.5, z, 6, 2.5, 2.4);
      conts.push({ m, t, x: m.position.x, y: m.position.y, z, fate: rng() });
    }
  }
  // fuel area
  const tanksF = [hc(0x8f9690, 22, 1.9, 14), hc(0x8f9690, 22, 1.9, 19.5)];
  function hc(c, x, rad, z) { const m = k.hcyl(c, x, rad + .3, z, rad, 9); m.position.x = x; return m; }
  for (const [x, z] of [[33, 14], [33, 20]]) {
    put(box, 0xb8453a, x, .4, z, 6, 2.2, 2.4);
    k.hcyl(0x9aa09a, x + 1.2, 2, z, 1.2, 5);
  }
  for (const x of [28, 38]) for (const z of [24, 29]) put(box, 0x5d5a50, x, 0, z, .4, 4, .4);
  const canopy = put(box, 0xd0902f, 33, 4, 26.5, 14, .5, 8);
  put(box, 0x4c5054, 33, 0, 26.5, 1, 1.6, .8);
  // perimeter fence with south gate
  const fence = [];
  const fz = 34, fx = 46;
  for (let x = -fx; x < fx; x += 10) if (Math.abs(x + 5) > 6) { fence.push(put(box, 0x4d514f, x + 5, 0, -fz, 10, 2.2, .12)); }
  for (let x = -fx; x < fx; x += 10) if (Math.abs(x + 5) > 6) { fence.push(put(box, 0x4d514f, x + 5, 0, fz, 10, 2.2, .12)); }
  for (let z = -fz; z < fz; z += 10) { fence.push(put(box, 0x4d514f, -fx, 0, z + 5, .12, 2.2, 10)); fence.push(put(box, 0x4d514f, fx, 0, z + 5, .12, 2.2, 10)); }
  for (let x = -fx; x <= fx; x += 10) for (const z of [-fz, fz]) if (Math.abs(x) > 6) put(box, 0x3a3d3b, x, 0, z, .3, 2.6, .3);
  for (const dx of [-3.5, 3.5]) put(box, 0xb8453a, dx, 0, fz, 5.4, 2.2, .2);
  put(box, 0x3a3d3b, -6, 0, fz, .4, 3, .4); put(box, 0x3a3d3b, 6, 0, fz, .4, 3, .4);
  put(box, 0x8b8a80, 10, 0, 31, 5, 3, 3.5); // gatehouse
  const sc = [k.scorch(-22, -18, 14), k.scorch(22, -18, 14), k.scorch(-28, 20, 12), k.scorch(33, 20, 8)];
  const topple = (c, f) => {
    c.m.rotation.set((rng() - .5) * .5, rng() * 3, (f ? 1 : -1) * (.5 + rng() * .8));
    c.m.position.set(c.x + (rng() - .5) * 5, c.t > 0 ? 1.0 : c.y, c.z + (rng() - .5) * 4);
  };
  const flat = (w, drop, tilt, col) => {
    w.pv.position.y = 6 - drop; w.roof.scale.y = 3.2 * .3; w.pv.rotation.z = tilt; w.pv.rotation.x = tilt * .4;
    k.char(w.roof, col);
  };
  return k.finish({
    aim: V(-10, 5, -18),
    fireSpots: [V(-22, 8, -26), V(22, 8, -10), V(-33, 4, 18), V(22, 4, 17), V(33, 5, 26)],
    levels: [
      () => {
        whs[1].pv.rotation.z = .2; whs[1].pv.position.y -= 1.2; sc[1].visible = true;
        for (const c of conts) if (c.t > 0 && c.fate < .25) topple(c, 0);
      },
      () => {
        for (const i of [0, 1, 2]) flat(whs[i], 2.2, .22 + i * .05, 0x3b3a38);
        for (const c of conts) if (c.t > 0 && c.fate < .75) topple(c, 1);
        sc[0].visible = sc[2].visible = true;
        k.char(tanksF[0], BURNT); canopy.rotation.z = .3; canopy.position.y -= 1.4;
      },
      () => {
        for (const w of whs) {
          flat(w, 3.4, .1, 0x2c2a28);
          w.wall.scale.y = 3.6; w.wall.position.y = 1.8; k.char(w.wall, 0x4a463f);
        }
        for (const c of conts) { if (c.t > 0) topple(c, 1); if (c.fate > .6) k.char(c.m, BURNT); }
        for (const s of sc) s.visible = true;
        k.char(tanksF[1], CHAR); canopy.visible = false;
        for (let i = 0; i < fence.length; i += 5) { fence[i].rotation.y = .2; fence[i].position.y -= .5; }
      },
    ],
  });
}

// ---------------------------------------------------------------- 3 Market
function market(seed) {
  const k = kit(seed, 404);
  const { put, box, gable, rng, r, pick } = k;
  put(box, 0x77746a, 0, -.2, 0, 100, .2, 76);
  put(box, 0x4a4c4d, 0, 0, 32.5, 84, .1, 9); // parking
  for (let x = -40; x <= 40; x += 6) put(box, 0xcfcab5, x, .1, 32.5, .15, .02, 8.4);
  // central hall
  put(box, 0x8d8473, 0, 0, 0, 30, .3, 18); // floor
  const cols = [];
  for (const x of [-13, -4.5, 4.5, 13]) for (const z of [-7.5, 7.5]) cols.push(put(box, 0x6b6558, x, 0, z, .7, 7, .7));
  put(box, 0xa8998a, 0, 0, -8.7, 29, 4, .4);
  const roofs = [];
  for (const sx of [-1, 1]) {
    const pv = k.pivot(sx * 7.7, 7, 0);
    const m = put(gable, 0x4f6a86, 0, 0, 0, 16, 4.2, 19, pv);
    roofs.push({ pv, m, sx });
  }
  // stalls
  const stalls = [];
  const cano = [0x3d6a9a, 0xd7d2c0, 0x3d6a9a, 0x5c7f9f];
  for (const x of [-40, -32, -24, 24, 32, 40]) for (const z of [-24, -8, 8, 24]) {
    const gx = x + r(-.6, .6), gz = z + r(-.6, .6);
    put(box, 0x8b6b4a, gx, 0, gz, 3, 1.1, 1.4);
    put(box, pick([0xb8453a, 0xc9a94a, 0x6b8a52, 0x9a7aa0]), gx + r(-.6, .6), 1.1, gz, 1, .5, .8);
    for (const dx of [-1.6, 1.6]) put(box, 0x5c4a3a, gx + dx, 0, gz - 1.1, .2, 3, .2);
    const can = put(box, pick(cano), gx, 3, gz, 4.2, .25, 3.4);
    stalls.push({ can, y: can.position.y, fate: rng(), x: gx });
  }
  // parking
  const cars = [];
  const carC = [0x7a7f84, 0x5d6f7f, 0x8f4a40, 0x9a9486, 0x4b5a4b, 0x34383c];
  for (const z of [30.5, 34.7]) for (let i = 0; i < 9; i++) {
    if (rng() < .2) continue;
    const x = -35 + i * 8.5 + r(-.6, .6), g = k.pivot(x, 0, z), c = pick(carC);
    put(box, c, 0, .3, 0, 4.2, 1.1, 1.9, g);
    put(box, 0x333a40, -.2, 1.4, 0, 2.2, .8, 1.7, g);
    cars.push(g);
  }
  // lamps
  const lamps = [];
  for (const [x, z] of [[-18, -26], [18, -26], [-18, 0], [18, 0], [-18, 26], [18, 26], [0, -32], [0, 27]]) {
    const g = k.pivot(x, 0, z);
    put(box, 0x4a4e50, 0, 0, 0, .25, 7, .25, g);
    put(box, 0xffd890, .6, 7, 0, 1.2, .3, .6, g).material = k.basic(0xffd890);
    lamps.push(g);
  }
  const sc = [k.scorch(0, 0, 14), k.scorch(-32, -8, 7), k.scorch(10, 31, 6)];
  const tear = (s, full) => {
    if (full) { s.can.visible = false; return; }
    s.can.rotation.z = (s.x < 0 ? -1 : 1) * (.5 + rng() * .4); s.can.rotation.x = rng() * .4;
    s.can.position.y = s.y - .9; k.char(s.can, 0x6a6458);
  };
  return k.finish({
    aim: V(0, 6, 0),
    fireSpots: [V(0, 8, 0), V(-32, 3.5, -8), V(32, 3.5, 24), V(6, 2, 30.5), V(-10, 3, 0)],
    levels: [
      () => {
        for (const s of stalls) if (s.fate < .3) tear(s, s.fate < .12);
        roofs[0].pv.rotation.z = .12; roofs[0].pv.position.y -= .6; sc[0].visible = true;
      },
      () => {
        for (const s of stalls) if (s.fate < .7) tear(s, s.fate < .4);
        roofs[0].pv.rotation.z = .4; roofs[0].pv.position.y -= 2.4; roofs[1].pv.rotation.z = -.1;
        k.char(roofs[0].m, 0x3a4350); sc[1].visible = true;
        for (let i = 0; i < cars.length; i += 3) k.charGroup(cars[i]);
        for (const i of [0, 3]) lamps[i].rotation.z = .35;
      },
      () => {
        for (const s of stalls) tear(s, s.fate < .6);
        roofs[0].pv.rotation.z = .6; roofs[0].pv.position.y -= 3.6;
        roofs[1].pv.rotation.z = -.42; roofs[1].pv.position.y -= 3;
        k.char(roofs[1].m, 0x3a4350);
        cols.forEach((c, i) => { if (i % 2) { c.rotation.z = .3; c.scale.y = 5.2; } });
        for (const c of cars) k.charGroup(c);
        cars[1] && (cars[1].rotation.z = 1.2);
        for (let i = 1; i < lamps.length; i += 2) lamps[i].rotation.x = .4;
        for (const s of sc) s.visible = true;
      },
    ],
  });
}

// ---------------------------------------------------------------- 4 Airfield
function airfield(seed) {
  const k = kit(seed, 505);
  const { put, box, cyl, cone, gable, rng, r, pick } = k;
  put(box, 0x6c7060, 0, -.2, 0, 100, .2, 76);
  put(box, 0x44474a, 0, .0, -3, 86, .08, 4.5); // taxiway
  put(box, 0xd9b43a, 0, .1, -3, 86, .02, .25);
  for (const x of [-30, 30]) put(box, 0x44474a, x, 0, 3.5, 4.5, .09, 13);
  put(box, 0x3b3d3f, 0, 0, 10, 94, .12, 9); // runway
  for (let x = -38; x <= 38; x += 7) put(box, 0xcfcab5, x, .12, 10, 4, .05, .35);
  for (const z of [5.7, 14.3]) put(box, 0xcfcab5, 0, .12, z, 90, .05, .15);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) put(box, 0xcfcab5, sx * 44.5, .12, 7.6 + i * 1.2, 2.4, .05, .5);
    put(box, 0xcfcab5, sx * 39, .12, 10, 3, .05, 2.2);
  }
  put(box, 0x4a4c4c, -14, 0, -15, 54, .1, 16); // apron
  // hangars
  const hangars = [];
  for (const x of [-24, 2]) {
    const wall = put(box, 0x7d7a6e, x, 0, -30, 22, 8, 13);
    put(box, 0x2b2d2c, x, 0, -23.4, 16, 6.5, .3);
    put(box, 0xd9b43a, x, 6.5, -23.3, 16, .8, .3);
    const pv = k.pivot(x, 8, -30);
    const roof = put(gable, 0x5d6a5f, 0, 0, 0, 23.5, 4.5, 14.2, pv);
    hangars.push({ wall, pv, roof });
  }
  // control tower
  put(box, 0x8b8a80, 30, 0, -26, 3.4, 11, 3.4);
  put(box, 0x4a5c6a, 30, 11, -26, 6.4, 2.4, 6.4);
  put(box, 0xc8c3b0, 30, 13.4, -26, 7, .5, 7);
  put(box, 0xd9b43a, 30, 13.9, -26, .4, 2.2, .4);
  put(box, 0x8b8a80, 38, 0, -26, 6, 3, 5);
  // windsock
  put(box, 0x5e5a50, -44, 0, 20, .25, 7, .25);
  const sock = put(cone, 0xe07a2f, -42.8, 5.6, 20, .6, 2.6, .6); sock.rotation.z = -Math.PI / 2 + .15;
  // aircraft
  const planes = [];
  const pc = [0x8e9488, 0x7b8691, 0x9a8f78, 0x6f7d6e];
  for (const [x, z, a] of [[-30, -16, .2], [-18, -14, -.1], [-5, -16, .35], [8, -14, 0]]) {
    const g = k.pivot(x, 0, z); g.rotation.y = a + r(-.1, .1);
    const col = pick(pc);
    put(box, col, 0, .9, 0, 8, 1.4, 1.4, g);
    put(box, 0xd9b43a, 1.4, 1.1, 0, 1.2, .6, 1.5, g);
    const wing = put(box, col, .6, 1.5, 0, 1.8, .25, 10, g);
    put(box, col, -3.6, 2, 0, 1.2, 2, .25, g);
    put(box, col, -3.8, 2.3, 0, 1, .2, 3.6, g);
    for (const z2 of [-.8, .8]) put(box, 0x2b2d2c, .8, 0, z2, .3, .9, .3, g);
    planes.push({ g, wing, a: g.rotation.y });
  }
  // fuel tanks
  const ftanks = [];
  for (let i = 0; i < 3; i++) ftanks.push(put(cyl, 0xa8afa7, -34 + i * 6.5, 0, 26, 2.5, 5, 2.5));
  put(box, 0x6e6555, -28, 0, 30, 10, .2, 1); // pipe
  // craters (hidden)
  const craters = [[8, 10, 6.5], [-14, 10, 4], [22, -3, 3]].map(([x, z, rad]) => ({
    ring: (() => { const m = put(cyl, 0x4a3f33, x, 0.18, z, rad * 1.5, .04, rad * 1.5); m.visible = false; return m; })(),
    inner: (() => { const m = put(cyl, 0x151413, x, 0.2, z, rad, .04, rad); m.visible = false; return m; })(),
    rad,
  }));
  const crater = (c, f) => { c.ring.visible = c.inner.visible = true; c.ring.scale.set(c.rad * 1.5 * f, .04, c.rad * 1.5 * f); c.inner.scale.set(c.rad * f, .04, c.rad * f); };
  const wreck = (p, tilt, drop) => {
    k.charGroup(p.g); p.g.rotation.z = tilt; p.g.position.y = -drop; p.wing.rotation.y = .5;
  };
  const flat = (h, drop, tilt, col) => {
    h.pv.position.y = 8 - drop; h.roof.scale.y = 1.4; h.pv.rotation.z = tilt; k.char(h.roof, col);
  };
  return k.finish({
    aim: V(8, 3, 10),
    fireSpots: [V(-24, 9, -30), V(-18, 2, -14), V(8, 2, 10), V(2, 9, -30), V(-34, 6, 26)],
    levels: [
      () => {
        crater(craters[0], .45);
        hangars[0].pv.rotation.z = .25; hangars[0].pv.position.y -= 1.2;
        planes[1].g.rotation.z = .25; planes[1].wing.rotation.y = .3;
      },
      () => {
        crater(craters[0], .75);
        flat(hangars[0], 3.4, .2, 0x3b3a38); hangars[1].pv.rotation.z = -.22; hangars[1].pv.position.y -= 1.4;
        wreck(planes[1], .5, .1); wreck(planes[2], -.4, .15);
        k.char(ftanks[0], BURNT);
      },
      () => {
        crater(craters[0], 1); crater(craters[1], 1); crater(craters[2], 1);
        for (const h of hangars) { flat(h, 4.2, .08, 0x2c2a28); h.wall.scale.y = 4.5; h.wall.position.y = 2.25; k.char(h.wall, 0x4a463f); }
        for (const p of planes) wreck(p, (rng() - .5) * 1.2, .2);
        for (const t of ftanks) { k.char(t, CHAR); t.scale.y = 3.8; t.position.y = 1.9; }
        k.char(sock, ASH);
      },
    ],
  });
}

// ---------------------------------------------------------------- 5 Jammer (EW station)
function jammer(seed) {
  const k = kit(seed, 606);
  const { put, box, cyl, rng, r, pick } = k;
  put(box, 0x5f5a47, 0, -.2, 0, 78, .2, 70);
  put(cyl, 0x77716a, 0, 0, 0, 6, .5, 6);
  // lattice mast
  const mast = k.pivot(0, 0, 0), upper = k.pivot(0, 20, 0, mast);
  const SECT = 9, H = 5;
  for (let i = 0; i < SECT; i++) {
    const w = 4.2 - i * .33, par = i < 4 ? mast : upper, y0 = (i < 4 ? i : i - 4) * H;
    const col = i % 2 ? 0xe0dccc : 0xb8453a;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box, col, sx * w / 2, y0, sz * w / 2, .35, H, .35, par);
    const L = Math.hypot(w, H);
    for (const sz of [-1, 1]) {
      const d = put(box, 0x77736a, 0, y0 + H / 2 - H / 2, sz * w / 2, .18, L, .18, par);
      d.position.y = y0 + H / 2; d.rotation.z = -Math.atan2(w, H) * sz;
    }
  }
  put(cyl, 0xcfcab5, 0, 25, 0, .12, 6, .12, upper);
  const panels = [0, 1, 2].map(i => { const a = i * 2.1; return put(box, 0x8f948f, Math.cos(a) * 1.1, 24, Math.sin(a) * 1.1, .5, 3, .25, upper); });
  // guy wires + anchors
  const wires = [];
  for (let a = 0; a < 4; a++) {
    const ang = Math.PI / 4 + a * Math.PI / 2, ax = Math.cos(ang) * 25, az = Math.sin(ang) * 25;
    put(box, 0x77736a, ax, 0, az, 1.6, .8, 1.6);
    wires.push(k.beam(V(Math.cos(ang) * 1.6, 14, Math.sin(ang) * 1.6), V(ax, .8, az), .12, 0x2c2e30));
    wires.push(k.beam(V(Math.cos(ang) * 1.1, 32, Math.sin(ang) * 1.1), V(ax, .8, az), .12, 0x2c2e30));
  }
  // dishes
  const dishG = k.tcyl(2.4, .35, 14), dishes = [];
  const mkDish = (x, y, z, ang, par) => {
    put(box, 0x5e5a50, x, y, z, .4, 3.4, .4, par);
    const pv = k.pivot(x, y + 3.6, z, par); pv.rotation.y = ang;
    const m = put(dishG, 0xcfd0c6, 0, -.4, 0, 1, .9, 1, pv); m.rotation.x = -1.0;
    dishes.push({ pv, x, y: y + 3.6, z, ang, m });
  };
  mkDish(-24, 0, -15, .6, k.group); mkDish(26, 0, -12, 2.2, k.group); mkDish(-22, 0, 20, -.8, k.group); mkDish(27, 0, 16, 3.6, k.group);
  // shelters
  const shel = [];
  for (const [x, z, a] of [[-16, 8, .1], [16, -4, 1.4], [4, 18, 0]]) {
    const g = k.pivot(x, 0, z); g.rotation.y = a;
    put(box, pick([0x6b7a5e, 0x7a7255, 0x6a7060]), 0, 0, 0, 6, 2.6, 2.5, g);
    put(box, 0x4a4e44, 0, 2.6, 0, 6.2, .2, 2.7, g);
    put(box, 0x2b2d2c, 3.05, .2, 0, .1, 2, 1.2, g);
    put(box, 0xb8453a, 0, 2.8, 0, .6, 1.6, .6, g); // small whip
    shel.push(g);
  }
  // generator + drums
  const gen = put(box, 0x8a7a42, 12, 0, 16, 2.6, 1.5, 1.6);
  put(cyl, 0x4a4e44, 13.2, 1.5, 16, .22, 1.2, .22);
  for (let i = 0; i < 3; i++) put(cyl, pick([0x6b3f36, 0x4a5a3c]), 15 + i * 1.4, 0, 18, .45, 1.1, .45);
  // sandbag ring
  const bags = [];
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 28; i++) {
    const a = (i + layer * .5) / 28 * Math.PI * 2, rad = 8.5;
    const m = put(box, 0x9a8f68, Math.cos(a) * rad, layer * .65, Math.sin(a) * rad, 1.6, .65, .9);
    m.rotation.y = -a + Math.PI / 2; bags.push({ m, fate: rng() });
  }
  const sc = [k.scorch(12, 16, 5), k.scorch(-16, 8, 6), k.scorch(0, 0, 9)];
  const knock = (d, i) => {
    d.pv.position.set(d.x + 2 + i, .9, d.z + 1.5); d.pv.rotation.set(0, d.ang + i, 1.25);
  };
  return k.finish({
    aim: V(0, 18, 0),
    fireSpots: [V(-16, 3.2, 8), V(12, 2, 16), V(0, 3, 0), V(16, 3.2, -4), V(4, 3.2, 18)],
    levels: [
      () => {
        upper.rotation.z = .22; mast.rotation.z = .02;
        knock(dishes[0], 0); k.char(gen, BURNT); sc[0].visible = true;
      },
      () => {
        upper.rotation.z = .65; mast.rotation.z = .14; mast.rotation.x = .06;
        knock(dishes[1], 1); knock(dishes[2], 2);
        shel[0].rotation.z = .35; shel[0].position.y = .4; sc[1].visible = true;
        for (const b of bags) if (b.fate < .25) b.m.visible = false;
        wires[1].visible = false; wires[3].visible = false; wires[5].visible = false;
      },
      () => {
        mast.rotation.z = 1.4; mast.rotation.x = .1; mast.position.y = .8; upper.rotation.z = .25;
        for (const w of wires) w.visible = false;
        knock(dishes[3], 3);
        for (const s of shel) { k.charGroup(s, BURNT); s.rotation.z = (rng() - .5) * .6; }
        for (const b of bags) if (b.fate < .6) b.m.visible = false;
        for (const s of sc) s.visible = true;
        panels.forEach((p, i) => { p.rotation.z = .5 + i * .3; });
      },
    ],
  });
}

export const builders = [oilWorks, powerStation, depot, market, airfield, jammer];
