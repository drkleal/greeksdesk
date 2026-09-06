// Documented Quant Data panel adapters. Each source retains its request scope.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const number=v=>Number.isFinite(v)?v:null;
const fields=(v,keys)=>Object.fromEntries(keys.map(k=>[k,typeof v?.[k]==='string'||typeof v?.[k]==='boolean'?v[k]:number(v?.[k])]));
const grid=p=>{if(!object(p?.data))throw Error('Expected data grid');return p.data;};
const iso=t=>Number.isFinite(Number(t))?new Date(Number(t)).toISOString():null;
const dateKey=d=>/^\d{4}-\d{2}-\d{2}$/.test(d);
export async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}));return out;}
export function oiRows(p,key,date,stockPrice=null){
 const rows=Object.entries(grid(p)).filter(([k])=>key!=='sessionDate'||dateKey(k)&&k<=date).map(([k,v])=>({[key]:key==='strike'?Number(k):k,...fields(v,['callOpenInterest','putOpenInterest'])}));
 if(rows.some(r=>key==='strike'&&!Number.isFinite(r.strike)))throw Error('Invalid strike');
 const ordered=key==='strike'?rows.sort((a,b)=>(b.callOpenInterest??0)+(b.putOpenInterest??0)-(a.callOpenInterest??0)-(a.putOpenInterest??0)):rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key])));
 const selected=key==='strike'&&Number.isFinite(stockPrice)?[...new Map([...ordered.slice(0,12),...ordered.filter(r=>Math.abs(r.strike-stockPrice)<=150).sort((a,b)=>Math.abs(a.strike-stockPrice)-Math.abs(b.strike-stockPrice)).slice(0,81)].map(r=>[r.strike,r])).values()].sort((a,b)=>a.strike-b.strike):key==='sessionDate'?ordered.slice(-20):ordered.slice(0,60);
 return {rowCount:rows.length,rows:selected,partial:selected.length<rows.length,units:'Contracts',limitation:'Open interest is a reported position snapshot, not an intraday change in dealer inventory. Missing values are unknown.',...(key==='strike'?{stockPrice,selection:Number.isFinite(stockPrice)?'Nearest 81 strikes within 150 points plus the 12 largest OI strikes':'Largest 60 OI strikes; price reference unavailable'}:{})};
}
export function ivRank(p,date){
 const v=grid(p)[date];if(!object(v?.contractTypeToIVData))return {available:false,message:'No IV-rank observation for the selected session.'};
 const legs=Object.fromEntries(['CALL','PUT'].map(side=>{const r=fields(v.contractTypeToIVData[side],['lastIv','windowMinIv','windowMaxIv']);return [side,{...r,rankPercent:Object.values(r).every(Number.isFinite)&&r.windowMaxIv>r.windowMinIv?100*(r.lastIv-r.windowMinIv)/(r.windowMaxIv-r.windowMinIv):null}];}));
 return {observationDate:date,stockPrice:number(v.stockPrice),expirationDate:v.expirationDate,legs,lookBackDays:365,maturityDays:30,units:'IV in percent as returned by the live API; rank in percent',limitation:'Rank is computed separately for calls and puts from the provider window. No newer session is substituted. Live IV scaling was checked against the platform; it differs from the fractional examples in the documentation.'};
}
export function volatilityGrid(p,date,term=false){
 const data=grid(p),spot=number(p.stockPrice),all=Object.keys(data).filter(d=>dateKey(d)&&d>=date).sort(),expirations=[];
 for(const expiry of all.slice(0,16)){
  if(!object(data[expiry]))throw Error('Invalid expiry');
  const rows=Object.entries(data[expiry]).map(([strike,r])=>({strike:Number(strike),call:term?fields(r?.CALL,['delta','iv','moneyType']):number(r?.CALL),put:term?fields(r?.PUT,['delta','iv','moneyType']):number(r?.PUT)})).filter(r=>Number.isFinite(r.strike));
  if(spot===null){expirations.push({expirationDate:expiry,rowCount:rows.length,atm:null,rows:[]});continue;}
  rows.sort((a,b)=>Math.abs(a.strike-spot)-Math.abs(b.strike-spot));
  const entry={expirationDate:expiry,rowCount:rows.length,atm:rows[0]||null};
  if(term){
   const leg=(side,target)=>rows.filter(r=>Number.isFinite(r[side]?.delta)&&Number.isFinite(r[side]?.iv)).sort((a,b)=>Math.abs(a[side].delta-target)-Math.abs(b[side].delta-target))[0];
   const c=leg('call',.25),p=leg('put',-.25);
   entry.delta25=c&&p&&Math.abs(c.call.delta-.25)<=.03&&Math.abs(p.put.delta+.25)<=.03?{callStrike:c.strike,putStrike:p.strike,callDelta:c.call.delta,putDelta:p.put.delta,callIv:c.call.iv,putIv:p.put.iv,putMinusCallVolPoints:p.put.iv-c.call.iv}:null;
  }else entry.rows=rows.slice(0,21).sort((a,b)=>a.strike-b.strike);
  expirations.push(entry);
 }
 return {stockPrice:spot,expirationCount:all.length,expirations,partial:all.length>16||!term,units:'IV in percent as returned by the live API; delta25 difference in percentage points',limitation:term?'ATM uses nearest available strike. 25-delta skew is supplied only with both deltas within 0.03 of their targets.':'Nearest 21 strikes per expiry. This surface has no deltas; do not describe its wings as 25-delta skew.'};
}
export function series(p,keys,{cents=false,totals=false}={}){
 const rows=Object.entries(grid(p)).map(([t,r])=>({timestamp:iso(t),...fields(r,keys)})).sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
 if(rows.some(r=>r.timestamp===null))throw Error('Invalid time');
 if(cents)for(const row of rows)for(const k of ['callSum','putSum'])if(Number.isFinite(row[k]))row[k]/=100;
 const sums=totals?Object.fromEntries(keys.filter(k=>k!=='stockPrice').map(k=>[k,rows.length&&rows.every(r=>Number.isFinite(r[k]))?rows.reduce((s,r)=>s+r[k],0):null])):undefined;
 return {bucketCount:rows.length,latestTimestamp:rows.at(-1)?.timestamp||null,latest:rows.at(-1)||null,recentBuckets:rows.slice(-24),...(sums?{totals:sums}:{}),partial:rows.length>24,units:cents?'USD (provider cents divided by 100)':'Provider fields; IV and ARV in percent, checked against platform',limitation:'Recent 24 buckets retained; totals, where present, are rebuilt from every returned bucket. No inference of opening versus closing trades.'};
}
export function tape(p,kind){
 if(!Array.isArray(p?.data))throw Error('Expected tape');
 const keys=kind==='equity'?['ticker','price','size','notionalValue','printType','tradeSide','isDelayedPrint','tradeTime']:kind==='oi'?['ticker','contractType','strikePrice','expirationDate','previousOpenInterest','currentOpenInterest','changeInOpenInterest','percentChangeInOpenInterest','sessionDate','createdTime']:['ticker','contractType','strikePrice','expirationDate','premium','size','tradeSideCode','tradeConsolidationType','stockPrice','tradeTime','optionPrice'];
 return {rowCount:p.data.length,rows:p.data.map(r=>fields(r,keys)),partial:!!p.nextSearchAfter,hasMore:!!p.nextSearchAfter,units:kind==='equity'?'Prices and notional in USD; size in shares':kind==='oi'?'Open interest in contracts; percentChangeInOpenInterest in percent, verified against count changes':'Premium in USD; size in contracts',limitation:'Bounded first page, ordered by the stated request. Not the complete tape. Quote-side classification does not establish buyer identity or opening/closing intent.'};
}
const mapPairs=(p,keys)=>({rows:Object.entries(grid(p)).map(([side,v])=>({side,...fields(v,keys)}))});
export function quantPanelRequests(date,{stockPrice=null}={}){
 const scope={sessionDate:date,filter:{ticker:'SPX'}},url='https://v3.quantdata.us/';
 const request=(id,title,path,body,normalize,family,scopeText)=>({id:'qd-'+id,title:'Quant Data · '+title,path:'/v1/options/tool/'+path,body,normalize,family,scope:scopeText||'SPX · selected session',url});
 const items=[
  request('net-drift-0dte','SPX 0DTE Net Drift','net-drift',{...scope,aggregationPeriod:'5m',filter:{ticker:'SPX',expirationDate:date}},p=>({...series(p,['netCallPremium','netPutPremium','netCallVolume','netPutVolume','stockPrice'],{totals:true}),units:'Premium in USD; volume in contracts'}),'flow','SPX · same-day expiration only'),
  request('net-flow','SPX Net Flow','net-flow',{...scope,dataMode:'NET_PREMIUM',aggregationPeriod:'5m'},p=>series(p,['callSum','putSum','stockPrice'],{cents:true,totals:true}),'flow'),
  request('net-flow-0dte','SPX 0DTE Net Flow','net-flow',{...scope,dataMode:'NET_PREMIUM',aggregationPeriod:'5m',filter:{ticker:'SPX',expirationDate:date}},p=>series(p,['callSum','putSum','stockPrice'],{cents:true,totals:true}),'flow','SPX · same-day expiration only'),
  request('trade-side','SPX Trade Side Statistics','contract-trade-side-statistics',{...scope,dataMode:'PREMIUM'},p=>({rows:Object.entries(grid(p)).flatMap(([type,sides])=>Object.entries(sides).map(([side,r])=>({type,side,premium:number(r?.premium)}))),units:'Premium in USD',limitation:'Ask/bid classification is not proof of opening positions or dealer intent.'}),'flow'),
  request('contract-statistics','SPX Contract Statistics','contract-statistics',scope,p=>({...mapPairs(p,['premium','tradeCount','volume']),units:'Premium USD; volume contracts; tradeCount trades'}),'flow'),
  request('iv-rank','SPX IV Rank','iv-rank',{filter:{ticker:'SPX'},lookBackPeriod:365,maturity:30},p=>ivRank(p,date),'volatility','SPX · 365-day lookback · 30-day maturity · exact session'),
  request('term-structure','SPX Term Structure','term-structure',scope,p=>volatilityGrid(p,date,true),'volatility'),
  request('volatility-skew','SPX Volatility Skew','volatility-skew',scope,p=>volatilityGrid(p,date),'volatility'),
  request('volatility-drift','SPX Realized and Implied Volatility','volatility-drift',scope,p=>series(p,['iv','arv','stockPrice']),'volatility'),
  request('oi-strike','SPX Open Interest by Strike','open-interest-by-strike',scope,p=>oiRows(p,'strike',date,stockPrice),'positioning','SPX · all expirations · nearby strikes and largest reported OI'),
  request('oi-expiration','SPX Open Interest by Expiration','open-interest-by-expiration',scope,p=>oiRows(p,'expirationDate',date),'positioning'),
  request('oi-time','SPX Open Interest over Time','open-interest-over-time',{filter:{ticker:'SPX'}},p=>oiRows(p,'sessionDate',date),'positioning','SPX · 20 sessions ending on or before selected session'),
  request('oi-change','SPX Open Interest Change','open-interest-change',{...scope,size:60,sort:{field:'changeInOpenInterest',direction:'DESCENDING'}},p=>tape(p,'oi'),'positioning','SPX · largest 60 increases in reported OI'),
  request('max-pain-time','SPX Max Pain by Expiration','max-pain-over-time',scope,p=>({rows:Object.entries(grid(p)).filter(([d])=>dateKey(d)&&d>=date).sort(([a],[b])=>a.localeCompare(b)).slice(0,40).map(([expirationDate,strike])=>({expirationDate,strike:number(strike)})),units:'SPX strikes',limitation:'Provider max-pain references across expirations, not an intraday trajectory or a price target.'}),'positioning')
 ];
 for(const mode of ['consolidated','unconsolidated'])items.push(request('order-flow-'+mode,'SPX '+mode+' Order Flow','order-flow/'+mode,{...scope,size:60,sort:{field:'premium',direction:'DESCENDING'},...(mode==='consolidated'?{includeComprisingTrades:false}:{})},p=>tape(p,'options'),'flow','SPX · 60 largest premium trades · '+mode+' view; overlaps other flow panels'));
 items.push({...request('equity-prints','SPY Equity Prints','', {sessionDate:date,filter:{ticker:'SPY'},size:60,sort:{field:'notionalValue',direction:'DESCENDING'}},p=>tape(p,'equity'),'institutional','SPY · 60 largest notional prints'),path:'/v1/equities/tool/equity-prints'});
 return items;
}
export async function collectQuantPanels(date,post,checkedAt,stockPrice=null){
 const items=quantPanelRequests(date,{stockPrice});
 const sources=await mapLimit(items,4,async q=>({id:q.id,title:q.title,sessionDate:date,capturedAt:checkedAt,url:q.url,data:{ticker:q.family==='institutional'?'SPY':'SPX',family:q.family,endpoint:q.path,requestScope:q.body,scope:q.scope,sessionDate:date,checkedAt,...await post(q.path,q.body,q.normalize)}}));
 // Expiration is taken from the provider, never guessed around holidays.
 const nearest=sources.find(s=>s.id==='qd-oi-expiration')?.data.rows?.find(r=>r.expirationDate>=date)?.expirationDate;
 const data=nearest?await post('/v1/options/tool/max-pain',{sessionDate:date,filter:{ticker:'SPX',expirationDate:nearest}},p=>({strike:number(p.maxPainStrikePrice),stockPrice:number(p.stockPrice),rows:Object.entries(grid(p)).sort(([a],[b])=>Math.abs(Number(a)-(number(p.stockPrice)??number(p.maxPainStrikePrice)??0))-Math.abs(Number(b)-(number(p.stockPrice)??number(p.maxPainStrikePrice)??0))).slice(0,81).map(([strike,r])=>({strike:Number(strike),...fields(r,['callIntrinsicValue','putIntrinsicValue'])})).sort((a,b)=>a.strike-b.strike),units:'SPX strike; intrinsic values in USD',limitation:'Nearest 81 strikes to the returned spot reference. Provider maximum-pain reference is not a directional forecast.'})):{available:false,message:'No eligible expiration returned by the open-interest feed.'};
 sources.push({id:'qd-max-pain',title:'Quant Data · SPX Max Pain',sessionDate:date,capturedAt:checkedAt,url:'https://v3.quantdata.us/',data:{ticker:'SPX',family:'positioning',expirationDate:nearest||null,scope:'Nearest returned expiration on or after session',...data}});
 return sources;
}
