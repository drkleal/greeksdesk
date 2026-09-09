import {esSessionDate,validDate} from './public/session.mjs';
import {calculateBasis} from './basis.mjs';

const positive=n=>Number.isFinite(n)&&n>0;
const millis=n=>Number.isFinite(n)&&n>1e17?Math.floor(n/1e6):NaN;
// Quotes and trades have different timestamps. Never relabel settlement/last trade as live.
export function normalizeMassiveSnapshot(rows,date,symbol,now=Date.now()){
 const eligible=rows.filter(r=>r.details?.product_code==='ES'&&/^ES[HMUZ]\d{1,2}$/.test(r.details.ticker)&&validDate(r.details.settlement_date)&&r.details.settlement_date>=date&&Date.parse(r.details.settlement_date)-Date.parse(date)<370*86400000);
 const candidates=eligible.filter(r=>symbol==='ES.v.0'||r.details.ticker===symbol).map(r=>{
  const q=r.last_quote,t=r.last_trade,qt=Math.min(millis(q?.bid_timestamp),millis(q?.ask_timestamp));
  let observation;
  if(q?.timeframe==='REAL-TIME'&&positive(q.bid)&&positive(q.ask)&&q.bid<=q.ask&&now-qt>=0&&now-qt<=20000)
   observation={latestPrice:(q.bid+q.ask)/2,latestTimestamp:new Date(qt).toISOString(),priceKind:'Bid/ask midpoint (not a traded price)',bid:q.bid,ask:q.ask};
  const tt=millis(t?.last_updated);
  if(!observation&&t?.timeframe==='REAL-TIME'&&positive(t.price)&&now-tt>=0&&now-tt<=20000)
   observation={latestPrice:t.price,latestTimestamp:new Date(tt).toISOString(),priceKind:'Last trade'};
  return observation?{...observation,contract:r.details.ticker,settlementDate:r.details.settlement_date,selectionVolume:Number.isFinite(r.session?.volume)?r.session.volume:0}:null;
 }).filter(Boolean).sort((a,b)=>b.selectionVolume-a.selectionVolume);
 if(!candidates.length)throw Error('Polygon/Massive returned no ES trade or two-sided quote within 20 seconds. No live price applied.');
 if(symbol==='ES.v.0'&&candidates.length>1&&candidates[0].selectionVolume===candidates[1].selectionVolume)throw Error('ES contract selection is ambiguous. Enter the exact contract shown on your chart.');
 const selected=candidates[0];
 return {ok:true,count:1,available:true,ticker:'ES',provider:'Polygon/Massive',dataset:'MASSIVE.FUTURES',family:'price',sessionDate:date,requestedSymbol:symbol,...selected,checkedAt:new Date(now).toISOString(),freshness:'fresh',recentBars:[],messages:[],
  contractSelection:symbol==='ES.v.0'?'Highest reported session volume among returned unexpired ES contracts with fresh quotes.':'Explicit ES contract.',
  limitation:'Current price observation only. Bid/ask midpoint is indicative, not an execution or last trade. No session extrema, volume profile or price history inferred.'};
}

export function createMassive({env=process.env,request=fetch,now=Date.now}={}){
 const key=env.POLYGON_API_KEY||env.MASSIVE_API_KEY;
 async function get(path){
  const r=await request('https://api.massive.com'+path,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error(r.status===401||r.status===403?'Polygon/Massive denied access to this dataset. Check this key’s futures or indices access.':'Polygon/Massive request failed (HTTP '+r.status+').');
  const b=await r.json();if(b.status!=='OK'||!Array.isArray(b.results))throw Error('Polygon/Massive returned no usable snapshot.');return b;
 }
 return async(date,symbol='ES.v.0')=>{
  if(!validDate(date)||!/^ES(?:\.v\.0|[HMUZ]\d{1,2})$/.test(symbol))throw Error('Select a valid ES contract and date.');
  if(!key)return {ok:false,message:'Polygon/Massive is not configured.'};
  if(date!==esSessionDate(now()))return {ok:false,message:'Polygon/Massive live snapshot is for the current futures session only. It is not substituted into a historical chart.'};
  try{
   const query=symbol==='ES.v.0'?'product_code=ES&limit=100':'ticker='+encodeURIComponent(symbol)+'&limit=1';
   const [future,index]=await Promise.allSettled([get('/futures/v1/snapshot?'+query),get('/v3/snapshot/indices?ticker=I%3ASPX&limit=1')]);
   if(future.status==='rejected')throw future.reason;
   if(future.value.next_url)throw Error('ES snapshot exceeded the bounded contract list. Enter the exact contract shown on your chart.');
   const result=normalizeMassiveSnapshot(future.value.results,date,symbol,now());
   const spx=index.status==='fulfilled'?index.value.results.find(x=>x.ticker==='I:SPX'&&!x.error):null;
   try{
    if(spx?.timeframe!=='REAL-TIME'||!positive(spx.value)||!Number.isFinite(millis(spx.last_updated)))throw Error('No timestamped real-time SPX reference returned.');
    const timestamp=new Date(millis(spx.last_updated)).toISOString();
    result.spxReference={ticker:'SPX',price:spx.value,timestamp,provider:'Polygon/Massive'};
    result.basisResult={...calculateBasis({instrument:'ES',price:result.latestPrice,timestamp:result.latestTimestamp,contract:result.contract},{priceObservations:[{price:spx.value,timestamp}]},date),esPriceKind:result.priceKind};
   }catch(error){result.basisResult={ok:false,message:error.message};}
   return result;
  }catch(error){return {ok:false,message:error?.name==='TimeoutError'?'Polygon/Massive timed out. No automatic retry.':error.message?.startsWith('Polygon/')||error.message?.startsWith('ES ')?error.message:'Polygon/Massive response failed price, contract or timestamp checks.'};}
 };
}
