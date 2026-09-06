import {minutePrices,nearestStrike,premiumObservation,nyInstant,priorSessions} from './public/straddle.mjs';
import {cashSession,nyTime} from './public/session.mjs';
import {oiRows} from './quant-panels.mjs';
const optionPath='/v1/options/tool/option-price-over-time',stockPath='/v1/equities/tool/stock-price-over-time';
const missing=message=>({ready:false,message});
// All requests use documented filters. No OCC symbol construction or price-unit guesses.
export async function collectStraddle(date,post,checkedAt=new Date().toISOString(),{openingOnly=false}={}){
 const now=Date.parse(checkedAt),hours=cashSession(date),clock=nyTime(now);
 const source={id:'qd-straddle',title:'Quant Data · SPX ATM straddle / VIX',sessionDate:date,capturedAt:checkedAt,url:'https://v3.quantdata.us/'};
 if(!hours)return {...source,data:{available:false,ticker:'SPX',family:'volatility',sessionDate:date,message:'Selected date is not a supported cash session.'}};
 const previous=!openingOnly&&(date>clock.date||date===clock.date&&clock.seconds<hours.open+60),observationDate=previous?priorSessions(date,1)[0]:date;
 const timeRange=openingOnly?{startTime:nyInstant(date,9*3600+35*60),endTime:nyInstant(date,9*3600+36*60)}:null;
 const base=timeRange?{timeRange}:{sessionDate:observationDate};
 const readPrices=(ticker)=>post(stockPath,{...base,aggregationPeriod:'1m',filter:{ticker}},p=>({rows:minutePrices(p,observationDate,now)}));
 const [spx,vix,oi]=await Promise.all([readPrices('SPX'),readPrices('VIX'),post('/v1/options/tool/open-interest-by-strike',{sessionDate:observationDate,filter:{ticker:'SPX',expirationDate:date}},p=>{
  if(!p?.data||Array.isArray(p.data))throw Error('Invalid strike grid');
  return {strikes:Object.keys(p.data).map(Number).filter(s=>Number.isFinite(s)&&s>0),...oiRows(p,'strike',date)};
 })]);
 const openingSpot=spx.rows?.find(r=>r.timestamp===nyInstant(date,9*3600+36*60)),latestSpot=spx.rows?.at(-1),strikes=oi.strikes||[];
 const requested=[openingSpot,...(openingOnly?[]:[latestSpot])].filter(Boolean),pairs=new Map();
 for(const strike of [...new Set(requested.map(r=>nearestStrike(strikes,r.price)).filter(Number.isFinite))]){
  const readLeg=contractType=>post(optionPath,{...base,aggregationPeriod:'1m',filter:{ticker:'SPX',expirationDate:date,strikePrice:strike,contractType}},p=>({rows:minutePrices(p,observationDate,now)}));
  const [call,put]=await Promise.all([readLeg('CALL'),readLeg('PUT')]);pairs.set(strike,{call:call.rows||[],put:put.rows||[]});
 }
 const make=(spot,kind)=>{
  if(!spot)return missing(kind==='opening'?'The exact 9:36 ET observation is not available.':'No completed cash-session SPX minute was returned.');
  const strike=nearestStrike(strikes,spot.price),pair=pairs.get(strike);
  if(!pair)return missing(oi.message||'No verified strike grid for this expiration.');
  const at=rows=>rows?.find(r=>r.timestamp===spot.timestamp);
  return premiumObservation({date:observationDate,expiry:date,strike,strikes,spot,call:at(pair.call),put:at(pair.put),vix:at(vix.rows),kind});
 };
 const opening=make(openingSpot,'opening'),latest=openingOnly?undefined:make(latestSpot,'latest');
 const state=previous?'prior-session':date<clock.date||clock.seconds>=hours.close?'closed-session':'cash-session';
 const data={available:!!(opening.ready||latest?.ready),ticker:'SPX',family:'volatility',sessionDate:date,expirationDate:date,checkedAt,scope:'Same-day SPX expiration · completed 1-minute trades · timestamp-matched VIX',state,opening,latest,
  openInterest:{available:oi.available,observationDate,expirationDate:date,rows:oi.rows||[],units:'Contracts',limitation:oi.limitation},
  limitation:'Opening reference uses only the 9:35–9:36 ET bar, even on a late first refresh. A prior-session pair is indicative only. No stale quote is labeled live, and no missing leg is estimated.'};
 if(!data.available)data.message=latest?.message||opening.message;
 return {...source,data};
}
