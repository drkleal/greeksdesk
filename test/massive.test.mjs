import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMassiveSnapshot,createMassive} from '../massive.mjs';
const date='2026-09-09',now=Date.parse(date+'T14:00:00Z'),ns=t=>t*1e6;
const row=()=>({details:{ticker:'ESU6',product_code:'ES',settlement_date:'2026-09-18'},session:{volume:200},last_quote:{timeframe:'REAL-TIME',bid:7681.25,ask:7681.5,bid_timestamp:ns(now-1000),ask_timestamp:ns(now-2000)},last_trade:{timeframe:'REAL-TIME',price:7679.75,last_updated:ns(now-7200000)}});
test('Massive uses the fresh two-sided midpoint and preserves its provenance instead of stale last trade',()=>{
 const result=normalizeMassiveSnapshot([row()],date,'ES.v.0',now);
 assert.equal(result.latestPrice,7681.375);assert.equal(result.latestTimestamp,new Date(now-2000).toISOString());
 assert.equal(result.dataset,'MASSIVE.FUTURES');assert.match(result.priceKind,/not a traded/);assert.deepEqual(result.recentBars,[]);
 assert.equal(result.session,undefined);
});
test('Massive rejects delayed, old, crossed, future and wrong-contract quotes',()=>{
 for(const change of [{timeframe:'DELAYED'},{bid_timestamp:ns(now-21000)},{ask:7680},{bid_timestamp:ns(now+1000),ask_timestamp:ns(now+1000)}]){
  const r=row();Object.assign(r.last_quote,change);assert.throws(()=>normalizeMassiveSnapshot([r],date,'ESU6',now));
 }
 assert.throws(()=>normalizeMassiveSnapshot([row()],date,'ESZ6',now));
 const wrong=row();wrong.details.product_code='NQ';assert.throws(()=>normalizeMassiveSnapshot([wrong],date,'ES.v.0',now));
});
test('Massive selects volume among unexpired contracts and rejects ambiguous selection',()=>{
 const next=row();next.details={...next.details,ticker:'ESZ6',settlement_date:'2026-12-18'};next.session.volume=250;
 assert.equal(normalizeMassiveSnapshot([row(),next],date,'ES.v.0',now).contract,'ESZ6');
 next.session.volume=200;assert.throws(()=>normalizeMassiveSnapshot([row(),next],date,'ES.v.0',now),/ambiguous/);
});
test('Massive calculates same-time cash basis but never joins an after-hours ES quote to stale SPX',async()=>{
 let clock=now,calls=[];
 const request=async(url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,'Bearer test');return {ok:true,json:async()=>({status:'OK',results:url.includes('/futures/')?[{...row(),last_quote:{...row().last_quote,bid_timestamp:ns(clock-1000),ask_timestamp:ns(clock-1000)}}]:[{ticker:'I:SPX',value:7675,timeframe:'REAL-TIME',last_updated:ns(now-1000)}]})};};
 const read=createMassive({env:{POLYGON_API_KEY:'test'},request,now:()=>clock});
 const cash=await read(date);assert.equal(cash.basisResult.ok,true);assert.equal(cash.basisResult.basis,6.38);
 clock=Date.parse(date+'T21:30:00Z');const after=await read(date);assert.equal(after.basisResult.ok,false);
 const before=calls.length;assert.equal((await read('2026-09-08')).ok,false);assert.equal(calls.length,before);
});
