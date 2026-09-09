import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalysisRecovery} from '../analysis-recovery.mjs';
import {validatePacket} from '../analysis.mjs';
import {createServer} from '../server.mjs';

const secret='recovery-test-secret',date='2026-09-09';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=';
const chartIds=['paste-dg','es-snapshot','es-five-minute','paste-vp','paste-vp-prior','paste-vp-composite'];
const packet=validatePacket({date,instrument:'ES',basis:null,sources:chartIds.map(id=>({id,title:id,sessionDate:date,image}))});
const panels=chartIds.map((sourceId,i)=>({id:'p'+i,sourceId,title:sourceId,capturedPanelId:null,instrument:'ES',instrumentEvidence:'contract_header',instrumentLabel:'ESU6',metricUnits:'points',observedDate:date,dateEvidence:'visible',dateRole:'observed_session',status:i>=4?'context':'usable',reason:'Regression fixture',shows:'Regression fixture',region:{x:0,y:0,width:1,height:1}}));
const level=(id,price,role='structure')=>({id,price,role,kind:'reference',label:id,identity:{category:role==='structure'?'structure':'provider',name:id,sourceLabel:role==='structure'?null:'HVN',description:'Regression fixture',derivation:'Regression fixture'},sourceIds:['es-snapshot'],panelIds:['p1'],evidence:'Regression fixture',watch:'Observe',invalidation:'Failure'});
const analysis={headline:'Fixture',summary:'Fixture',gaps:[],changes:[],panels,levels:[level('low',7650),level('high',7670)],checkpoints:[level('hvn',7660,'model_reference')],confluence:[],sources:chartIds.map(id=>({id,shows:'Fixture finding',importance:'Fixture',lookFor:'Fixture'})),scenarios:['up','down','neutral'].map(direction=>({direction,status:'conditional',triggerId:direction==='down'?'high':'low',targetId:direction==='down'?'low':'high',condition:'Observe boundaries',confirmation:'Observe response',invalidation:'Failure',rationale:'Fixture',continuation:{targetId:null,condition:'None',confirmation:'None',invalidation:'None',rationale:'None'}}))};
const review={packet,analysis,checkedAt:'2026-09-09T11:45:00Z',model:'gpt-5.4',usage:{inputTokens:10,outputTokens:20}};

test('signed recovery preserves the exact snapshot and cannot accept modified data, output, dates or credentials',()=>{
 const recovery=createAnalysisRecovery({secret,now:()=>1000}),receipt=recovery.issue(review);
 const result=recovery.recover({packet,recovery:receipt});
 assert.equal(result.ok,true);assert.equal(result.recovered,true);assert.equal(result.checkedAt,review.checkedAt);assert.deepEqual(result.usage,review.usage);
 assert.equal(result.analysis.panels.length,6);assert.equal(result.analysis.sources.length,6);assert.equal(result.analysis.reviewStatus,'limited');
 assert.equal(result.analysis.referenceCheckpoints[0].role,'model_reference');assert.ok(result.analysis.scenarios.every(s=>s.status==='insufficient'));
 assert.equal(analysis.checkpoints.length,1);assert.equal(receipt.analysis.checkpoints.length,1);
 for(const change of [r=>r.analysis.levels[0].price++,r=>r.checkedAt='2026-09-10T12:00:00Z',r=>r.expiresAt++,r=>r.usage.inputTokens++,r=>r.packetHash='0'.repeat(64)]){
  const modified=structuredClone(receipt);change(modified);assert.equal(recovery.recover({packet,recovery:modified}).code,'recovery_invalid');
 }
 const changedPacket=structuredClone(packet);changedPacket.sources[0].image=image.replace('AAAA','AAAB');
 assert.equal(recovery.recover({packet:changedPacket,recovery:receipt}).ok,false);
 assert.equal(createAnalysisRecovery({secret:'different',now:()=>1000}).recover({packet,recovery:receipt}).ok,false);
 assert.equal(createAnalysisRecovery({secret,now:()=>receipt.expiresAt+1}).recover({packet,recovery:receipt}).ok,false);
 assert.ok(!JSON.stringify(receipt).includes(secret));
 const invalid=structuredClone(analysis);invalid.levels[0].sourceIds=['invented'];
 assert.equal(recovery.recover({packet,recovery:recovery.issue({...review,analysis:invalid})}).code,'recovery_validation');
});

test('authenticated HTTP recovery processes all six fixture images with zero generation calls and rejects cross-site requests',async()=>{
 let calls=0;
 const server=createServer(secret,{analysisOptions:{env:{OPENAI_API_KEY:'test'},request:async()=>{calls++;throw Error('No generation expected');}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('drkleal:'+secret).toString('base64'),'Content-Type':'application/json','X-GreeksDesk-Action':'manual-check'};
 const body=JSON.stringify({packet,recovery:createAnalysisRecovery({secret}).issue(review)});
 try{
  assert.equal((await fetch(base+'/api/recover-analysis',{method:'POST',body})).status,401);
  assert.equal((await fetch(base+'/api/recover-analysis',{method:'POST',headers:{...headers,'sec-fetch-site':'cross-site'},body})).status,403);
  const response=await fetch(base+'/api/recover-analysis',{method:'POST',headers,body});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.ok,true);assert.equal(result.analysis.panels.length,6);assert.equal(result.analysis.sources.length,6);assert.equal(result.analysis.reviewStatus,'limited');assert.equal(calls,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('a failed generation returns a signed, unapplied recovery receipt and rechecking never regenerates it',async()=>{
 let calls=0;const invalid=structuredClone(analysis);invalid.levels[0].sourceIds=['invented'];
 const server=createServer(secret,{analysisOptions:{env:{OPENAI_API_KEY:'test'},request:async()=>{calls++;return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(invalid)}]}],usage:{input_tokens:10,output_tokens:20}})};}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('drkleal:'+secret).toString('base64'),'Content-Type':'application/json','X-GreeksDesk-Action':'manual-check'};
 try{
  const failed=await(await fetch(base+'/api/analyze',{method:'POST',headers,body:JSON.stringify(packet)})).json();
  assert.equal(failed.ok,false);assert.equal(failed.analysis,undefined);assert.ok(failed.recovery.signature);assert.equal(calls,1);
  const result=await(await fetch(base+'/api/recover-analysis',{method:'POST',headers,body:JSON.stringify({packet,recovery:failed.recovery})})).json();
  assert.equal(result.code,'recovery_validation');assert.equal(result.analysis,undefined);assert.equal(calls,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
