import {cashSession,nyTime} from './session.mjs';

export const freshnessVersion=1;
export const isDeepGamma=s=>s?.id==='paste-dg'||Boolean(s?.image&&/deep\s*gamma/i.test(s.title||''));
const chart24h=s=>Boolean(s?.image&&(['es-snapshot','es-five-minute','paste-vp','paste-vp-prior','paste-vp-composite'].includes(s.id)||/deepcharts|volume profile/i.test(s.title||'')));
const instant=value=>typeof value==='number'?(value<1e11?value*1000:value):typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
const age=(t,now)=>Number.isFinite(t)&&t<=now?(now-t)/60000:null;
const ageText=n=>n===null?'age unknown':`${Math.floor(n)} min`;

// A provider slot without an offset is interpreted as ET for this desk's
// comparison policy. Preserve that assumption, never call it an update time.
function slotInstant(value,timezone){
 const t=instant(value);if(Number.isFinite(t))return {time:t,assumption:null};
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value)||timezone&&!['America/New_York','ET'].includes(timezone))return {time:NaN,assumption:null};
 const wall=Date.parse(value+'Z'),p=nyTime(wall),local=Date.parse(p.date+'T00:00:00Z')+p.seconds*1000;
 return {time:wall+(wall-local),assumption:timezone?null:'Slot timezone assumed ET; provider timezone unverified'};
}
export function gammaObservation(source,now=Date.now()){
 const d=source.data||{};let t=NaN,kind='unknown',assumption=null;
 if(isDeepGamma(source)){t=instant(source.capturedAt);kind='paste';}
 else if(source.id==='gamma'||source.id?.startsWith('od-')){
  const slot=slotInstant(d.actualSlot||d.collectionSlot,d.timezone);t=slot.time;assumption=slot.assumption;kind='model slot';
 }else if(source.id==='quantdata'||source.id?.startsWith('qd-')){
  const times=[d.latestTimestamp,...(d.recentBuckets||[]).map(r=>r.timestamp),...(d.intervals?.buckets||[]).map(r=>r.timestamp)].map(instant).filter(Number.isFinite);
  if(times.length)t=Math.max(...times);kind='latest bucket';
 }
 const minutes=age(t,now);
 return {sourceId:source.id,title:source.title,kind,timestamp:minutes===null?null:new Date(t).toISOString(),ageMinutes:minutes,assumption,available:d.available!==false&&d.ok!==false};
}
export function evaluateFreshness(sources,now=Date.now()){
 now=Number(now);const local=nyTime(now);if(!local)throw Error('Invalid freshness clock');
 const session=cashSession(local.date),rth=Boolean(session&&local.seconds>=session.open&&local.seconds<session.close);
 const overnightPriority=!rth&&(local.seconds>=20.25*3600||local.seconds<4*3600);
 const candidates=sources.filter(isDeepGamma),dated=candidates.filter(s=>age(instant(s.capturedAt),now)!==null).sort((a,b)=>instant(b.capturedAt)-instant(a.capturedAt)),newest=dated[0];
 const minutes=newest?age(instant(newest.capturedAt),now):null,pasted=newest?nyTime(newest.capturedAt):null;
 let band='not_used',reason='No dated Deep Gamma paste on file';
 if(newest){
  if(!rth){band='overnight';reason='Outside RTH: newest dated paste retained at any age; paste time is not a verified market update';}
  else if(pasted.date!==local.date||pasted.seconds<session.open)reason='Paste predates today’s RTH open';
  else if(minutes<=30){band='current';reason='Full gamma context; Deep Gamma > OptionsDepth > Quant Data breaks ties';}
  else if(minutes<=90){band='reference';reason='Slow structure only: zero-gamma region, major gamma and large walls. No 0DTE walls or pin; fresher OD/QD leads';}
  else reason='Paste is more than 90 minutes old';
 }
 const entries=sources.filter(s=>isDeepGamma(s)||chart24h(s)).map(s=>{
  const n=age(instant(s.capturedAt),now),dg=isDeepGamma(s),chosen=s===newest;
  return {sourceId:s.id,type:dg?'deepgamma':'price_profile',band:dg?(chosen?band:'not_used'):(n!==null&&n<=1440?'current':'not_used'),ageMinutes:n,pastedAt:s.capturedAt||null,reason:dg?(chosen?reason:'Superseded, missing or future paste timestamp'):(n!==null&&n<=1440?'Within 24-hour chart window':'Chart exceeds 24 hours or has no valid paste timestamp; use Databento price structure')};
 });
 const observations=sources.filter(s=>isDeepGamma(s)||s.id==='gamma'||s.id==='od-gex-mm-strike'||s.id==='qd-gamma').map(s=>gammaObservation(s,now));
 const eligible=observations.filter(o=>o.available&&o.timestamp&&(o.sourceId!==newest?.id||band!=='not_used')&&(!candidates.some(s=>s.id===o.sourceId)||o.sourceId===newest?.id));
 const rank=o=>o.sourceId===newest?.id?0:o.sourceId==='gamma'||o.sourceId.startsWith('od-')?1:2;
 eligible.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||rank(a)-rank(b));
 let leader=eligible[0]||null;
 if(rth&&band==='current')leader=eligible.find(o=>o.sourceId===newest.id)||leader;
 if(band==='reference')leader=eligible.find(o=>o.sourceId!==newest.id)||null;
 const label=band==='current'?`Deep Gamma: current, ${ageText(minutes)}`:band==='reference'?`Deep Gamma: referenced, ${ageText(minutes)}`:band==='overnight'?`Deep Gamma: overnight paste ${pasted.date} ${String(Math.floor(pasted.seconds/3600)).padStart(2,'0')}:${String(Math.floor(pasted.seconds%3600/60)).padStart(2,'0')} ET, ${ageText(minutes)}`:`Deep Gamma: none this session, QD+OD only${minutes===null?'':` · paste ${ageText(minutes)} old`}`;
 return {version:freshnessVersion,evaluatedAt:new Date(now).toISOString(),window:rth?'RTH':'outside_RTH',overnightPriority,deepGamma:{sourceId:newest?.id||null,band,ageMinutes:minutes,label,reason},entries,observations,leader:leader?{sourceId:leader.sourceId,title:leader.title,kind:leader.kind,timestamp:leader.timestamp}:null,ranking:['Deep Gamma','OptionsDepth','Quant Data']};
}
export function freshnessConstraint(source,packet){
 const f=packet?.freshness||packet?.result?.freshness,entry=f?.entries?.find(e=>e.sourceId===source?.id);
 if(entry?.band==='not_used')return {effect:'unavailable',reason:entry.reason};
 if(entry?.type==='deepgamma'&&entry.band==='reference')return {effect:'context',reason:entry.reason};
 return null;
}
export function freshnessInput(packet,freshness){
 return {...packet,freshness,sources:packet.sources.map(s=>{
  const entry=freshness.entries.find(e=>e.sourceId===s.id);
  if(entry?.band!=='not_used')return {...s,...(entry?{freshnessPolicy:entry}:{})};
  return {id:s.id,title:s.title,sessionDate:s.sessionDate,capturedAt:s.capturedAt,data:{available:false,message:entry.reason},freshnessPolicy:entry};
 })};
}
export const freshnessInstructions=`Apply the supplied server-computed freshness policy to EVERY manual, automatic, 07:05 or checkpoint read. Source ranking for comparable gamma evidence is Deep Gamma > OptionsDepth > Quant Data. During RTH current Deep Gamma (0–30 minutes inclusive and pasted after today's cash open) has full weight and wins ties. Reference Deep Gamma (>30–90 minutes inclusive) supplies slow zero-gamma regions, major gamma and large walls ONLY: no 0DTE walls or pin, no override of fresher OD/QD, no independent directional confirmation. Describe REFERENCE structures in source findings and summary only, never cite that image as a level/checkpoint price source. NOT USED means no current Deep Gamma; QD and OD carry gamma. Excluded images are intentionally not supplied: do not reconstruct them from previous analysis. Outside RTH the newest dated DG paste may be referenced at any age, always with age/date. Compare returned gamma timestamps before naming a leader; a paste is NOT proof of a fresh underlying update. 20:15–04:00 ET gives DG preferred overnight context when supported by relative timestamps, never automatic freshness over a newer dated OD/QD observation. OD uses actual returned model slot, not request/expiry/projection target; a slot is a comparison coordinate, not proven dealer activity. Naive OD slots are assumed ET and marked unverified. QD uses latest bucket timestamps, never stockPrice or request time; exposure panels without buckets remain last-refresh context, even if flow panels update. Do not claim every API is refreshed each minute unless Auto actually did that. ES and profile images use a 24-hour paste-age limit; Databento bars remain available. Name disagreements and the source leading them. State freshness.deepGamma.label and its reason in the read, including when no usable gamma timestamp exists. Freshness grants scope, never proof of price response, live ES conversion or trading accuracy.`;
