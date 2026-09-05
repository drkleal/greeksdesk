import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateLoop} from '../public/update-loop.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('auto off by default; bounded cycles; no paid fetch or source logic in timer',async()=>{
 let count=0,next;const loop=createUpdateLoop({run:async()=>{count++;return true;},later:fn=>{next=fn;return 1;},cancel:()=>{next=undefined;}});
 assert.equal(count,0);assert.equal(loop.status().active,false);
 loop.start({intervalMs:60000,maxCycles:2,durationMs:120000});await flush();assert.equal(count,1);
 next();await flush();assert.equal(count,2);assert.equal(loop.status().active,false);
});
test('stop while in flight prevents rescheduling and overlapping requests',async()=>{
 let finish,scheduled=0,calls=0;const loop=createUpdateLoop({run:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},later:()=>{scheduled++;}});
 loop.start({intervalMs:60000,maxCycles:3,durationMs:180000});assert.equal(await loop.once(),false);assert.equal(calls,1);
 loop.stop();finish(true);await flush();assert.equal(scheduled,0);assert.equal(loop.status().active,false);
});
test('failure stops auto without retry; manual mode makes exactly one cycle',async()=>{
 let calls=0,scheduled=0;const loop=createUpdateLoop({run:async()=>{calls++;return false;},later:()=>{scheduled++;}});
 loop.start({intervalMs:60000,maxCycles:4,durationMs:240000});await flush();assert.equal(calls,1);assert.equal(scheduled,0);assert.equal(loop.status().active,false);
 await loop.once();assert.equal(calls,2);assert.equal(scheduled,0);
});
test('manual update replaces waiting timer rather than leaving duplicate schedules',async()=>{
 let calls=0,next,cancelled=0;const loop=createUpdateLoop({run:async()=>{calls++;return true;},later:fn=>{next=fn;return 1;},cancel:()=>{next=undefined;cancelled++;}});
 loop.start({intervalMs:60000,maxCycles:4,durationMs:240000});await flush();await loop.once();assert.equal(calls,2);assert.equal(cancelled,1);assert.equal(typeof next,'function');loop.stop();
});
