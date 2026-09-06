import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeES,createDatabento,validateESProfile} from '../databento.mjs';
const makeBar=(time='2026-09-04T19:59:00Z',id=123)=>({timestamp:time,end:new Date(Date.parse(time)+60000).toISOString(),open:7715,high:7717,low:7714,close:7716,volume:50,instrumentId:id});
const sample=()=>({ok:true,contract:'ESU6',dataset:'GLBX.MDP3',sessionDate:'2026-09-04',bars:[makeBar()],quote:null,messages:[]});

test('volume profile must match the ES contract, requested window and weighted price bounds',()=>{
 const p={available:true,contract:'ESU6',instrumentId:123,dataset:'GLBX.MDP3',schema:'trades',completeWindow:true,from:'2026-09-03T22:00:00.000Z',through:'2026-09-04T20:00:00.000Z',nodes:[{kind:'POC',price:7716}],sessionProfiles:{RTH:{from:'2026-09-04T13:30:00Z',through:'2026-09-04T20:00:00Z',low:7714,high:7718,vwap:7716,volume:10}}};
 const check=p=>validateESProfile(p,'ESU6','2026-09-04',123,Date.parse('2026-09-06'));
 assert.equal(check(p).available,true);assert.equal(check({...p,contract:'ESZ6'}).available,false);assert.equal(check({...p,through:'2026-09-04T22:00:00Z'}).available,false);
 assert.equal(check({...p,sessionProfiles:{RTH:{...p.sessionProfiles.RTH,vwap:7790}}}).available,false);
});
test('ES records preserve actual contract, completed-bar time and cash-session scope',()=>{
 const raw=sample();raw.bars.push(makeBar('2026-09-04T20:59:00Z'));
 const result=summarizeES(raw,Date.parse('2026-09-06T12:00:00Z'));
 assert.equal(result.contract,'ESU6');assert.equal(result.latestTimestamp,'2026-09-04T21:00:00.000Z');
 assert.equal(result.cashSession.barCount,1);assert.equal(result.session.barCount,2);assert.equal(result.freshness,'historical');
 assert.equal(result.averageTrueRange1m,null);assert.equal(result.latestPrice,7716);
});
test('mixed contracts, inconsistent bars and future quotes are rejected',()=>{
 const mixed=sample();mixed.bars.push(makeBar('2026-09-04T20:00:00Z',456));assert.throws(()=>summarizeES(mixed),/Mixed/);
 const invalid=sample();invalid.bars[0].low=8000;assert.throws(()=>summarizeES(invalid),/Invalid/);
 const future=sample();future.quote={price:7715,timestamp:'2026-09-06T13:00:00Z',instrumentId:123};assert.throws(()=>summarizeES(future,Date.parse('2026-09-06T12:00:00Z')),/Future/);
});
test('only a recent live capture is labeled fresh; cached observations age normally',async()=>{
 let clock=Date.parse('2026-09-04T20:00:05Z'),calls=0;
 const raw=sample();raw.quote={price:7716,timestamp:'2026-09-04T20:00:04Z',instrumentId:123,kind:'Completed 1-second trade bar'};
 const read=createDatabento({env:{DATABENTO_API_KEY:'test-private'},now:()=>clock,run:async()=>{calls++;return raw;}});
 const first=await read('2026-09-04');assert.equal(first.freshness,'fresh');assert.ok(!JSON.stringify(first).includes('test-private'));
 clock+=10000;const reused=await read('2026-09-04');assert.equal(reused.cached,true);assert.equal(reused.ageSeconds,11);assert.equal(calls,1);
 const old=summarizeES(raw,clock+30000);assert.equal(old.freshness,'stale');
});
test('unconfigured Databento makes no request and historical samples are cached',async()=>{
 let calls=0;const absent=createDatabento({env:{},run:async()=>{calls++;}});assert.equal((await absent('2026-09-04')).configured,false);assert.equal(calls,0);
 const read=createDatabento({env:{DATABENTO_API_KEY:'test-private'},now:()=>Date.parse('2026-09-06T12:00:00Z'),run:async()=>{calls++;return sample();}});
 await read('2026-09-04');assert.equal((await read('2026-09-04')).cached,true);assert.equal(calls,1);
 await assert.rejects(()=>read('2026-09-04','NQ.v.0'));
});
test('broader bars preserve early-session structure excluded from the minute timing window',()=>{
 const raw=sample();raw.bars=Array.from({length:150},(_,i)=>makeBar(new Date(Date.parse('2026-09-04T13:30:00Z')+i*60000).toISOString()));
 raw.bars[0].high=7751;raw.bars[0].open=7749;
 const r=summarizeES(raw,Date.parse('2026-09-06T12:00:00Z'));
 assert.equal(r.recentBars.length,120);assert.ok(r.recentBars.every(b=>b.high<7751));
 assert.equal(r.bars5m.length,30);assert.equal(r.bars15m.length,10);
 assert.equal(r.bars5m[0].open,7749);assert.equal(r.bars15m[0].high,7751);
 assert.equal(r.bars15m[0].close,7716);assert.equal(r.bars15m[0].volume,750);
 assert.equal(r.bars5m.reduce((n,b)=>n+b.volume,0),r.session.volume);
 assert.ok(r.bars15m.every(b=>b.complete));assert.equal(r.bars5m.at(-1).observedThrough,r.latestTimestamp);
});
test('partial aggregate bars retain actual coverage times and do not fill absent minute records',()=>{
 const raw=sample();raw.bars=[makeBar('2026-09-04T13:30:00Z'),makeBar('2026-09-04T13:32:00Z'),makeBar('2026-09-04T13:36:00Z')];
 const r=summarizeES(raw,Date.parse('2026-09-06T12:00:00Z'));
 assert.equal(r.bars5m.length,2);assert.equal(r.bars5m[0].complete,false);assert.equal(r.bars5m[0].minuteCount,2);
 assert.equal(r.bars5m[0].end,'2026-09-04T13:35:00.000Z');assert.equal(r.bars5m[0].observedThrough,'2026-09-04T13:33:00.000Z');
 assert.equal(r.bars15m[0].minuteCount,3);assert.equal(r.bars15m[0].volume,150);assert.equal(r.bars15m[0].complete,false);
});
test('a full futures-session analysis payload stays within the source-size budget',()=>{
 const raw=sample();raw.bars=Array.from({length:1380},(_,i)=>makeBar(new Date(Date.parse('2026-09-03T22:00:00Z')+i*60000).toISOString()));
 const {priceObservations,...data}=summarizeES(raw,Date.parse('2026-09-06T12:00:00Z'));
 assert.equal(data.bars5m.length,276);assert.equal(data.bars15m.length,92);
 assert.ok(JSON.stringify(data).length<200000);
});

test('New York bar labels preserve summer/winter offsets and the prior-evening date',()=>{
 const raw=sample();raw.bars=[makeBar('2026-09-04T00:00:00Z'),makeBar('2026-09-04T16:45:00Z')];
 const summer=summarizeES(raw,Date.parse('2026-09-06T12:00:00Z'));
 assert.equal(summer.bars5m[0].newYorkTime,'2026-09-03 20:00 America/New_York');
 assert.equal(summer.bars15m[1].newYorkTime,'2026-09-04 12:45 America/New_York');
 assert.equal(summer.recentBars[1].timestamp,'2026-09-04T16:45:00Z');
 const winter=sample();winter.sessionDate='2026-01-05';winter.bars=[makeBar('2026-01-05T16:45:00Z')];
 assert.equal(summarizeES(winter,Date.parse('2026-01-06T12:00:00Z')).recentBars[0].newYorkTime,'2026-01-05 11:45 America/New_York');
});
