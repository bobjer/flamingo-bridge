import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
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
  box(p,marine,0,.48,0,3.1,.48,1.13);
  box(p,mint,1.08,.94,0,.78,.64,1.12);
  box(p,ink,1.19,1.03,0,.61,.24,1.14);
  for(const z of [-.58,.58])for(const x of [-1.12,-.51,.46,1.15])
    rod(p,ink,[x,.29,z*.84],[x,.29,z*1.18],.27);
  for(const x of [-.76,-.18])for(const z of [-.29,.29]){
    rod(p,marine,[x,.73,z],[x+.36,2.48,z],.26);
    rod(p,mint,[x+.34,2.39,z],[x+.38,2.52,z],.27);
  }
  p.userData.launchPoint=[.2,2.52,.29];
}
function pantsir(p) {
  box(p,marine,0,.33,0,1.62,.4,.86);
  for(const z of [-.46,.46])box(p,ink,0,.21,z,1.52,.35,.22);
  box(p,mint,-.12,.64,0,.77,.43,.7);
  oval(p,ivory,-.24,1.02,0,.34,.28,.34);
  for(const z of [-.49,.49]){
    for(const y of [.57,.8])rod(p,marine,[-.42,y,z],[.68,y+.27,z],.104);
  }
  p.userData.launchPoint=[.68,1.07,.49];
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
// "Malyuk": a cheeky baby pilot riding a tiny kamikaze sea drone.
const blinkRed=new THREE.MeshBasicMaterial({color:0xff2a2a,toneMapped:false});
const lensMat=new THREE.MeshStandardMaterial({color:0x7fe6ff,metalness:.6,roughness:.08,emissive:0x0b3a44});
function baby(p) {
  const hull=0x37424c,stripe=0xffcf3a;
  // drone hull: long wedge with a sharp bow
  oval(p,hull,-.05,.12,0,.95,.17,.36);
  add(p,'cone',hull,.95,.12,0,.2,.42,.2).rotation.z=-Math.PI/2;
  box(p,stripe,-.05,.24,0,1.5,.035,.5);
  box(p,0x1e252b,-.62,.28,0,.34,.16,.4);                     // engine pod
  const prop=new THREE.Group();prop.position.set(-.86,.14,0);p.add(prop);
  for(let i=0;i<3;i++){const b=box(prop,0xc9ced3,0,0,0,.02,.22,.07);b.rotation.x=i*Math.PI*2/3;}
  prop.onBeforeRender=()=>{prop.rotation.x=performance.now()*.03};
  // antenna with a blinking warning light
  rod(p,ink,[-.5,.3,.14],[-.55,.78,.17],.012);
  const led=new THREE.Mesh(geometry.oval,blinkRed);led.scale.setScalar(.04);led.position.set(-.55,.8,.17);p.add(led);
  led.onBeforeRender=()=>{led.visible=Math.floor(performance.now()/350)%2===0};
  // baby pilot
  oval(p,0xf4f1ea,-.02,.36,0,.24,.15,.22);                    // diaper
  oval(p,skin,0,.56,0,.24,.26,.22);                           // chubby body
  oval(p,skin,.06,.92,0,.27,.25,.25);                         // big head
  oval(p,0x8a5a3a,-.02,1.14,.03,.06,.07,.05);                 // hair curl
  rod(p,0x8a5a3a,[-.02,1.17,.03],[.08,1.24,.06],.02,true);
  for(const s of [-1,1]){
   oval(p,blush,.25,.86,s*.13,.06,.045,.05);                  // rosy cheeks
   oval(p,ink,.28,.96,s*.08,.03,.035,.03);                    // eyes
   // aviator goggles pushed up on the forehead
   const ring=add(p,'tube',0x5a3a26,.29,1.05,s*.095,.068,.05,.068);ring.rotation.z=Math.PI/2;
   const lens=new THREE.Mesh(geometry.tube,lensMat);lens.scale.set(.055,.055,.055);lens.position.set(.305,1.05,s*.095);lens.rotation.z=Math.PI/2;p.add(lens);
   rod(p,skin,[.03,.66,s*.2],[.34,.6,s*.17],.06);             // arms forward
   oval(p,skin,.36,.6,s*.16,.055,.05,.05);                    // fists
   oval(p,skin,.12,.36,s*.16,.14,.08,.08);                    // little legs
  }
  add(p,new THREE.TorusGeometry(.255,.018,6,28),0x5a3a26,.06,1.05,0,1,1,1).rotation.x=Math.PI/2; // goggle strap
  // pacifier
  oval(p,coral,.33,.83,0,.03,.05,.07);
  add(p,'tube',gold,.36,.83,0,.04,.015,.04).rotation.z=Math.PI/2;
  // handlebar
  rod(p,ink,[.42,.26,0],[.42,.6,0],.022);
  rod(p,ink,[.42,.6,-.18],[.42,.6,.18],.025);
}
function truck(p) {
  box(p,ink,0,.38,0,2.32,.24,1.04);
  box(p,gold,.77,.81,0,.74,.84,1.02);
  box(p,0x65969c,.81,1,0,.72,.32,1.035);
  box(p,gold,.76,1.23,0,.82,.12,1.08);
  box(p,marine,-.47,.72,0,1.55,.55,1.12);
  for(const z of [-.53,.53])box(p,marine,-.47,.99,z,1.55,.36,.065);
  for(const x of [-1.22,.28])box(p,marine,x,.99,0,.065,.36,1.12);
  for(let i=0;i<11;i++)oval(p,i%3===0?0x483724:0x604730,-.99+(i%4)*.34,1.01+Math.sin(i)*.05,(Math.floor(i/4)-1)*.27,.32,.19,.23);
  for(const s of [-1,1]) for(const x of [-.82,.78]) rod(p,ink,[x,.3,s*.45],[x,.3,s*.63],.28);
}
// All three prongs point along the flight models' local +X axis.
function neptune(p) {
 rod(p,gold,[-1.45,0,0],[1,0,0],.13);
 for(const side of [-1,1]){
  rod(p,gold,[.35,0,0],[.73,0,side*.52],.11);
  rod(p,gold,[.73,0,side*.52],[1.3,0,side*.52],.10);
  rod(p,ivory,[1.25,0,side*.52],[1.76,0,side*.52],.16,true);
 }
 rod(p,gold,[.9,0,0],[1.52,0,0],.11);
 rod(p,ivory,[1.48,0,0],[2,0,0],.18,true);
 rod(p,ink,[-1.55,0,0],[-1.18,0,0],.21);
 const flame=rod(p,0x55ddff,[-1.55,0,0],[-2.5,0,0],.16,true);
 flame.material=new THREE.MeshBasicMaterial({color:0x78eaff,toneMapped:false});
}
function barge(p){
  box(p,0x60453c,0,0,0,4.5,.5,1.45);
  for(const z of [-.68,.68])box(p,0x78574a,0,.39,z,4.5,.4,.09);
  for(const x of [-2.2,2.2])box(p,0x78574a,x,.39,0,.1,.4,1.4);
  box(p,0x978981,-1.55,.55,0,.73,.65,.9);
  rod(p,ink,[-1.56,.8,0],[-1.56,1.45,0],.045);
}
function loaf(p){
  oval(p,0xb96527,0,0,0,1.05,.54,.67);
  for(const x of [-.48,0,.48])oval(p,0xf1cf8b,x,.44,0,.1,.06,.32).rotation.y=.4;
  for(const side of [-1,1]){
   oval(p,0xff3855,.08,.04,side*.64,.3,.29,.045);
   for(const x of [-.12,.06,.24])oval(p,0x38894c,x,.3,side*.64,.13,.07,.04);
   for(const x of [-.03,.15])oval(p,0xffdd87,x,.05,side*.687,.027,.047,.015);
  }
}
function helicopter(p){
 const olive=0x78846a;
 oval(p,olive,0,0,0,1.28,.57,.56);
 oval(p,0x567990,.69,.13,0,.68,.42,.49);
 rod(p,olive,[-.82,.05,0],[-2.62,.38,0],.17);
 rod(p,olive,[-2.58,.31,0],[-2.7,.88,0],.12);
 for(const z of [-.47,.47]){
  for(const x of [-.56,.52])rod(p,ink,[x,-.32,z*.7],[x,-.7,z],.045);
  rod(p,ink,[-.94,-.7,z],[1,-.7,z],.065);
 }
 rod(p,ink,[0,.38,0],[0,.83,0],.09);
 const rotor=new THREE.Group();rotor.position.y=.83;p.add(rotor);
 box(rotor,ink,0,0,0,4.15,.045,.13);box(rotor,ink,0,.025,0,.13,.045,4.15);
 const tail=new THREE.Group();tail.position.set(-2.64,.64,.14);p.add(tail);
 box(tail,ink,0,0,0,.69,.09,.04);box(tail,ink,0,0,0,.09,.69,.04);
 p.userData.rotors=[rotor,tail];
}
function jet(p){
 oval(p,0x849ba8,0,0,0,2.3,.27,.35);
 oval(p,0x39516a,.85,.21,0,.55,.17,.25);
 for(const side of [-1,1]){
  const wing=plate([[.7,0,0],[-.9,0,side*2.3],[-1.35,0,side*2.2],[-.8,0,0]]);
  add(p,wing,0x8ba4b3,0,0,0,1,1,1);
  rod(p,0x647986,[-1.6,.1,side*.27],[-1.94,.78,side*.46],.16,true);
 }
}
function drone(p){
 box(p,ink,0,0,0,.8,.28,.55);
 for(const x of [-.63,.63])for(const z of [-.7,.7]){
  rod(p,marine,[0,0,0],[x,.08,z],.085);
  oval(p,mint,x,.12,z,.48,.035,.13);
 }
 oval(p,coral,.42,-.05,0,.12,.11,.13);
}
const builders = { drone,jet,helicopter, loaf,barge, sam,pantsir,turret,cruiser,dolphin,baby,truck,neptune,bird:p=>flying(p,false),flamingo:p=>flying(p,true) };
let truckMesh;
function roadVehicle(){
 if(!truckMesh){
  const parts=new THREE.Group();truck(parts);
  const meshes=parts.children.map(part=>{
   part.updateMatrix();
   const g=part.geometry.toNonIndexed().applyMatrix4(part.matrix);
   const colors=new Float32Array(g.attributes.position.count*3);
   for(let i=0;i<colors.length;i+=3)part.material.color.toArray(colors,i);
   g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
  });
  truckMesh=new THREE.Mesh(mergeGeometries(meshes),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,flatShading:true}));
  truckMesh.name='truck';
 }
 return truckMesh.clone();
}
// Passenger cars: a few body styles in realistic paint, merged into one glossy mesh each.
const CAR_PAINTS=[0xf2f2ef,0xb8bcc0,0x1b1d21,0x1f3557,0x8e1a1a,0x4b5a4f,0xcbb796,0x2f6a8f,0xe0b21c,0x5c5f63];
const CAR_STYLES=['sedan','hatch','suv','van','wagon'];
function car(p,style,paint){
 const glass=0x1c262e,tire=0x141414,trim=0x26272a,lamp=0xfff3d2,tail=0xa3121a,chrome=0xc4c8cc;
 const S={sedan:{L:1.95,H:.26,y:.33,cab:[-.1,.95,.24],r:.16},hatch:{L:1.6,H:.28,y:.34,cab:[-.15,.95,.26],r:.16},
  suv:{L:2.0,H:.36,y:.42,cab:[-.1,1.25,.3],r:.21},van:{L:2.1,H:.42,y:.44,cab:[-.03,1.8,.36],r:.19},wagon:{L:2.05,H:.26,y:.33,cab:[-.2,1.4,.25],r:.16}}[style];
 const W=.86,{L,H,y,r}=S,[cx,cl,ch]=S.cab,top=y+H/2,lo=ch*.5,hi=ch-lo;
 box(p,paint,0,y,0,L,H,W);                                   // body
 box(p,paint,L*.03,top+.012,0,L*.96,.024,W*.97);             // shoulder line
 box(p,trim,0,y-H/2+.035,0,L+.02,.07,W+.02);                 // sills
 box(p,glass,cx,top+lo/2,0,cl,lo,W-.08);                     // lower glasshouse
 box(p,glass,cx-.02,top+lo+hi/2,0,cl*.74,hi,W-.12);          // upper glasshouse (raked pillars)
 for(const z of [-1,1])box(p,paint,cx-.02,top+ch/2,z*(W/2-.045),.045,ch,.03); // B-pillars
 box(p,paint,cx-.02,top+ch+.018,0,cl*.72,.036,W-.12);        // roof
 box(p,trim,L/2+.005,y-.06,0,.04,.12,W*.92);                 // front bumper
 box(p,trim,-L/2-.005,y-.06,0,.04,.12,W*.92);                // rear bumper
 for(const z of [-1,1]){
  box(p,lamp,L/2+.01,y+.06,z*W*.33,.03,.07,.16);             // headlights
  box(p,tail,-L/2-.01,y+.07,z*W*.36,.03,.08,.13);            // tail lights
  box(p,chrome,L*.12,top+.01,z*(W/2+.04),.05,.05,.08);       // mirrors
  for(const x of [L*.32,-L*.32]){
   rod(p,tire,[x,r,z*(W/2-.1)],[x,r,z*(W/2+.03)],r);
   rod(p,chrome,[x,r,z*(W/2+.031)],[x,r,z*(W/2+.036)],r*.55);
  }
 }
}
const carMeshes=new Map();
function mergedVehicle(name,build,mat){
 const parts=new THREE.Group();build(parts);
 const meshes=parts.children.map(part=>{
  part.updateMatrix();
  const g=part.geometry.toNonIndexed().applyMatrix4(part.matrix);
  const colors=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)part.material.color.toArray(colors,i);
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
 });
 const m=new THREE.Mesh(mergeGeometries(meshes),mat);m.name=name;return m;
}
const carMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.35,envMapIntensity:1.4});
export function randomCarType(){return 'car:'+CAR_STYLES[Math.floor(Math.random()*CAR_STYLES.length)]+':'+Math.floor(Math.random()*CAR_PAINTS.length)}
function carModel(type){
 if(!carMeshes.has(type)){
  const [,style,paint]=type.split(':');
  carMeshes.set(type,mergedVehicle(type,p=>car(p,CAR_STYLES.includes(style)?style:'sedan',CAR_PAINTS[+paint]??CAR_PAINTS[0]),carMaterial));
 }
 return carMeshes.get(type).clone();
}
export function model(type) {
  if(type.startsWith('car:'))return carModel(type);
  if(type==='truck')return roadVehicle();
  const group = new THREE.Group();
  group.name = type;
  builders[type](group);
  return group;
}
