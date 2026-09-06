import {mapLimit} from './quant-panels.mjs';
import {normalizeGamma} from './providers.mjs';
const finite=Number.isFinite;
const metrics=[['GEX','Gamma','gamma'],['DEX','DEX','delta'],['VEX','Vanna','vanna'],['CEX','Charm','charm'],['NET_POSITION','Net position','positioning']];
const time=t=>typeof t==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)&&finite(Date.parse(t));
export function positionalRows(payload,date,selection,byExpiration=false){
 if(!Array.isArray(payload))throw Error('Expected positional rows');
 const canonical=payload.map(r=>({effectiveDatetime:r.effective_datetime??r.effectiveDatetime,strikePrice:r.strike_price??r.strikePrice,expirationDate:r.expiration_date??r.expirationDateOriginal??r.expirationDate,optionSymbol:r.option_symbol??r.optionSymbol,latestValue:r.latest_value??r.latestValue,open:r.open,priorUpdate:r.prior_update??r.priorUpdate,minWicks:r.min_wicks??r.minWicks,maxWicks:r.max_wicks??r.maxWicks}));
 if(canonical.some(r=>!time(r.effectiveDatetime)))throw Error('Invalid model timestamp');
 const eligible=canonical.filter(r=>r.effectiveDatetime.startsWith(date+'T')&&r.effectiveDatetime<=selection.slot);
 const actualSlot=eligible.map(r=>r.effectiveDatetime).sort().at(-1)||null;
 if(!actualSlot)return {available:false,rows:[],actualSlot:null,message:'No model rows at or before the selected slot in this session.'};
 const rows=eligible.filter(r=>r.effectiveDatetime===actualSlot).map(r=>({...(byExpiration?{expirationDate:r.expirationDate,optionSymbol:r.optionSymbol}: {strike:r.strikePrice}),value:r.latestValue,open:finite(r.open)?r.open:null,priorUpdate:finite(r.priorUpdate)?r.priorUpdate:null,minWicks:finite(r.minWicks)?r.minWicks:null,maxWicks:finite(r.maxWicks)?r.maxWicks:null}));
 if(rows.some(r=>!finite(r.value)||(byExpiration?typeof r.expirationDate!=='string':!finite(r.strike))))throw Error('Invalid positional coordinate');
 return {rows:rows.slice(0,100),rowCount:rows.length,partial:rows.length>100,receivedCount:payload.length,actualSlot,timeRole:'provider_model_coordinate',timezone:null,modelUpdatedAt:null,units:'OptionsDepth provider metric units; never summed with QD scaling',limitation:'Participant and expiration scopes are separate. A model position is not a verified hedge transaction. Open/priorUpdate are provider comparison values; their exact observation times are not supplied.'};
}
export function depthRows(payload){
 if(Array.isArray(payload))payload=payload.map(r=>({strikePrice:r.strike_price??r.strikePrice,netValue:r.net_value??r.netValue,callValue:r.call_value??r.callValue,putValue:r.put_value??r.putValue,expirationDateOriginal:r.expiration_date_original??r.expirationDateOriginal??r.expiration_date,optionSymbol:r.option_symbol??r.optionSymbol}));
 if(!Array.isArray(payload)||payload.some(r=>!finite(r.strikePrice)||!finite(r.netValue)||typeof r.expirationDateOriginal!=='string'))throw Error('Invalid depth rows');
 const all=payload.map(r=>({strike:r.strikePrice,expirationDate:r.expirationDateOriginal,optionSymbol:r.optionSymbol,net:r.netValue,call:finite(r.callValue)?r.callValue:null,put:finite(r.putValue)?r.putValue:null}));
 if(!all.length)return {available:false,rows:[],message:'No Depth View cells in the requested range.'};
 const byStrike=new Map(),byExpiry=new Map();
 for(const r of all){for(const [map,key]of [[byStrike,r.strike],[byExpiry,r.expirationDate]])map.set(key,(map.get(key)||0)+r.net);}
 return {rowCount:all.length,rows:all.sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,80),byStrike:[...byStrike].sort(([a],[b])=>a-b).map(([strike,net])=>({strike,net})),byExpiration:[...byExpiry].sort(([a],[b])=>a.localeCompare(b)).map(([expirationDate,net])=>({expirationDate,net})),partial:all.length>80,units:'OptionsDepth provider metric units',limitation:'Top 80 strike/expiration cells shown. Strike and expiration sums use all returned cells. These are modeled option positions, not a futures order book or traded volume profile.'};
}
export function optionsDepthRequests(date,selection){
 const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+90);
 const base={ticker:'SPX',date,model:'intraday',date_time:selection.slot.replace('T',' '),lower_strike_price:String(selection.min),upper_strike_price:String(selection.max),expiration_type:'all',mode:'net',with_markers:'true',option_type:'A'};
 const tasks=[];
 for(const participant of ['mm','all_cust'])for(const [metric,name,family]of metrics)for(const byExpiration of [false,true]){
  if(participant==='all_cust'&&!['DEX','NET_POSITION'].includes(metric))continue;
  const shape=byExpiration?'expiration':'strike';
  tasks.push({id:`od-${metric.toLowerCase().replace('_','-')}-${participant==='mm'?'mm':'customers'}-${shape}`,title:`OptionsDepth · ${participant==='mm'?'Dealer':'Customer'} ${name} by ${shape}`,family,path:`breakdown-by-${shape}/`,query:{...base,metric,customer_type:participant},normalize:p=>positionalRows(p,date,selection,byExpiration)});
 }
 for(const [metric,participant]of [['GEX','mm'],['DEX','all_cust'],['NET_POSITION','all_cust']]){
  tasks.push({id:'od-depth-'+metric.toLowerCase().replace('_','-'),title:'OptionsDepth · Depth View '+metric,family:metric==='GEX'?'gamma':metric==='DEX'?'delta':'positioning',path:'depthview/',query:{...base,metric,customer_type:participant,expiration_type:'range',expiration_range_start:date,expiration_range_end:end.toISOString().slice(0,10)},normalize:depthRows});
 }
 for(const type of ['gamma','charm','vanna'])tasks.push({id:type==='gamma'?'gamma':'od-heatmap-'+type,title:'OptionsDepth · SPX '+type+' heatmap',family:type,path:'heatmap/',query:{key:undefined,model:'intraday',date,ticker:'SPX',type,date_time:selection.slot.replace('T',' '),min_price:String(selection.min),max_price:String(selection.max),is_upcoming_day:'false'},normalize:p=>({...normalizeGamma(p,date,selection),units:'OptionsDepth heatmap model units',timeRole:'heatmap_coordinate',timezone:null,modelUpdatedAt:null})});
 return tasks;
}
export function createOptionsDepthContext({env=process.env,request=fetch}={}){
 const cache=new Map(),pending=new Map();
 return async (date,selection)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!time(selection?.slot)||!selection.slot.startsWith(date+'T')||!finite(selection.min)||!finite(selection.max)||selection.min<=0||selection.max<=selection.min||selection.max-selection.min>300)throw Error('Invalid model selection');
  const tasks=optionsDepthRequests(date,selection),checkedAt=new Date().toISOString(),cacheKey=JSON.stringify([date,selection]),old=cache.get(cacheKey);
  if(old&&Date.now()-old.time<600000)return {...old.result,cached:true,requestCount:0};
  if(pending.has(cacheKey))return pending.get(cacheKey);
  const job=(async()=>{
   let calls=0;
   const sources=await mapLimit(tasks,3,async t=>{
    let data;
    if(!env.OPTIONSDEPTH_API_KEY)data={available:false,message:'OptionsDepth key is not configured.'};
    else try{
     calls++;const params=new URLSearchParams(Object.entries({...t.query,key:env.OPTIONSDEPTH_API_KEY}).filter(([,v])=>v!==undefined));
     const r=await request('https://api.optionsdepth.com/options-depth-api/v1/'+t.path+'?'+params,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
     data=r.ok?{available:true,...t.normalize(await r.json())}:{available:false,message:'OptionsDepth returned HTTP '+r.status+'. No retry made.'};
    }catch{data={available:false,message:'OptionsDepth timed out or returned an unrecognized response. No retry made.'};}
    const {key,...requestScope}=t.query;
    return {id:t.id,title:t.title,sessionDate:date,capturedAt:checkedAt,url:'https://app.optionsdepth.com/'+(t.path==='heatmap/'?'market-makers':t.path==='depthview/'?'depth-view':'positional-insight'),data:{ticker:'SPX',family:t.family,endpoint:t.path,requestScope,scope:`SPX · ${t.query.customer_type||'heatmap'} · ${t.query.expiration_type==='range'?t.query.expiration_range_start+' through '+t.query.expiration_range_end:t.query.expiration_type||'provider model'} · ${selection.min}–${selection.max}`,requestedSlot:selection.slot,sessionDate:date,checkedAt,...data}};
   });
   // No documented IV Depth API exists in the provider's API catalogue.
   sources.push({id:'od-iv-depth',title:'OptionsDepth · IV Depth',sessionDate:date,capturedAt:checkedAt,url:'https://app.optionsdepth.com/iv-depth',data:{ticker:'SPX',family:'volatility',available:false,captureRequired:true,message:'IV Depth has no endpoint in the documented API catalogue. Its original visible panel must be captured for analysis.'}});
   const result={ok:true,count:sources.length,sources,requestCount:calls,checkedAt,cacheSeconds:600};cache.set(cacheKey,{time:Date.now(),result});if(cache.size>8)cache.delete(cache.keys().next().value);return result;
  })();pending.set(cacheKey,job);try{return await job;}finally{pending.delete(cacheKey);}
 };
}
