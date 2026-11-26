// Rifle sounds for the Sniper range (WebAudio): a real .30-06 recording is the base of the muzzle blast in air, pitched and layered per caliber; synthesized fallback and vacuum thud. The context is created lazily on a user gesture.
const KEY='pop-sniper-sound'; // the Sniper's own setting (the chiptune music keeps 'pop-music-muted'): '1' on, '0' off, unset = on
export const soundMuted=()=>{try{return localStorage.getItem(KEY)==='0'}catch{return false}};
export const setSoundMuted=v=>{try{localStorage.setItem(KEY,v?'0':'1')}catch{}};

// Per caliber: rate/gain = playback pitch and level of the recording (heavier = lower, bigger), layer = level of the synth thump added under it, crack = noise burst brightness (Hz) and length, body = low thump (Hz) and length, slap = muzzle-brake echo (s, gain), tail = reverb length (s), level.
const SHOT_URL='/audio/rifle-shot.mp3';
const GUNS=[
 {rate:.92,gain:1,layer:.35,crack:5200,cl:.045,body:95,bl:.22,slap:0,tail:.6,level:.85},  // .338 Lapua Magnum: sharp loud crack, mid body
 {rate:.86,gain:1.05,layer:.5,crack:4200,cl:.06,body:70,bl:.3,slap:0,tail:.8,level:.95},    // .375 CheyTac: louder, deeper
 {rate:.82,gain:1.1,layer:.6,crack:3400,cl:.07,body:55,bl:.36,slap:.05,tail:1,level:1},    // .416 Barrett: heavier, lower
 {rate:.72,gain:1.2,layer:.8,crack:2600,cl:.09,body:42,bl:.5,slap:.09,tail:1.5,level:1.1}, // .50 BMG: booming blast, brake slap, long rolling tail
];
const reverbBuf=(ctx,sec)=>{
 const n=Math.floor(ctx.sampleRate*sec),b=ctx.createBuffer(2,n,ctx.sampleRate);
 for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++){const t=i/n;d[i]=(Math.random()*2-1)*Math.pow(1-t,3.2)*(1+.6*Math.sin(i/ctx.sampleRate*14))}} // decaying noise with a slow flutter: rolling terrain echo
 return b;
};

export function createShotAudio(){
 let ctx=null,noise=null,master=null,shotBuf=null;
 const unlock=()=>{
  if(soundMuted())return null;
  try{
   if(!ctx){
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
    const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    master=ctx.createDynamicsCompressor(); // limiter: heavy calibers must not clip
    master.threshold.value=-8;master.knee.value=6;master.ratio.value=14;master.attack.value=.002;master.release.value=.2;
    master.connect(ctx.destination);
    const c=ctx;
    fetch(SHOT_URL).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()}).then(a=>c.decodeAudioData(a)).then(b=>{shotBuf=b}).catch(e=>console.warn('rifle-shot.mp3 unavailable, using synthesized blast',e));
   }
   if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  }catch{ctx=null}
  return ctx;
 };
 const burst=(t,len,{freq,type='lowpass',q=.7,gain=1,out})=>{
  const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  s.buffer=noise;s.loop=true;f.type=type;f.frequency.value=freq;f.Q.value=q;
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+len);
  s.connect(f).connect(g).connect(out);s.start(t);s.stop(t+len+.05);
 };
 const thump=(t,hz,len,gain,out)=>{
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';o.frequency.setValueAtTime(hz*2.2,t);o.frequency.exponentialRampToValueAtTime(hz,t+len*.4);
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+len);
  o.connect(g).connect(out);o.start(t);o.stop(t+len+.05);
 };
 const bus=(volume,lowpass)=>{
  const g=ctx.createGain(),f=ctx.createBiquadFilter();
  g.gain.value=volume;f.type='lowpass';f.frequency.value=lowpass;f.connect(g).connect(master);
  return {in:f,gain:g};
 };
 // Muzzle blast. atmosphere: 'air' | 'hydrogen' (Mesklin: cold H2, higher and thinner) | 'thin' (Mars) | 'vacuum' (Moon, Mercury: only the recoil felt through the rifle).
 function shot(caliber,atmosphere,quiet=1){
  if(!unlock())return;
  const gun=GUNS[Math.max(0,Math.min(GUNS.length-1,caliber))]||GUNS[0],t=ctx.currentTime+.01;
  if(atmosphere==='vacuum'){
   const b=bus(.16*quiet,260);thump(t,60,.12,.9,b.in);burst(t,.05,{freq:180,gain:.5,out:b.in});
   return;
  }
  const thin=atmosphere==='thin',h2=atmosphere==='hydrogen',pr=h2?1.25:1; // cold hydrogen: sound travels faster, the blast is higher-pitched and thinner (pitch x1.25, high shelf, weaker low end)
  const shelf=b=>{if(!h2)return;const sh=ctx.createBiquadFilter();sh.type='highshelf';sh.frequency.value=3200;sh.gain.value=9;sh.connect(b.in);b.in=sh};
  if(shotBuf){
   const b=bus(gun.gain*.55*quiet*(thin?.125:1),thin?900:20000),s=ctx.createBufferSource(),e=ctx.createGain();
   shelf(b);s.buffer=shotBuf;s.playbackRate.value=gun.rate*pr;
   e.gain.setValueAtTime(1,t);
   if(thin){e.gain.setValueAtTime(1,t+.45);e.gain.linearRampToValueAtTime(0,t+.75)} // Mars: shortened tail
   s.connect(e).connect(b.in);s.start(t);if(thin)s.stop(t+.8);
   thump(t,gun.body*pr,gun.bl,1.1*gun.layer*(h2?.6:1),b.in); // synth low end under the recording: bigger calibers sound bigger
   if(gun.slap)burst(t+gun.slap,gun.cl*1.5,{freq:gun.crack*.6,type:'bandpass',q:1.2,gain:.45*gun.layer,out:b.in}); // muzzle-brake slap
   if(!thin&&gun.tail>=1.5){ // .50 BMG: longer rolling tail
    const conv=ctx.createConvolver(),wet=ctx.createGain(),lp=ctx.createBiquadFilter();
    conv.buffer=reverbBuf(ctx,gun.tail);wet.gain.value=.4;lp.type='lowpass';lp.frequency.value=2400;
    e.connect(lp).connect(conv).connect(wet).connect(b.gain);
   }
   return;
  }
  const b=bus(gun.level*.55*quiet*(thin?.125:1),thin?420:16000); // Mars: -18 dB and strongly low-passed
  shelf(b);
  burst(t,gun.cl,{freq:gun.crack*pr,type:'highpass',q:.5,gain:1,out:b.in});
  burst(t,gun.cl*2.2,{freq:gun.crack*.5,gain:.8,out:b.in});
  thump(t,gun.body*pr,gun.bl,1.1*(h2?.6:1),b.in);burst(t,gun.bl,{freq:gun.body*3.5,gain:.7,out:b.in});
  if(gun.slap)burst(t+gun.slap,gun.cl*1.5,{freq:gun.crack*.6,type:'bandpass',q:1.2,gain:.45,out:b.in}); // muzzle-brake slap
  const tail=thin?Math.min(.35,gun.tail*.25):gun.tail,conv=ctx.createConvolver(),wet=ctx.createGain();
  conv.buffer=reverbBuf(ctx,tail);wet.gain.value=.55;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=thin?400:2400;
  b.in.connect(lp).connect(conv).connect(wet).connect(b.gain);
  if(!thin&&gun.tail>=1){const d=ctx.createDelay(1);d.delay.value=.32;const dg=ctx.createGain();dg.gain.value=.22;lp.connect(d).connect(dg).connect(b.gain)} // distant terrain echo
 }
 // Steel hit: faint metallic ting, delaySec after now.
 function ting(delaySec,quiet=1){
  if(!unlock())return;
  const t=ctx.currentTime+Math.max(0,delaySec),b=bus(.07*quiet,9000);
  for(const [hz,len,g] of [[1830,.7,1],[2740,.5,.6],[4210,.3,.35]]){
   const o=ctx.createOscillator(),e=ctx.createGain();o.type='sine';o.frequency.value=hz*(1+(Math.random()-.5)*.02);
   e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.002);e.gain.exponentialRampToValueAtTime(.001,t+len);
   o.connect(e).connect(b.in);o.start(t);o.stop(t+len+.05);
  }
  burst(t,.02,{freq:6000,type:'highpass',gain:.6,out:b.in});
 }
 // Turret detent clicks (the scope's own mechanics, so they play in every world; muffled on Mars and in vacuum, where they come through the rifle).
 // kind: 'x' windage (higher), 'y' elevation (lower), 'zoom' (softer, lower tick). n clicks, 18 ms apart; more than 12 become a 12-click ratchet roll over ~250 ms.
 let nextFree=0;
 function click(kind,n=1,atmosphere='air'){
  n=Math.round(n);if(!(n>0))return;
  if(!unlock())return;
  const now=ctx.currentTime;
  if(nextFree>now+.12)return; // sustained drag: never queue more than ~120 ms ahead (also caps at ~60 clicks/s)
  const count=Math.min(n,12),gap=n>12?.25/11:.018,t0=Math.max(now+.005,nextFree);
  const zoom=kind==='zoom',hz=zoom?1500:kind==='y'?3200:4000,ping=zoom?900:kind==='y'?2100:2600;
  const muff=atmosphere==='vacuum'?[1200,.5]:atmosphere==='thin'?[1800,.7]:[16000,1];
  const b=bus(.035*(zoom?.6:1)*muff[1],muff[0]);
  for(let i=0;i<count;i++){
   const t=t0+i*gap,v=1-.08*(i%2)+(Math.random()-.5)*.1; // slight per-click variation
   burst(t,.008,{freq:hz*(1+(Math.random()-.5)*.06),type:'bandpass',q:1.6,gain:1.2*v,out:b.in});
   const o=ctx.createOscillator(),e=ctx.createGain();o.type='sine';o.frequency.value=ping;
   e.gain.setValueAtTime(.25*v,t);e.gain.exponentialRampToValueAtTime(.001,t+.009);
   o.connect(e).connect(b.in);o.start(t);o.stop(t+.02);
  }
  nextFree=t0+count*Math.max(gap,1/60);
 }
 return {unlock,shot,ting,click};
}
