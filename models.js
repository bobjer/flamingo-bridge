import * as THREE from 'three';

const geometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  oval: new THREE.SphereGeometry(1, 10, 7),
  tube: new THREE.CylinderGeometry(1, 1, 1, 9),
  cone: new THREE.ConeGeometry(1, 1, 8)
};
const materials = new Map();
function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({color, roughness: .78, flatShading: true, side: THREE.DoubleSide}));
  return materials.get(color);
}
function add(parent, shape, color, x, y, z, a, b, c) {
  const mesh = new THREE.Mesh(geometry[shape] ?? shape, material(color));
  mesh.scale.set(a, b, c);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
const oval = (p, ...args) => add(p, 'oval', ...args);
const box = (p, ...args) => add(p, 'box', ...args);
function rod(p, color, start, end, radius, taper = false) {
  const axis = new THREE.Vector3(...end).sub(new THREE.Vector3(...start));
  const mesh = add(p, taper ? 'cone' : 'tube', color, 0, 0, 0, radius, axis.length(), radius);
  mesh.position.set(...start).addScaledVector(axis, .5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  return mesh;
}
function plate(points) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setIndex([0,1,2,0,2,3]);
  g.computeVertexNormals();
  return g;
}
const pink = 0xff709e, blush = 0xffb9bb, coral = 0xfd446e, ink = 0x283040;
const ivory = 0xffe3b9, gold = 0xffba4e, marine = 0x497b74, mint = 0xb0d4ab, skin = 0xffbd94;
const wingShape = plate([[.48,0,0],[-.58,0,0],[-1.15,.32,1.82],[.12,.31,1.18]]);
const wingTip = plate([[.12,.31,1.18],[-1.15,.32,1.82],[-1.48,.41,2.1],[-.44,.43,1.95]]);
const dorsal = plate([[-.36,0,0],[.37,0,0],[-.29,.61,0],[-.33,.19,0]]);
function flying(p, flamingo) {
  const bodyColor = flamingo ? pink : 0xfff0bc;
  oval(p, bodyColor, 0,0,0,.8,.29,.27);
  p.userData.wings = [-1,1].map(side => {
    const pivot = new THREE.Group();
    p.add(pivot);
    pivot.scale.z = side;
    add(pivot,wingShape,flamingo ? coral : 0xd4c7a8,0,0,0,1,1,1);
    add(pivot,wingTip,ink,0,0,0,1,1,1);
    return pivot;
  });
  if (flamingo) {
    rod(p,pink,[.42,.05,0],[1.14,.12,0],.12);
    rod(p,blush,[1.11,.12,0],[1.55,.54,0],.105);
    for (const s of [-1,1]) {
      rod(p,coral,[-.45,-.04,s*.08],[-1.59,-.25,s*.13],.037);
      rod(p,coral,[-1.58,-.25,s*.13],[-1.91,-.24,s*.16],.036,true);
    }
  }
  const x = flamingo ? 1.58 : .62, y = flamingo ? .5 : .13;
  oval(p,bodyColor,x,y,0,.24,.2,.18);
  rod(p,flamingo ? ivory : gold,[x+.12,y+.02,0],[x+.39,y-.04,0],.12);
  rod(p,ink,[x+.37,y-.035,0],[x+.4,y-.21,0],.115,true);
  for(const s of [-1,1]) oval(p,ink,x+.08,y+.075,s*.155,.035,.035,.025);
  if(!flamingo) p.scale.setScalar(.58);
}
function sam(p) {
  box(p,ink,0,.23,0,2.12,.36,1.1);
  box(p,marine,0,.5,0,1.9,.35,1.03);
  for(const s of [-1,0,1]) {
    const z = s*.32;
    rod(p,mint,[-.83,.72,z],[.65,1.35,z],.145);
    rod(p,coral,[.65,1.35,z],[.99,1.51,z],.147,true);
  }
}
function turret(p) {
  add(p,'tube',ink,0,.14,0,.82,.28,.82);
  add(p,'tube',mint,0,.4,0,.56,.29,.56);
  box(p,marine,0,.67,0,.95,.47,.84);
  for(const s of [-1,1]) rod(p,ink,[.28,.73,s*.22],[1.38,.91,s*.22],.096);
  oval(p,gold,.33,.86,0,.16,.16,.14);
}
function cruiser(p) {
  oval(p,ink,-.05,.17,0,2.57,.45,.72);
  oval(p,marine,-.05,.37,0,2.48,.29,.7);
  box(p,mint,-.18,.85,0,1.12,.63,.85);
  box(p,ivory,-.16,1.23,0,.83,.27,.76);
  box(p,ink,-.13,1.27,0,.69,.12,.78);
  rod(p,ink,[-.53,1.23,0],[-.53,2.05,0],.056);
  box(p,coral,-.74,1.89,0,.43,.23,.045);
  for(const x of [-1.38,1.25]) {
    box(p,marine,x,.69,0,.5,.32,.45);
    rod(p,ink,[x,.8,0],[x+.61,.93,0],.075);
  }
}
function dolphin(p) {
  oval(p,0x67acae,0,.46,0,1.1,.36,.35);
  oval(p,0xd1e4d7,.22,.38,0,.79,.22,.34);
  oval(p,0x67acae,.99,.45,0,.48,.145,.17);
  add(p,dorsal,marine,-.23,.7,0,1,1,1);
  for(const s of [-1,1]) {
    oval(p,marine,-1.05,.42,s*.27,.29,.075,.41).rotation.y=s*.43;
    oval(p,ink,.68,.58,s*.23,.055,.05,.045);
    oval(p,0x478a93,.17,.34,s*.38,.23,.07,.32).rotation.y=s*.56;
  }
  box(p,gold,-.24,.77,0,.35,.18,.49);
}
function baby(p) {
  const ring = add(p,'tube',0xffcf55,0,.21,0,.83,.25,.63);
  oval(p,coral,0,ring.position.y+.12,0,.82,.16,.63);
  oval(p,skin,.04,.63,0,.36,.47,.3);
  oval(p,skin,.16,1.17,0,.43,.42,.39);
  oval(p,gold,.06,1.54,0,.11,.12,.09);
  for(const s of [-1,1]) {
    oval(p,ink,.49,1.24,s*.17,.037,.043,.038);
    rod(p,skin,[.02,.85,s*.26],[.18,1.03,s*.53],.095);
  }
  oval(p,0x66d6be,.55,1.08,0,.085,.094,.12);
}
function truck(p) {
  box(p,ink,0,.38,0,2.32,.24,1.04);
  box(p,gold,.77,.81,0,.74,.84,1.02);
  box(p,0x65969c,.81,1,0,.72,.32,1.035);
  box(p,gold,.76,1.23,0,.82,.12,1.08);
  box(p,marine,-.47,.72,0,1.55,.55,1.12);
  for(const [x,y,z,r] of [[-.86,.96,.05,.38],[-.42,1.09,-.11,.44],[-.09,1,.08,.32],[-.5,1.34,-.06,.22]]) oval(p,0x764d35,x,y,z,r,r*.73,r);
  for(const s of [-1,1]) for(const x of [-.82,.78]) rod(p,ink,[x,.3,s*.45],[x,.3,s*.63],.28);
}
function neptune(p) {
  oval(p,0x67b5a2,0,.38,0,.65,.57,.56);
  oval(p,skin,0,1,0,.55,.65,.5);
  oval(p,skin,.05,1.92,0,.43,.52,.42);
  oval(p,ivory,.29,1.7,0,.36,.48,.37);
  add(p,'tube',gold,.02,2.34,0,.43,.21,.43);
  for(let i=0;i<5;i++) {
    const angle=i*Math.PI*2/5;
    add(p,'cone',gold,.02+.33*Math.cos(angle),2.53,.33*Math.sin(angle),.12,.37,.12);
  }
  for(const s of [-1,1]) {
    oval(p,ink,.41,2.03,s*.185,.05,.05,.04);
    rod(p,skin,[0,1.34,s*.39],[.28,1.51,s*.81],.14);
  }
  rod(p,gold,[.3,.12,.81],[.3,2.87,.81],.056);
  for(const dz of [-.22,0,.22]) {
    rod(p,gold,[.3,2.47,.81],[.3,2.58,.81+dz],.052);
    rod(p,gold,[.3,2.55,.81+dz],[.3,2.98,.81+dz],.063,true);
  }
}
const builders = { sam,turret,cruiser,dolphin,baby,truck,neptune,bird:p=>flying(p,false),flamingo:p=>flying(p,true) };
export function model(type) {
  const group = new THREE.Group();
  group.name = type;
  builders[type](group);
  return group;
}
