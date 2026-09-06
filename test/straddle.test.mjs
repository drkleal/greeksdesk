import test from 'node:test';
import assert from 'node:assert/strict';
import {minutePrices,nyInstant,nearestStrike,premiumObservation,esPremiumRange,openingQuartile,priorSessions} from '../public/straddle.mjs';
import {collectStraddle} from '../straddle-provider.mjs';
const date='2026-09-04',timestamp=nyInstant(date,34560),row=(price,volume=10)=>({timestamp,intervalStart:nyInstant(date,34500),price,volume});
const input=()=>({date,strike:7745,strikes:[7740,7745,7750],spot:row(7743.45),call:row(11.5,408),put:row(13.7,294),vix:row(14.1),kind:'opening'});
test('the opening premium uses completed 9:35 bars; flat after-hours and incomplete minutes are excluded',()=>{
 const payload={data:Object.fromEntries(['2026-09-04T13:29:00Z','2026-09-04T13:35:00Z','2026-09-04T13:36:00Z','2026-09-04T20:00:00Z'].map(t=>[Date.parse(t),{closePrice:20,volume:10}]))};
 const rows=minutePrices(payload,date,Date.parse(timestamp));assert.equal(rows.length,1);assert.equal(rows[0].timestamp,timestamp);
 assert.equal(nyInstant('2026-12-01',34560),'2026-12-01T14:36:00.000Z');
});
test('matched premium and VIX ratio preserve units and opening ES uses its own basis',()=>{
 const p=premiumObservation(input());assert.equal(p.ready,true);assert.equal(p.premium,25.2);assert.ok(Math.abs(p.ratio-.3664)<.0001);
 const feed={ticker:'ES',contract:'ESU6',dataset:'GLBX.MDP3',openingReference:row(7749.5),basisResult:{ok:true,basis:5.94}};
 const mapped=esPremiumRange(p,feed);assert.ok(Math.abs(mapped.basis-6.05)<1e-8);assert.equal(mapped.anchor,7749.5);assert.equal(mapped.lower,7724.3);assert.equal(mapped.upper,7774.7);
 assert.equal(esPremiumRange(p,{...feed,openingReference:undefined}).ready,false);
 assert.equal(esPremiumRange(p,{...feed,priceObservations:[row(7750)]}).ready,false);
});
test('missing, mismatched, untraded, non-ATM, wrong-expiry and imbalanced legs are withheld',()=>{
 for(const change of [{put:undefined},{put:{...row(13.7),timestamp:'2026-09-04T13:37:00.000Z'}},{call:row(11.5,0)},{strike:7750},{expiry:'2026-09-03'},{call:row(.05)}])assert.equal(premiumObservation({...input(),...change}).ready,false);
 const p=premiumObservation({...input(),vix:{...row(14.1),timestamp:'2026-09-04T13:37:00.000Z'}});assert.equal(p.ready,true);assert.equal(p.ratio,null);
 assert.equal(nearestStrike([7750,7740],7745),7740);
});
test('walk-forward quartiles require exactly the preceding 60 sessions, deduplicate and exclude the scored session',()=>{
 const opening=premiumObservation(input()),dates=priorSessions(date),history=dates.map((d,i)=>{const premium=20+i/5,spot=7700,vix=14;return {...opening,sessionDate:d,expirationDate:d,timestamp:nyInstant(d,34560),premium,spot,vix,ratio:(premium/spot*100)/(vix/Math.sqrt(252))};});
 assert.equal(dates.length,60);assert.ok(!priorSessions('2026-09-08').includes('2026-09-07'));
 assert.equal(openingQuartile(opening,history.slice(0,59)).ready,false);
 const q=openingQuartile(opening,[...history,history[0],opening]);assert.equal(q.count,60);assert.equal(q.ready,true);assert.equal(q.quartile,2);
 assert.equal(openingQuartile(opening,history.map((r,i)=>i? r:{...r,timestamp:nyInstant(r.sessionDate,34620)})).ready,false);
 assert.equal(openingQuartile(opening,history.map((r,i)=>i? r:{...r,ratio:9})).ready,false);
});
test('adapter requests both exact contracts and freezes 9:36 instead of using a late first read',async()=>{
 const calls=[],at=(time,value)=>({[Date.parse(time)]:{closePrice:value,volume:20}});
 const post=async(path,body,normalize)=>{
  calls.push([path,body]);let data;
  if(path.endsWith('open-interest-by-strike'))data={'7740':{callOpenInterest:10,putOpenInterest:10},'7745':{callOpenInterest:20,putOpenInterest:20}};
  else if(path.endsWith('stock-price-over-time'))data=at('2026-09-04T13:35:00Z',body.filter.ticker==='SPX'?7743.45:14.1);
  else data=at('2026-09-04T13:35:00Z',body.filter.contractType==='CALL'?11.5:13.7);
  return {available:true,...normalize({data})};
 };
 const result=await collectStraddle(date,post,'2026-09-06T12:00:00Z',{openingOnly:true});assert.equal(result.data.opening.premium,25.2);assert.equal(result.data.opening.timestamp,timestamp);
 const legs=calls.filter(([path])=>path.endsWith('option-price-over-time'));assert.equal(legs.length,2);
 for(const [,body]of legs){assert.equal(body.filter.expirationDate,date);assert.equal(body.filter.strikePrice,7745);assert.equal(body.sessionDate,undefined);assert.equal(body.timeRange.startTime,'2026-09-04T13:35:00.000Z');}
});
