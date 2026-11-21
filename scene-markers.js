export function sceneMarkers(view,project){
 const layer=document.createElement('div');
 layer.className='scene-markers';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 layer.append(svg);view.append(layer);
 const entries=new Map();
 return function render(items){
  const present=new Set(items.map(item=>item.key));
  for(const [key,entry] of entries){
   if(!present.has(key)){entry.button.remove();entry.line.remove();entry.dot.remove();entries.delete(key)}
  }
  const occupied=[];
  for(const item of items){
   let entry=entries.get(item.key);
   if(!entry){
    const button=document.createElement('button'),line=document.createElementNS(svg.namespaceURI,'line'),dot=document.createElementNS(svg.namespaceURI,'g');
    dot.setAttribute('class','marker-dot '+item.kind);dot.innerHTML='<circle class="pulse" r="5"/><circle class="core" r="3.2"/>';line.setAttribute('class','marker-line '+item.kind);
    button.type='button';button.className='scene-marker '+item.kind;
    for(const ev of ['pointerenter','pointerleave','focus','blur'])button.addEventListener(ev,()=>{const e=entries.get(item.key);if(e)e.size=null});
    const title=document.createElement('strong'),detail=document.createElement('small');
    const text=document.createElement('span'),short=document.createElement('b');text.className='marker-text';short.className='marker-short';text.append(title,detail);button.append(short,text);layer.append(button);svg.append(line,dot);entry={button,line,dot,title,detail,short};entries.set(item.key,entry);
   }
   const {button,line,dot}=entry,pos=project(item.point);
   if(entry.kind!==item.kind){entry.kind=item.kind;button.className='scene-marker '+item.kind;dot.setAttribute('class','marker-dot '+item.kind);line.setAttribute('class','marker-line '+item.kind)}
   button.hidden=!pos;line.style.display=dot.style.display=pos?'':'none';if(!pos)continue;
   dot.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
   if(entry.title.textContent!==item.label){entry.title.textContent=item.label;entry.size=null}
   if(entry.detail.textContent!==item.detail){entry.detail.textContent=item.detail;entry.size=null}
   const s=item.short??item.label;if(entry.short.textContent!==s){entry.short.textContent=s;entry.size=null}
   button.classList.toggle('urgent',!!item.urgent);const aria=item.label+' · '+item.detail;if(entry.aria!==aria){entry.aria=aria;button.setAttribute('aria-label',aria);button.title=aria}
   if(button.disabled!==item.disabled)button.disabled=item.disabled;button.onclick=item.action;
   // measuring forces layout, so only re-measure when the chip changed
   if(!entry.size||!entry.size[0])entry.size=[button.offsetWidth,button.offsetHeight];
   const [w,h]=entry.size;
   const x=Math.max(2,Math.min(view.clientWidth-w-2,pos.x-w/2));
   let y=Math.max(2,pos.y-h-9);
   for(let i=0;i<occupied.length;i++){
    if(!occupied.some(b=>x<b.x+b.w+3&&x+w>b.x-3&&y<b.y+b.h+3&&y+h>b.y-3))break;
    y-=h+4;if(y<2)y=pos.y+15;
   }
   y=Math.min(y,view.clientHeight-h-2);occupied.push({x,y,w,h});
   button.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';
   line.setAttribute('x1',pos.x);line.setAttribute('y1',pos.y);const ly=y+h/2<pos.y?y+h:y;line.setAttribute('x2',x+w/2);line.setAttribute('y2',ly);
  }
 };
}
