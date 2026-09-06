// Fixed, documented Quant Data endpoints. Credentials never leave the server response boundary.
import {collectQuantPanels} from './quant-panels.mjs';
import {collectStraddle} from './straddle-provider.mjs';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const finite=Number.isFinite;
// Quant Data omits a leg when it has no exposure. Explicit null/invalid values
// remain unknown; never apply this endpoint-specific rule to another provider.
function legs(row,callKey,putKey){
 if(!object(row))throw Error('Invalid exposure cell');
 const value=key=>!Object.hasOwn(row,key)?0:finite(row[key])?row[key]:null;
 const call=value(callKey),put=value(putKey);
 return {call,put,net:call!==null&&put!==null?call+put:null,omitted:Number(!Object.hasOwn(row,callKey))+Number(!Object.hasOwn(row,putKey))};
}
export function exposureSnapshot(payload,sessionDate,representationMode='RAW'){
 const root=payload?.data?.SPX;if(!object(root?.exposureMap))throw Error('Unrecognized exposure response');
 const strikes=new Map(),byExpiration=[];let incomplete=0,omitted=0;
 const expirationDates=Object.keys(root.exposureMap).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&(!sessionDate||d>=sessionDate)).sort().slice(0,3);
 const zeroDteAvailable=!!sessionDate&&Object.hasOwn(root.exposureMap,sessionDate);
 for(const [expiry,rows] of Object.entries(root.exposureMap)){
  if(!object(rows))throw Error('Unrecognized expiry rows');
  let expiryCall=0,expiryPut=0,expiryComplete=true;
  for(const [strike,row]of Object.entries(rows)){
   if(!finite(Number(strike)))throw Error('Invalid strike');
   const entry=legs(row,'callExposure','putExposure');if(entry.net===null)incomplete++;omitted+=entry.omitted;
   expiryCall+=entry.call??0;expiryPut+=entry.put??0;expiryComplete&&=entry.net!==null;
   const strikeKey=Number(strike),total=strikes.get(strikeKey)||{strike:strikeKey,call:0,put:0,complete:true,expirations:[],zeroDte:null,expiryExposure:{}};
   if(expiry===sessionDate)total.zeroDte={call:entry.call,put:entry.put,net:entry.net};
   if(expirationDates.includes(expiry))total.expiryExposure[expiry]={call:entry.call,put:entry.put,net:entry.net};
   total.call+=entry.call??0;total.put+=entry.put??0;total.complete&&=entry.net!==null;total.expirations.push(expiry);strikes.set(strikeKey,total);
  }
  byExpiration.push({expirationDate:expiry,call:expiryComplete?expiryCall:null,put:expiryComplete?expiryPut:null,net:expiryComplete?expiryCall+expiryPut:null});
 }
 const all=[...strikes.values()].map(r=>({...r,call:r.complete?r.call:null,put:r.complete?r.put:null,net:r.complete?r.call+r.put:null}));
 const stockPrice=finite(root.stockPrice)?root.stockPrice:null;
 return {normalizationVersion:2,stockPrice,strikeCount:all.length,incompleteLegPairs:incomplete,omittedZeroLegs:omitted,
  ladderVersion:1,representationMode,byExpiration,expirationDates,zeroDteAvailable,zeroDteDate:sessionDate||null,
  ladder:stockPrice===null?[]:all.filter(r=>Math.abs(r.strike-stockPrice)<=150).sort((a,b)=>Math.abs(a.strike-stockPrice)-Math.abs(b.strike-stockPrice)).slice(0,81).sort((a,b)=>a.strike-b.strike),
  ladderScope:'Up to 81 nearest strikes within 150 SPX points. All expirations and a separate same-session expiration slice; missing rows are not inferred.',
  strongest:all.filter(r=>r.net!==null).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,12),
  nearby:stockPrice===null?[]:all.filter(r=>r.net!==null&&Math.abs(r.strike-stockPrice)<=60).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,12),nearbyBandPoints:60,
  limitation:'Quant Data documents omitted legs as no exposure (zero). Explicit null or invalid legs remain unknown and exclude that strike from rankings. All expirations; nearby ranks are within 60 SPX points of stockPrice. Session latest snapshot; provider response supplies no observation timestamp.'};
}
export function intervalPath(payload){
 if(!object(payload?.data))throw Error('Unrecognized interval response');
 return Object.entries(payload.data).sort(([a],[b])=>Number(a)-Number(b)).slice(-12).map(([time,expiries])=>{
  if(!finite(Number(time))||!object(expiries))throw Error('Invalid interval');
  let call=0,put=0,incomplete=0,pairs=0,omitted=0;
  for(const rows of Object.values(expiries)){if(!object(rows))throw Error('Invalid interval rows');for(const row of Object.values(rows)){const l=legs(row,'CALL','PUT');pairs++;omitted+=l.omitted;if(l.net===null)incomplete++;else{call+=l.call;put+=l.put;}}}
  return {timestamp:new Date(Number(time)).toISOString(),call:incomplete?null:call,put:incomplete?null:put,net:incomplete?null:call+put,pairs,incomplete,omittedZeroLegs:omitted};
 });
}
export function darkPoolLevels(payload){
 if(!object(payload?.data))throw Error('Unrecognized dark-pool response');
 const rows=Object.entries(payload.data).map(([price,r])=>({price:Number(price),notionalValue:r?.notionalValue,size:r?.size,tradeCount:r?.tradeCount}));
 if(rows.some(r=>!Object.values(r).every(finite)))throw Error('Invalid dark-pool rows');
 return {levelCount:rows.length,levels:rows.sort((a,b)=>b.notionalValue-a.notionalValue).slice(0,10),
  limitation:'SPY transactions, not ES price levels or evidence of buying/selling intent. Do not convert SPY prices to ES. Request-time latestStockPrice intentionally omitted from historical evidence.'};
}
export function darkFlow(payload){
 if(!object(payload?.data))throw Error('Unrecognized dark-flow response');
 const rows=Object.entries(payload.data).map(([time,r])=>({timestamp:Number(time),notionalValue:r?.notionalValue,size:r?.size,tradeCount:r?.tradeCount,stockPrice:finite(r?.stockPrice)?r.stockPrice:null})).sort((a,b)=>a.timestamp-b.timestamp);
 if(rows.some(r=>![r.timestamp,r.notionalValue,r.size,r.tradeCount].every(finite)))throw Error('Invalid dark-flow rows');
 return {bucketCount:rows.length,notionalTotal:rows.reduce((n,r)=>n+r.notionalValue,0),recentBuckets:rows.slice(-12).map(r=>({...r,timestamp:new Date(r.timestamp).toISOString()})),limitation:'Five-minute SPY dark-pool activity. Not directional order flow or direct evidence of dealer inventory.'};
}
export function createMarketContext({env=process.env,request=fetch,openingHistory}={}){
 let pending=null;const cache=new Map();
 return async date=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid date');
  if(!env.QUANT_DATA_API_KEY)return {ok:false,message:'Quant Data key is not configured.'};
  if(cache.has(date)&&Date.now()-cache.get(date).time<60000)return {...cache.get(date).result,cached:true};
  if(pending)return {ok:false,message:'Market evidence update is already running.'};pending=date;
  const checkedAt=new Date().toISOString();let calls=0;
  async function post(path,body,normalize){
   calls++;try{const r=await request('https://api.quantdata.us'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.QUANT_DATA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok)return {available:false,message:'Provider returned HTTP '+r.status};
    return {available:true,...normalize(await r.json())};
   }catch{return {available:false,message:'Provider timed out or returned an unrecognized response. No retry made.'};}
  }
  try{
   const greekSources=await Promise.all(['GAMMA','DELTA','VANNA','CHARM'].map(async greek=>{
    const snapshot=await post('/v1/options/tool/exposure-by-strike',{sessionDate:date,greekMode:greek,representationMode:'PER_ONE_PERCENT_MOVE',filter:{ticker:'SPX'}},p=>exposureSnapshot(p,date,'PER_ONE_PERCENT_MOVE'));
    let intervals;
    if(['GAMMA','DELTA'].includes(greek))intervals=await post('/v1/options/tool/interval-map',{sessionDate:date,greekMode:greek,aggregationPeriod:'5m',filter:{ticker:'SPX'}},p=>({buckets:intervalPath(p),units:'Provider interval-map units; not assumed equal to raw exposure-by-strike.',limitation:'Separate time buckets, never a cumulative current exposure. Changes reflect provider aggregates, not verified dealer trades.'}));
    return {id:'qd-'+greek.toLowerCase(),title:'Quant Data · SPX '+greek+' exposure',sessionDate:date,capturedAt:checkedAt,url:'https://v3.quantdata.us/',data:{ticker:'SPX',family:greek.toLowerCase(),metric:greek,sessionDate:date,scope:'All expirations · per 1% move · by strike and expiration; separate 0DTE slice',checkedAt,...snapshot,...(intervals?{intervals}:{})}};
   }));
   const equity=await Promise.all([
    ['dark-pool','SPY dark-pool levels','/v1/equities/tool/dark-pool-levels',{sessionDateRange:{startDate:date,endDate:date},filter:{ticker:'SPY'}},darkPoolLevels],
    ['dark-flow','SPY dark-pool activity','/v1/equities/tool/dark-flow',{sessionDate:date,aggregationPeriod:'5m',filter:{ticker:'SPY'}},darkFlow]
   ].map(async([id,title,path,body,normalize])=>({id:'qd-'+id,title:'Quant Data · '+title,sessionDate:date,capturedAt:checkedAt,url:'https://v3.quantdata.us/',data:{ticker:'SPY',sessionDate:date,checkedAt,contextOnly:true,...await post(path,body,normalize)}})));
   const panels=await collectQuantPanels(date,post,checkedAt,greekSources.find(s=>Number.isFinite(s.data.stockPrice))?.data.stockPrice??null);
   const straddle=await collectStraddle(date,post,checkedAt);
   if(openingHistory){await openingHistory.remember(straddle.data.opening);straddle.data.history=await openingHistory.records(date);}
   const sources=[...greekSources,...equity,...panels,straddle];
   const result={ok:true,count:sources.length,sources,requestCount:calls,checkedAt};cache.set(date,{time:Date.now(),result});if(cache.size>8)cache.delete(cache.keys().next().value);return result;
  }finally{pending=null;}
 };
}
