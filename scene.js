import {archSmoke} from './arch-smoke.js';
import {DAY_SECONDS} from './tanker-traffic.js';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Water} from 'three/addons/objects/Water.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {buildLand, LANDFALL, LANDFALL_Y} from './terrain.js';

const MIN_DIST = 14, MAX_DIST = 3500;

function concreteTexture() {
 const s = 256, c = document.createElement('canvas');
 c.width = c.height = s;
 const g = c.getContext('2d');
 g.fillStyle = '#bdb9b0';
 g.fillRect(0, 0, s, s);
 let seed = 7;
 const r = () => (seed = seed * 16807 % 2147483647) / 2147483647;
 for (let i = 0; i < 5200; i++) {
  const v = 150 + r() * 70;
  g.fillStyle = `rgba(${v},${v - 3},${v - 10},${.1 + r() * .18})`;
  g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
 }
 for (let i = 0; i < 40; i++) { // weathering streaks
  g.fillStyle = `rgba(70,66,60,${.03 + r() * .05})`;
  g.fillRect(r() * s, 0, 1 + r() * 4, s);
 }
 const t = new T.CanvasTexture(c);
 t.colorSpace = T.SRGBColorSpace;
 t.anisotropy = 4;
 return t;
}

// Tileable water normal map built from a sum of sine waves with analytic slopes.
function waterNormals(renderer) {
 const size = 256, data = new Uint8Array(size * size * 4);
 const waves = [[2, 1, 1], [3, 2, .8], [5, 3, .55], [7, 5, .4], [11, 4, .3], [4, 9, .3], [13, 8, .2], [17, 11, .15], [23, 15, .1], [19, 27, .08]];
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const u = x / size, v = y / size;
  let dx = 0, dy = 0;
  waves.forEach(([ku, kv, a], n) => {
   const ph = 2 * Math.PI * (ku * u + kv * v) + n * 1.7;
   const d = Math.cos(ph) * a * 2 * Math.PI / Math.hypot(ku, kv) / 45;
   dx += d * ku / Math.hypot(ku, kv);
   dy += d * kv / Math.hypot(ku, kv);
  });
  const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
  data[i] = (-dx / len * .5 + .5) * 255;
  data[i + 1] = (-dy / len * .5 + .5) * 255;
  data[i + 2] = (1 / len * .5 + .5) * 255;
  data[i + 3] = 255;
 }
 const tex = new T.DataTexture(data, size, size);
 tex.wrapS = tex.wrapT = T.RepeatWrapping;
 tex.magFilter = T.LinearFilter;
 tex.minFilter = T.LinearMipmapLinearFilter;
 tex.generateMipmaps = true;
 tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
 tex.needsUpdate = true;
 return tex;
}

export function landscape(view) {
 const renderer = new T.WebGLRenderer({antialias: true, logarithmicDepthBuffer: true});
 let maxRatio = Math.min(devicePixelRatio, 1.6);
 // Never drop below native resolution on 1x screens; on Retina stay at 1.2x or more.
 let minRatio = Math.min(maxRatio, Math.max(1, maxRatio * .75));
 let pixelRatio = maxRatio;
 renderer.setPixelRatio(pixelRatio);
 // Adaptive resolution: drop render scale when frames run long, recover when there is headroom.
 let frameAvg = 16.7, lastFrame = 0, slowFor = 0, fastFor = 0, shadowTick = 0;
 function adapt(now) {
  const ms = lastFrame ? Math.min(100, now - lastFrame) : 16.7; lastFrame = now;
  if (document.hidden || ms > 90) return;
  frameAvg += (ms - frameAvg) * .08;
  if (frameAvg > 24) { slowFor += ms; fastFor = 0; } else if (frameAvg < 15) { fastFor += ms; slowFor = 0; } else { slowFor = fastFor = 0; }
  if (slowFor > 2000 && pixelRatio > minRatio) { pixelRatio = Math.max(minRatio, pixelRatio - .1); renderer.setPixelRatio(pixelRatio); slowFor = 0; }
  if (fastFor > 2500 && pixelRatio < maxRatio) { pixelRatio = Math.min(maxRatio, pixelRatio + .1); renderer.setPixelRatio(pixelRatio); fastFor = 0; }
 }
 renderer.toneMapping = T.ACESFilmicToneMapping;
 renderer.toneMappingExposure = .42;
 renderer.shadowMap.enabled = true;
 renderer.shadowMap.autoUpdate = false; // refreshed every other frame in draw()
 renderer.shadowMap.type = T.PCFSoftShadowMap;
 view.prepend(renderer.domElement);

 const hazeColor = new T.Color(0xa3c6e2);
 const scene = new T.Scene();
 scene.background = hazeColor;
 scene.fog = new T.FogExp2(hazeColor, .0035);

 const camera = new T.PerspectiveCamera(42, 1, .15, 60000);
 camera.position.set(40, 20, 52);
 // Pan is off and the target is fixed: the bridge is always in the centre of the view.
 camera.layers.enable(1); // land (see terrain.js)
 const controls = new OrbitControls(camera, renderer.domElement);
 controls.target.set(0, 5, 0);
 controls.enablePan = false;
 controls.enableDamping = true;
 controls.minDistance = MIN_DIST;
 controls.maxDistance = MAX_DIST;
 controls.zoomSpeed = 2.4;
 controls.maxPolarAngle = Math.PI * .478;

 // Sun: high, warm, behind the default camera so the white steel is fully lit.
 const skySun = new T.Vector3(.45, .6, .66).normalize();
 const sky = new Sky();
 sky.scale.setScalar(45000); // used only to light the scene (environment map)
 const su = sky.material.uniforms;
 su.sunPosition.value.copy(skySun);
 su.turbidity.value = .6;
 su.rayleigh.value = 3;
 su.mieCoefficient.value = .0015;
 su.mieDirectionalG.value = .85;
 const pmrem = new T.PMREMGenerator(renderer);
 scene.environment = pmrem.fromScene(sky).texture;
 scene.environmentIntensity = .25;
 pmrem.dispose();

// Visible sky: clear photographic gradient, deep blue at the zenith, pale haze at the horizon.
 const domeGeo = new T.SphereGeometry(30000, 48, 24), domeCol = [], zen = new T.Color(0x2a67b4), mid = new T.Color(0x5d9ad0), hor = hazeColor.clone();
 const pos = domeGeo.attributes.position;
 for (let i = 0; i < pos.count; i++) {
  const h = Math.max(0, pos.getY(i) / 30000), c = h < .22 ? hor.clone().lerp(mid, h / .22) : mid.clone().lerp(zen, Math.min(1, (h - .22) / .6));
  domeCol.push(c.r, c.g, c.b);
 }
 domeGeo.setAttribute('color', new T.Float32BufferAttribute(domeCol, 3));
 const dome = new T.Mesh(domeGeo, new T.MeshBasicMaterial({vertexColors: true, side: T.BackSide, fog: false, toneMapped: false, depthWrite: false}));
 dome.renderOrder = -1;
 scene.add(dome);

  const ambient=new T.HemisphereLight(0xdcebff,0x6f8f9c,.55);scene.add(ambient);
 const sun = new T.DirectionalLight(0xfff0dc, 3);
 sun.position.copy(skySun).multiplyScalar(70);
 sun.castShadow = true;
 sun.shadow.mapSize.set(2048, 2048);
 const sc = sun.shadow.camera;
 sc.left = -68; sc.right = 68; sc.top = 34; sc.bottom = -34; sc.near = 5; sc.far = 190;
 sun.shadow.bias = -.0004;
 sun.shadow.normalBias = .06;
 scene.add(sun);

 let seed = 39;
 const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;

 const concrete = concreteTexture();
 const palette = {
  white: {color: 0xf6f7f4, roughness: .38, metalness: .08},
  shade: {color: 0xcdd4d8, roughness: .45, metalness: .1},
  line: {color: 0xfbf8ee, roughness: .6},
  asphalt: {color: 0x3a3c40, roughness: .93},
  railbed: {color: 0x6f7377, roughness: .9},
  concrete: {color: 0xffffff, roughness: .96, map: concrete},
  concreteDark: {color: 0xd4d0c8, roughness: .98, map: concrete},
  steel: {color: 0x8c9296, roughness: .5, metalness: .7},
  sleeper: {color: 0x5b5651, roughness: .95},
  fender: {color: 0xe9e7e0, roughness: .85, map: concrete},
  lamp: {color: 0xdfe4e6, roughness: .4, metalness: .4}
 };
 const scenery = new Map(), steel = new Map(), pavement = new Map();
 let parts = scenery;
 const Q = new T.Quaternion(), ONE = new T.Vector3(1, 1, 1);
 function solid(geo, key, x, y, z, q) {
  geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), q || Q, ONE));
  if (!parts.has(key)) parts.set(key, []);
  parts.get(key).push(geo.index ? geo.toNonIndexed() : geo);
 }
 const box = (c, x, y, z, w, h, d) => solid(new T.BoxGeometry(w, h, d), c, x, y, z);
 const UP = new T.Vector3(0, 1, 0);
 function beam(c, a, b, w) { // round steel tube between two points
  const dir = new T.Vector3(...b).sub(new T.Vector3(...a));
  solid(new T.CylinderGeometry(w / 2, w / 2, dir.length(), 7), c, ...a.map((v, i) => (v + b[i]) / 2), new T.Quaternion().setFromUnitVectors(UP, dir.normalize()));
 }
 function column(c, x, y, z, wTop, wBot, h, d) { // tapered square pier column
  const g = new T.CylinderGeometry(wTop * .7071, wBot * .7071, h, 4);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, d / wTop);
  solid(g, c, x, y, z);
 }
 const piers = [-48, -40, -32, -24, -18, -12, 12, 18, 24, 32, 40, 48];

 const sideDecks = [new Map(), new Map()];
 // --- road deck ---
 for(const [left,right,collection] of [[-55,-18,scenery],[-18,-12,sideDecks[0]],[-12,12,pavement],[12,18,sideDecks[1]],[18,55,scenery]]){
  parts=collection;
  const mid=(left+right)/2,w=right-left;
  box('asphalt',mid,2.9,0,w,.52,4.8);
  box('shade',mid,2.55,0,w,.22,4.9);
  for(let x=left+1;x<right-.65;x+=2.8)box('line',x,3.17,0,1.3,.015,.08);
  for(const side of [-1,1]){
   box('line',mid,3.17,side*1.95,w,.015,.06);
   for(const y of [3.38,3.58])box('shade',mid,y,side*2.35,w,.08,.08);
   for(let x=left+1;x<right;x+=2)box('white',x,3.38,side*2.35,.08,.55,.08);
  }
 }
 parts=scenery;
 // lamp posts along the approaches and between arch spans
 for (let x = -54; x <= 54; x += 9) for (const z of [-2.3, 2.3]) {
  if (Math.abs(x) < 13) continue;
  beam('lamp', [x, 3.2, z], [x, 6.2, z], .1);
  beam('lamp', [x, 6.2, z], [x, 6.35, z - Math.sign(z) * .55], .07);
 }
 // piers: two tapered columns, cap, footing and round ice-breaker fenders
 for (const x of piers) {
  for (const z of [-1.4, 1.4]) column('concrete', x, 1.35, z, .85, 1.2, 2.9, 1.4);
  box('concreteDark', x, 2.5, 0, 1.5, .4, 5.4);
  box('concrete', x, .08, 0, 2.5, .8, 5.8);
  for (const z of [-3.1, 3.1]) solid(new T.CylinderGeometry(.55, .55, .8, 14), 'fender', x, .06, z);
 }
 for (const x of [-12, 12]) for (const z of [-3.5, 3.5]) solid(new T.CylinderGeometry(.8, .8, .9, 18), 'fender', x + (x < 0 ? -1.2 : 1.2), .06, z);

 // --- arch (steel) ---
 parts = steel;
 const arch = x => 3.25 + 7.3 * (1 - (x / 12) ** 2);
 for (let x = -12; x < 12; x += 1.5) {
  for (const z of [-2.2, 2.2]) {
   const x2 = x + 1.5;
   beam('white', [x, arch(x), z], [x2, arch(x2), z], .42);
   beam('shade', [x, arch(x) - .65, z], [x2, arch(x2) - .65, z], .2);
   beam('white', [x, 3.2, z], [x, arch(x) - .65, z], .1); // hanger
   beam('white', [x, arch(x) - .65, z], [x2, arch(x2), z], .13);
   beam('white', [x, arch(x), z], [x2, arch(x2) - .65, z], .1);
  }
  beam('white', [x, arch(x), -2.2], [x, arch(x), 2.2], .22);
  beam('shade', [x, arch(x), -2.2], [x + 1.5, arch(x + 1.5), 2.2], .13);
 }
 for (const z of [-2.2, 2.2]) {
  box('white', 0, 3.1, z, 24, .42, .3); // tie girder
  for (const x of [-12, 12]) box('white', x, 3.7, z, 1.1, 1.4, .8);
 }

 // --- second (railway) deck ---
 parts = scenery;
 box('railbed', 0, 2.85, -6, 110, .52, 3.6);
 box('shade', 0, 2.52, -6, 110, .22, 3.7);
 for (const z of [-6.62, -5.38]) box('steel', 0, 3.18, z, 110, .13, .1);
 for (let x = -54; x < 55; x += .65) box('sleeper', x, 3.12, -6, .15, .09, 1.65);
 for (const x of piers) {
  for (const z of [-6.9, -5.1]) column('concrete', x, 1.3, z, .8, 1.1, 2.9, 1.1);
  box('concreteDark', x, 2.45, -6, 1.4, .4, 4.1);
  box('concrete', x, .08, -6, 2.4, .8, 4.6);
 }

 // --- viaduct: low road and rail spans from the arch section out to the far shores (instanced) ---
 const SPANS = 20, L = (LANDFALL - 55) / SPANS;
 const deckTop = x => T.MathUtils.lerp(3.16, LANDFALL_Y, T.MathUtils.smoothstep(Math.abs(x), 55, LANDFALL));
 const module = build => { const m = new Map(); parts = m; build(); parts = scenery; return m; };
 const spanParts = module(() => { // one span, deck top at y = 0
  box('asphalt', 0, -.26, 0, L, .52, 4.8);
  box('shade', 0, -.61, 0, L, .22, 4.9);
  for (let x = -L / 2 + .7; x < L / 2; x += 2.8) box('line', x, .01, 0, 1.3, .015, .08);
  for (const z of [-1.95, 1.95]) box('line', 0, .01, z, L, .015, .06);
  for (const z of [-2.35, 2.35]) {
   box('shade', 0, .42, z, L, .1, .1);
   box('shade', 0, .22, z, L, .05, .05);
   for (let x = -L / 2; x < L / 2; x += 2) box('white', x, .22, z, .08, .55, .08);
   beam('lamp', [0, .04, z], [0, 2.6, z], .1);
   beam('lamp', [0, 2.6, z], [0, 2.72, z - Math.sign(z) * .55], .07);
  }
  box('railbed', 0, -.31, -6, L, .52, 3.6);
  box('shade', 0, -.64, -6, L, .22, 3.7);
  for (const z of [-6.62, -5.38]) box('steel', 0, .02, z, L, .13, .1);
  for (let x = -L / 2 + .3; x < L / 2; x += .65) box('sleeper', x, -.04, -6, .15, .09, 1.65);
 });
 const columnParts = module(() => { // unit-height columns, scaled per pier
  for (const z of [-1.4, 1.4]) column('concrete', 0, .5, z, .85, 1, 1, 1.4);
  for (const z of [-6.9, -5.1]) column('concrete', 0, .5, z, .8, .95, 1, 1.1);
 });
 const capParts = module(() => {
  box('concreteDark', 0, -.9, 0, 1.5, .4, 5.4);
  box('concreteDark', 0, -.95, -6, 1.4, .4, 4.1);
 });
 const footParts = module(() => {
  box('concrete', 0, .08, 0, 2.3, .8, 5.6);
  box('concrete', 0, .08, -6, 2.2, .8, 4.4);
  for (const z of [-3, 3, -8.3]) solid(new T.CylinderGeometry(.5, .5, .8, 12), 'fender', 0, .06, z);
 });
 const spanM = [], colM = [], capM = [], footM = [], ZR = new T.Vector3(0, 0, 1);
 for (const side of [-1, 1]) for (let k = 0; k < SPANS; k++) {
  const xc = side * (55 + L * (k + .5)), xp = side * (55 + L * (k + 1)), yp = deckTop(xp);
  const tilt = Math.atan2(deckTop(xc + L / 2) - deckTop(xc - L / 2), L);
  spanM.push(new T.Matrix4().compose(new T.Vector3(xc, deckTop(xc), 0), new T.Quaternion().setFromAxisAngle(ZR, tilt), ONE));
  colM.push(new T.Matrix4().compose(new T.Vector3(xp, -.5, 0), Q, new T.Vector3(1, yp - .6, 1)));
  capM.push(new T.Matrix4().makeTranslation(xp, yp, 0));
  footM.push(new T.Matrix4().makeTranslation(xp, 0, 0));
 }
 const holeCanvas=document.createElement('canvas');holeCanvas.width=1024;holeCanvas.height=64;
 const holeCtx=holeCanvas.getContext('2d'),holeMap=new T.CanvasTexture(holeCanvas);
 function setDeckHoles(sites){
  for (const deck of looseDecks) deck.since = sites.find(s => s.fallenSide === deck.side)?.fallenAt ?? null;
  holeCtx.clearRect(0,0,1024,64);
  holeCtx.fillStyle='white';
  for(const site of sites){
   if (site.fallenSide) continue;
   holeCtx.beginPath();
   for(let i=0;i<18;i++){
    const a=i*Math.PI/9,r=1+.13*Math.sin(i*7.2);
    const x=(site.point.x+56+1.45*r*Math.cos(a))*1024/112;
    const y=(3-site.point.z-.82*r*Math.sin(a))*64/6;
    if(i===0)holeCtx.moveTo(x,y);else holeCtx.lineTo(x,y);
   }
   holeCtx.closePath();holeCtx.fill();
  }
  holeMap.needsUpdate=true;
 }
 const mats = {}, material = key => (mats[key] ??= new T.MeshStandardMaterial(palette[key]));
 for (const [partsMap, list] of [[spanParts, spanM], [columnParts, colM], [capParts, capM], [footParts, footM]]) {
  for (const [key, geos] of partsMap) {
   const m = new T.InstancedMesh(mergeGeometries(geos), material(key), list.length);
   list.forEach((mt, i) => m.setMatrixAt(i, mt));
   m.computeBoundingSphere();
   m.castShadow = m.receiveShadow = true;
   scene.add(m);
   geos.forEach(g => g.dispose());
  }
 }

 const sceneryMeshes = [];
 for (const [collection, parent] of [[scenery, scene], [steel, null], [pavement,null], ...sideDecks.map(parts => [parts,null])]) {
  for (const [key, geos] of collection) {
   const m = new T.Mesh(mergeGeometries(geos), material(key));
   m.castShadow = m.receiveShadow = true;
   if (collection === scenery) sceneryMeshes.push(m);
   (parent || (collection.group ??= new T.Group())).add(m);
   geos.forEach(g => g.dispose());
  }
 }
 const looseDecks = sideDecks.map((parts, i) => {
  const edge = i === 0 ? -18 : 18, pivot = new T.Group();
  pivot.position.set(edge, 3.16, 0);
  parts.group.position.set(-edge, -3.16, 0);
  pivot.add(parts.group); scene.add(pivot);
  return {pivot, side: i === 0 ? -1 : 1, since: null};
 });
 const span = steel.group;
 scene.add(span);
 const railway = span.clone();
 railway.scale.set(.98, 1.05, .78);
 railway.position.z = -6;
 scene.add(railway);
 const falling=new T.Group();scene.add(falling);falling.add(span,pavement.group);

 const land = buildLand(scene);

 // --- water ---
 // dense grid around the strait so storm swells can displace it; flat skirts out to the horizon
 const SEA = 320, seaParts = [new T.PlaneGeometry(SEA, SEA, 192, 192)], FAR = 60000, half = (FAR - SEA) / 4 + SEA / 2;
 for (const [x, y, w, h] of [[0, half, FAR, (FAR - SEA) / 2], [0, -half, FAR, (FAR - SEA) / 2], [half, 0, (FAR - SEA) / 2, SEA], [-half, 0, (FAR - SEA) / 2, SEA]])
  seaParts.push(new T.PlaneGeometry(w, h).translate(x, y, 0));
 const water = new Water(mergeGeometries(seaParts), {
  textureWidth: 512, textureHeight: 512,
  waterNormals: waterNormals(renderer),
  sunDirection: skySun, sunColor: 0xb9a98a,
  waterColor: 0x2aa3ad, distortionScale: 2.4, fog: true
 });
 water.rotation.x = -Math.PI / 2;
 water.material.uniforms.size.value = 14;
 // Storm: swell displacement on the near grid, whitecaps on crests and in wind streaks.
 water.material.uniforms.storm = {value: 0};
 water.material.uniforms.ring = {value: new T.Vector4(0, 0, -1, 0)}; // x, z, age (s, <0 = off), amplitude
 const SWELL = `
  uniform float storm; uniform vec4 ring; varying float vCrest; varying float vRing; varying float vRoll;
  // the 'ninth wave': long peaked rollers marching across the strait
  float roller(vec2 p, float t) { float s = .5 + .5 * sin(dot(p, vec2(.078, .208)) - t * .8); return s * s * s * s; }
  float spitD(vec2 p) {
   float ax = abs(p.x); vec2 d = vec2((ax - 46.) / 33., (p.y - 7.) / 17.); float r = max(length(d), 1e-4);
   return min((1. - r) * r / length(d / vec2(33., 17.)), ax - 15.5);
  }
  float swell(vec2 p, float t) {
   return sin(dot(p, vec2(.21, .13)) + t * 1.3) * .5 + sin(dot(p, vec2(-.11, .27)) + t * 1.7) * .32 + sin(dot(p, vec2(.37, -.19)) + t * 2.3) * .18;
  }`;
 water.material.vertexShader = water.material.vertexShader
  .replace('void main() {', SWELL + '\nvoid main() {\n vec3 pos = position;\n float fade = 1. - smoothstep(110., 155., length(pos.xy));\n float h = swell(vec2(pos.x, -pos.y), time * 3.) * fade;\n float sd = spitD(vec2(pos.x, -pos.y));\n float shore = (1. + .45 * smoothstep(-10., -1.5, sd)) * (1. - smoothstep(-1.8, .6, sd));\n float r = roller(vec2(pos.x, -pos.y), time * 3.) * fade * shore; vRoll = r;\n pos.z += storm * (.55 * h * shore + 1.55 * r - .3 * fade); vCrest = h;\n vRing = 0.;\n if (ring.z >= 0.) { float rr = ring.z * 9., dd = length(vec2(pos.x, -pos.y) - ring.xy); vRing = exp(-pow((dd - rr) / (2.2 + ring.z * .5), 2.)) * exp(-ring.z * .22) * fade; pos.z += ring.w * vRing; }')
  .replace('mirrorCoord = modelMatrix * vec4( position, 1.0 );', 'mirrorCoord = modelMatrix * vec4( pos, 1.0 );')
  .replace('vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );', 'vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );');
 water.material.fragmentShader = water.material.fragmentShader
  .replace('void main() {', `uniform float storm; varying float vCrest; varying float vRing; varying float vRoll;
   float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
   float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash21(i), hash21(i + vec2(1., 0.)), f.x), mix(hash21(i + vec2(0., 1.)), hash21(i + 1.), f.x), f.y);
   }
   // sandy spits beside the arch (same ellipse as terrain.js, without the noise)
   float spit(vec2 p) {
    float ax = abs(p.x); vec2 d = vec2((ax - 46.) / 33., (p.y - 7.) / 17.); float r = max(length(d), 1e-4);
    return min((1. - r) * r / length(d / vec2(33., 17.)), ax - 15.5);
   }
   void main() {`)
  .replace('vec3 outgoingLight = albedo;', `vec3 outgoingLight = mix(albedo, waterColor * .5 * (1. + .5 * theta), storm * .45) * (1. + storm * .3 * vCrest);
   if (storm > .01) {
    // groups of whitecaps ride the swell crests; each cap is a small, sharp-edged break in fine ripples
    vec2 q = worldPosition.xz;
    float broad = vnoise(q * .07 + vec2(time * .6, time * .25));
    float fine = vnoise(q * vec2(.8, 1.9) + vec2(time * 2.2, time * .9)) * .65 + vnoise(q * vec2(2.2, 4.4) - vec2(time * 1.4, 0.)) * .35;
    float group = smoothstep(.3, .65, broad * .75 + vCrest * .25 + .12);
    float cap = smoothstep(.7, .77, fine + .06 * vCrest);
    float foam = storm * group * cap * (1. - smoothstep(160., 700., distance));
    vec3 foamColor = vec3(.84, .88, .9) * clamp(length(sunColor) * .95, .14, 1.);
    outgoingLight = mix(outgoingLight, foamColor, foam * .8);
   }
   if (storm > .01) {
    // Aivazovsky: light shining through the glassy green face of each roller, foam torn off its crest,
    // and surf breaking right over the low spits
    float face = smoothstep(.25, .7, vRoll) * (1. - smoothstep(.82, .97, vRoll));
    float light = clamp(length(sunColor) * 1.3, .25, 1.);
    outgoingLight = mix(outgoingLight, vec3(.2, .52, .42) * light * (.8 + .4 * vnoise(worldPosition.xz * .3 + time)), storm * face * .55);
    float crest = smoothstep(.84, .97, vRoll) * smoothstep(.35, .65, vnoise(worldPosition.xz * vec2(.9, 2.2) + vec2(time * 2., 0.)));
    // breakers: a churned white band where the rollers trip on the shallows in front of the beach
    float sd = spit(worldPosition.xz);
    float raw = .5 + .5 * sin(dot(worldPosition.xz, vec2(.078, .208)) - time * 3. * .8); raw = raw * raw * raw * raw;
    float surge = smoothstep(-5., -1.2, sd) * (1. - smoothstep(-.6, .4, sd)) * smoothstep(.45, .85, raw) * (.5 + .5 * vnoise(worldPosition.xz * 1.8 + time * 1.5));
    outgoingLight = mix(outgoingLight, vec3(.9, .93, .9) * light, storm * max(crest * .9, surge * .85));
   }
   if (vRing > .02) {
    float spray = smoothstep(.25, .9, vRing) * smoothstep(.3, .7, vnoise(worldPosition.xz * 1.4 + time));
    outgoingLight = mix(outgoingLight * (1. + .35 * vRing), vec3(.86, .9, .92) * clamp(length(sunColor) * 1.1, .2, 1.), spray * .75);
   }`);
 if (!water.material.vertexShader.includes('vCrest = h') || !water.material.fragmentShader.includes('foamColor')) console.warn('storm water patch did not apply');
 scene.add(water);

 // --- life on the water: red buoys and a small yellow sailboat ---
 for(const key of ['asphalt','shade','line']){
  material(key).onBeforeCompile=shader=>{
   shader.uniforms.holeMap={value:holeMap};
   shader.vertexShader='varying vec3 sitePos;\n'+shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    vec4 siteVertex=vec4(transformed,1.);
    #ifdef USE_INSTANCING
     siteVertex=instanceMatrix*siteVertex;
    #endif
    sitePos=(modelMatrix*siteVertex).xyz;`);
   shader.fragmentShader='varying vec3 sitePos; uniform sampler2D holeMap;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif(abs(sitePos.x)<56. && abs(sitePos.z)<3. && sitePos.y<3.25 && texture2D(holeMap,(sitePos.xz+vec2(56.,3.))/vec2(112.,6.)).a>.5)discard;');
  };
 }
 const buoyGeo = new T.CylinderGeometry(.16, .22, .45, 8), buoyMat = new T.MeshStandardMaterial({color: 0xc8231c, roughness: .5});
 for (let i = 0; i < 14; i++) {
  const b = new T.Mesh(buoyGeo, buoyMat);
  b.position.set((rand() - .5) * 24, .05, (rand() < .5 ? -1 : 1) * (14 + rand() * 40));
  scene.add(b);
 }
 const drawArchSmoke=archSmoke(scene);
 const boat = new T.Group();
 const hull = new T.Mesh(new T.BoxGeometry(1.8, .35, .6), new T.MeshStandardMaterial({color: 0xf2b21a, roughness: .5}));
 const sail = new T.Mesh(new T.PlaneGeometry(.9, 1.6), new T.MeshStandardMaterial({color: 0xfafafa, side: T.DoubleSide, roughness: .8}));
 sail.position.set(.1, 1.1, 0);
 boat.add(hull, sail);
 boat.position.set(19, .1, 26);
 boat.rotation.y = .5;
 scene.add(boat);
 boat.traverse(o => { if (o.isMesh) o.castShadow = true; });

 let framed = false;
 new ResizeObserver(() => {
  renderer.setSize(view.clientWidth, view.clientHeight, false);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  if (!framed) { // first layout: oblique view along the bridge, like the reference aerial photo
   framed = true;
   const dir = new T.Vector3(.55, .15, .8).normalize();
   camera.position.copy(controls.target).addScaledVector(dir, Math.max(105, 145 / camera.aspect));
  }
 }).observe(view);

 function zoom(f) {
  const off = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).add(off.setLength(T.MathUtils.clamp(off.length() * f, MIN_DIST, MAX_DIST)));
 }
 const ray = new T.Raycaster();
 function aim(event) {
  const r = renderer.domElement.getBoundingClientRect();
  const x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
  ray.setFromCamera(new T.Vector2(2*x-1,1-2*y),camera);
 }
 function pick(event, groups) {
  aim(event);
  let hit = ray.intersectObjects(groups, true)[0]?.object;
  while (hit && !groups.includes(hit)) hit = hit.parent;
  return hit;
 }
 const daySun=new T.Color(0xfff0dc),sunset=new T.Color(0xffa56d),nightHaze=new T.Color(0x162a49),nightWater=new T.Color(0x163d51),dayWater=new T.Color(0x2aa3ad);
 let daylight = 1;
 // weather: 0 = calm, 1 = full storm; eases toward the target so the sea builds up and settles
 let wet = 0, storm = 0, stormTarget = 0, waveClock = 0, lastDraw = 0;
 const stormWater = new T.Color(0x2b564c), stormHaze = new T.Color(0x8b9182);
 const rollerAt = (x, z, t) => { const s = .5 + .5 * Math.sin(x * .078 + z * .208 - t * .8); return s * s * s * s; };
 const swellAt = (x, z, t) => Math.sin(x * .21 + z * .13 + t * 1.3) * .5 + Math.sin(x * -.11 + z * .27 + t * 1.7) * .32 + Math.sin(x * .37 + z * -.19 + t * 2.3) * .18;
 let railFall = -1;
 let collapseAge = 0, splashed = false, ringStart = null, onCollapseSplash = null;
 let collapse = false, prevDist = camera.position.distanceTo(controls.target);
 // Bullet-time: fly in to an impact, sweep around it in slow motion, fly back.
 let cine = null, cineLast = 0, cineCooldown = 0, pose = null, poseSaved = null;
 const sight = new T.Raycaster(), sightTo = new T.Vector3(), sightDir = new T.Vector3();
 const occluders = [falling, railway, ...looseDecks.map(d => d.pivot), ...sceneryMeshes];
 function blocked(point, ang, r, h) {
  sightTo.set(point.x + Math.cos(ang) * r, Math.max(.8, point.y + h), point.z + Math.sin(ang) * r);
  sightDir.subVectors(sightTo, point); const dist = sightDir.length(); sightDir.divideScalar(dist);
  // skip the subject's own surroundings, and look a bit past the lens so the camera never sits inside a beam
  sight.set(point, sightDir); sight.near = Math.min(1.4, dist * .25); sight.far = dist + .8;
  return sight.intersectObjects(occluders, true).length > 0;
 }
 const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
 const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
 function endCine() {
  if (!cine) return;
  camera.position.copy(cine.fromPos); controls.target.copy(cine.fromTarget);
  if (camera.fov !== cine.baseFov) { camera.fov = cine.baseFov; camera.updateProjectionMatrix(); }
  controls.enabled = true; controls.update(); prevDist = camera.position.distanceTo(controls.target);
  view.classList.remove('cinematic'); cine = null;
 }
 renderer.domElement.addEventListener('pointerdown', () => { if (cine && cine.age > .25) endCine(); });
 function cineStep() {
  const now = performance.now(), dt = Math.min(.05, (now - (cineLast || now)) / 1000); cineLast = now;
  cineCooldown = Math.max(0, cineCooldown - dt);
  if (!cine) return false;
  const c = cine; c.age += dt;
  if (c.follow) c.point.copy(c.follow.position).add(c.lift);
  // bomb shots wait for the blast; give up if it never comes
  if (c.bomb && c.boomAt == null && c.age > 7) { c.boomAt = c.age; c.end = c.age + .7; }
  if (c.boomAt != null && c.end == null && c.age - c.boomAt > 12) c.end = c.age + .8;
  if (c.end != null && c.age >= c.end) { endCine(); return false; }
  const end = c.end ?? c.age + 3, inDur = c.bomb ? .7 : .2 * c.duration, outDur = c.bomb ? .8 : .2 * c.duration;
  const prog = c.bomb ? c.age / 6 : ease(T.MathUtils.clamp(c.age / c.duration, 0, 1));
  // Tall phone screens have a narrow horizontal view: widen the lens and back off a little.
  const portrait = T.MathUtils.clamp((1.25 - camera.aspect) / .8, 0, 1);
  const ang0 = c.angle + c.sweep * prog, r0 = c.panorama ? c.radius / Math.min(1,camera.aspect) : c.radius * (1 + .3 * portrait) * (1 - .2 * Math.sin(Math.PI * Math.min(1, prog)));
  const h0 = c.height + 1.1 * Math.sin(Math.PI * Math.min(1, prog));
  // Keep the arch, pylons and decks out of the frame: probe the line of sight a few times a second
  // and glide the orbit around (or over) whatever blocks it.
  if (!c.panorama && c.age >= c.probeAt) {
   c.probeAt = c.age + .12;
   if (blocked(c.point, ang0 + c.dodge.a, r0 * c.dodge.r, h0 + c.dodge.h)) {
    const tries = [[.4, 0, 1], [-.4, 0, 1], [.8, 0, 1], [-.8, 0, 1], [0, 3, 1], [.4, 3, 1], [-.4, 3, 1], [1.2, 0, 1], [-1.2, 0, 1], [0, 2, .7], [0, 6, 1], [1.6, 4, 1], [-1.6, 4, 1]];
    for (const [a, h, k] of tries) {
     const da = c.dodge.a + a * (c.sweep > 0 ? 1 : -1), dh = Math.min(7, c.dodge.h + h), dr = k;
     if (!blocked(c.point, ang0 + da, r0 * dr, h0 + dh)) { c.goal = {a: da, h: dh, r: dr}; break; }
    }
   } else if (c.goal.a || c.goal.h || c.goal.r !== 1) {
    // drift back toward the planned orbit once the clean line no longer needs the detour
    const back = {a: c.goal.a * .85, h: c.goal.h * .85, r: 1 + (c.goal.r - 1) * .85};
    if (!blocked(c.point, ang0 + back.a, r0 * back.r, h0 + back.h)) c.goal = back;
   }
  }
  const k = 1 - Math.exp(-dt * 3.2); // soft camera glide, never a jump cut
  c.dodge.a += (c.goal.a - c.dodge.a) * k; c.dodge.h += (c.goal.h - c.dodge.h) * k; c.dodge.r += (c.goal.r - c.dodge.r) * k;
  const ang = ang0 + c.dodge.a, r = r0 * c.dodge.r;
  const shot = new T.Vector3(c.point.x + Math.cos(ang) * r, c.point.y + h0 + c.dodge.h, c.point.z + Math.sin(ang) * r);
  if (shot.y < .8) shot.y = .8;
  let w = ease(Math.min(1, c.age / inDur));
  if (c.end != null && c.age > end - outDur) w = Math.min(w, 1 - ease((c.age - (end - outDur)) / outDur));
  const fov = c.baseFov + 16 * portrait * w;
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.position.copy(c.fromPos).lerp(shot, w);
  controls.target.copy(c.fromTarget).lerp(c.point, w);
  const since = c.boomAt != null ? c.age - c.boomAt : c.bomb ? 9 : c.age;
  const shake = Math.max(0, .55 - since) * (c.bomb ? .22 : .12);
  camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake;
  camera.lookAt(controls.target);
  return true;
 }
 return {
  scene, zoom, pick, deckTop, setDeckHoles, camera,
  // Optional external camera (coalition FPV drones). pose = {position, target, fov, roll}; null restores the orbit camera.
  setPose(p) {
   if (p) {
    if (!pose) { poseSaved = {pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov}; if (cine) endCine(); controls.enabled = false; }
    pose = p;
   } else if (pose) {
    pose = null; camera.position.copy(poseSaved.pos); controls.target.copy(poseSaved.target); camera.up.copy(UP); camera.fov = poseSaved.fov; camera.updateProjectionMatrix();
    controls.enabled = true; controls.update(); prevDist = camera.position.distanceTo(controls.target);
   }
  },
  // Render once and return the canvas as a data URL (for the share card).
  snapshot(type = 'image/jpeg', quality = .9) { renderer.render(scene, camera); return renderer.domElement.toDataURL(type, quality); },
  setMaxPixelRatio(r) { maxRatio = Math.min(maxRatio, r); minRatio = Math.min(maxRatio, minRatio); pixelRatio = Math.min(pixelRatio, maxRatio); renderer.setPixelRatio(pixelRatio); },
  bridgeClearance(x,z) {
   if (Math.min(Math.abs(z), Math.abs(z + 6)) > 2.8) return 0;
   return Math.max(deckTop(x) + 2, arch(x) + .8);
  },
  cameraPosition:()=>camera.position.toArray(),
  heading:()=>controls.getAzimuthalAngle(),
  restoreCamera(p){camera.position.fromArray(p);controls.update();prevDist=camera.position.distanceTo(controls.target)},
  carryDown(objects){for(const m of objects)if(Math.abs(m.position.x)<12)falling.attach(m)},
  screenPoint(point){const p=point.clone().project(camera);
   if(Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1)return null;
   return {x:(1+p.x)*view.clientWidth/2,y:(1-p.y)*view.clientHeight/2};
  },
  onScreen(point){const p=point.clone().project(camera);return Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&Math.abs(p.z)<=1},
  waterPoint(event) { aim(event); return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3()); },
  cinematic(point, strength = 1, opts = {}) {
   if (cine || reduceMotion.matches || (cineCooldown > 0 && !opts.force && !opts.bomb)) return false;
   const fromPos = camera.position.clone(), fromTarget = controls.target.clone();
   const rel = fromPos.clone().sub(point);
   const duration = opts.duration ?? 2.4 + .8 * strength;
   cine = {point: point.clone(), age: 0, duration, end: opts.bomb ? null : duration, strength, fromPos, fromTarget,
    subject: opts.subject ?? opts.follow, deckShot: !!opts.deckShot, follow: opts.follow ?? null, lift: new T.Vector3(0, opts.lift ?? 0, 0), bomb: !!opts.bomb, boomAt: null,
    panorama: !!opts.panorama, angle: opts.panorama ? (rel.z < 0 ? -1 : 1) * 1.24 : Math.atan2(rel.z, rel.x) + (Math.random() - .5) * .6, sweep: (Math.random() < .5 ? -1 : 1) * (opts.sweep ?? (opts.bomb ? 1.5 : 1.6 + .6 * strength)),
    radius: opts.radius ?? 7 + 2.5 * strength, height: opts.height ?? 2.4 + 1.2 * strength,
    baseFov: camera.fov, probeAt: 0, dodge: {a: 0, h: 0, r: 1}, goal: {a: 0, h: 0, r: 1}};
   cineCooldown = 9; controls.enabled = false; view.classList.add('cinematic');
   return true;
  },
  // Detonation inside a bomb shot: freeze-frame, then a very slow release.
  cinematicBoom(point, opts = {}) {
   if (!cine || !cine.bomb || cine.boomAt != null || !opts.subject || cine.subject !== opts.subject) return false;
   if (point) cine.point.copy(point);
   cine.follow = opts.follow ?? null; cine.lift.set(0, 0, 0); cine.boomAt = cine.age;
   cine.end = opts.hold ? null : cine.age + 4.6;
   return true;
  },
  // Abort a pre-roll whose subject died before the big moment (e.g. a baby shot down en route).
  cinematicCancel(obj) {
   if (!cine || !cine.bomb || cine.boomAt != null || cine.subject !== obj) return false;
   cine.boomAt = cine.age - 10; cine.end = cine.age + .6; cine.follow = null; return true;
  },
  // Let a held shot (e.g. following a falling wreck) wind down.
  cinematicRelease(subject, extra = 1.4) { if (cine && cine.subject === subject && cine.end == null) cine.end = cine.age + extra; },
  timeScale() {
   if (!cine) return 1;
   const c = cine;
   if (c.bomb) {
    if (c.boomAt == null) return Math.max(.25, 1 - c.age * 1.2);            // approach: crawl toward the blast
    const s = c.age - c.boomAt;
    if (c.deckShot) return .18 + .82 * T.MathUtils.smoothstep(s, 3.5, 4.6);
    if (s < .35) return .006;                                              // near freeze-frame
    if (s < 3.3) return .006 + .06 * ((s - .35) / 2.95) ** 2;              // bullet-time release
    return Math.min(1, .066 + (s - 3.3) / 1.3);                          // back to real time
   }
   const t = c.age / c.duration;
   return t < .08 ? 1 - t / .08 * .85 : t > .82 ? .15 + .85 * (t - .82) / .18 : .15;
  },
  cinematicActive: () => !!cine,
  onCollapseSplash(fn) { onCollapseSplash = fn; },
  setStorm(on) { stormTarget = on ? 1 : 0; },
  stormLevel: () => storm,
  // surface height and tilt at a point, for floating things
  wave(x, z) {
   const fade = 1 - T.MathUtils.smoothstep(Math.hypot(x, z), 110, 155), t = waveClock * 3, k = storm * .55 * fade;
   const surface = (a, b) => .55 * swellAt(a, b, t) + 1.55 * rollerAt(a, b, t) - .3;
   const h = surface(x, z), e = .6, s = storm * fade;
   return {y: s * h, roll: s * (surface(x, z + e) - h) / e, pitch: s * (surface(x + e, z) - h) / e, crest: s * rollerAt(x, z, t)};
  },
  daylight: () => daylight,
  setRailHits(hits, instant = false) {
   railFall = hits < 3 ? -1 : instant ? 5 : Math.max(0,railFall);
   railway.scale.y = 1.05 - .035 * hits;
   if (railFall < 0) { railway.position.y = 0; railway.rotation.z = 0 }
  },
  setHits(hits, instant = false) {
   if (hits >= 3 && !collapse) { collapseAge = instant ? 30 : 0; splashed = instant; ringStart = null; }
   collapse = hits >= 3;
   if (!hits) { falling.position.y = 0; falling.rotation.z = 0; falling.rotation.x = 0; }
   span.scale.y = 1 - .035 * hits;
  },
  draw(gameTime=0,trafficTime=0,smoke=false,lightTime=gameTime) {
   for (const deck of looseDecks) {
    const drop = deck.since === null ? 0 : T.MathUtils.clamp((gameTime - deck.since) / 1.35, 0, 1);
    deck.pivot.rotation.z = deck.side * .59 * drop * drop;
    deck.pivot.position.y = 3.16 - .35 * drop;
   }
   const angle=2*Math.PI*lightTime/DAY_SECONDS,altitude=Math.cos(angle);
   const day=T.MathUtils.smoothstep(altitude,-.32,.6),dusk=1-Math.min(1,Math.abs(altitude)*3);daylight=day;
   sun.position.set(35*Math.cos(angle),13+40*Math.abs(altitude),46+20*Math.sin(angle));
   const nowMs = performance.now(), realDt = lastDraw ? Math.min(.1, (nowMs - lastDraw) / 1000) : 0; lastDraw = nowMs;
   storm += (stormTarget - storm) * (1 - Math.exp(-realDt * .35));
   waveClock += realDt * .35 * (1 + 1.6 * storm);
   sun.intensity=(.32+2.68*day)*(1-.45*storm);
   sun.color.setHex(0x9bbfff).lerp(daySun,day).lerp(sunset,dusk*.68);
   ambient.intensity=.34+.21*day;
   dome.material.color.setRGB(.07+.93*day,.12+.88*day,.27+.73*day).lerp(sunset,dusk*.28);
   scene.fog.color.copy(nightHaze).lerp(hazeColor,day).lerp(sunset,dusk*.3);
   scene.fog.color.lerp(stormHaze, storm * .35 * (.4 + .6 * day));
   water.material.uniforms.waterColor.value.copy(nightWater).lerp(dayWater,day).lerp(stormWater, storm * .7);
   water.material.uniforms.storm.value = storm;
   water.material.uniforms.distortionScale.value = 2.4 + 4 * storm;
   water.material.uniforms.sunDirection.value.copy(sun.position).normalize();
   water.material.uniforms.sunColor.value.copy(sun.color).multiplyScalar(.38+.5*day);

   if (railFall >= 0) {
    railFall = Math.min(5,railFall + realDt);
    const drop = T.MathUtils.smoothstep(railFall,0,5);
    railway.position.y = -12 * drop; railway.rotation.z = .23 * drop;
   }
   if (collapse) {
    // sag and groan, then a long slow fall; the deck slaps the water and pushes out a ring wave
    collapseAge += realDt;
    const a = collapseAge, sag = T.MathUtils.smoothstep(a, 0, 1.1), fall = T.MathUtils.clamp((a - 1.1) / 4.2, 0, 1), f = fall * fall * (1.6 - .6 * fall);
    const shiver = a < 1.4 ? Math.sin(a * 60) * .012 * (1.4 - a) : 0;
    falling.position.y = -.35 * sag - 7.2 * f;
    falling.rotation.z = -.05 * sag - .27 * f + shiver;
    falling.rotation.x = .06 * f;
    if (!splashed && falling.position.y < -2.7) { splashed = true; ringStart = collapseAge; onCollapseSplash?.(); }
   }
   const ringU = water.material.uniforms.ring.value;
   if (ringStart != null && collapseAge - ringStart < 18) ringU.set(0, 0, collapseAge - ringStart, .9); else ringU.z = -1;
   const filming = pose ? false : cineStep();
   if (pose) { // external FPV / tripod camera: no orbit logic at all
    camera.position.copy(pose.position); camera.up.copy(UP); camera.lookAt(pose.target);
    if (pose.roll) camera.rotateZ(pose.roll);
    if (Math.abs(camera.fov - pose.fov) > .001) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
   }
   const dist = camera.position.distanceTo(pose ? pose.target : controls.target);
   // any zoom-out (buttons, wheel, trackpad pinch) also tilts the camera toward straight-down, like climbing to orbit
   if (!filming && !pose && dist > prevDist + .01 && dist > 120) {
    const off = camera.position.clone().sub(controls.target).normalize().lerp(UP, Math.min(.12, (dist - prevDist) / dist * 1.5)).normalize();
    camera.position.copy(controls.target).addScaledVector(off, dist);
   }
   if (!filming) prevDist = dist;
   // sea haze swallows the far ends of the viaduct; it thins out from high orbit so the whole sea is visible
   scene.fog.density = .0019 * Math.min(1, 140 / dist) ** 1.6 * (1 + .6 * storm);
   drawArchSmoke(gameTime,smoke,day,camera);
   const passage=trafficTime*.052;
   boat.position.x=2.4;
   boat.position.z=32*Math.cos(passage);
   boat.rotation.y=Math.sin(passage)>=0?Math.PI/2:-Math.PI/2;
   boat.position.y = .08 + Math.sin(performance.now() * .0012) * .04;
   boat.rotation.z = Math.sin(performance.now() * .0009) * .05;
   water.material.uniforms.time.value = waveClock;
   wet = T.MathUtils.clamp(wet + realDt * (storm > .35 ? .07 * storm : -.009), 0, 1);
   land.update(performance.now() * .001, storm, wet, waveClock * 3);
   if (!filming && !pose) controls.update();
   adapt(performance.now());
   renderer.shadowMap.needsUpdate = (shadowTick++ & 1) === 0 || !!cine;
   renderer.render(scene, camera);
  }
 };
}
