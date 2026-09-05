import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalyzer,validatePacket,validateAnalysis} from '../analysis.mjs';
const packet={date:'2026-09-04',instrument:'SPX',sources:[{id:'gamma',title:'Gamma',sessionDate:'2026-09-04',data:{rows:[]},image:'data:image/png;base64,aGVsbG8='}]};
const valid={headline:'More evidence needed',summary:'No reliable levels.',gaps:['Need chart'],changes:[],levels:[],sources:[],scenarios:['up','down','neutral'].map(direction=>({direction,status:'insufficient',triggerId:null,targetId:null,condition:'Need levels',confirmation:'Need price response',invalidation:'Not established'}))};
test('analysis rejects date mismatches, secret-bearing remote image URLs, and missing ES basis',()=>{
 assert.throws(()=>validatePacket({...packet,date:'2026-02-30'}));
 assert.throws(()=>validatePacket({...packet,instrument:'ES'}));
 assert.throws(()=>validatePacket({...packet,sources:[{...packet.sources[0],sessionDate:'2026-09-03'}]}));
 assert.throws(()=>validatePacket({...packet,sources:[{...packet.sources[0],image:'https://example.com/key=private'}]}));
});
test('analysis rejects invented source IDs and dangling scenario levels',()=>{
 assert.throws(()=>validateAnalysis({...valid,levels:[{id:'x',price:7700,sourceIds:['invented']}]},packet));
 assert.throws(()=>validateAnalysis({...valid,scenarios:valid.scenarios.map(s=>({...s,triggerId:'missing'}))},packet));
 assert.equal(validateAnalysis(valid,packet),valid);
});
test('analysis sends only selected inputs, disables storage, caches exact repeats and strips usage extras',async()=>{
 let calls=0;const analyze=createAnalyzer({env:{OPENAI_API_KEY:'private'},request:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.ok(!JSON.stringify(body).includes('private'));return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(valid)}]}],usage:{input_tokens:10,output_tokens:20,other:'unused'}})};}});
 const first=await analyze(packet);assert.equal(first.ok,true);assert.deepEqual(first.usage,{inputTokens:10,outputTokens:20});assert.equal((await analyze(packet)).cached,true);assert.equal(calls,1);
});
test('no key, refusal or truncated analysis never applies a partial map',async()=>{
 assert.equal((await createAnalyzer({env:{}})(packet)).ok,false);
 for(const body of [{status:'incomplete'}, {status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]}]){const analyze=createAnalyzer({env:{OPENAI_API_KEY:'secret'},request:async()=>({ok:true,json:async()=>body})});const r=await analyze(packet);assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('secret'));}
});

test('data-only reference read has exact extrema and no AI request or trading triggers',async()=>{
 let calls=0;const analyze=createAnalyzer({env:{OPENAI_API_KEY:'private'},request:()=>{calls++;throw Error();}});
 const r=await analyze({date:'2026-09-04',instrument:'SPX',sources:[{id:'gamma',title:'Gamma',sessionDate:'2026-09-04',data:{actualSlot:'2026-09-04T16:00:00',rows:[{price:7743,value:-1743},{price:7740.5,value:-1871},{price:7715.5,value:1174}]}}]});
 assert.equal(calls,0);assert.equal(r.ok,true);assert.equal(r.analysis.levels.find(l=>l.label==='Negative Gamma reference').price,7740.5);assert.ok(r.analysis.scenarios.every(s=>s.status==='insufficient'&&s.triggerId===null));
});
