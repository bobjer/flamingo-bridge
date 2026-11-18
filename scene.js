import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export function landscape(view){
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));view.prepend(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(0xffd6c4);scene.fog=new T.FogExp2(0xfbc9bd,.009);
 const camera=new T.PerspectiveCamera(42,1,.15,350);camera.position.set(22,15,30);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,5,0);controls.enablePan=false;controls.enableDamping=true;controls.minDistance=14;controls.maxDistance=59;controls.maxPolarAngle=Math.PI*.478;
 scene.add(new T.HemisphereLight(0xffeee5,0x9ba9b1,2));const sun=new T.DirectionalLight(0xffdfb2,2.2);sun.position.set(-16,24,14);scene.add(sun);
 let seed=39;function rand(){seed=(seed*16807)%2147483647;return seed/2147483647}
 const parts=new Map();function solid(geo,color,x,y,z,q){geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),q||new T.Quaternion(),new T.Vector3(1,1,1)));if(!parts.has(color))parts.set(color,[]);parts.get(color).push(geo.index?geo.toNonIndexed():geo)}
 function box(c,x,y,z,w,h,d){solid(new T.BoxGeometry(w,h,d),c,x,y,z)}
 function beam(c,a,b,w){const dir=new T.Vector3(...b).sub(new T.Vector3(...a));solid(new T.BoxGeometry(w,dir.length(),w),c,...a.map((v,i)=>(v+b[i])/2),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()))}
 const white=0xf1ddd0,shadow=0xb89591,rail=0xf5e3cc;
 box(0x605e62,0,2.9,0,110,.52,4.8);for(let x=-53;x<54;x+=2.8)box(rail,x,3.17,0,1.3,.015,.08);
 for(const z of [-2.35,2.35]){box(shadow,0,3.58,z,110,.12,.12);for(let x=-54;x<55;x+=2)box(white,x,3.38,z,.09,.55,.09)}
 for(let x=-48;x<=48;x+=8){box(0x989696,x,1.25,0,1.25,3,4.6);box(0xbcb4a4,x,.12,0,2.3,.75,5.6)}
 function arch(x){return 3.25+7.3*(1-(x/12)**2)}
 for(let x=-12;x<12;x+=1.5){for(const z of [-2.2,2.2]){
 beam(white,[x,arch(x),z],[x+1.5,arch(x+1.5),z],.35);
 beam(shadow,[x,arch(x)-.65,z],[x+1.5,arch(x+1.5)-.65,z],.16);
 beam(white,[x,3.2,z],[x,arch(x),z],.12);
 beam(white,[x,arch(x)-.65,z],[x+1.5,arch(x+1.5),z],.12)}
 beam(white,[x,arch(x),-2.2],[x,arch(x),2.2],.22);beam(shadow,[x,arch(x),-2.2],[x+1.5,arch(x+1.5),2.2],.13)}
 for(let i=0;i<76;i++){let a=i*.39,r=65+rand()*47;solid(new T.ConeGeometry(10+rand()*14,5+rand()*12,5),i%2?0x988f9a:0xa09da7,Math.cos(a)*r,0,Math.sin(a)*r)}
 const sea=new T.PlaneGeometry(410,410,140,140).rotateX(-Math.PI/2).toNonIndexed(),pos=sea.attributes.position,colors=[];for(let i=0;i<pos.count;i+=3){let color=new T.Color(0x48808c).lerp(new T.Color(0x83aeb3),rand()*.65);for(let j=0;j<3;j++)colors.push(color.r,color.g,color.b)}sea.setAttribute('color',new T.Float32BufferAttribute(colors,3));scene.add(new T.Mesh(sea,new T.MeshBasicMaterial({vertexColors:true})));
 for(let i=0;i<1500;i++)box(i%4?0x86aeb1:0xc7c4b4,(rand()-.5)*145,.02,(rand()-.5)*145,rand()*1.7+.1,.01,rand()*.09+.02)
 for(const [color,geos] of parts){scene.add(new T.Mesh(mergeGeometries(geos),new T.MeshStandardMaterial({color,flatShading:true})));geos.forEach(g=>g.dispose())}
 new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight,false);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix()}).observe(view);
 function zoom(f){let off=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(off.setLength(T.MathUtils.clamp(off.length()*f,14,59)))}
 return {scene,zoom,draw(){controls.update();renderer.render(scene,camera)}}
}
