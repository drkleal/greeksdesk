export function barValues(column,row){
 if(column.id.startsWith('qd-oi-strike'))return [-row.put,row.call].filter(Number.isFinite);
 if(column.family==='gamma'&&Number.isFinite(row.call))return [row.put,row.call].filter(Number.isFinite);
 return Number.isFinite(row.net)?[row.net]:[];
}
export function seriesScale(column,rows){return Math.max(1,...rows.flatMap(r=>barValues(column,r)).map(Math.abs));}
// Concentrations rank supplied gross call/put exposure, not a directional signal.
export function gammaConcentrations(column,min,max,basis){
 if(!column?.source||!Number.isFinite(basis))return [];
 return column.rows.filter(r=>r.price+basis>=min&&r.price+basis<=max&&Number.isFinite(r.call)&&Number.isFinite(r.put))
  .map(r=>({...r,gross:Math.abs(r.call)+Math.abs(r.put)})).filter(r=>r.gross>0).sort((a,b)=>b.gross-a.gross||a.price-b.price).slice(0,6);
}
