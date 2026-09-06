import {evidenceConstraint} from './evidence-policy.mjs';
import {evidenceCoverage} from './evidence.mjs';

export const families=[
 ['price','ES price structure','#2ce2ff'],['gamma','Gamma','#40ffc1'],
 ['delta','DEX','#72abff'],['vanna','Vanna','#c497ff'],['charm','Charm','#ffbd5b'],
 ['flow','Options flow','#29e4d2'],['institutional','Dark-pool / equity prints','#ffe16a'],
 ['acceptance','Volume / price acceptance','#79d7ee'],['volatility','Volatility','#ff75c5'],
 ['positioning','Positioning / open interest','#acbade']
].map(([id,label,color])=>({id,label,color}));
export function familyFor(title=''){
 const t=title.toLowerCase();
 if(/dark|equity print|institution/.test(t))return 'institutional';
 if(/charm/.test(t))return 'charm';if(/vanna/.test(t))return 'vanna';
 if(/delta|\bdex\b/.test(t))return 'delta';if(/gamma|\bgex\b|exposure/.test(t))return 'gamma';
 if(/volatil|\biv\b|skew|term structure/.test(t))return 'volatility';
 if(/profile|vwap|depthview|acceptance/.test(t))return 'acceptance';
 if(/interest|position|pain/.test(t))return 'positioning';
 if(/flow|drift|sweep|gainer/.test(t))return 'flow';
 if(/databento|\bes\b|deepcharts/.test(t))return 'price';return null;
}
export function familyInventory(read){
 const coverage=evidenceCoverage(read);
 return families.map(f=>({...f,items:coverage.filter(i=>familyFor(i.title)===f.id)}));
}
export function conversionFor(read){
 if(read.instrument==='SPX')return {kind:'native',basis:0,label:'Native SPX coordinates'};
 if(Number.isFinite(read.basis))return {kind:'applied',basis:read.basis,label:'Read basis · ES − SPX '+signed(read.basis)+' pts'};
 const d=read.sources.find(s=>s.id==='databento')?.data,r=d?.basisReference;
 if(r?.ok&&r.kind==='cash_anchor'&&r.sessionDate===read.date&&r.contract===d.contract&&Number.isFinite(r.basis)&&Math.abs(r.basis)<=200&&Math.abs(Date.parse(r.esTime)-Date.parse(r.spxTime))<=60000)
  return {kind:'anchor',basis:r.basis,reference:r,label:'Frozen cash anchor · ≈ ES − SPX '+signed(r.basis)+' pts'};
 return {kind:'unmapped',basis:null,label:'Native ES plan · SPX exposure shown separately'};
}
export const signed=n=>(n>=0?'+':'')+n.toLocaleString('en-US',{maximumFractionDigits:2});
export const compact=n=>Number.isFinite(n)?n.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2}):'—';
export function familyObservation(read,id){
 const get=id=>read.sources.find(s=>s.id===id)?.data;
 if(id==='price'){const d=get('databento');return d?.session?'Session '+d.session.low+'–'+d.session.high+' · last '+d.latestPrice:null;}
 if(['gamma','delta','vanna','charm'].includes(id)){
  const d=get('qd-'+id),rows=(d?.nearby||[]).filter(r=>Number.isFinite(r.net));
  if(!rows.length)return null;
  const positive=rows.filter(r=>r.net>0).sort((a,b)=>b.net-a.net)[0],negative=rows.filter(r=>r.net<0).sort((a,b)=>a.net-b.net)[0];
  return [positive?'+'+compact(positive.net)+' @ '+positive.strike:null,negative?compact(negative.net)+' @ '+negative.strike:null].filter(Boolean).join(' / ')+' · SPX RAW';
 }
 if(id==='flow'){const d=get('quantdata');return Number.isFinite(d?.callPremium)&&Number.isFinite(d?.putPremium)?'Net premiums · calls '+compact(d.callPremium)+' / puts '+compact(d.putPremium):null;}
 if(id==='institutional'){const d=get('qd-dark-flow');return Number.isFinite(d?.notionalTotal)?'SPY reported notional '+compact(d.notionalTotal)+' · direction unverified':null;}
 return null;
}
export function exposureColumns(read){
 const columns=[];
 for(const [id,title,family,zero] of [['qd-gamma','QD Gamma · all','gamma',false],['qd-gamma','QD Gamma · 0DTE','gamma',true],['qd-delta','QD DEX','delta',false],['qd-vanna','QD Vanna','vanna',false],['qd-charm','QD Charm','charm',false]]){
  const source=read.sources.find(s=>s.id===id),d=source?.data;
  const rows=d?.available===false?[]:(d?.ladder||[...new Map([...(d?.nearby||[]),...(d?.strongest||[])].map(r=>[r.strike,r])).values()]);
  columns.push({id:id+(zero?'-0dte':''),title,family,source,unit:'RAW',scope:zero?'Expiration '+(d?.zeroDteDate||read.date):'All expirations',partial:!d?.ladder,
   rows:rows.map(r=>({price:r.strike,call:zero?r.zeroDte?.call:r.call,put:zero?r.zeroDte?.put:r.put,net:zero?r.zeroDte?.net:r.net})).filter(r=>Number.isFinite(r.net))});
 }
 const od=read.sources.find(s=>s.id==='gamma'),d=od?.data;
 columns.push({id:'od-gamma',title:'OD Gamma model',family:'gamma',source:od,unit:'Provider model units',scope:d?.actualSlot||'Model sample',partial:false,
  rows:d?.ok===false?[]:(d?.rows||[]).filter(r=>Number.isFinite(r.price)&&Number.isFinite(r.value)).map(r=>({price:r.price,net:r.value}))});
 return columns;
}
export function sanitizeConfluence(analysis,packet){
 if(analysis.confluence===undefined)return;
 if(!Array.isArray(analysis.confluence)||analysis.confluence.length>72)throw Error('Invalid confluence inventory.');
 const levels=[...analysis.levels,...(analysis.checkpoints||[])],keys=new Set();
 for(const e of analysis.confluence){
  const source=packet.sources.find(s=>s.id===e.sourceId),panel=e.panelId===null?null:analysis.panels?.find(p=>p.id===e.panelId&&p.sourceId===e.sourceId);
  if(!levels.some(l=>l.id===e.levelId)||!source||(e.panelId!==null&&!panel)||!families.some(f=>f.id===e.family)||!['supports','opposes','context','unavailable'].includes(e.effect)||!['observation','mechanism','watch'].every(k=>typeof e[k]==='string'&&e[k].trim()))throw Error('Invalid level confluence evidence.');
  const key=[e.levelId,e.sourceId,e.panelId,e.family].join(':');if(keys.has(key))throw Error('Duplicate confluence evidence.');keys.add(key);
  const restriction=evidenceConstraint(source,panel,packet);
  if(restriction){e.effect=restriction.effect;e.scopeNote=restriction.reason;}
 }
}
export function levelConfluence(read,level){
 const a=read.result.analysis,items=[];
 for(const e of a.confluence||[])if(e.levelId===level.id){
  const source=read.sources.find(s=>s.id===e.sourceId),panel=a.panels?.find(p=>p.id===e.panelId&&p.sourceId===e.sourceId);
  if(!source)continue;const rule=evidenceConstraint(source,panel,read);
  items.push({...e,effect:rule?.effect||e.effect,scopeNote:rule?.reason||e.scopeNote,source,panel});
 }
 for(const id of level.sourceIds||[]){
  const source=read.sources.find(s=>s.id===id);if(!source||items.some(e=>e.sourceId===id))continue;
  const panel=a.panels?.find(p=>level.panelIds?.includes(p.id)&&p.sourceId===id),family=familyFor(panel?.title||source.title)||'price',rule=evidenceConstraint(source,panel,read);
  items.push({source,panel,sourceId:id,family,effect:rule?.effect||'supports',observation:level.identity?.derivation||level.evidence,mechanism:level.evidence,watch:level.watch,scopeNote:rule?.reason,origin:true});
 }
 // Coordinate overlap is useful for investigation, not a vote for direction.
 const conversion=conversionFor(read);
 if(conversion.kind!=='unmapped')for(const column of exposureColumns(read)){
  if(!column.source||column.source.sessionDate!==read.date)continue;
  const nearby=column.rows.filter(r=>Math.abs(r.price+conversion.basis-level.price)<=1).sort((x,y)=>Math.abs(x.price+conversion.basis-level.price)-Math.abs(y.price+conversion.basis-level.price))[0];
  if(!nearby)continue;
  items.push({source:column.source,sourceId:column.source.id,family:column.family,effect:'context',column,row:nearby,
   observation:column.title+' at SPX '+nearby.price+': '+signed(nearby.net)+' · '+column.unit+' · '+column.scope,
   mechanism:'Coordinate overlap within 1 point'+(conversion.kind==='anchor'?' using a frozen cash anchor':'')+'. This is a model reference, not independent price confirmation.',
   watch:'Check whether price accepts or rejects the area and whether the exposure persists.',coordinateOnly:true});
 }
 return items;
}
export function confluenceSummary(items){
 const support=new Set(items.filter(i=>i.effect==='supports').map(i=>i.family)),oppose=new Set(items.filter(i=>i.effect==='opposes').map(i=>i.family));
 return {support:[...support],oppose:[...oppose],context:[...new Set(items.filter(i=>i.effect==='context').map(i=>i.family))]};
}
