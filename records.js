import {tr} from './language.js';
const rendered=new WeakMap();
export function showRecords(card,run){
 const key=JSON.stringify([run.id,document.documentElement.lang]);
 if(run.id&&rendered.get(card)===key)return;
 rendered.set(card,key);
 card.querySelector('.records')?.remove();
 const box=document.createElement('section');box.className='records';card.append(box);
 const heading=document.createElement('strong'),form=document.createElement('form'),input=document.createElement('input'),button=document.createElement('button'),list=document.createElement('ol'),status=document.createElement('small');
 heading.textContent=tr('Топ-10 цієї складності','Top 10 on this difficulty');
 input.placeholder=tr('Ваш псевдонім','Your nickname');input.setAttribute('aria-label',input.placeholder);input.required=true;input.maxLength=24;
 button.textContent=tr('Записати рекорд','Submit score');form.append(input,button);box.append(heading);if(run.id)box.append(form);box.append(status,list);
 const url='/api/records?difficulty='+encodeURIComponent(run.difficulty);
 let posting=false;
 async function load(submit){
  if(submit){posting=true;button.disabled=true}
  try{
   const response=await fetch(url,submit?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...run,name:input.value.trim()})}:{});
   if(!response.ok)throw Error();
   const rows=await response.json();
   if(!submit&&posting)return;
   list.replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=row.name+' · '+tr('хв. ','wave ')+row.wave+' · '+tr('відбито ','repelled ')+row.score;if(row.assisted)li.append(" · "+tr("Автогра","Autoplay"));return li}));
   status.textContent=submit?tr('Результат збережено','Score saved'):rows.length?'':tr('Поки немає рекордів','No scores yet');
   if(submit)form.hidden=true;
  }catch{status.textContent=tr('Таблиця недоступна. Спробуйте ще раз.','Leaderboard unavailable. Try again.');if(submit){button.disabled=false;posting=false}}
 }
 form.onsubmit=e=>{e.preventDefault();if(input.value.trim()&&!posting)load(true)};
 load(false);
}
