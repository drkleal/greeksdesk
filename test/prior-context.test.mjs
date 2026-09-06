import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeES,summarizePriorContext,createDatabento} from '../databento.mjs';
import {validateAnalysis,validatePacket} from '../analysis.mjs';
import {esSessionDate,esSessionBounds} from '../public/session.mjs';

const date='2026-09-04',now=Date.parse('2026-09-06T12:00:00Z');
const bar=(timestamp,minutes=60)=>({timestamp,end:new Date(Date.parse(timestamp)+minutes*60000).toISOString(),open:7780,high:7790,low:7770,close:7785,volume:200,instrumentId:123});
const context=()=>({available:true,contract:'ESU6',dataset:'GLBX.MDP3',schema:'ohlcv-1h',requestedFrom:'2026-08-24T22:00:00Z',through:'2026-09-03T22:00:00Z',bars:['2026-08-26','2026-08-27','2026-08-28','2026-08-31','2026-09-01','2026-09-02','2026-09-03'].map(d=>bar(d+'T14:00:00Z'))});
const raw=()=>({ok:true,contract:'ESU6',dataset:'GLBX.MDP3',sessionDate:date,bars:[{...bar('2026-09-04T19:59:00Z',1),open:7715,high:7717,low:7714,close:7716}],quote:null,priorContext:context(),messages:[]});

test('earlier history keeps five actual traded sessions without filling the weekend',()=>{
 const prior=summarizePriorContext(context(),'ESU6',date,123);
 assert.equal(prior.sessionCount,5);assert.deepEqual(prior.sessions.map(s=>s.sessionDate),['2026-08-28','2026-08-31','2026-09-01','2026-09-02','2026-09-03']);
 assert.equal(prior.sessions[0].barCount,1);assert.equal(prior.sessions[0].bars[0].newYorkTime,'2026-08-28 10:00 America/New_York');
 assert.equal(prior.sessions.at(-1).high,7790);assert.equal(prior.sessions.at(-1).close,7785);
});

test('wrong contracts, dates, duplicated hours and invalid prior prices never contaminate current ES data',()=>{
 const mutations=[c=>c.contract='ESZ6',c=>c.bars[0].instrumentId=456,c=>c.bars.push({...c.bars[0]}),c=>c.bars[0].low=8000,c=>c.bars[0].timestamp='invalid',c=>c.bars.push(bar('2026-09-03T22:00:00Z')),c=>c.through='2026-09-04T22:00:00Z',c=>c.bars.push(bar('2026-09-03T21:00:00Z'))];
 for(const mutate of mutations){const input=raw();mutate(input.priorContext);assert.throws(()=>summarizePriorContext(input.priorContext,'ESU6',date,123));const r=summarizeES(input,now);assert.equal(r.priorContext.available,false);assert.equal(r.latestPrice,7716);assert.equal(r.available,true);}
});

test('futures boundaries and evening labels follow New York summer, winter and DST dates',()=>{
 assert.equal(esSessionDate('2026-09-06T21:59:59Z'),'2026-09-06');assert.equal(esSessionDate('2026-09-06T22:00:00Z'),'2026-09-07');
 assert.deepEqual(esSessionBounds(date),{start:'2026-09-03T22:00:00.000Z',end:'2026-09-04T21:00:00.000Z'});
 assert.deepEqual(esSessionBounds('2026-01-05'),{start:'2026-01-04T23:00:00.000Z',end:'2026-01-05T22:00:00.000Z'});
 assert.deepEqual(esSessionBounds('2026-03-09'),{start:'2026-03-08T22:00:00.000Z',end:'2026-03-09T21:00:00.000Z'});
 assert.deepEqual(esSessionBounds('2026-11-02'),{start:'2026-11-01T23:00:00.000Z',end:'2026-11-02T22:00:00.000Z'});
 const input=raw();input.sessionDate='2026-09-07';input.bars=[bar('2026-09-06T22:00:00Z',1)];input.priorContext=null;
 assert.equal(summarizeES(input,Date.parse('2026-09-06T22:02:00Z')).freshness,'stale');
});

test('earlier history is reused beyond the quote cache and never across a changed raw contract',async()=>{
 let clock=now,contract='ESU6';const calls=[];
 const read=createDatabento({env:{DATABENTO_API_KEY:'test-private'},now:()=>clock,run:async input=>{calls.push(input);const result=raw();result.contract=contract;if(input.cached_context_contract===contract){delete result.priorContext;result.contextReused=true;}else result.priorContext.contract=contract;return result;}});
 assert.equal((await read(date)).priorContext.cached,false);
 clock+=3600001;assert.equal((await read(date)).priorContext.cached,true);assert.equal(calls[1].cached_context_contract,'ESU6');
 contract='ESZ6';clock+=3600001;const rolled=await read(date);assert.equal(rolled.contract,'ESZ6');assert.equal(rolled.priorContext.contract,'ESZ6');assert.equal(rolled.priorContext.cached,false);
 clock+=86400001;await read(date);assert.equal(calls.at(-1).cached_context_contract,undefined);
});

const empty=()=>({headline:'Dated ES context',summary:'Earlier prices are references.',gaps:[],changes:[],levels:[],checkpoints:[],panels:[],sources:[],scenarios:['up','down','neutral'].map(direction=>({direction,status:'insufficient',triggerId:null,targetId:null,condition:'Wait for a response',confirmation:'Price acceptance',invalidation:'Not established'}))});
const level=()=>({id:'earlier-high',price:7790,label:'September 3 hourly reaction high',role:'structure',kind:'resistance',sourceIds:['databento'],panelIds:[],identity:{category:'structure',name:'September 3 hourly reaction high',sourceLabel:null,description:'Dated price reference',derivation:'September 3 hourly high; current response still required.'},evidence:'Same-contract ESU6 hourly high',watch:'Retest',invalidation:'Sustained acceptance above',apiOrigin:{sourceId:'databento',sessionDate:'2026-09-03',timeframe:'1h',timestamp:'2026-09-03T14:00:00Z',field:'high'}});
const packet=()=>({date,instrument:'ES',basis:null,sources:[{id:'databento',title:'ESU6 price history',sessionDate:date,data:summarizeES(raw(),now)}]});

test('prior-session map levels and checkpoints require the exact dated OHLC origin',()=>{
 const input=packet(),l=level();assert.equal(validateAnalysis({...empty(),levels:[l]},input).levels[0].price,7790);
 assert.equal(validateAnalysis({...empty(),checkpoints:[l]},input).checkpoints[0].price,7790);
 for(const change of [{sessionDate:date},{timeframe:'1m'},{timestamp:'2026-09-03T15:00:00Z'},{field:'low'},{sourceId:'quantdata'}])assert.throws(()=>validateAnalysis({...empty(),levels:[{...level(),apiOrigin:{...l.apiOrigin,...change}}]},input),/dated source bar/);
 assert.throws(()=>validateAnalysis({...empty(),levels:[{...level(),price:7791}]},input),/dated source bar/);
 assert.throws(()=>validateAnalysis({...empty(),levels:[{...level(),apiOrigin:null}]},input),/native ES/);
 const wrongContract=packet();wrongContract.sources[0].data.priorContext.contract='ESZ6';assert.throws(()=>validateAnalysis({...empty(),levels:[level()]},wrongContract),/dated source bar/);
});

test('current-session exact origins remain valid and prior arrays are omitted from comparisons',()=>{
 const input=packet(),l={...level(),price:7717,apiOrigin:{sourceId:'databento',sessionDate:date,timeframe:'1m',timestamp:'2026-09-04T19:59:00Z',field:'high'}};
 assert.doesNotThrow(()=>validateAnalysis({...empty(),levels:[l]},input));
 const previousEvidence={date,checkedAt:'2026-09-06T10:00:00Z',sources:input.sources};
 const normalized=validatePacket({...input,previousEvidence});assert.equal(normalized.previousEvidence.sources[0].data.priorContext,undefined);assert.equal(normalized.sources[0].data.priorContext.sessionCount,5);
});

test('five complete earlier sessions plus the full current session fit the analysis source limit',()=>{
 const input=raw();input.bars=Array.from({length:1380},(_,i)=>bar(new Date(Date.parse(esSessionBounds(date).start)+i*60000).toISOString(),1));
 input.priorContext.bars=['2026-08-28','2026-08-31','2026-09-01','2026-09-02','2026-09-03'].flatMap(d=>Array.from({length:23},(_,i)=>bar(new Date(Date.parse(esSessionBounds(d).start)+i*3600000).toISOString())));
 const {priceObservations,...data}=summarizeES(input,now);assert.equal(data.priorContext.sessions.reduce((n,s)=>n+s.barCount,0),115);assert.ok(JSON.stringify(data).length<200000);
});
