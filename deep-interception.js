// Fictional card-game balance, in percentage points.
export const defenses={
 net:{name:['Сітка','Net'],profile:['Легкий','Light'],bonus:12},
 guard:{name:['Варта','Watch'],profile:['Важкий','Heavy'],bonus:14},
 dome:{name:['Купол','Dome'],profile:['Балістичний','Ballistic'],bonus:16}
};
export function interceptionChance(unit,defense){
 return unit.baseChance+(unit.weakTo===defense?defenses[defense].bonus:0);
}
const deck=Object.keys(defenses);
export function rollInterception(unit,encounter,random=Math.random){
 const defense=encounter?deck[Math.floor(random()*deck.length)]:null;
 return random()*100<interceptionChance(unit,defense);
}
