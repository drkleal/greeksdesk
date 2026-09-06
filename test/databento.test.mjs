import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeES,createDatabento} from '../databento.mjs';
const makeBar=(time='2026-09-04T19:59:00Z',id=123)=>({timestamp:time,end:new Date(Date.parse(time)+60000).toISOString(),open:7715,high:7717,low:7714,close:7716,volume:50,instrumentId:id});
const sample=()=>({ok:true,contract:'ESU6',dataset:'GLBX.MDP3',sessionDate:'2026-09-04',bars:[makeBar()],quote:null,messages:[]});
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
