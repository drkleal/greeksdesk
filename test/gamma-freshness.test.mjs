import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFreshness,gammaObservation,freshnessInput,freshnessConstraint} from '../public/gamma-freshness.mjs';
import {createAnalyzer,validateAnalysis,validatePacket} from '../analysis.mjs';
import {createAnalysisRecovery} from '../analysis-recovery.mjs';
import {createChartRestore} from '../public/chart-restore.mjs';
import {familyInventory,levelConfluence,confluenceLabel} from '../public/confluence.mjs';
import {validateSharedSession} from '../shared-session.mjs';
const image='data:image/png;base64,aGVsbG8=';
const dg=(capturedAt,id='paste-dg')=>({id,title:'DeepGamma',sessionDate:capturedAt.slice(0,10),capturedAt,image});
const at=(sources,time)=>evaluateFreshness(sources,Date.parse(time));

test('RTH exact age boundaries, before-open exclusion and future/missing timestamps',()=>{
 const paste=dg('2026-09-14T09:30:00-04:00');
 for(const [time,band]of [['09:30:00','current'],['10:00:00','current'],['10:00:01','reference'],['11:00:00','reference'],['11:00:01','not_used']])assert.equal(at([paste],`2026-09-14T${time}-04:00`).deepGamma.band,band,time);
 assert.equal(at([dg('2026-09-14T09:29:59-04:00')],'2026-09-14T09:30:00-04:00').deepGamma.band,'not_used');
 assert.equal(at([dg('2026-09-11T15:59:00-04:00')],'2026-09-14T09:30:00-04:00').deepGamma.band,'not_used');
 for(const t of ['2026-09-14T11:01:00-04:00','bad','2026-09-14T10:50:00'])assert.equal(at([{...paste,capturedAt:t}],'2026-09-14T11:00:00-04:00').deepGamma.band,'not_used');
});
test('outside RTH preserves oldest paste, including weekend, holiday, early close, DST and overnight windows',()=>{
 const paste=dg('2026-08-31T12:00:00-04:00');
 for(const time of ['2026-09-14T09:29:59-04:00','2026-09-14T16:00:00-04:00','2026-09-12T12:00:00-04:00','2026-09-07T12:00:00-04:00','2026-11-27T13:00:00-05:00','2026-11-02T07:05:00-05:00'])assert.equal(at([paste],time).deepGamma.band,'overnight',time);
 for(const [time,expected]of [['20:14:59',false],['20:15:00',true],['03:59:59',true],['04:00:00',false],['07:05:00',false]])assert.equal(at([paste],`2026-09-14T${time}-04:00`).overnightPriority,expected,time);
 assert.equal(at([dg('2026-11-02T09:30:00-05:00')],'2026-11-02T10:00:00-05:00').deepGamma.band,'current');
});
test('newest paste wins; superseded paste is not transmitted',()=>{
 const sources=[dg('2026-09-14T09:30:00-04:00'),dg('2026-09-14T10:10:00-04:00','dg-second')],f=at(sources,'2026-09-14T10:20:00-04:00');
 assert.equal(f.deepGamma.sourceId,'dg-second');assert.equal(f.entries[0].band,'not_used');
 assert.equal(freshnessInput({sources},f).sources[0].image,undefined);
});
test('24-hour ES and profile cutoff leaves API data intact',()=>{
 const sources=['es-snapshot','es-five-minute','paste-vp','paste-vp-prior','paste-vp-composite'].map(id=>({...dg('2026-09-13T10:00:00-04:00'),id,title:id}));
 sources.push({id:'databento',data:{available:true}});
 const current=at(sources,'2026-09-14T10:00:00-04:00');assert.ok(current.entries.every(e=>e.band==='current'));
 const expired=at(sources,'2026-09-14T10:00:01-04:00'),packet=freshnessInput({sources},expired);
 assert.ok(packet.sources.slice(0,5).every(s=>!s.image));assert.equal(packet.sources[5].data.available,true);
});
test('QD buckets and OD slots establish comparison age; price/request time never does',()=>{
 const now=Date.parse('2026-09-14T10:00:00-04:00');
 assert.equal(gammaObservation({id:'qd-gamma',capturedAt:new Date(now).toISOString(),data:{stockPrice:7700}},now).timestamp,null);
 const qd={id:'qd-gamma',data:{recentBuckets:[{timestamp:'2026-09-14T13:40:00Z'},{timestamp:'2026-09-14T13:59:00Z'}]}};
 assert.equal(gammaObservation(qd,now).ageMinutes,1);
 const od={id:'od-gex-mm-strike',data:{actualSlot:'2026-09-14T09:50:00',requestedSlot:'2026-09-14T16:00:00'}};
 assert.equal(gammaObservation(od,now).ageMinutes,10);assert.match(gammaObservation(od,now).assumption,/assumed ET/);
 assert.equal(gammaObservation({...od,data:{actualSlot:'2026-09-15T09:50:00'}},now).timestamp,null);
});
test('current DG breaks ties; reference cannot override fresher feeds; overnight newer exposure beats older paste',()=>{
 const qd={id:'qd-gamma',title:'Quant Data Gamma',data:{latestTimestamp:'2026-09-14T13:59:00Z'}},od={id:'od-gex-mm-strike',title:'OD Gamma',data:{actualSlot:'2026-09-14T13:59:00Z'}};
 assert.equal(at([dg('2026-09-14T09:45:00-04:00'),qd,od],'2026-09-14T10:00:00-04:00').leader.sourceId,'paste-dg');
 assert.equal(at([dg('2026-09-14T09:30:00-04:00'),qd,od],'2026-09-14T10:20:00-04:00').leader.sourceId,'od-gex-mm-strike');
 const overnight=at([dg('2026-09-14T20:30:00-04:00'),{...qd,data:{latestTimestamp:'2026-09-15T00:40:00Z'}}],'2026-09-14T20:45:00-04:00');
 assert.equal(overnight.leader.sourceId,'qd-gamma');assert.equal(overnight.deepGamma.band,'overnight');
});
const empty=()=>({headline:'Review',summary:'No proved price path.',gaps:[],changes:[],levels:[],sources:[],scenarios:['up','down','neutral'].map(direction=>({direction,status:'insufficient',triggerId:null,targetId:null,condition:'Need structure',confirmation:'Need price response',invalidation:'Unknown'}))});
test('manual / 07:05 / checkpoint calls use the same server clock and omit excluded screenshots',async()=>{
 for(const [trigger,time,band]of [['manual','2026-09-14T10:00:00-04:00','current'],['07:05','2026-09-14T07:05:00-04:00','overnight'],['checkpoint','2026-09-14T11:10:00-04:00','not_used']]){
  const sources=[dg(trigger==='07:05'?'2026-09-11T16:00:00-04:00':'2026-09-14T09:30:00-04:00'),{id:'other',title:'Other chart',sessionDate:'2026-09-14',image}];let sent;
  const analyze=createAnalyzer({now:()=>Date.parse(time),env:{OPENAI_API_KEY:'test'},request:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(empty())}]}]})};}});
  const result=await analyze({date:'2026-09-14',instrument:'SPX',sources,trigger,freshness:{deepGamma:{band:'current'}}});
  assert.equal(result.ok,true);assert.equal(result.freshness.deepGamma.band,band);
  assert.equal(sent.input[0].content.filter(c=>c.type==='input_image').length,band==='not_used'?1:2);
  assert.match(sent.instructions,/no 0DTE walls or pin/i);
 }
});
test('reference / excluded DG cannot become a price level or confluence vote; recovery freezes policy',()=>{
 const packet=validatePacket({date:'2026-09-14',instrument:'SPX',sources:[dg('2026-09-14T09:30:00-04:00')]}),freshness=at(packet.sources,'2026-09-14T10:20:00-04:00');
 assert.equal(freshnessConstraint(packet.sources[0],{...packet,freshness}).effect,'context');
 assert.throws(()=>validateAnalysis({...empty(),levels:[{sourceIds:['paste-dg']}]},{...packet,freshness}),/freshness/);
 const recovery=createAnalysisRecovery({secret:'test',now:()=>Date.parse('2026-09-14T11:00:00-04:00')});
 const receipt=recovery.issue({packet,analysis:empty(),freshness,checkedAt:freshness.evaluatedAt,model:'test',usage:null});
 assert.equal(recovery.recover({packet,recovery:receipt}).freshness.deepGamma.band,'reference');
 assert.equal(recovery.recover({packet,recovery:{...receipt,freshness:{...freshness,window:'changed'}}}).ok,false);
});
test('latest DG restores across session change without accepting other mismatched charts',async()=>{
 const accepted=[],restore=createChartRestore({load:async()=>[dg('2026-09-11T16:00:00-04:00'),{id:'es-snapshot',sessionDate:'2026-09-11'}],accept:async s=>{accepted.push(s.id);return true;},currentDate:()=>'2026-09-14',locked:()=>false,versions:new Map(),onRestored:()=>{}});
 await restore.restore();assert.deepEqual(accepted,['paste-dg']);
});
test('excluded DG is absent from gamma inventory and cannot contribute a star',()=>{
 const sources=[dg('2026-09-14T09:30:00-04:00')],freshness=at(sources,'2026-09-14T11:10:00-04:00');
 const level={id:'l1',sourceIds:['paste-dg'],panelIds:['p1'],identity:{derivation:'Old wall'}};
 const read={date:'2026-09-14',instrument:'SPX',basis:0,sources,result:{freshness,analysis:{levels:[level],sources:[],panels:[{id:'p1',sourceId:'paste-dg',title:'Deep Gamma',instrument:'SPX',status:'usable',dateRole:'observed_session',observedDate:'2026-09-14',dateEvidence:'visible'}]}}};
 assert.equal(familyInventory(read).find(f=>f.id==='gamma').items.length,0);
 assert.equal(confluenceLabel(levelConfluence(read,level)).count,0);
});
test('cache cannot carry CURRENT across the 30-minute boundary',async()=>{
 let now=Date.parse('2026-09-14T10:00:00-04:00'),calls=0;
 const analyze=createAnalyzer({now:()=>now,env:{OPENAI_API_KEY:'test'},request:async()=>{calls++;return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(empty())}]}]})};}});
 const packet={date:'2026-09-14',instrument:'SPX',sources:[dg('2026-09-14T09:30:00-04:00')]};
 assert.equal((await analyze(packet)).freshness.deepGamma.band,'current');
 now+=1000;assert.equal((await analyze(packet)).freshness.deepGamma.band,'reference');assert.equal(calls,2);
});
test('sharing preserves DG original date and paste time across sessions',()=>{
 const chart=dg('2026-09-11T16:00:00-04:00');
 const state=validateSharedSession({version:1,date:'2026-09-14',instrument:'SPX',basis:0,charts:[chart],read:null});
 assert.equal(state.charts[0].sessionDate,'2026-09-11');assert.equal(state.charts[0].capturedAt,chart.capturedAt);
 assert.throws(()=>validateSharedSession({...state,charts:[{...chart,id:'es-snapshot',title:'ES'}]}),/date/);
});

