export const priceText=p=>Number(p).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
export function quoteStatus(feed, now=Date.now()){
 if(feed.freshness==='historical')return 'Historical';
 const age=(now-Date.parse(feed.latestTimestamp))/1000;
 if(!Number.isFinite(age)||age<0)return 'Observation time unverified';
 return feed.freshness==='fresh'&&age<=20?'Fresh sample · '+Math.floor(age)+'s old':'Stale sample · '+(age<60?Math.floor(age)+'s':Math.floor(age/60)+'m')+' old';
}
export function levelDetails(level,analysis={}){
 const panels=(analysis.panels||[]).filter(p=>level.panelIds?.includes(p.id));
 const source=[...panels.map(p=>p.title),...(level.apiOrigin?['Databento · '+level.apiOrigin.sessionDate+' · '+level.apiOrigin.timeframe+' '+level.apiOrigin.field]:[])].join(' · ')||'API source';
 if(level.identity)return {...level.identity,source,badge:({provider:'Named source level',structure:'Price reaction',drawing:'Indicator not identified',quote:'Snapshot price'})[level.identity.category]};
 const category=level.role==='last_price'?'quote':level.role==='structure'?'structure':'drawing';
 return {category,name:category==='quote'?'Last observed price':category==='drawing'?'Chart line · indicator unknown':String(level.label||'Price reaction').replace(/^\d[\d,.]*\s+/,''),sourceLabel:null,source,
  badge:category==='quote'?'Snapshot price':category==='drawing'?'Indicator not identified':'Price interpretation · saved read',
  description:category==='quote'?'The screenshot’s last-price marker, not an established support or resistance.':category==='drawing'?'A drawn reference whose indicator or calculation has not been identified.':level.evidence,
  derivation:level.evidence};
}
export function pathDirectionValid(s,levels){
 const from=levels.find(l=>l.id===s.triggerId),to=levels.find(l=>l.id===s.targetId);
 if(!from||from.role!=='structure'||(to&&to.role!=='structure'))return false;
 if(s.direction==='neutral')return !!to&&to.price!==from.price;
 return !to||(s.direction==='up'?to.price>from.price:to.price<from.price);
}
export const directionTitle=d=>({up:'↑ Upside',down:'↓ Downside',neutral:'↔ Neutral'})[d];
export const levelColors={support:'#36ffb1',resistance:'#ff4f85',gamma:'#c899ff',delta:'#ffb34f',vanna:'#ef96ff',charm:'#73baff',dark_pool:'#ffe85c',reference:'#27e5ff',other:'#ffe85c'};

export function decisionZones(levels, tolerance=1){
 const sorted=levels.filter(l=>l.role==="structure").sort((a,b)=>b.price-a.price), zones=[];
 for(const l of sorted){const z=zones.at(-1);if(z&&z.high-l.price<=tolerance){z.low=l.price;z.members.push(l);}else zones.push({id:l.id,high:l.price,low:l.price,members:[l]});}
 return zones;
}
export function setupRoom(s,levels,minimum=5,checkpoints=[]){
 const from=levels.find(l=>l.id===s.triggerId),to=levels.find(l=>l.id===s.targetId);
 if(s.status!=="conditional"||!from||!to)return {eligible:false,text:"Watch only · no verified destination"};
 if(from.role!=='structure'||to.role!=='structure'||(s.direction&&!pathDirectionValid(s,levels)))return {eligible:false,text:'Watch only · structural boundaries need verification'};
 if(!Array.isArray(checkpoints))return {eligible:false,text:'Watch only · rebuild this read to check nearer obstacles'};
 const points=Math.abs(to.price-from.price);
 const obstacles=[...levels,...checkpoints].filter(l=>l.role==='structure'&&(to.price>from.price?l.price>from.price&&l.price<to.price:l.price<from.price&&l.price>to.price)).sort((a,b)=>Math.abs(a.price-from.price)-Math.abs(b.price-from.price));
 const first=obstacles[0];
 if(first)return {eligible:false,obstacles,points:Math.abs(first.price-from.price),text:'Watch only · '+priceText(Math.abs(first.price-from.price))+' points to intervening structure at '+priceText(first.price)+' · farther path withheld'};
 return {eligible:points>=minimum,points,text:points<=1?"Watch only · nearby prices are one decision zone":points<minimum?"Watch only · "+priceText(points)+" points to the next reference; under the "+minimum+"-point planning minimum":priceText(points)+" points to the reference · risk/reward not yet established"};
}

// Distances describe separate conditional stages, never a forecast or an entry-to-profit calculation.
export function scenarioRoute(s,levels,checkpoints){
 if(!Array.isArray(checkpoints))return {ready:false,reason:'Rebuild this read to review the full route and its checkpoints.',stages:[]};
 const from=levels.find(l=>l.id===s.triggerId),first=levels.find(l=>l.id===s.targetId);
 if(s.status!=='conditional'||!first||!pathDirectionValid(s,levels))return {ready:false,reason:'No complete structural route is established.',stages:[]};
 const segment=(a,b,phase)=>{
  const checks=[...levels,...checkpoints].filter(l=>l.role==='structure'&&(b.price>a.price?l.price>a.price&&l.price<b.price:l.price<a.price&&l.price>b.price)).sort((x,y)=>Math.abs(x.price-a.price)-Math.abs(y.price-a.price));
  const nearest=checks[0]||b;
  return {from:a,to:b,phase,points:Math.abs(b.price-a.price),nearest,firstPoints:Math.abs(nearest.price-a.price),checks};
 };
 const stages=[segment(from,first,'initial')],c=s.continuation,outer=levels.find(l=>l.id===c?.targetId);
 if(outer?.role==='structure'&&['condition','confirmation','invalidation','rationale'].every(k=>typeof c[k]==='string'&&c[k].trim())&&(s.direction==='up'?outer.price>first.price:s.direction==='down'?outer.price<first.price:false))stages.push(segment(first,outer,'continuation'));
 return {ready:true,stages,first:stages[0],totalPoints:Math.abs(stages.at(-1).to.price-from.price),hasContinuation:stages.length>1};
}
