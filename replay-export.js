import {tr} from './language.js';

const game = 'flamingo-bridge.rustyperch5.chatgpt.site';
const formats = ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'];

export function replayExport(dialog, screen, controls, restart) {
 const bar=document.createElement('div');
 bar.className='replay-export';
 bar.innerHTML='<button type="button" data-prepare></button><a download hidden></a><button type="button" data-share hidden></button><small role="status"></small>';
 dialog.append(bar);
 const [prepare,download,share,status]=bar.children;
 let source,recorder,ctx,url,file,preview,projectile;
 function reset() {
   const old=recorder; recorder=null;
   if(old && old.state!=='inactive') old.stop();
   old?.stream.getTracks().forEach(track=>track.stop());
   if(url) URL.revokeObjectURL(url);
   url=null; file=null; ctx=null; source=null; projectile=null;
   preview?.remove();preview=null;
   download.hidden=share.hidden=true;download.removeAttribute('href');
   prepare.hidden=false;prepare.disabled=false;status.textContent='';
 }
 function fail() {
   resetRecording();
   status.textContent=tr('Не вдалося записати відео. Спробуйте ще раз.','Recording failed. Try again.');
 }
 function resetRecording() {
   const old=recorder;recorder=null;
   if(old?.state==='recording')old.stop();
   old?.stream.getTracks().forEach(track=>track.stop());
   ctx=null;prepare.disabled=false;controls.inert=false;
   if(source?.tagName==='VIDEO')source.controls=true;
 }
 prepare.onclick=async()=>{
   const type=formats.find(t=>MediaRecorder.isTypeSupported(t));
   const canvas=document.createElement('canvas');
   const w=source.videoWidth||source.width,h=source.videoHeight||source.height;
   if(!w||!h){status.textContent=tr('Зачекайте, поки завантажиться кадр.','Wait for the first frame to load.');return}
   const scale=Math.min(1,1280/Math.max(w,h));
   canvas.width=Math.max(2,2*Math.round(w*scale/2));canvas.height=Math.max(2,2*Math.round(h*scale/2));
   let stream;
   try{
     ctx=canvas.getContext('2d');stream=canvas.captureStream(30);
     const active=new MediaRecorder(stream,{...(type?{mimeType:type}:{}),videoBitsPerSecond:5000000});
     recorder=active;const chunks=[];
     active.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
     active.onerror=()=>{if(recorder===active)fail()};
     active.onstop=()=>{
       stream.getTracks().forEach(track=>track.stop());
       if(recorder!==active)return;
       if(!chunks.length){fail();return}
       recorder=null;ctx=null;controls.inert=false;
       const mime=active.mimeType.split(';')[0],ext=mime.includes('mp4')?'mp4':'webm';
       file=new File(chunks,'pop-season-replay.'+ext,{type:mime});url=URL.createObjectURL(file);
       preview=document.createElement('video');preview.className='export-preview';preview.controls=preview.playsInline=true;
       preview.src=url+'#t=0.01';screen.append(preview);controls.hidden=true;
       download.href=url;download.download=file.name;download.hidden=false;
       share.hidden=!navigator.canShare?.({files:[file]});
       prepare.hidden=true;status.textContent='';
     };
     prepare.disabled=true;controls.inert=true;
     status.textContent=tr('Записуємо повтор…','Recording replay…');
     active.start();restart();
     if(source.tagName==='VIDEO'){source.controls=false;source.currentTime=0;await source.play()}
   }catch{stream?.getTracks().forEach(t=>t.stop());fail()}
 };
 share.onclick=async()=>{try{await navigator.share({files:[file]})}catch(e){if(e.name!=='AbortError')status.textContent=tr('Завантажте файл, щоб опублікувати його.','Download the file to publish it.')}};
 return {
   reset,
   open(media){
     source=media;bar.hidden=!media;
     controls.inert=false;
     prepare.textContent=tr('Підготувати відео','Prepare video');
     download.textContent=tr('Зберегти відео','Save video');share.textContent=tr('Поділитися','Share video');
     prepare.disabled=!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream;
     if(prepare.disabled)status.textContent=tr('Браузер не підтримує запис відео.','This browser does not support video recording.');
     const svg=screen.querySelector('.camera-projectile svg');
     if(svg){projectile=new Image();projectile.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg))}
   },
   frame(done=false){
     if(recorder?.state!=='recording'||!ctx)return;
     const {width:w,height:h}=ctx.canvas;
     ctx.filter=screen.classList.contains('night-replay')?'grayscale(1)':'none';
     ctx.drawImage(source,0,0,w,h);ctx.filter='none';
     const icon=screen.querySelector('.camera-projectile:not([hidden])');
     if(icon&&projectile?.naturalWidth){const r=icon.getBoundingClientRect(),s=screen.getBoundingClientRect();ctx.drawImage(projectile,(r.x-s.x)*w/s.width,(r.y-s.y)*h/s.height,r.width*w/s.width,r.height*h/s.height)}
     const slate=screen.querySelector('.signal-slate:not([hidden])');
     if(slate){ctx.fillStyle='#090c10';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold '+Math.max(12,Math.round(w*.032))+'px sans-serif';ctx.fillText(slate.textContent,w/2,h/2)}
     const pad=Math.max(5,Math.round(w*.014)),size=Math.max(10,Math.round(w*.024));
     ctx.font='600 '+size+'px sans-serif';ctx.textAlign='right';ctx.textBaseline='bottom';
     const tw=ctx.measureText(game).width;
     ctx.fillStyle='rgba(0,0,0,.68)';ctx.fillRect(w-tw-3*pad,h-size-3*pad,tw+2*pad,size+2*pad);
     ctx.fillStyle='white';ctx.fillText(game,w-2*pad,h-2*pad);
     if(done||source.ended)recorder.stop();
   }
 };
}
