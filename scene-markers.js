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
    const title=document.createElement('strong'),detail=document.createElement('small');
    const text=document.createElement('span');text.className='marker-text';text.append(title,detail);button.append(text);layer.append(button);svg.append(line,dot);entry={button,line,dot,title,detail};entries.set(item.key,entry);
   }
   const {button,line,dot}=entry,pos=project(item.point);
   button.hidden=!pos;line.style.display=dot.style.display=pos?'':'none';if(!pos)continue;
   dot.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
   if(entry.title.textContent!==item.label)entry.title.textContent=item.label;
   if(entry.detail.textContent!==item.detail)entry.detail.textContent=item.detail;
   button.disabled=item.disabled;button.title=item.label+' · '+item.detail;button.onclick=item.action;
   const w=button.offsetWidth,h=button.offsetHeight;
   const x=Math.max(2,Math.min(view.clientWidth-w-2,pos.x-w/2));
   let y=Math.max(2,pos.y-h-15);
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
