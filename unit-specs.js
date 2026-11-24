import {tr} from './language.js';

// Publicly reported tactical-technical specs (ТТХ). All figures are official or claimed
// and disputed; they are shown as "claimed", never as verified data.
export const unitSpecs={
 flamingo:{km:3000,kmh:900,warheadKg:1000,
  note:['FP-5 · заявлені дані; макс. ~950 км/год','FP-5 · claimed figures; max ~950 km/h']},
 neptuneBase:{km:300,kmh:900,warheadKg:150,
  note:['Р-360 · дальність ~280-300 км · заявлені дані','R-360 · range ~280-300 km · claimed figures']},
 neptuneLong:{km:1000,kmh:900,warheadKg:260,
  note:['Long Neptune · швидкість не підтверджена окремо · заявлені дані','Long Neptune · speed not separately sourced · claimed figures']},
 palianytsia:{km:650,kmh:900,warheadKg:100,
  note:['БЧ до ~100 кг (оцінки 20-100, спірно) · заявлені дані','Warhead up to ~100 kg (estimates 20-100, disputed) · claimed figures']},
 maliuk:{km:900,kmh:90,warheadKg:800,
  note:['Sea Baby · дальність 800-1000 км · заявлені дані','Sea Baby · range 800-1000 km · claimed figures']}
};

// Short line: «~3000 км · ~900 км/год · БЧ ~1000 кг»
export const specLine=id=>{
 const s=unitSpecs[id];
 return tr('~'+s.km+' км · ~'+s.kmh+' км/год · БЧ ~'+s.warheadKg+' кг','~'+s.km+' km · ~'+s.kmh+' km/h · warhead ~'+s.warheadKg+' kg');
};
export const specNote=id=>tr(...unitSpecs[id].note);
// Line with the "claimed" label for places that have room.
export const specLineClaimed=id=>specLine(id)+' ('+tr('заявлені','claimed')+')';

// Relative damage per hit from warhead mass. Pure sqrt(kg/1000) (1.0 / .9 / .5 / .3) would break balance, so the
// scale is heavily softened: 0.75 + 0.25*sqrt(kg/1000) -> 1.0 / .98 / .88 / .83 (Flamingo / Maliuk / Neptune Long / Palianytsia).
export const warheadScale=id=>.75+.25*Math.sqrt(unitSpecs[id].warheadKg/1000);
