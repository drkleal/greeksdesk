import test from 'node:test';
import assert from 'node:assert/strict';
import {exposureSnapshot,intervalPath,darkPoolLevels,createMarketContext} from '../market-context.mjs';
import {evidenceCoverage} from '../public/evidence.mjs';
import {pathDirectionValid,levelDetails,decisionZones,setupRoom,quoteStatus} from '../public/plan.mjs';
test('exposure ranks complete strikes without treating absent legs as zero',()=>{
 const r=exposureSnapshot({data:{SPX:{stockPrice:7717,exposureMap:{'2026-09-04':{'7715':{callExposure:200,putExposure:-50},'7720':{callExposure:999}},'2026-09-11':{'7715':{callExposure:80,putExposure:-10}}}}}});
 assert.equal(r.strongest.length,1);assert.equal(r.strongest[0].net,220);assert.equal(r.incompleteLegPairs,1);assert.equal(r.strikeCount,2);
});
test('interval snapshots remain separate and incomplete buckets cannot imply measured changes',()=>{
 const rows=intervalPath({data:{'2000':{expiry:{'10':{CALL:12,PUT:-2}}},'1000':{expiry:{'10':{CALL:4,PUT:-1}}},'3000':{expiry:{'10':{CALL:50}}}}});
 assert.deepEqual(rows.map(r=>r.net),[3,10,null]);assert.equal(rows[0].timestamp,'1970-01-01T00:00:01.000Z');
});
test('historical dark-pool context excludes request-time price',()=>{
 const r=darkPoolLevels({latestStockPrice:999,data:{'700':{notionalValue:5000,size:10,tradeCount:2}}});
 assert.ok(!JSON.stringify(r).includes('999'));assert.equal(r.levels[0].price,700);
});
test('market context is bounded, caches results, reports failures, and never returns credentials',async()=>{
 const calls=[];const fetcher=createMarketContext({env:{QUANT_DATA_API_KEY:'private-key'},request:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);assert.equal(options.headers.Authorization,'Bearer private-key');return {ok:false,status:422};}});
 const first=await fetcher('2026-09-04');assert.equal(first.requestCount,8);assert.equal(first.sources.length,6);assert.ok(first.sources.every(s=>s.data.available===false));assert.ok(!JSON.stringify(first).includes('private-key'));
 assert.equal((await fetcher('2026-09-04')).cached,true);assert.equal(calls.length,8);assert.ok(calls.every(([url])=>url.startsWith('https://api.quantdata.us/v1/')));
 assert.equal(calls.filter(([,body])=>body.filter.ticker==='SPY').length,2);
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
