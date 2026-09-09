import test from 'node:test';import assert from 'node:assert/strict';
import {createPriorCashBasis,previousCashSession} from '../prior-basis.mjs';
import {conversionFor,levelConfluence,confluenceSummary} from '../public/confluence.mjs';
const date='2026-09-09',prior='2026-09-08',es={ok:true,ticker:'ES',contract:'ESU6'},time=prior+'T19:59:00Z';
const past={...es,priceObservations:[{price:7680,timestamp:time}]},spx={ok:true,priceObservations:[{price:7674,timestamp:time}]};
test('premarket uses the same contract at the previous matched cash close and caches it',async()=>{
 let calls=0;const resolve=createPriorCashBasis({now:()=>Date.parse(date+'T11:00:00Z'),readES:async(d,c)=>{calls++;assert.equal(d,prior);assert.equal(c,'ESU6');return past;},readSPX:async()=>spx});
 const anchor=await resolve(es,date);assert.equal(anchor.basis,6);assert.equal(anchor.sessionDate,prior);assert.equal(anchor.comparisonSessionDate,date);assert.equal(await resolve(es,date),anchor);assert.equal(calls,1);
 const read={date,instrument:'ES',basis:null,sources:[{id:'databento',data:{...es,basisReference:anchor}},{id:'qd-gamma',data:{ticker:'SPX',available:true,ladder:[{strike:7674,net:10}]}}],result:{analysis:{sources:[],panels:[],scenarios:[],checkpoints:[]}}};
 assert.equal(conversionFor(read).kind,'anchor');assert.match(conversionFor(read).label,/2026-09-08.*estimated/);
 const level={id:'l',price:7680,role:'structure',sourceIds:['databento'],panelIds:[]};assert.deepEqual(confluenceSummary(levelConfluence(read,level)).support,['price']);
 read.date='2026-09-10';assert.equal(conversionFor(read).kind,'unmapped');read.date=date;read.sources[0].data.contract='ESZ6';assert.equal(conversionFor(read).kind,'unmapped');
});
test('prior reference rejects rollover, missing closing prices, and future or historical requests',async()=>{
 for(const data of [{...past,contract:'ESZ6'},{...past,priceObservations:[{price:7680,timestamp:prior+'T18:00:00Z'}]}]){const resolve=createPriorCashBasis({now:()=>Date.parse(date+'T11:00:00Z'),readES:async()=>data,readSPX:async()=>spx});assert.equal(await resolve(es,date),null);}
 let calls=0;const resolve=createPriorCashBasis({now:()=>Date.parse(date+'T14:00:00Z'),readES:async()=>{calls++;return past;},readSPX:async()=>spx});assert.equal(await resolve(es,date),null);assert.equal(await resolve(es,prior),null);assert.equal(calls,0);
 assert.equal(previousCashSession('2026-09-08'),'2026-09-04');
});
