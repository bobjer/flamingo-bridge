import * as T from 'three';

// Procedural "satellite photo" land around a wide strait crossed by a long viaduct.
// Open sea for |x| < ~330; the bridge runs along x. Near the arch there are two sandy spits
// (x 15..75 on each side) where the SAM batteries stand; the far shores lie at |x| > LANDFALL.
// Geometry carries heights and the signed coast distance; all surface colour is computed per pixel on the GPU.
const EXT = 5600, SEG = 460, NEAR_STEP = 1.6;
export const LANDFALL = 345, LANDFALL_Y = 1.45; // where the viaduct deck meets the far shore, and its deck height there

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, y) {
 const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
 const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
 return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
const fbm = (x, y, o = 4) => { let a = .5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= .5; f *= 2.03; } return s; };

// approximate signed distance to an ellipse (positive inside)
function ellipse(x, z, cx, cz, rx, rz) {
 const dx = (x - cx) / rx, dz = (z - cz) / rz, r = Math.hypot(dx, dz) || 1e-6;
 return (1 - r) * r / Math.hypot(dx / rx, dz / rz);
}
// signed distance to the coast (roughly in world units): > 0 on land, < 0 in the sea
function coast(x, z) {
 const s = x < 0 ? 5 : 0, ax = Math.abs(x), az = Math.abs(z);
 // far shores: straight where the viaduct lands, then capes and bays; the strait opens into a sea at each end
 const open = Math.max(0, az - 700);
 const xc = 330 + smooth(30, 220, az) * 90 * (fbm(z * .006, 4.1 + s) - .35)
  + open * open / 1500 + smooth(500, 1400, az) * 420 * (fbm(z * .0016, 8.3 + s) - .45);
 const ragged = smooth(40, 400, az) * 60 * (fbm(x * .006 + s, z * .006) - .5);
 // far outline of the continent, so the land ends in a natural coast instead of a hard edge
 const r = Math.hypot(x, z * 1.2), a = Math.atan2(z, x);
 const outer = 4400 * (1 + .18 * (fbm(Math.cos(a) * 2.5 + 9, Math.sin(a) * 2.5) - .5)) - r;
 const shore = Math.min(ax - xc + ragged, outer);
 // sandy spit beside the arch, never closer than |x| = 15.5 so the fairway stays open
 const spit = Math.min(ellipse(ax, z, 46, 7, 33, 17) + 2.5 * (fbm(x * .06 + s, z * .06) - .5), ax - 15.5);
 return Math.max(shore, spit);
}
function rawHeight(x, z, d = coast(x, z)) {
 if (d < 0) return T.MathUtils.lerp(-1.5, .05, smooth(-2.5, 0, d));
 // flat, low corridor along the road and railway so the approach ribbons sit on the ground
 const corridor = smooth(10, 60, Math.min(Math.abs(z), Math.abs(z + 6)));
 const hills = smooth(25, 90, d) * smooth(12, 45, Math.abs(z)) * corridor * (fbm(x * .02, z * .02) * 9 + fbm(x * .07, z * .07) * 1.6 + smooth(150, 500, d) * fbm(x * .004, z * .004) * 22);
 return .05 + .95 * smooth(0, 3.2, d) + hills + (fbm(x * .3, z * .3) - .5) * .12 * smooth(2, 10, d);
}
export function groundHeight(x, z) { return rawHeight(x, z); }

// grid density: ~1.6 units per cell near the bridge, coarse towards the horizon
const warp = u => { const a = NEAR_STEP * SEG / 2; return Math.sign(u) * (a * Math.abs(u) + (EXT - a) * Math.abs(u) ** 3); };

const NOISE = /* glsl */`
vec3 S(vec3 c) { return pow(c, vec3(2.2)); }
float h21(vec2 p) { p = mod(p, 289.); p = fract(p * vec2(.1031, .1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p) {
 vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
 return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.), f.x), f.y);
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
// cheaper 3-octave version for large-scale masks (rescaled to the same range)
float fbm3(vec2 p) { return (.5 * vn(p) + .25 * vn(p * 2.03 + 17.1) + .125 * vn(p * 4.12 + 51.8)) * 1.107; }
// fades detail of frequency f (cycles per world unit) once it gets smaller than a pixel
float lod(float px, float f) { return 1. - smoothstep(.25, 1., px * f); }
float coastJitter(vec2 p, float px) { return (fbm3(p * .22) - .5) * 1.4 * lod(px, .3); }
`;

const LAND_FRAG = /* glsl */`
vec3 landColor(vec2 p, float d, float h, float px) {
 float n1 = fbm3(p * .011), n2 = fbm(p * .043 + 7.), n3 = vn(p * .55) * lod(px, .6);
 float dd = d < 14. ? d + coastJitter(p, px) : d;
 // steppe: olive, dry tan and greener patches, speckled with scrub
 vec3 c = mix(S(vec3(.50, .51, .35)), S(vec3(.66, .61, .45)), smoothstep(.36, .66, n1));
 c = mix(c, S(vec3(.40, .45, .28)), smoothstep(.5, .74, n2) * .75);
 float scrub = smoothstep(.6, .82, vn(p * .8 + 3.)) * lod(px, .8) + smoothstep(.62, .8, vn(p * .16 + 9.)) * .5 * lod(px, .16);
 c = mix(c, S(vec3(.25, .30, .18)), scrub * .6 * smoothstep(7., 14., dd));

 // farmland patchwork with shelterbelts and dirt tracks; each district has its own grid angle and plot size
 vec2 dc = floor(p / 1300. + vec2(.5, .3) * fbm3(p * .0012));
 float dh = h21(dc + 21.), A = .35 + (dh - .5) * 1.4;
 vec2 q = mat2(cos(A), sin(A), -sin(A), cos(A)) * p;
 vec2 cs = vec2(140., 50.) * (.7 + .8 * h21(dc + 4.)), g = floor(q / cs), f = fract(q / cs);
 float r = h21(g + 3.1), r2 = h21(g + 7.7), splitOn = step(.5, h21(g + 1.9));
 r2 = fract(r2 + splitOn * step(.5, f.x) * .37);   // some plots are split in two along their length
 float landuse = smoothstep(.46, .54, fbm3(p * .0011 + 3.)) * (1. - smoothstep(.62, .7, n2) * .8);
 float farm = step(.18, r) * smoothstep(30., 70., d) * landuse;
 vec3 fc = r2 < .24 ? S(vec3(.76, .68, .46)) : r2 < .42 ? S(vec3(.56, .47, .36)) : r2 < .56 ? S(vec3(.47, .53, .30)) : r2 < .74 ? S(vec3(.79, .74, .59)) : r2 < .84 ? S(vec3(.36, .44, .24)) : S(vec3(.65, .57, .41));
 fc *= 1. + .07 * sin(q.y * 1.7 + r * 40.) * lod(px, .3) + (n3 - .5) * .1 + (vn(q * .03 + r * 9.) - .5) * .18;
 vec2 e = min(f, 1. - f) * cs;
 float edge = min(min(e.x, e.y), mix(1e3, abs(f.x - .5) * cs.x, splitOn));
 float w = max(px, .001);
 float track = (1. - smoothstep(.8, .8 + w, edge)) * min(1., 1.6 / w);
 float belt = (1. - smoothstep(2.4, 2.4 + w, e.y)) * step(.35, h21(vec2(g.y, 5.) + dc)) * min(1., 4.8 / w);
 belt *= .55 + .45 * smoothstep(.3, .6, vn(q * .45));
 c = mix(c, fc, farm);
 c = mix(c, S(vec3(.72, .67, .53)), track * farm * .7);
 c = mix(c, S(vec3(.15, .21, .11)), belt * farm * .92);

 // salt lakes with pink brine and white crusted shores
 float lk = d > 120. ? fbm3(p * .0035 + 61.) + (vn(p * .03) - .5) * .05 : 0.;
 float lake = smoothstep(.8, .81, lk) * smoothstep(120., 220., d);
 float crust = smoothstep(.78, .795, lk) * (1. - lake) * smoothstep(120., 220., d);
 c = mix(c, S(vec3(.86, .84, .78)), crust * .85);
 c = mix(c, mix(S(vec3(.86, .66, .60)), S(vec3(.74, .55, .52)), smoothstep(.81, .86, lk)), lake);

 // villages: clusters of small roofs among dark gardens
 float town = d > 60. ? smoothstep(.66, .72, fbm3(p * .0055 + 40.)) * smoothstep(60., 120., d) : 0.;
 if (town > 0.) {
  vec2 hc = floor(p / 9.), hf = fract(p / 9.);
  float hr = h21(hc + 11.);
  vec3 roof = hr < .45 ? S(vec3(.62, .33, .25)) : hr < .75 ? S(vec3(.66, .66, .64)) : S(vec3(.86, .84, .80));
  vec2 hb = abs(hf - .5 - (vec2(h21(hc), h21(hc + 2.)) - .5) * .3);
  float house = step(hb.x, .2 + .1 * hr) * step(hb.y, .16) * step(.25, hr) * lod(px, .2);
  vec3 tc = mix(S(vec3(.30, .36, .22)), roof, house);
  c = mix(c, mix(tc, S(vec3(.52, .51, .44)), 1. - lod(px, .12)), town);
 }

 // dunes and beach, wet sand at the waterline
 vec3 sand = mix(S(vec3(.84, .77, .60)), S(vec3(.72, .65, .49)), n3 * .6 + n2 * .35);
 sand *= 1. + .05 * sin(dd * 5. + n3 * 6.) * lod(px, .8);
 c = mix(sand, c, smoothstep(2.5, 6.5, dd + (n2 - .5) * 4.));
 c = mix(S(vec3(.55, .51, .41)), c, smoothstep(.2, 1.2, dd));
 // higher ground turns dry and grey
 c = mix(c, S(vec3(.58, .55, .45)), smoothstep(5., 20., h) * .3);
 return c;
}
`;

// weather shared with the land shader: storm level, accumulated wetness, roller clock (same phase as the sea)
const weather = {uStorm: {value: 0}, uWet: {value: 0}, uRoll: {value: 0}};
const WEATHER_FRAG = /* glsl */`
uniform float uStorm, uWet, uRoll;
float wetBeach(vec2 p, float dd, float px, inout vec3 c) {
 // run-up: each breaker pushes a foamy sheet of water up the sand, then it drains back
 float fade = 1. - smoothstep(110., 155., length(p));
 float s = .5 + .5 * sin(dot(p, vec2(.078, .208)) - uRoll * .8), r = s * s * s * s;
 float back = .5 + .5 * sin(dot(p, vec2(.078, .208)) - uRoll * .8 + .9); // the sheet lags the crest a little
 float reach = uStorm * fade * (1.2 + 5.5 * r + 2.2 * back * back * back);
 float edge = reach + (vn(p * .7 + uRoll * .3) - .5) * 1.4;
 float sheet = (1. - smoothstep(edge - 1.4, edge, dd)) * step(0., dd) * step(.2, reach);
 float lace = (1. - smoothstep(0., .9, abs(dd - edge + .35))) * smoothstep(.4, .7, vn(p * 2.4 + uRoll));
 // wet sand, mud and puddles left behind; they dry long after the storm
 float zone = 1. - smoothstep(3., 10. + 4. * fbm3(p * .07), dd);
 float wet = clamp(uWet * zone + sheet * .8, 0., 1.);
 c = mix(c, c * vec3(.58, .56, .52), wet * .85);
 float mud = uWet * zone * smoothstep(.45, .7, fbm3(p * .09 + 31.));
 c = mix(c, S(vec3(.33, .27, .19)), mud * .55);
 float pud = uWet * zone * smoothstep(.63, .7, fbm3(p * .21 + 5.)) * lod(px, .3);
 c = mix(c, S(vec3(.30, .38, .40)), pud * .85);
 c = mix(c, mix(S(vec3(.42, .58, .55)), S(vec3(.93, .96, .95)), lace), sheet * (.55 + .4 * lace));
 return max(pud, sheet * .6);
}
`;
function landMaterial() {
 const mat = new T.MeshStandardMaterial({roughness: 1, metalness: 0});
 mat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, weather);
  sh.vertexShader = sh.vertexShader
   .replace('#include <common>', '#include <common>\nattribute float coastD;\nvarying float vD;\nvarying vec3 vW;')
   .replace('#include <begin_vertex>', '#include <begin_vertex>\nvD = coastD;\nvW = (modelMatrix * vec4(position, 1.)).xyz;');
  sh.fragmentShader = sh.fragmentShader
   .replace('#include <common>', '#include <common>\nvarying float vD;\nvarying vec3 vW;\n' + NOISE + LAND_FRAG + WEATHER_FRAG)
   .replace('#include <color_fragment>', 'float px = length(fwidth(vW.xz));\ndiffuseColor.rgb = landColor(vW.xz, vD, vW.y, px);\nfloat gloss = 0.;\nif (vD < 14. && (uWet > .01 || uStorm > .01)) { float dd = vD + coastJitter(vW.xz, px); gloss = wetBeach(vW.xz, dd, px, diffuseColor.rgb); }')
   .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .12, gloss);');
 };
 return mat;
}

// Shallow shelf drawn just above the opaque sea: turquoise over sand, rolling surf, a foam line at the beach.
function shelfMaterial(time) {
 const mat = new T.MeshBasicMaterial({transparent: true, depthWrite: false});
 mat.onBeforeCompile = sh => {
  sh.uniforms.uTime = time;
  sh.vertexShader = sh.vertexShader
   .replace('#include <common>', '#include <common>\nattribute float coastD;\nvarying float vD;\nvarying vec3 vW;')
   .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = .04;\nvD = coastD;\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
  sh.fragmentShader = sh.fragmentShader
   .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vD;\nvarying vec3 vW;\n' + NOISE)
   .replace('#include <color_fragment>', /* glsl */`
float px = length(fwidth(vW.xz));
float dd = vD + coastJitter(vW.xz, px);
float W = mix(6., 40., smoothstep(90., 340., length(vW.xz))) * (.75 + .5 * fbm(vW.xz * .02));
float t = clamp(-dd / W, 0., 1.);
float bars = (fbm(vW.xz * vec2(.05, .02)) - .5) * .5;
vec3 col = mix(S(vec3(.47, .84, .78)), S(vec3(.13, .60, .63)), smoothstep(0., .75, t + bars * .4));
float alpha = (1. - smoothstep(.25, 1., t + bars * .25)) * .9;
float wave = sin(dd * 1.9 + uTime * 1.5 + vn(vW.xz * .12) * 7.);
float surf = smoothstep(.72, 1., wave) * (1. - smoothstep(.5, 7., -dd)) * lod(px, .3);
float line = 1. - smoothstep(0., 1.1, abs(dd + .35));
float foam = max(surf * .75, line) * (.55 + .45 * vn(vW.xz * 1.3 + uTime * .2));
foam = mix(foam, (1. - smoothstep(0., 3., -dd)) * .35, 1. - lod(px, .5));
col = mix(col, vec3(.93, .96, .95), foam);
alpha = max(alpha, foam * .95) * (1. - smoothstep(-.2, .5, dd));
diffuseColor = vec4(col, alpha);`);
 };
 return mat;
}

export function buildLand(scene) {
 const g = new T.Group(), time = {value: 0};
 const geo = new T.PlaneGeometry(2, 2, SEG, SEG);
 geo.rotateX(-Math.PI / 2);
 const pos = geo.attributes.position, cd = new Float32Array(pos.count);
 for (let i = 0; i < pos.count; i++) {
  const x = warp(pos.getX(i)), z = warp(pos.getZ(i)), d = coast(x, z);
  pos.setXYZ(i, x, rawHeight(x, z, d), z);
  cd[i] = d;
 }
 geo.setAttribute('coastD', new T.BufferAttribute(cd, 1));
 geo.computeVertexNormals();
 geo.computeBoundingSphere();
 const land = new T.Mesh(geo, landMaterial());
 land.receiveShadow = true;
 g.add(land);

 // the shelf reuses the land vertices but only the triangles near the waterline
 const idx = geo.index.array, keep = [];
 for (let i = 0; i < idx.length; i += 3) {
  const a = cd[idx[i]], b = cd[idx[i + 1]], c = cd[idx[i + 2]];
  if (Math.min(a, b, c) < 1 && Math.max(a, b, c) > -60) keep.push(idx[i], idx[i + 1], idx[i + 2]);
 }
 const sGeo = new T.BufferGeometry();
 sGeo.setAttribute('position', pos);
 sGeo.setAttribute('coastD', geo.attributes.coastD);
 sGeo.setIndex(keep);
 sGeo.computeBoundingSphere();
 const shelf = new T.Mesh(sGeo, shelfMaterial(time));
 shelf.renderOrder = 1;
 g.add(shelf);

 // shrubs and small trees near the bridge, kept off the gameplay zone and the road corridors
 const shrubs = [];
 for (let i = 0; i < 30000 && shrubs.length < 3200; i++) {
  const x = (hash(i, 11) * 2 - 1) * 760, z = (hash(i, 12) * 2 - 1) * 420, d = coast(x, z);
  if (d < 8) continue;
  if (Math.abs(x) < 34 && Math.abs(z) < 20) continue; // keep the SAM sites clear
  if (Math.abs(z) < 7 || Math.abs(z + 6) < 5) continue;
  if (fbm(x * .05, z * .05) < .5 && hash(i, 13) > .12) continue;
  shrubs.push([x, z]);
 }
 const inst = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({roughness: 1, flatShading: true}), shrubs.length);
 const m = new T.Matrix4(), q = new T.Quaternion(), c = new T.Color();
 shrubs.forEach(([x, z], i) => {
  const s = .45 + hash(i, 21) * .9;
  m.compose(new T.Vector3(x, groundHeight(x, z) + s * .3, z), q, new T.Vector3(s * 1.15, s * .75, s * 1.15));
  inst.setMatrixAt(i, m);
  inst.setColorAt(i, c.setHSL(.19 + hash(i, 22) * .07, .25 + hash(i, 23) * .15, .17 + hash(i, 24) * .1, T.SRGBColorSpace));
 });
 inst.castShadow = inst.receiveShadow = true;
 g.add(inst);

 // road and railway on the far shores: ramp down from the viaduct, then follow the ground inland
 const fillMat = new T.MeshStandardMaterial({color: 0x9c9686, roughness: 1, side: T.DoubleSide});
 for (const [z, w, color, deckY] of [[0, 4.8, 0x3d3f43, LANDFALL_Y], [-6, 3.6, 0x77736c, LANDFALL_Y - .05]]) {
  const x0 = LANDFALL, x1 = LANDFALL + 24, step = 4;
  const yAt = x => (x < x1 ? T.MathUtils.lerp(deckY, groundHeight(x1, z) + .06, smooth(x0, x1, x)) : groundHeight(x, z) + .06 + (x - x0) * .0004);
  const surfMat = new T.MeshStandardMaterial({color, roughness: .95, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  for (const side of [-1, 1]) {
   const fill = new T.Shape();
   fill.moveTo(x0, -1); fill.lineTo(x0, deckY - .3);
   for (let x = x0; x <= x1; x += 2) fill.lineTo(x, yAt(x) - .05);
   fill.lineTo(x1, -1);
   const ex = new T.Mesh(new T.ExtrudeGeometry(fill, {depth: w + 3.4, bevelEnabled: false}), fillMat);
   ex.position.set(0, 0, z - (w + 3.4) / 2);
   ex.scale.x = side;
   ex.receiveShadow = ex.castShadow = true;
   g.add(ex);
   const verts = [], tri = [];
   for (let x = x0, i = 0; x < x1 || coast(side * x, z) > 25; x += step, i++) {
    const y = yAt(x) + .01;
    verts.push(side * x, y, z - w / 2, side * x, y, z + w / 2);
    if (i) { const b = (i - 1) * 2; tri.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
   }
   const rg = new T.BufferGeometry();
   rg.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
   rg.setIndex(tri);
   rg.computeVertexNormals();
   const surf = new T.Mesh(rg, surfMat);
   surf.receiveShadow = true;
   g.add(surf);
  }
 }
 // layer 1: drawn by the main camera, skipped by the water's reflection pass (saves a full land render)
 g.traverse(o => o.layers.set(1));
 scene.add(g);
 return {group: g, update(t, storm = 0, wet = 0, roll = 0) { time.value = t; weather.uStorm.value = storm; weather.uWet.value = wet; weather.uRoll.value = roll; }};
}
