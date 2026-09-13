import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createESWorker,createDatabento,summarizeES} from '../databento.mjs';
const raw={ok:true,contract:'ESU6',dataset:'GLBX.MDP3',sessionDate:'2026-09-11',bars:[{timestamp:'2026-09-11T19:00:00Z',end:'2026-09-11T19:01:00Z',open:7660,high:7662,low:7659,close:7661,volume:10,instrumentId:12}],messages:[]};
function fakeLaunch(action){return ()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr={resume(){}};child.stdin=new EventEmitter();child.stdin.end=()=>queueMicrotask(()=>action(child));child.kill=()=>child.emit('close');return child;};}
const run=action=>createESWorker({launch:fakeLaunch(action),timeoutMs:15})({},{});
test('worker timeout preserves only completed price stages, including a fragmented progress record',async()=>{
 const out=await run(c=>{const line=JSON.stringify({progress:raw})+'\n';c.stdout.emit('data',line.slice(0,30));c.stdout.emit('data',line.slice(30));});
 assert.equal(out.ok,true);assert.equal(out.partialRequest,true);assert.equal(out.bars[0].close,7661);
 assert.equal(out.priorContext.available,false);assert.equal(out.volumeProfile.available,false);
 const normalized=summarizeES(out,Date.parse('2026-09-13T12:00:00Z'));assert.equal(normalized.latestPrice,7661);assert.equal(normalized.partialRequest,true);
 const wrong=structuredClone(raw);wrong.bars[0].timestamp='2026-09-12T19:00:00Z';wrong.bars[0].end='2026-09-12T19:01:00Z';
 const unsafe=await run(c=>c.stdout.emit('data',JSON.stringify({progress:wrong})+'\n'));
 assert.throws(()=>summarizeES(unsafe,Date.parse('2026-09-13T12:00:00Z')),/outside selected session/);
});
test('worker rejects missing or malformed output and does not hide a crashed reader behind progress',async()=>{
 for(const action of [()=>{},c=>{c.stdout.emit('data','bad\n');},c=>{c.stdout.emit('data',JSON.stringify({progress:raw})+'\n');c.emit('close');}])assert.equal((await run(action)).ok,false);
});
test('complete worker output wins over progress and duplicate final messages are rejected',async()=>{
 const final={...raw,volumeProfile:{available:false,message:'Fixture'}};
 const result=await run(c=>{c.stdout.emit('data',JSON.stringify({progress:raw})+'\n'+JSON.stringify(final)+'\n');c.emit('close');});
 assert.deepEqual(result,final);
 assert.equal((await run(c=>c.stdout.emit('data',JSON.stringify(final)+'\n'+JSON.stringify(final)+'\n'))).ok,false);
});
test('partial historical snapshots expire promptly so an explicit update can obtain missing enrichment',async()=>{
 let calls=0,now=Date.parse('2026-09-13T12:00:00Z');
 const read=createDatabento({env:{DATABENTO_API_KEY:'fixture'},now:()=>now,run:async()=>{calls++;return {...raw,partialRequest:true};}});
 assert.equal((await read('2026-09-11','ESU6')).ok,true);
 assert.equal((await read('2026-09-11','ESU6')).cached,true);assert.equal(calls,1);
 now+=16000;await read('2026-09-11','ESU6');assert.equal(calls,2);
});
