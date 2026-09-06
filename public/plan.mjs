export const priceText=p=>Number(p).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
export function quoteStatus(feed, now=Date.now()){
 if(feed.freshness==='historical')return 'Historical';
 const age=(now-Date.parse(feed.latestTimestamp))/1000;
 if(!Number.isFinite(age)||age<0)return 'Observation time unverified';
 return feed.freshness==='fresh'&&age<=20?'Fresh sample · '+Math.floor(age)+'s old':'Stale sample · '+(age<60?Math.floor(age)+'s':Math.floor(age/60)+'m')+' old';
}
export function levelDetails(level,analysis={}){
 const panels=(analysis.panels||[]).filter(p=>level.panelIds?.includes(p.id));
 const source=panels.map(p=>p.title).join(' · ')||'API source';
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
export function setupRoom(s,levels,minimum=5){
 const from=levels.find(l=>l.id===s.triggerId),to=levels.find(l=>l.id===s.targetId);
 if(s.status!=="conditional"||!from||!to)return {eligible:false,text:"Watch only · no verified destination"};
 const points=Math.abs(to.price-from.price);
 return {eligible:points>=minimum,points,text:points<=1?"Watch only · nearby prices are one decision zone":points<minimum?"Watch only · "+priceText(points)+" points to the next reference; under the "+minimum+"-point planning minimum":priceText(points)+" points to the reference · risk/reward not yet established"};
}
