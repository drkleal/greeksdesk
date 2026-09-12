import test from 'node:test';
import assert from 'node:assert/strict';
import {straddleBands,snapshotStraddleBands,esPremiumRange} from '../public/straddle.mjs';
import {createAnalyzer,validatePacket} from '../analysis.mjs';
import {createAnalysisRecovery} from '../analysis-recovery.mjs';
import {validateSharedSession} from '../shared-session.mjs';
const time='2026-09-11T13:36:00.000Z',date='2026-09-11';
const observation={ready:true,version:1,kind:'opening',sessionDate:date,expirationDate:date,timestamp:time,strike:7700,spot:7699,premium:40,call:19,put:21};
const feed={ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',openingReference:{timestamp:time,price:7705}};
const packet=()=>({date,instrument:'ES',basis:null,sources:[{id:'qd-straddle',title:'Straddle',sessionDate:date,data:{state:'historical',opening:{...observation},latest:{...observation,kind:'latest'}}},{id:'databento',title:'ES',sessionDate:date,data:structuredClone(feed)}]});
test('raw ±S and 0.85×S bounds share the matched anchor without early tick rounding',()=>{
 const b=straddleBands(observation,esPremiumRange(observation,feed));
 assert.equal(b.rawStraddle,40);assert.equal(b.oneSigma.points,34);
 assert.deepEqual([b.breakeven.lower,b.breakeven.upper],[7665,7745]);
 assert.deepEqual([b.oneSigma.lower,b.oneSigma.upper],[7671,7739]);
 assert.deepEqual(b.exactOptionBreakevens,{anchor:7706,lower:7666,upper:7746});
 const fractional=straddleBands({...observation,premium:25.2,call:12,put:13.2},{ready:true,anchor:7705});
 assert.equal(fractional.oneSigma.points,25.2*.85);
 assert.match(b.oneSigma.label,/1σ \(straddle × 0.85\)/);assert.match(b.method,/not calibrated/);
});
test('read snapshot keeps both references and remains unchanged after feed updates or serialization',()=>{
 const p=packet(),s=snapshotStraddleBands(p,time),copy=structuredClone(s);
 p.sources[0].data.opening.premium=80;p.sources[1].data.openingReference.price=7800;
 assert.deepEqual(s,copy);assert.deepEqual(JSON.parse(JSON.stringify(s)),copy);
 assert.equal(s.selected,'opening');assert.equal(s.opening.observationTime,time);assert.equal(s.latest.rawStraddle,40);
 assert.equal(s.opening.contract,'ESU6');assert.equal(s.opening.basis,6);
 const live=packet();live.sources[0].data.state='cash-session';assert.equal(snapshotStraddleBands(live,time).selected,'latest');
});
test('no range is invented for missing legs, invalid premium, unsupported instrument, future or unmatched ES time',()=>{
 for(const premium of [NaN,Infinity,0,-1])assert.equal(straddleBands({...observation,premium},{ready:true,anchor:7700}).ready,false);
 assert.equal(straddleBands({...observation,put:null},{ready:true,anchor:7705}).ready,false);
 const p=packet();p.sources[1].data.openingReference.timestamp='2026-09-11T13:37:00.000Z';assert.equal(snapshotStraddleBands(p,time).opening.ready,false);
 assert.equal(snapshotStraddleBands(packet(),'2026-09-11T13:35:00Z').opening.ready,false);
 assert.equal(snapshotStraddleBands({...packet(),instrument:'NQ'},time).opening.ready,false);
 assert.equal(snapshotStraddleBands({date,instrument:'ES',sources:[]},time).opening.ready,false);
 const spx=snapshotStraddleBands({...packet(),instrument:'SPX'},time);assert.equal(spx.opening.anchor,7699);
});
test('server reference reads persist the snapshot through sharing and signed recovery without paid generation',async()=>{
 let calls=0;const p=packet();p.sources=p.sources.filter(s=>s.id!=='databento');p.instrument='SPX';
 const result=await createAnalyzer({now:()=>Date.parse(time),env:{},request:()=>{calls++;throw Error('Unexpected AI request');}})(p);
 assert.equal(result.ok,true);assert.equal(calls,0);assert.equal(result.straddleBands.opening.oneSigma.points,34);
 const read={id:time,...p,result},shared=validateSharedSession({version:1,date,instrument:'SPX',basis:0,charts:[],read});
 assert.deepEqual(shared.read.result.straddleBands,result.straddleBands);
 const recovery=createAnalysisRecovery({secret:'test-only',now:()=>Date.parse(time)});
 const receipt=recovery.issue({packet:validatePacket(p),analysis:result.analysis,checkedAt:time,model:result.model,usage:null,straddleBands:result.straddleBands});
 const restored=recovery.recover({packet:p,recovery:receipt});assert.equal(restored.ok,true);assert.deepEqual(restored.straddleBands,result.straddleBands);
 const changed=structuredClone(receipt);changed.straddleBands.opening.oneSigma.points=99;
 assert.equal(recovery.recover({packet:p,recovery:changed}).ok,false);
});
