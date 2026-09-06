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

const panel={id:'p1',sourceId:'gamma',title:'Price',instrument:'SPX',instrumentEvidence:'price_axis',instrumentLabel:'SPX',metricUnits:'price points',observedDate:'2026-09-04',dateEvidence:'visible',dateRole:'observed_session',status:'usable',reason:'Readable',shows:'Price structure',region:{x:0,y:0,width:1,height:1}};
test('panel evidence excludes mismatched dates and cross-instrument prices',()=>{
 assert.throws(()=>validateAnalysis({...valid,panels:[{...panel,observedDate:'2026-09-08'}]},packet));
 assert.throws(()=>validateAnalysis({...valid,panels:[{...panel,instrument:'SPY'}]},packet));
 assert.throws(()=>validateAnalysis({...valid,panels:[{...panel,region:{x:.9,y:0,width:.5,height:1}}]},packet));
 assert.equal(validateAnalysis({...valid,panels:[panel]},packet).panels.length,1);
});
test('ES API references apply only the explicitly supplied basis',()=>{
 const input=validatePacket({date:'2026-09-04',instrument:'ES',basis:17.25,sources:[{id:'price',title:'SPX',sessionDate:'2026-09-04',data:{ticker:'SPX',latestPrice:7700}}]});
 return createAnalyzer({env:{}})(input).then(r=>assert.equal(r.analysis.levels[0].price,7717.25));
});

test('native ES mode never relabels SPX API references as ES',async()=>{
 const r=await createAnalyzer({env:{}})({date:'2026-09-04',instrument:'ES',basis:null,sources:[{id:'price',title:'SPX',sessionDate:'2026-09-04',data:{ticker:'SPX',latestPrice:7700}}]});assert.deepEqual(r.analysis.levels,[]);
 const native={...packet,instrument:'ES',basis:null};const nativePanel={...panel,instrument:'ES'};const level={id:'es-level',price:7725,label:'ES support',kind:'support',sourceIds:['gamma'],panelIds:['p1'],evidence:'Visible ES structure',watch:'Hold',invalidation:'Break'};
 assert.equal(validateAnalysis({...valid,panels:[nativePanel],levels:[level]},native).levels.length,1);
 assert.throws(()=>validateAnalysis({...valid,panels:[panel],levels:[level]},native));
 assert.throws(()=>validateAnalysis({...valid,panels:[nativePanel],levels:[{...level,panelIds:[]}]},native));
});

test('exposure measured in ES futures is not an ES price coordinate',()=>{
 const native={...packet,instrument:'ES',basis:null};
 const exposure={...panel,instrument:'ES',instrumentEvidence:'exposure_units_only',instrumentLabel:'ES futures / point',metricUnits:'ES futures / point'};
 assert.throws(()=>validateAnalysis({...valid,panels:[exposure]},native),/Exposure units/);
 assert.throws(()=>validateAnalysis({...valid,panels:[{...exposure,instrumentEvidence:'underlying_selector'}]},native),/contract or price axis/);
 const spxExposure={...panel,status:'context',instrumentEvidence:'underlying_selector',instrumentLabel:'SPX',metricUnits:'ES futures / point'};
 assert.equal(validateAnalysis({...valid,panels:[spxExposure]},native).panels[0].instrument,'SPX');
});
test('next-session exposure remains planning context without becoming observed levels',()=>{
 const forward={...panel,observedDate:'2026-09-08',dateRole:'projected_session',status:'context',title:'Next-session Gamma'};
 assert.equal(validateAnalysis({...valid,panels:[forward]},packet).panels[0].status,'context');
 assert.throws(()=>validateAnalysis({...valid,panels:[{...forward,status:'usable'}]},packet));
 assert.throws(()=>validateAnalysis({...valid,panels:[{...forward,observedDate:packet.date,status:'usable'}]},packet),/Projected sessions/);
});

test('cropped ES metadata can use source-specific owner confirmation without a basis',()=>{
 const confirmedContext={instrument:'ES',sessionDate:packet.date,priceTime:'17:00',timezone:'America/New_York'};
 const native=validatePacket({...packet,instrument:'ES',basis:null,sources:[{...packet.sources[0],confirmedContext}]});
 const confirmedPanel={...panel,instrument:'ES',instrumentEvidence:'user_confirmed',instrumentLabel:'ES (chart owner)',dateEvidence:'user_confirmed'};
 const level={id:'es-retest',price:7716,label:'Visible ES retest',sourceIds:['gamma'],panelIds:['p1'],evidence:'Chart price; date and ES supplied by owner',watch:'Observe retest',invalidation:'Acceptance through the level'};
 assert.equal(validateAnalysis({...valid,panels:[confirmedPanel],levels:[level]},native).levels[0].price,7716);
 assert.throws(()=>validateAnalysis({...valid,panels:[confirmedPanel]}, {...native,sources:[{...native.sources[0],confirmedContext:null}]}),/no user confirmation/);
 assert.throws(()=>validatePacket({...native,sources:[{...native.sources[0],confirmedContext:{...confirmedContext,sessionDate:'2026-09-03'}}]}));
 assert.throws(()=>validatePacket({...native,sources:[{...native.sources[0],image:undefined}]}),/requires an image/);
 assert.throws(()=>validateAnalysis({...valid,panels:[{...confirmedPanel,observedDate:'2026-09-08',dateEvidence:'visible'}]},native),/date mismatch/);
});
