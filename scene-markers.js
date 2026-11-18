export function sceneMarkers(view,project){
 const layer=document.createElement('div');
 layer.className='scene-markers';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 layer.append(svg);view.append(layer);
 const entries=new Map();
 return function render(items){
  const present=new Set(items.map(item=>item.key));
  for(const [key,entry] of entries){
   if(!present.has(key)){entry.button.remove();entry.line.remove();entries.delete(key)}
  }
  const occupied=[];
  for(const item of items){
   let entry=entries.get(item.key);
   if(!entry){
    const button=document.createElement('button'),line=document.createElementNS(svg.namespaceURI,'line');
    button.type='button';button.className='scene-marker '+item.kind;
    layer.append(button);svg.append(line);entry={button,line};entries.set(item.key,entry);
   }
   const {button,line}=entry,pos=project(item.point);
   button.hidden=!pos;line.style.display=pos?'':'none';if(!pos)continue;
   if(button.textContent!==item.label)button.textContent=item.label;
   button.disabled=item.disabled;button.onclick=item.action;
   const w=button.offsetWidth,h=button.offsetHeight;
   const x=Math.max(2,Math.min(view.clientWidth-w-2,pos.x-w/2));
   let y=Math.max(2,pos.y-h-15);
   for(let i=0;i<occupied.length;i++){
    if(!occupied.some(b=>x<b.x+b.w+3&&x+w>b.x-3&&y<b.y+b.h+3&&y+h>b.y-3))break;
    y-=h+4;if(y<2)y=pos.y+15;
   }
   y=Math.min(y,view.clientHeight-h-2);occupied.push({x,y,w,h});
   button.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';
   line.setAttribute('x1',pos.x);line.setAttribute('y1',pos.y);line.setAttribute('x2',x+w/2);line.setAttribute('y2',y+h/2);
  }
 };
}
