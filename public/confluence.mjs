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
 if(/volatil|\biv\b|skew|term structure|straddle|vix/.test(t))return 'volatility';
 if(/profile|vwap|depthview|acceptance/.test(t))return 'acceptance';
 if(/interest|position|pain/.test(t))return 'positioning';
 if(/flow|drift|sweep|gainer/.test(t))return 'flow';
 if(/databento|\bes\b|deepcharts/.test(t))return 'price';return null;
}
export function familyInventory(read){
 const coverage=evidenceCoverage(read);
 return families.map(f=>({...f,items:coverage.filter(i=>(i.source?.data?.family||familyFor(i.title))===f.id||(f.id==='acceptance'&&i.source?.id==='databento'&&i.source.data?.volumeProfile?.available))}));
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
  return [positive?'+'+compact(positive.net)+' @ '+positive.strike:null,negative?compact(negative.net)+' @ '+negative.strike:null].filter(Boolean).join(' / ')+' · SPX '+(d.representationMode==='PER_ONE_PERCENT_MOVE'?'per 1% move':'RAW');
 }
 if(id==='flow'){const d=get('quantdata');return Number.isFinite(d?.callPremium)&&Number.isFinite(d?.putPremium)?'Net premiums · calls '+compact(d.callPremium)+' / puts '+compact(d.putPremium):null;}
 if(id==='institutional'){const d=get('qd-dark-flow');return Number.isFinite(d?.notionalTotal)?'SPY reported notional '+compact(d.notionalTotal)+' · direction unverified':null;}
 if(id==='acceptance'){const d=get('databento')?.volumeProfile;return d?.available?d.nodes.map(n=>n.kind+' '+n.price).join(' · '):null;}
 if(id==='volatility'){const d=get('qd-iv-rank'),legs=d?.legs;if(!legs)return null;return ['CALL','PUT'].filter(k=>Number.isFinite(legs[k]?.rankPercent)).map(k=>k.toLowerCase()+' IV rank '+legs[k].rankPercent.toFixed(1)+'%').join(' · ');}
 if(id==='positioning'){const d=get('qd-oi-strike'),rows=(d?.rows||[]).filter(r=>Number.isFinite(r.callOpenInterest)&&Number.isFinite(r.putOpenInterest)),top=rows.sort((a,b)=>b.callOpenInterest+b.putOpenInterest-a.callOpenInterest-a.putOpenInterest)[0];return top?'Largest supplied OI '+compact(top.callOpenInterest+top.putOpenInterest)+' @ SPX '+top.strike:null;}
 return null;
}
export function exposureColumns(read,{expirationDate=read.date}={}){
 const columns=[];
 for(const [id,title,family,zero] of [['qd-gamma','QD Gamma · all','gamma',false],['qd-gamma','QD Gamma · 0DTE','gamma',true],['qd-delta','QD DEX','delta',false],['qd-vanna','QD Vanna','vanna',false],['qd-charm','QD Charm','charm',false]]){
  const source=read.sources.find(s=>s.id===id),d=source?.data;
  const rows=d?.available===false?[]:(d?.ladder||[...new Map([...(d?.nearby||[]),...(d?.strongest||[])].map(r=>[r.strike,r])).values()]);
  const slice=r=>r.expiryExposure?.[expirationDate]||(expirationDate===(d?.zeroDteDate||read.date)?r.zeroDte:null);
  columns.push({id:id+(zero?'-0dte':''),title:zero?'QD Gamma · expiration '+expirationDate:title,family,source,unit:d?.representationMode==='PER_ONE_PERCENT_MOVE'?'Per 1% move':'RAW',scope:zero?'Expiration '+expirationDate+(expirationDate!==read.date?' · forward planning context':' · selected session'):'All expirations',partial:!d?.ladder,
   rows:rows.map(r=>({price:r.strike,call:zero?slice(r)?.call:r.call,put:zero?slice(r)?.put:r.put,net:zero?slice(r)?.net:r.net})).filter(r=>Number.isFinite(r.net))});
 }
 const od=read.sources.find(s=>s.id==='gamma'),d=od?.data;
 columns.push({id:'od-gamma',title:'OD Gamma model',family:'gamma',source:od,unit:'Provider model units',scope:d?.actualSlot||'Model sample',partial:false,
  rows:d?.ok===false?[]:(d?.rows||[]).filter(r=>Number.isFinite(r.price)&&Number.isFinite(r.value)).map(r=>({price:r.price,net:r.value}))});
 for(const [id,title,family]of [['od-gex-mm-strike','OD Dealer Gamma','gamma'],['od-dex-mm-strike','OD Dealer DEX','delta'],['od-vex-mm-strike','OD Dealer Vanna','vanna']]){const source=read.sources.find(s=>s.id===id),data=source?.data;if(source)columns.push({id,title,family,source,unit:'OD metric units',scope:data.actualSlot||data.requestedSlot,rows:data.available===false?[]:(data.rows||[]).map(r=>({price:r.strike,net:r.value}))});}
 const oi=read.sources.find(s=>s.id==='qd-oi-strike');if(oi)columns.push({id:'qd-oi-strike',title:'QD Open Interest',family:'positioning',source:oi,unit:'Contracts',scope:oi.data.scope,rows:(oi.data.available===false?[]:oi.data.rows||[]).map(r=>({price:r.strike,call:r.callOpenInterest,put:r.putOpenInterest,net:Number.isFinite(r.callOpenInterest)&&Number.isFinite(r.putOpenInterest)?r.callOpenInterest+r.putOpenInterest:null})).filter(r=>Number.isFinite(r.net))});
 const premium=read.sources.find(s=>s.id==='qd-straddle'),expiryOI=premium?.data.openInterest;
 if(expiryOI?.available)columns.push({id:'qd-oi-strike-0dte',title:'QD Open Interest · session expiration',family:'positioning',source:premium,unit:'Contracts',scope:'Expiration '+expiryOI.expirationDate+' · OI observed '+expiryOI.observationDate+' · bounded supplied strikes',rows:expiryOI.rows.map(r=>({price:r.strike,call:r.callOpenInterest,put:r.putOpenInterest,net:Number.isFinite(r.callOpenInterest)&&Number.isFinite(r.putOpenInterest)?r.callOpenInterest+r.putOpenInterest:null})).filter(r=>Number.isFinite(r.net))});
 return columns;
}
export function sanitizeConfluence(analysis,packet){
 if(analysis.confluence===undefined)return;
 if(!Array.isArray(analysis.confluence)||analysis.confluence.length>72)throw Error('Invalid confluence inventory.');
 const levels=[...analysis.levels,...(analysis.checkpoints||[])],keys=new Set();
 for(const e of analysis.confluence){
  const source=packet.sources.find(s=>s.id===e.sourceId),panel=e.panelId===null?null:analysis.panels?.find(p=>p.id===e.panelId&&p.sourceId===e.sourceId);
  if(!levels.some(l=>l.id===e.levelId)||!source||(e.panelId!==null&&!panel)||!families.some(f=>f.id===e.family)||!['supports','opposes','context','unavailable'].includes(e.effect)||!['observation','mechanism','watch'].every(k=>typeof e[k]==='string'&&e[k].trim()))throw Error('Invalid level confluence evidence.');
  // One feed can support the immediate level and separately supply context or
  // contrary evidence. Preserve those distinct effects; family counts still
  // deduplicate the source views, and identical effects remain an error.
  const key=[e.levelId,e.sourceId,e.panelId,e.family,e.effect].join(':');if(keys.has(key))throw Error('Duplicate confluence evidence.');keys.add(key);
  const restriction=evidenceConstraint(source,panel,packet);
  if(restriction){e.effect=restriction.effect;e.scopeNote=restriction.reason;}
 }
}
export function levelConfluence(read,level,{expirationDate=read.date}={}){
 const a=read.result.analysis,items=[];
 for(const e of a.confluence||[])if(e.levelId===level.id){
  const source=read.sources.find(s=>s.id===e.sourceId),panel=a.panels?.find(p=>p.id===e.panelId&&p.sourceId===e.sourceId);
  if(!source)continue;const rule=evidenceConstraint(source,panel,read);
  items.push({...e,effect:rule?.effect||e.effect,scopeNote:rule?.reason||e.scopeNote,source,panel});
 }
 for(const id of level.sourceIds||[]){
  const source=read.sources.find(s=>s.id===id);if(!source||items.some(e=>e.sourceId===id))continue;
  const panel=a.panels?.find(p=>level.panelIds?.includes(p.id)&&p.sourceId===id),family=id===level.apiOrigin?.sourceId&&/profile$/.test(level.apiOrigin.timeframe)?'acceptance':familyFor(panel?.title||source.title)||'price',rule=evidenceConstraint(source,panel,read);
  items.push({source,panel,sourceId:id,family,effect:rule?.effect||'supports',observation:level.identity?.derivation||level.evidence,mechanism:level.evidence,watch:level.watch,scopeNote:rule?.reason,origin:true});
 }
 // Coordinate overlap is useful for investigation, not a vote for direction.
 const conversion=conversionFor(read);
 if(conversion.kind!=='unmapped')for(const column of exposureColumns(read,{expirationDate})){
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

// Stars describe distinct supporting evidence families, never a win probability.
// Duplicated provider views, coordinate overlaps, and conflicted families cannot
// make a level appear more strongly confirmed.
export function confluenceLabel(items){
 const opposed=new Set(items.filter(i=>i.effect==='opposes').map(i=>i.family));
 const supporting=items.filter(i=>i.effect==='supports'&&!i.coordinateOnly&&!opposed.has(i.family));
 const ids=[...new Set(supporting.map(i=>i.family))];
 const names={price:'ES structure',gamma:'GEX',delta:'DEX',vanna:'Vanna',charm:'Charm',flow:'Flow',institutional:'Institutional prints',acceptance:'Volume profile',volatility:'Volatility',positioning:'Open interest'};
 const labels=ids.map(id=>{
  if(id!=='acceptance')return names[id]||id;
  const text=supporting.filter(i=>i.family===id).map(i=>[i.observation,i.panel?.title,i.source?.title].filter(Boolean).join(' ')).join(' ');
  const features=['VWAP','POC','HVN','LVN'].filter(name=>new RegExp('\\b'+name+'\\b','i').test(text));
  return features.length?features.join(' / '):names[id];
 });
 return {count:ids.length,families:ids,labels,text:labels.join(' · '),stars:ids.length>=4?'★★':ids.length===3?'★':''};
}
