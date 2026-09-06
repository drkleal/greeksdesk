import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validDate,nyTime,isCashObservation,cashSession} from './public/session.mjs';

// Preserve the whole observed session at broader resolutions without another API request.
export function aggregateESBars(bars,minutes){
 const groups=new Map(),duration=minutes*60000;
 for(const b of bars){
  const start=Math.floor(Date.parse(b.timestamp)/duration)*duration;
  let g=groups.get(start);
  if(!g){g={timestamp:new Date(start).toISOString(),end:new Date(start+duration).toISOString(),observedThrough:b.end,open:b.open,high:b.high,low:b.low,close:b.close,volume:0,minuteCount:0,complete:false};groups.set(start,g);}
  g.high=Math.max(g.high,b.high);g.low=Math.min(g.low,b.low);g.close=b.close;g.volume+=b.volume;g.minuteCount++;g.observedThrough=b.end;g.complete=g.minuteCount===minutes;
 }
 return [...groups.values()];
}

export function summarizeES(raw,now=Date.now()){
 if(!raw.ok)return raw;
 if(!/^ES[HMUZ]\d{1,2}$/.test(raw.contract)||raw.dataset!=='GLBX.MDP3'||!validDate(raw.sessionDate)||!Array.isArray(raw.bars)||raw.bars.length>1500)throw Error('Invalid ES response');
 const bars=[...raw.bars].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const ids=new Set(),times=new Set();
 for(const b of bars){
  if(!['open','high','low','close','volume','instrumentId'].every(k=>Number.isFinite(b[k]))||b.low<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||b.volume<0||Date.parse(b.end)-Date.parse(b.timestamp)!==60000||times.has(b.timestamp))throw Error('Invalid ES bars');
  times.add(b.timestamp);ids.add(b.instrumentId);
 }
 if(ids.size>1)throw Error('Mixed ES contracts');
 const cash=bars.filter(b=>isCashObservation(b.timestamp,raw.sessionDate)&&nyTime(b.timestamp).seconds<cashSession(raw.sessionDate).close);
 const stats=rows=>rows.length?{high:Math.max(...rows.map(b=>b.high)),low:Math.min(...rows.map(b=>b.low)),open:rows[0].open,close:rows.at(-1).close,volume:rows.reduce((n,b)=>n+b.volume,0),from:rows[0].timestamp,through:rows.at(-1).end,barCount:rows.length}:null;
 const ranges=bars.slice(-15).slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars.slice(-15)[i].close),Math.abs(b.low-bars.slice(-15)[i].close)));
 const last=bars.at(-1),q=raw.quote;
 if(q&&(!Number.isFinite(q.price)||q.price<=0||!Number.isFinite(Date.parse(q.timestamp))||q.instrumentId!==(last?.instrumentId??q.instrumentId)))throw Error('Invalid ES quote');
 const latest=q&&(!last||Date.parse(q.timestamp)>=Date.parse(last.end))?q:last?{price:last.close,timestamp:last.end,intervalStart:last.timestamp,kind:'Completed 1-minute trade bar'}:null;
 const age=latest?(now-Date.parse(latest.timestamp))/1000:null;
 if(age!==null&&age< -5)throw Error('Future ES observation');
 return {ok:true,count:bars.length||1,available:true,ticker:'ES',contract:raw.contract,requestedSymbol:raw.requestedSymbol,dataset:raw.dataset,sessionDate:raw.sessionDate,checkedAt:new Date(now).toISOString(),
  latestPrice:latest?.price??null,latestTimestamp:latest?.timestamp??null,priceKind:latest?.kind??null,
  freshness:q&&latest===q&&age>=0&&age<=20?'fresh':nyTime(now)?.date===raw.sessionDate?'stale':'historical',ageSeconds:age,
  session:stats(bars),cashSession:stats(cash),recentBars:bars.slice(-120),averageTrueRange1m:ranges.length===14?ranges.reduce((n,x)=>n+x,0)/14:null,
  structureVersion:1,bars5m:aggregateESBars(bars,5),bars15m:aggregateESBars(bars,15),
  structureScope:'Full observed futures session in 5-minute and 15-minute bars; last 120 one-minute bars for local timing. Aggregate OHLCV uses only returned minute records. complete=false means not every minute slot is represented; observedThrough is the last supplied minute end. Session range describes past movement, not a forecast.',
  priceObservations:bars.map(b=>({price:b.close,timestamp:b.end})),messages:raw.messages||[],estimatedHistoryCostUSD:raw.estimatedHistoryCostUSD,
  limitation:'Unadjusted '+raw.contract+' prices. Session window: prior 18:00–17:00 New York. Bars describe observed prices, not exchange settlement. Completed bar closes have interval-end timestamps; no exact trade-time claim. A fresh price does not refresh an older scenario.'};
}

function worker(input,env){return new Promise(resolve=>{
 const child=spawn(env.DATABENTO_PYTHON||'python3',[fileURLToPath(new URL('./databento_worker.py',import.meta.url))],{windowsHide:true,env:{PATH:env.PATH||env.Path||'',SYSTEMROOT:env.SYSTEMROOT||env.SystemRoot||'',DATABENTO_API_KEY:env.DATABENTO_API_KEY,PYTHONPATH:env.DATABENTO_PYTHONPATH||'',PYTHONUNBUFFERED:'1'},stdio:['pipe','pipe','pipe']});
 let output='',done=false;
 const finish=r=>{if(done)return;done=true;clearTimeout(timer);resolve(r);};
 const timer=setTimeout(()=>{child.kill();finish({ok:false,message:'ES data request timed out. No automatic retry was made.'});},65000);
 child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1000000){child.kill();finish({ok:false,message:'ES response exceeded the bounded sample size.'});}});
 child.stderr.resume(); // SDK logs are deliberately not relayed to the browser or application logs.
 child.on('error',()=>finish({ok:false,message:'The ES data reader is unavailable in this deployment.'}));
 child.on('close',()=>{try{finish(JSON.parse(output));}catch{finish({ok:false,message:'ES data reader returned an invalid response.'});}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
});}

export function createDatabento({env=process.env,run=worker,now=Date.now}={}){
 const cache=new Map();let pending=null;
 return async(date,symbol=env.DATABENTO_ES_SYMBOL||'ES.v.0')=>{
  if(!validDate(date)||!/^ES(?:\.v\.0|[HMUZ]\d{1,2})$/.test(symbol))throw Error('Select a valid ES contract and date.');
  if(!env.DATABENTO_API_KEY)return {ok:false,configured:false,message:'Databento key is not configured.'};
  const key=date+'|'+symbol,old=cache.get(key),ttl=date===nyTime(now()).date?15000:3600000;
  if(old&&now()-old.at<ttl){const result=structuredClone(old.result);if(result.latestTimestamp){result.ageSeconds=(now()-Date.parse(result.latestTimestamp))/1000;if(result.freshness==='fresh'&&result.ageSeconds>20)result.freshness='stale';}return {...result,cached:true};}
  if(pending)return {ok:false,message:'An ES market-data read is already running.'};
  pending=key;try{const raw=await run({date,symbol},env),result=summarizeES(raw,now());if(result.ok){cache.set(key,{at:now(),result});if(cache.size>8)cache.delete(cache.keys().next().value);}return result;}catch{return {ok:false,message:'ES data failed contract or timestamp validation.'};}finally{pending=null;}
 };
}
