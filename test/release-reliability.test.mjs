import test from 'node:test';
import assert from 'node:assert/strict';
import {priceReferenceInput,validateAnalysis,createAnalyzer,generationSchema,validatePacket} from '../analysis.mjs';
import {createAnalysisRecovery} from '../analysis-recovery.mjs';
import {currentFacts} from '../public/current-facts.mjs';
import {observedESSession,marketClock} from '../public/session.mjs';

const date='2026-09-11',timestamp='2026-09-11T19:00:00.000Z',through='2026-09-11T20:00:00.000Z';
const bar={timestamp,open:7660,high:7665.25,low:7658,close:7662,end:'2026-09-11T19:01:00.000Z'};
const source={id:'databento',title:'Databento ES',sessionDate:date,data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',latestPrice:7662,latestTimestamp:timestamp,recentBars:[bar],session:{from:'2026-09-10T22:00:00.000Z',open:7660,high:7665.25,low:7658,close:7662},volumeProfile:{available:true,contract:'ESU6',schema:'trades',completeWindow:true,through,nodes:[{kind:'POC',price:7661.25}]},sessionProfiles:{RTH:{high:7665.25,low:7658,vwap:7661.135,through}},priorContext:{available:true,contract:'ESU6',dataset:'GLBX.MDP3',schema:'ohlcv-1h',sessions:[{sessionDate:'2026-09-10',bars:[{...bar,timestamp:'2026-09-10T19:00:00.000Z',end:'2026-09-10T20:00:00.000Z',high:7680}]}]}}};
const packet={date,instrument:'ES',basis:null,sources:[source]};
const makeLevel=reference=>({id:'boundary',price:null,apiOrigin:null,priceReference:reference,label:'Observed reaction',role:'structure',kind:'reference',sourceIds:['databento'],panelIds:[],evidence:'Source price with observed response',watch:'Retest',invalidation:'Failure'});
const analysis=level=>({headline:'Review',summary:'Review fixture',gaps:[],changes:[],levels:[level],checkpoints:[],sources:[],scenarios:['up','down','neutral'].map(direction=>({direction,status:'insufficient',triggerId:null,targetId:null,condition:'No setup',confirmation:'Need response',invalidation:'No setup'}))});
const ref=(frame,field)=>({id:priceReferenceInput(packet).sources[0].data[frame].priceReferenceId,field});

test('generated references preserve exact OHLC, profile decimals and dated prior bars without mutating the packet',()=>{
 const before=JSON.stringify(packet),input=priceReferenceInput(packet),d=input.sources[0].data;
 for(const [row,field,price,frame]of [[d.recentBars[0],'high',7665.25,'1m'],[d.sessionProfiles.RTH,'vwap',7661.135,'rth_profile'],[d.volumeProfile.nodes[0],'poc',7661.25,'volume_profile'],[d.priorContext.sessions[0].bars[0],'high',7680,'1h']]){
  const a=analysis(makeLevel({id:row.priceReferenceId,field})),out=validateAnalysis(a,packet).levels[0];
  assert.equal(out.price,price);assert.equal(out.apiOrigin.timeframe,frame);
  assert.equal(validateAnalysis(a,packet).levels[0].price,price,'canonical output can be revalidated');
 }
 assert.equal(JSON.stringify(packet),before);
});
test('unknown, rolled-contract and conflicting references fail instead of being repaired to nearby prices',()=>{
 const good=ref('session','high');
 for(const mutate of [l=>l.priceReference.id='missing',l=>l.priceReference.id=l.priceReference.id.replace('ESU6','ESZ6'),l=>l.priceReference.field='vwap',l=>l.price=7665.5,l=>l.sourceIds=[],l=>l.apiOrigin={timestamp:'wrong'}]){
  const level=makeLevel({...good});mutate(level);assert.throws(()=>validateAnalysis(analysis(level),packet),/cited ES price/);
 }
 const changed=structuredClone(packet);changed.sources[0].data.priorContext.contract='ESZ6';
 assert.equal(priceReferenceInput(changed).sources[0].data.priorContext.sessions[0].bars[0].priceReferenceId,undefined);
});
test('generation uses row-selection schema and saved signed raw references recover without another model call',async()=>{
 let calls=0;const raw=analysis(makeLevel(ref('session','low')));
 const run=createAnalyzer({env:{OPENAI_API_KEY:'fixture'},request:async(url,{body})=>{
  calls++;const request=JSON.parse(body);assert.deepEqual(request.text.format.schema,generationSchema);
  const input=JSON.parse(request.input[0].content[0].text);assert.ok(input.sources[0].data.session.priceReferenceId);
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(raw)}]}]})};
 }});
 assert.equal((await run(packet)).analysis.levels[0].price,7658);
 const recovery=createAnalysisRecovery({secret:'fixture'}),normalized=validatePacket(packet);
 const receipt=recovery.issue({packet:normalized,analysis:raw,checkedAt:through,model:'fixture',usage:null});
 assert.equal(recovery.recover({packet:normalized,recovery:receipt}).analysis.levels[0].price,7658);assert.equal(calls,1);
});
test('current facts remain tied to updated sources even when an earlier plan is displayed or an analysis fails',()=>{
 const input={...packet,charts:[],read:{date:'2026-09-08',result:{checkedAt:'2026-09-08T20:00:00Z',analysis:{levels:[{price:8000}]}}}};
 const facts=currentFacts(input,Date.parse('2026-09-12T04:00:00Z'));
 assert.equal(facts.facts[0].value,'7,662.00');assert.match(facts.analysis,/2026-09-08/);assert.ok(!JSON.stringify(facts.facts).includes('8000'));
 assert.equal(facts.clock.esSession,date);assert.equal(facts.clock.futures,'Weekend closure');
 assert.equal(currentFacts({...input,date:'2026-09-14'}).facts.length,0);
 assert.equal(currentFacts({...input,sources:[{...source,data:{available:false,message:'Failed update'}}]}).facts.length,0);
});
test('empty model rows and old chart attachments cannot advertise fresh usable data',()=>{
 const facts=currentFacts({...packet,sources:[{id:'od-gamma',title:'Gamma',sessionDate:date,data:{available:true,rowCount:0,rows:[]}}],charts:[{title:'DeepGamma',sessionDate:date,capturedAt:through,image:'fixture'}]});
 assert.equal(facts.available,0);assert.equal(facts.unavailable,1);assert.match(facts.chartNotes[0].value,/unverified/);assert.match(facts.chartNotes[0].detail,/not market time/);
});
test('weekend session display rolls only at Sunday reopen and distinguishes cash close from holiday status',()=>{
 for(const t of ['2026-09-11T22:00:00Z','2026-09-12T16:00:00Z','2026-09-13T21:59:59Z'])assert.equal(observedESSession(t),date);
 assert.equal(observedESSession('2026-09-13T22:00:00Z'),'2026-09-14');
 assert.equal(marketClock('2026-09-11T19:59:59Z').cashOpen,true);assert.equal(marketClock('2026-09-11T20:00:00Z').cashOpen,false);
 assert.equal(marketClock('2026-09-10T21:30:00Z').futures,'Daily maintenance window');
});
