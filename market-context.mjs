// Fixed, documented Quant Data endpoints. Credentials never leave the server response boundary.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const finite=Number.isFinite;
function legs(call,put){return {call:finite(call)?call:null,put:finite(put)?put:null,net:finite(call)&&finite(put)?call+put:null};}
export function exposureSnapshot(payload){
 const root=payload?.data?.SPX;if(!object(root?.exposureMap))throw Error('Unrecognized exposure response');
 const strikes=new Map();let incomplete=0;
 for(const [expiry,rows] of Object.entries(root.exposureMap)){
  if(!object(rows))throw Error('Unrecognized expiry rows');
  for(const [strike,row]of Object.entries(rows)){
   if(!finite(Number(strike)))throw Error('Invalid strike');
   const entry=legs(row?.callExposure,row?.putExposure);if(entry.net===null)incomplete++;
   const total=strikes.get(strike)||{strike:Number(strike),call:0,put:0,complete:true,expirations:[]};
   total.call+=entry.call??0;total.put+=entry.put??0;total.complete&&=entry.net!==null;total.expirations.push(expiry);strikes.set(strike,total);
  }
 }
 const all=[...strikes.values()].map(r=>({...r,net:r.complete?r.call+r.put:null}));
 return {stockPrice:finite(root.stockPrice)?root.stockPrice:null,strikeCount:all.length,incompleteLegPairs:incomplete,
  strongest:all.filter(r=>r.net!==null).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,12),
  limitation:'All-expiration sums require both legs at every expiry. Incomplete strikes are excluded from rankings. Session latest snapshot; provider response supplies no observation timestamp.'};
}
export function intervalPath(payload){
 if(!object(payload?.data))throw Error('Unrecognized interval response');
 return Object.entries(payload.data).sort(([a],[b])=>Number(a)-Number(b)).slice(-12).map(([time,expiries])=>{
  if(!finite(Number(time))||!object(expiries))throw Error('Invalid interval');
  let call=0,put=0,incomplete=0,pairs=0;
  for(const rows of Object.values(expiries)){if(!object(rows))throw Error('Invalid interval rows');for(const row of Object.values(rows)){const l=legs(row?.CALL,row?.PUT);pairs++;if(l.net===null)incomplete++;else{call+=l.call;put+=l.put;}}}
  return {timestamp:new Date(Number(time)).toISOString(),call:incomplete?null:call,put:incomplete?null:put,net:incomplete?null:call+put,pairs,incomplete};
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
export function createMarketContext({env=process.env,request=fetch}={}){
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
    const snapshot=await post('/v1/options/tool/exposure-by-strike',{sessionDate:date,greekMode:greek,representationMode:'RAW',filter:{ticker:'SPX'}},exposureSnapshot);
    let intervals;
    if(['GAMMA','DELTA'].includes(greek))intervals=await post('/v1/options/tool/interval-map',{sessionDate:date,greekMode:greek,aggregationPeriod:'5m',filter:{ticker:'SPX'}},p=>({buckets:intervalPath(p),units:'Provider interval-map units; not assumed equal to raw exposure-by-strike.',limitation:'Separate time buckets, never a cumulative current exposure. Changes reflect provider aggregates, not verified dealer trades.'}));
    return {id:'qd-'+greek.toLowerCase(),title:'Quant Data · SPX '+greek+' exposure',sessionDate:date,capturedAt:checkedAt,url:'https://v3.quantdata.us/',data:{ticker:'SPX',metric:greek,sessionDate:date,scope:'All expirations · raw exposure by strike',checkedAt,...snapshot,...(intervals?{intervals}:{})}};
   }));
   const equity=await Promise.all([
    ['dark-pool','SPY dark-pool levels','/v1/equities/tool/dark-pool-levels',{sessionDateRange:{startDate:date,endDate:date},filter:{ticker:'SPY'}},darkPoolLevels],
    ['dark-flow','SPY dark-pool activity','/v1/equities/tool/dark-flow',{sessionDate:date,aggregationPeriod:'5m',filter:{ticker:'SPY'}},darkFlow]
   ].map(async([id,title,path,body,normalize])=>({id:'qd-'+id,title:'Quant Data · '+title,sessionDate:date,capturedAt:checkedAt,url:'https://v3.quantdata.us/',data:{ticker:'SPY',sessionDate:date,checkedAt,contextOnly:true,...await post(path,body,normalize)}})));
   const result={ok:true,count:greekSources.length+equity.length,sources:[...greekSources,...equity],requestCount:calls,checkedAt};cache.set(date,{time:Date.now(),result});if(cache.size>8)cache.delete(cache.keys().next().value);return result;
  }finally{pending=null;}
 };
}
