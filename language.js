import labels from './labels.json';

let rendering;
export const tr=(uk,en)=>(rendering??document.documentElement.lang)==='en'?en:uk;

export function writeMessage(render){
 const el=document.getElementById('info');
 try{
  for(const lang of ['uk','en']){
   rendering=lang;
   el.dataset[lang]=render();
  }
 }finally{rendering=undefined}
 el.textContent=el.dataset[document.documentElement.lang];
}

// Bind static copy once, before the game creates its own controls.
const initial=document.documentElement.lang;
const catalog=new Map(labels.map(pair=>[pair[initial==='uk'?0:1],pair]));
const bindings=[];
const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){
 const node=walker.currentNode,text=node.nodeValue,pair=catalog.get(text.trim());
 if(pair)bindings.push(lang=>{node.nodeValue=text.replace(text.trim(),pair[lang==='uk'?0:1])});
}
for(const el of document.querySelectorAll('[aria-label]')){
 const pair=catalog.get(el.getAttribute('aria-label'));
 if(pair)bindings.push(lang=>el.setAttribute('aria-label',pair[lang==='uk'?0:1]));
}
const button=document.querySelector('.lang');
button.onclick=()=>{
 const lang=document.documentElement.lang==='uk'?'en':'uk';
 document.documentElement.lang=lang;
 for(const update of bindings)update(lang);
 button.lang=lang==='uk'?'en':'uk';
 button.textContent=lang==='uk'?'English':'Українська';
 history.replaceState(null,'',lang==='uk'?'./':'./en.html');
 document.dispatchEvent(new Event('siege-language'));
};
