import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalyzer,validatePacket,validateAnalysis} from '../analysis.mjs';
test('corrected exposure calculations cannot become false before-and-after market movement',()=>{
 const input={date:'2026-09-04',instrument:'ES',basis:null,sources:[{id:'qd-gamma',title:'Gamma',sessionDate:'2026-09-04',data:{normalizationVersion:2}}],previousEvidence:{date:'2026-09-04',checkedAt:'2026-09-06T10:00:00Z',sources:[{id:'qd-gamma',data:{strongest:[{strike:6180,net:0}]}}]}};
 assert.equal(validatePacket(input).previousEvidence.sources[0].data.available,false);
 input.previousEvidence.sources[0].data={normalizationVersion:2,strongest:[{strike:7720,net:54655}]};
 assert.equal(validatePacket(input).previousEvidence.sources[0].data.strongest[0].net,54655);
});
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

test('analysis distinguishes timeouts, malformed replies and invalid evidence without exposing upstream errors',async()=>{
 const run=request=>createAnalyzer({env:{OPENAI_API_KEY:'private'},request})(packet);
 const timeout=await run(async()=>{throw new DOMException('secret upstream text','TimeoutError');});assert.equal(timeout.code,'analysis_timeout');assert.ok(!timeout.message.includes('secret'));
 const bad=await run(async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'not-json'}]}]})}));assert.equal(bad.code,'analysis_format');
 const invalid=await run(async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...valid,levels:[{id:'x',price:7790,apiOrigin:{sourceId:'databento'},sourceIds:['databento']}]})}]}]})}));assert.equal(invalid.code,'evidence_mismatch');assert.match(invalid.message,/cited date, price or bar/);
 const connection=await run(async()=>{throw Error('https://private/key=secret');});assert.equal(connection.code,'analysis_connection');assert.ok(!JSON.stringify(connection).includes('secret'));
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
 const native={...packet,instrument:'ES',basis:null};const nativePanel={...panel,instrument:'ES'};const level={id:'es-level',price:7725,label:'ES support',role:'structure',kind:'support',sourceIds:['gamma'],panelIds:['p1'],evidence:'Visible ES structure',watch:'Hold',invalidation:'Break'};
 assert.equal(validateAnalysis({...valid,panels:[nativePanel],levels:[level]},native).levels.length,1);
 assert.throws(()=>validateAnalysis({...valid,panels:[panel],levels:[level]},native));
 assert.throws(()=>validateAnalysis({...valid,panels:[nativePanel],levels:[{...level,panelIds:[]}]},native));
});
test('identified ES API bars support analysis without an image and cannot invent level prices',async()=>{
 const input={date:'2026-09-04',instrument:'ES',basis:null,sources:[{id:'databento',title:'ESU6',sessionDate:'2026-09-04',data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',latestPrice:7715,recentBars:[{open:7715,high:7717,low:7714,close:7716}],session:{high:7717,low:7714,volume:2000}}}]};
 const l={id:'es-low',price:7714,role:'structure',kind:'support',label:'Session low',sourceIds:['databento'],panelIds:[],evidence:'Session low from observed ESU6 bars',watch:'Retest',invalidation:'Loss'};
 assert.doesNotThrow(()=>validateAnalysis({...structuredClone(valid),levels:[l]},input));
 assert.throws(()=>validateAnalysis({...structuredClone(valid),levels:[{...l,price:2000}]},input));
 let calls=0;const analyze=createAnalyzer({env:{OPENAI_API_KEY:'test-private'},request:async()=>{calls++;return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...valid,levels:[l]})}]}]})};}});
 assert.equal((await analyze(input)).ok,true);assert.equal(calls,1);
});
test('off-map checkpoints require the same price, source and identity evidence as map levels',()=>{
 const input={date:'2026-09-04',instrument:'ES',basis:null,sources:[{id:'databento',title:'ESU6',sessionDate:'2026-09-04',data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',recentBars:[{open:7716,high:7719.25,low:7715,close:7717.75}]}}]};
 const checkpoint={id:'retest',price:7719.25,label:'Earlier rebound high',role:'structure',kind:'resistance',sourceIds:['databento'],panelIds:[],identity:{category:'structure',name:'Earlier rebound high',sourceLabel:null,description:'A rebound turned lower here.',derivation:'Recent ESU6 bar high followed by the supplied lower-price path.'},evidence:'Recent ES price reaction',watch:'Acceptance through the earlier high',invalidation:'A later break and sustained trade above'};
 const check=(patch={})=>validateAnalysis({...structuredClone(valid),checkpoints:[{...structuredClone(checkpoint),...patch}]},input);
 assert.equal(check().checkpoints[0].price,7719.25);
 assert.throws(()=>check({price:7800}),/native ES/);
 assert.throws(()=>check({sourceIds:['missing']}),/level evidence/);
 assert.throws(()=>check({role:'model_reference'}),/checkpoint/);
 assert.throws(()=>check({identity:{...checkpoint.identity,category:'drawing'}}),/checkpoint/);
 assert.throws(()=>validateAnalysis({...structuredClone(valid),levels:[checkpoint],checkpoints:[checkpoint]},input),/level evidence/);
 assert.throws(()=>validateAnalysis({...structuredClone(valid),checkpoints:[checkpoint],scenarios:valid.scenarios.map(s=>({...s,triggerId:'retest'}))},input),/scenario/);
 // Image-backed checkpoints must use an observed, usable panel too.
 const chart={...packet,instrument:'ES',basis:null};
 assert.throws(()=>validateAnalysis({...structuredClone(valid),panels:[{...panel,instrument:'ES',status:'context'}],checkpoints:[{...checkpoint,sourceIds:['gamma'],panelIds:['p1']}]},chart),/native ES/);
});
test('broader objectives require real earlier-session prices and directional acceptance conditions',()=>{
 const input={date:'2026-09-04',instrument:'ES',basis:null,sources:[{id:'databento',title:'ESU6',sessionDate:'2026-09-04',data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',recentBars:[{open:7716,high:7719.25,low:7715,close:7717.75}],bars15m:[{open:7739,high:7740,low:7730,close:7731}]}}]};
 const level=(id,price)=>({id,price,label:id,role:'structure',kind:'resistance',sourceIds:['databento'],panelIds:[],evidence:'Observed ES price reaction',watch:'Retest',invalidation:'Failure'});
 const continuation={targetId:'outer',condition:'After acceptance above the first objective',confirmation:'Hold reclaimed levels',invalidation:'Loss of that acceptance',rationale:'Earlier-session 15-minute reaction'};
 const run=(c=continuation)=>validateAnalysis({...structuredClone(valid),checkpoints:[],levels:[level('trigger',7716),level('first',7719.25),level('outer',7740)],scenarios:valid.scenarios.map(s=>({...s,...(s.direction==='up'?{status:'conditional',triggerId:'trigger',targetId:'first',continuation:c}:{})}))},input);
 assert.equal(run().scenarios[0].continuation.targetId,'outer');
 assert.equal(run({...continuation,targetId:'trigger'}).scenarios[0].continuation.targetId,null);
 assert.equal(run({...continuation,confirmation:''}).scenarios[0].continuation.targetId,null);
 assert.throws(()=>validateAnalysis({...structuredClone(valid),levels:[level('invented',7799)]},input),/native ES/);
 assert.equal(run({...continuation,targetId:'missing'}).scenarios[0].status,'conditional'); // Only the invalid continuation is withheld.
});
test('repeated full-session reads compare prior ES snapshots without resending old bar arrays to the analyst',()=>{
 const data={ticker:'ES',contract:'ESU6',latestPrice:7715,latestTimestamp:'2026-09-04T21:00:00Z',session:{high:7764.5,low:7711.75},bars5m:Array(300).fill({evidence:'x'.repeat(400)}),bars15m:[{}],recentBars:[{}]};
 const normalized=validatePacket({...packet,previousEvidence:{date:packet.date,checkedAt:'2026-09-06T14:00:00Z',sources:[{id:'databento',data}]}}).previousEvidence.sources[0].data;
 assert.equal(normalized.latestPrice,7715);assert.equal(normalized.session.high,7764.5);assert.equal(normalized.bars5m,undefined);assert.equal(normalized.recentBars,undefined);
 assert.equal(data.bars5m.length,300);
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
 const level={id:'es-retest',price:7716,label:'Visible ES retest',role:'structure',sourceIds:['gamma'],panelIds:['p1'],evidence:'Chart price; date and ES supplied by owner',watch:'Observe retest',invalidation:'Acceptance through the level'};
 assert.equal(validateAnalysis({...valid,panels:[confirmedPanel],levels:[level]},native).levels[0].price,7716);
 assert.throws(()=>validateAnalysis({...valid,panels:[confirmedPanel]}, {...native,sources:[{...native.sources[0],confirmedContext:null}]}),/no user confirmation/);
 assert.throws(()=>validatePacket({...native,sources:[{...native.sources[0],confirmedContext:{...confirmedContext,sessionDate:'2026-09-03'}}]}));
 assert.throws(()=>validatePacket({...native,sources:[{...native.sources[0],image:undefined}]}),/requires an image/);
 assert.throws(()=>validateAnalysis({...valid,panels:[{...confirmedPanel,observedDate:'2026-09-08',dateEvidence:'visible'}]},native),/date mismatch/);
});

test('last-price and raw model references cannot become a structural trade setup',()=>{
 const level={id:'quote',price:7715,label:'Last price',role:'last_price',kind:'reference',sourceIds:['gamma'],panelIds:['p1'],evidence:'Quote marker',watch:'Observe',invalidation:'Not structural'};
 const result=validateAnalysis({...valid,gaps:[],panels:[panel],levels:[level],scenarios:valid.scenarios.map(s=>({...s,status:'conditional',triggerId:'quote',targetId:null}))},packet);
 assert.ok(result.scenarios.every(s=>s.status==='insufficient'&&s.triggerId===null));
 assert.equal(result.gaps.length,3);
});

test('provider panel title and bounds come from captured layout rather than model guesses',()=>{
 const captured={id:'panel-2',title:'Vanna',complete:true,region:{x:.01,y:.5,width:.48,height:.45}};
 const input=validatePacket({...packet,sources:[{...packet.sources[0],capturedPanels:[captured]}]});
 const output=validateAnalysis({...valid,panels:[{...panel,capturedPanelId:'panel-2',title:'Guessed title'}]},input);
 assert.equal(output.panels[0].title,'Vanna');assert.deepEqual(output.panels[0].region,captured.region);assert.equal(output.panels[0].locationVerified,true);
 assert.throws(()=>validateAnalysis({...valid,panels:[{...panel,capturedPanelId:'panel-9'}]},input),/does not match/);
 assert.throws(()=>validatePacket({...packet,sources:[{...packet.sources[0],capturedPanels:[{...captured,region:{x:.9,y:0,width:.5,height:1}}]}]}),/bounds/);
 const legacy=validateAnalysis({...valid,panels:[{...panel,region:{x:.1,y:.1,width:.5,height:.5}}]},packet);
 assert.deepEqual(legacy.panels[0].region,{x:0,y:0,width:1,height:1});assert.equal(legacy.panels[0].locationVerified,false);
});

test('level identities prevent an unidentified drawing from becoming a trade trigger',()=>{
 const level={id:'line',price:7716,label:'Red line',role:'structure',kind:'reference',sourceIds:['gamma'],panelIds:['p1'],evidence:'A red line',watch:'Wait',invalidation:'Unknown',identity:{category:'drawing',name:'Unidentified red chart line',sourceLabel:null,description:'Drawn annotation',derivation:'Its source indicator is unreadable'}};
 const output=validateAnalysis({...structuredClone(valid),panels:[structuredClone(panel)],levels:[level],scenarios:valid.scenarios.map(s=>({...s,status:'conditional',triggerId:'line'}))},packet);
 assert.equal(output.levels[0].role,'model_reference');assert.ok(output.scenarios.every(s=>s.status==='insufficient'));
 assert.throws(()=>validateAnalysis({...structuredClone(valid),panels:[structuredClone(panel)],levels:[{...level,identity:{...level.identity,category:'provider'}}]},packet),/source label/);
});
test('wrong-way scenario target is withheld and future-model evidence cannot claim current support',()=>{
 const levels=[100,110].map((price,i)=>({id:'l'+i,price,label:'Retest',role:'structure',kind:'reference',sourceIds:['gamma'],panelIds:['p1'],evidence:'Price reaction',watch:'Retest',invalidation:'Failure'}));
 const future={...panel,id:'future',observedDate:'2026-09-08',dateRole:'projected_session',status:'context'};
 const scenarios=valid.scenarios.map(s=>({...s,status:s.direction==='down'?'conditional':'insufficient',triggerId:s.direction==='down'?'l0':null,targetId:s.direction==='down'?'l1':null,drivers:[{sourceId:'gamma',panelId:'future',effect:'supports',reason:'Forward model'}]}));
 const result=validateAnalysis({...structuredClone(valid),levels,panels:[structuredClone(panel),future],scenarios},packet);
 assert.equal(result.scenarios.find(s=>s.direction==='down').status,'insufficient');assert.ok(result.scenarios.every(s=>s.drivers[0].effect==='context'));
});


test('chart intake accepts eight selected images and rejects a ninth',()=>{
 const sources=Array.from({length:8},(_,i)=>({...packet.sources[0],id:'chart-'+i}));
 assert.equal(validatePacket({...packet,sources}).sources.length,8);
 assert.throws(()=>validatePacket({...packet,sources:[...sources,{...sources[0],id:'chart-9'}]}),/eight chart images/);
});
test('trade-derived VWAP and profile nodes require exact named session and origin',()=>{
 const through='2026-09-04T20:00:00.000Z';
 const input={date:'2026-09-04',instrument:'ES',basis:null,sources:[{id:'databento',title:'ESU6',sessionDate:'2026-09-04',data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',recentBars:[{open:7715,high:7725,low:7710,close:7720}],volumeProfile:{available:true,contract:'ESU6',schema:'trades',completeWindow:true,through,nodes:[{kind:'POC',price:7717.25}]},sessionProfiles:{RTH:{high:7725,low:7710,vwap:7718.135,through}}}}]};
 const level={id:'vwap',price:7718.135,label:'RTH VWAP',role:'structure',kind:'reference',sourceIds:['databento'],panelIds:[],evidence:'Trade-weighted session mean and observed retest',watch:'Acceptance',invalidation:'Loss',apiOrigin:{sourceId:'databento',sessionDate:input.date,timeframe:'rth_profile',timestamp:through,field:'vwap'}};
 const check=(l=level)=>validateAnalysis({...structuredClone(valid),levels:[l]},input);
 assert.equal(check().levels[0].price,7718.135);
 assert.throws(()=>check({...level,price:7718.25}));
 assert.throws(()=>check({...level,apiOrigin:{...level.apiOrigin,timeframe:'london_profile'}}));
 assert.throws(()=>check({...level,apiOrigin:{...level.apiOrigin,timestamp:'2026-09-04T19:00:00Z'}}));
 assert.equal(check({...level,price:7717.25,apiOrigin:{...level.apiOrigin,timeframe:'volume_profile',field:'poc'}}).levels[0].price,7717.25);
 assert.throws(()=>check({...level,price:7717.25,apiOrigin:{...level.apiOrigin,timeframe:'volume_profile',field:'hvn'}}));
});
