import {cashSession,nyTime,validDate} from './session.mjs';
const positive=v=>Number.isFinite(v)&&v>0;
export function nyInstant(date,seconds){
 if(!validDate(date)||!Number.isFinite(seconds)||seconds<0||seconds>=86400)throw Error('Invalid market time');
 const wall=Date.parse(date+'T00:00:00Z')+seconds*1000,p=nyTime(wall);
 return new Date(wall+wall-(Date.parse(p.date+'T00:00:00Z')+p.seconds*1000)).toISOString();
}
export function priorSessions(date,count=60){
 const dates=[];for(let i=1;i<=150&&dates.length<count;i++){const d=new Date(Date.parse(date)-i*86400000).toISOString().slice(0,10);if(cashSession(d))dates.push(d);}return dates;
}
export function minutePrices(payload,date,now=Date.now()){
 const hours=cashSession(date);if(!hours||!payload?.data||Array.isArray(payload.data))return [];
 return Object.entries(payload.data).flatMap(([key,r])=>{
  const start=Number(key),end=start+60000,t=nyTime(start);
  if(!Number.isFinite(start)||start%60000||!t||t.date!==date||t.seconds<hours.open||t.seconds>=hours.close||end>now||!positive(r?.closePrice))return [];
  return [{timestamp:new Date(end).toISOString(),intervalStart:new Date(start).toISOString(),price:r.closePrice,volume:Number.isFinite(r.volume)?r.volume:null}];
 }).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
export function nearestStrike(strikes,spot){return positive(spot)?strikes.filter(positive).sort((a,b)=>Math.abs(a-spot)-Math.abs(b-spot)||a-b)[0]??null:null;}
export function premiumObservation({date,expiry=date,strike,strikes,spot,call,put,vix,kind='latest'}){
 const fail=message=>({ready:false,kind,sessionDate:date,expirationDate:expiry,strike,timestamp:spot?.timestamp??null,message});
 if(!cashSession(date)||!cashSession(expiry)||expiry<date)return fail('No eligible expiration for this observation.');
 if(!spot||!call||!put||![spot.price,call.price,put.price].every(positive))return fail('Both call and put closes are required.');
 if(call.timestamp!==spot.timestamp||put.timestamp!==spot.timestamp)return fail('Call, put and SPX must close in the same minute.');
 if(![call.volume,put.volume].every(positive))return fail('Both option legs need reported trading volume in the matched minute.');
 if(strike!==nearestStrike(strikes,spot.price))return fail('The returned pair is not the nearest available strike to the matched SPX price.');
 const premium=call.price+put.price;
 if(Math.min(call.price,put.price)/premium<.05)return fail('One leg is below 5% of the premium. This imbalanced pair is withheld.');
 const matchedVix=vix?.timestamp===spot.timestamp&&positive(vix.price)?vix.price:null;
 return {ready:true,version:1,kind,sessionDate:date,expirationDate:expiry,timestamp:spot.timestamp,intervalStart:spot.intervalStart,strike,spot:spot.price,premium,
  call:call.price,put:put.price,callVolume:call.volume,putVolume:put.volume,vix:matchedVix,
  ratio:matchedVix?(premium/spot.price*100)/(matchedVix/Math.sqrt(252)):null,
  method:'Matched completed 1-minute call + put closes at the nearest available SPX strike. VIX comparison uses (premium / SPX × 100) / (VIX / √252).',
  limitation:'Traded closes, not simultaneous executable bid/ask quotes. Premium distance is not a statistical standard deviation, probability or directional signal.'};
}
export function openingQuartile(opening,history=[]){
 const expected=priorSessions(opening?.sessionDate||'2026-01-01'),byDate=new Map();
 for(const r of history){
  if(!r?.ready||r.version!==1||r.kind!=='opening'||!expected.includes(r.sessionDate)||r.expirationDate!==r.sessionDate||r.timestamp!==nyInstant(r.sessionDate,9*3600+36*60)||![r.premium,r.spot,r.vix].every(positive))continue;
  const ratio=(r.premium/r.spot*100)/(r.vix/Math.sqrt(252));
  if(!positive(r.ratio)||Math.abs(r.ratio-ratio)>1e-8)continue;
  byDate.set(r.sessionDate,r);
 }
 const records=expected.flatMap(d=>byDate.has(d)?[byDate.get(d)]:[]),result={count:records.length,required:60,ready:false,quartile:null,records};
 if(records.length!==60||!positive(opening?.ratio))return result;
 const ratios=records.map(r=>r.ratio).sort((a,b)=>a-b),quantile=p=>{const i=(ratios.length-1)*p,lo=Math.floor(i);return ratios[lo]+(ratios[Math.ceil(i)]-ratios[lo])*(i-lo);};
 const boundaries=[.25,.5,.75].map(quantile);
 return {...result,ready:true,quartile:1+boundaries.filter(q=>opening.ratio>q).length,boundaries};
}
export function esPremiumRange(observation,feed){
 if(!observation?.ready)return {ready:false,message:observation?.message||'Premium observation unavailable.'};
 if(feed?.ticker!=='ES'||feed.dataset!=='GLBX.MDP3'||!/^ES[HMUZ]\d{1,2}$/.test(feed.contract))return {ready:false,message:'Verified ES contract data is required.'};
 const rows=[...(feed.priceObservations||[]),...(feed.recentBars||[]).map(r=>({price:r.close,timestamp:r.end})),feed.openingReference,feed.cashCloseReference].filter(Boolean);
 const matches=rows.filter(r=>r.timestamp===observation.timestamp&&positive(r.price));
 if(!matches.length||new Set(matches.map(r=>r.price)).size!==1)return {ready:false,message:'The matching ES minute is unavailable. No later basis is substituted.'};
 const anchor=matches[0].price,basis=anchor-observation.spot;
 if(Math.abs(basis)>200)return {ready:false,message:'ES and SPX failed the basis plausibility check.'};
 return {ready:true,anchor,basis,lower:anchor-observation.premium,upper:anchor+observation.premium,contract:feed.contract,timestamp:observation.timestamp};
}
