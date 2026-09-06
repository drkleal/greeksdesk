import test from 'node:test';
import assert from 'node:assert/strict';
import {exposureSnapshot,intervalPath,darkPoolLevels,createMarketContext} from '../market-context.mjs';
import {evidenceCoverage} from '../public/evidence.mjs';
import {pathDirectionValid,levelDetails,decisionZones,setupRoom,quoteStatus,scenarioRoute} from '../public/plan.mjs';
test('Quant Data documented omitted legs are zero and participate in strike ranks',()=>{
 const r=exposureSnapshot({data:{SPX:{stockPrice:7717,exposureMap:{'2026-09-04':{'7715':{callExposure:200,putExposure:-50},'7720':{callExposure:999}},'2026-09-11':{'7715':{callExposure:80,putExposure:-10}}}}}});
 assert.equal(r.strongest.length,2);assert.equal(r.strongest[0].net,999);assert.equal(r.strongest[1].net,220);assert.equal(r.incompleteLegPairs,0);assert.equal(r.omittedZeroLegs,1);assert.equal(r.strikeCount,2);assert.equal(r.nearby.length,2);
});
test('interval snapshots remain separate and documented zero legs are included',()=>{
 const rows=intervalPath({data:{'2000':{expiry:{'10':{CALL:12,PUT:-2}}},'1000':{expiry:{'10':{CALL:4,PUT:-1}}},'3000':{expiry:{'10':{CALL:50}}}}});
 assert.deepEqual(rows.map(r=>r.net),[3,10,50]);assert.equal(rows[2].omittedZeroLegs,1);assert.equal(rows[0].timestamp,'1970-01-01T00:00:01.000Z');
});

test('a distant target cannot hide an intervening structural obstacle',()=>{
 const levels=[{id:'start',price:7716,role:'structure'},{id:'near',price:7719.25,role:'structure'},{id:'far',price:7725.75,role:'structure'}];
 const room=setupRoom({status:'conditional',direction:'up',triggerId:'start',targetId:'far'},levels);
 assert.equal(room.eligible,false);assert.equal(room.points,3.25);assert.match(room.text,/intervening structure/);
});
test('path checks include off-map reactions, both directions, and obstacles within one point',()=>{
 const levels=[{id:'start',price:7716,role:'structure'},{id:'far',price:7722.75,role:'structure'}];
 const checks=[{id:'near',price:7717.75,role:'structure'},{id:'nearer',price:7716.5,role:'structure'},{id:'other',price:7714,role:'structure'},{id:'quote',price:7716.25,role:'last_price'}];
 const up={status:'conditional',direction:'up',triggerId:'start',targetId:'far'};
 const room=setupRoom(up,levels,5,checks);
 assert.equal(room.eligible,false);assert.equal(room.points,.5);assert.deepEqual(room.obstacles.map(l=>l.id),['nearer','near']);
 assert.equal(levels.length,2); // Keeping the map uncluttered cannot increase apparent room.
 const down=setupRoom({...up,direction:'down',triggerId:'far',targetId:'start'},levels,5,checks);
 assert.equal(down.points,5);assert.equal(down.obstacles[0].id,'near');assert.equal(down.eligible,false);
 assert.equal(setupRoom(up,levels,5,[]).eligible,true);
 assert.equal(setupRoom(up,levels,5,null).eligible,false); // Archived read without this review.
});
test('the first reaction does not cap the broader conditional span, and intermediate checks remain visible',()=>{
 const levels=[{id:'start',price:7716,role:'structure'},{id:'first',price:7719.25,role:'structure'},{id:'shelf',price:7722.75,role:'structure'},{id:'outer',price:7740,role:'structure'}];
 const s={status:'conditional',direction:'up',triggerId:'start',targetId:'first',continuation:{targetId:'outer',condition:'Only after first objective acceptance',confirmation:'Acceptance through intervening shelves',invalidation:'Loss of reclaimed structure',rationale:'Earlier session reaction'}};
 const route=scenarioRoute(s,levels,[{id:'micro',price:7717,role:'structure'}]);
 assert.equal(route.first.firstPoints,1);assert.equal(route.first.points,3.25);
 assert.equal(route.totalPoints,24);assert.equal(route.stages[1].points,20.75);assert.equal(route.hasContinuation,true);
 assert.deepEqual(route.stages[1].checks.map(l=>l.id),['shelf']);
 assert.equal(scenarioRoute({...s,continuation:{...s.continuation,confirmation:''}},levels,[]).hasContinuation,false);
 assert.equal(scenarioRoute({...s,continuation:{...s.continuation,targetId:'start'}},levels,[]).hasContinuation,false);
 assert.equal(scenarioRoute(s,levels.map(l=>l.id==='outer'?{...l,role:'last_price'}:l),[]).hasContinuation,false);
 assert.equal(scenarioRoute(s,levels,undefined).ready,false);
});

test('explicit null and malformed exposure remain unknown, not documented zeros',()=>{
 const r=exposureSnapshot({data:{SPX:{stockPrice:7717,exposureMap:{expiry:{'7715':{callExposure:200,putExposure:null},'7720':{callExposure:'999'},'7000':{putExposure:-20}}}}}});
 assert.equal(r.incompleteLegPairs,2);assert.deepEqual(r.strongest.map(x=>x.strike),[7000]);assert.equal(r.nearby.length,0);
 assert.equal(intervalPath({data:{'1000':{expiry:{'10':{CALL:50,PUT:null}}}}})[0].net,null);
 assert.throws(()=>exposureSnapshot({data:{SPX:{exposureMap:{expiry:{'100':null}}}}}),/Invalid exposure/);
});
test('historical dark-pool context excludes request-time price',()=>{
 const r=darkPoolLevels({latestStockPrice:999,data:{'700':{notionalValue:5000,size:10,tradeCount:2}}});
 assert.ok(!JSON.stringify(r).includes('999'));assert.equal(r.levels[0].price,700);
});
test('market context is bounded, caches results, reports failures, and never returns credentials',async()=>{
 const calls=[];const fetcher=createMarketContext({env:{QUANT_DATA_API_KEY:'private-key'},request:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);assert.equal(options.headers.Authorization,'Bearer private-key');return {ok:false,status:422};}});
 const first=await fetcher('2026-09-04');assert.equal(first.requestCount,25);assert.equal(first.sources.length,24);assert.ok(first.sources.every(s=>s.data.available===false));assert.ok(!JSON.stringify(first).includes('private-key'));
 assert.equal((await fetcher('2026-09-04')).cached,true);assert.equal(calls.length,25);assert.ok(calls.every(([url])=>url.startsWith('https://api.quantdata.us/v1/')));
 assert.equal(calls.filter(([,body])=>body.filter.ticker==='SPY').length,3);
});
test('coverage exposes captured panels omitted from the analysis and unavailable API feeds',()=>{
 const read={sources:[{id:'chart',image:'image',capturedPanels:[{id:'panel-1',title:'Gamma'},{id:'panel-2',title:'Charm'}]},{id:'api',title:'API',data:{available:false}}],result:{analysis:{sources:[{id:'api'}],panels:[{id:'p',sourceId:'chart',capturedPanelId:'panel-1',title:'Gamma',status:'context'}]}}};
 assert.deepEqual(evidenceCoverage(read).map(r=>r.status),['context','not-reviewed','unavailable']);
});
test('reviewed incomplete exposure remains visibly partial',()=>{
 const read={sources:[{id:'gamma',data:{available:true,incompleteLegPairs:3}},{id:'delta',data:{available:true,intervals:{buckets:[{incomplete:1}]}}}],result:{analysis:{sources:[{id:'gamma'},{id:'delta'}]}}};
 assert.deepEqual(evidenceCoverage(read).map(r=>r.status),['partial','partial']);
});
test('a displayed fresh quote ages into stale without fetching new data',()=>{
 const feed={freshness:'fresh',latestTimestamp:'2026-09-08T14:00:00Z'};
 assert.equal(quoteStatus(feed,Date.parse('2026-09-08T14:00:10Z')),'Fresh sample · 10s old');
 assert.equal(quoteStatus(feed,Date.parse('2026-09-08T14:00:21Z')),'Stale sample · 21s old');
 assert.equal(quoteStatus({...feed,freshness:'historical'},Date.parse('2026-09-09T14:00:00Z')),'Historical');
});
test('path direction cannot reverse prices or use a last-price marker as a target',()=>{
 const levels=[{id:'a',price:100,role:'structure'},{id:'b',price:110,role:'structure'},{id:'last',price:90,role:'last_price'}];
 assert.equal(pathDirectionValid({direction:'up',triggerId:'a',targetId:'b'},levels),true);
 assert.equal(pathDirectionValid({direction:'down',triggerId:'a',targetId:'b'},levels),false);
 assert.equal(pathDirectionValid({direction:'down',triggerId:'a',targetId:'last'},levels),false);
});
test('legacy reference labels expose an unidentified indicator rather than inventing a Greek',()=>{
 const d=levelDetails({role:'model_reference',label:'ES reference',evidence:'Red horizontal line'});
 assert.equal(d.name,'Chart line · indicator unknown');assert.equal(d.category,'drawing');
});
test('nearby prices form one decision zone and missing or half-point destinations are watch-only',()=>{
 const levels=[{id:'a',price:7715.5,role:'structure'},{id:'b',price:7716,role:'structure'},{id:'c',price:7722.75,role:'structure'},{id:'q',price:7715,role:'last_price'}];
 const zones=decisionZones(levels);assert.equal(zones.length,2);assert.deepEqual(zones[1].members.map(l=>l.id),['b','a']);
 assert.equal(setupRoom({status:'conditional',triggerId:'a',targetId:'b'},levels).eligible,false);
 assert.equal(setupRoom({status:'conditional',triggerId:'a',targetId:null},levels).eligible,false);
 assert.equal(setupRoom({status:'conditional',triggerId:'b',targetId:'c'},levels).points,6.75);
 assert.equal(setupRoom({status:'conditional',triggerId:'a',targetId:'low'},[...levels,{id:'low',price:7713.75,role:'structure'}]).eligible,false);
});
