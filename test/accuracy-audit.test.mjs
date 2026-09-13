import test from 'node:test';
import assert from 'node:assert/strict';
import {tape} from '../quant-panels.mjs';
import {normalizeGamma} from '../providers.mjs';
import {createMarketContext} from '../market-context.mjs';
import {summarizeES} from '../databento.mjs';
import {sourceStatus} from '../public/source-status.mjs';
import {evidenceConstraint} from '../public/evidence-policy.mjs';
import {levelConfluence,confluenceLabel} from '../public/confluence.mjs';

const date='2026-09-04',now=Date.parse('2026-09-06T12:00:00Z');
const bar=(timestamp='2026-09-04T19:59:00Z')=>({timestamp,end:new Date(Date.parse(timestamp)+60000).toISOString(),open:7700,high:7701,low:7699,close:7700,volume:50,instrumentId:123});
const raw=bars=>({ok:true,contract:'ESU6',dataset:'GLBX.MDP3',sessionDate:date,bars});

test('option tape retains execution conditions and treats missing flags as unknown',()=>{
 const r=tape({data:[{ticker:'SPX',osi:'SPX260904C07700000',tradeType:'MULTI_LEG_AUTO',isComplex:true,isTied:false,isCancelled:false,bidPrice:4,askPrice:5},{ticker:'SPX'}]},'options');
 assert.equal(r.rows[0].tradeType,'MULTI_LEG_AUTO');assert.equal(r.rows[0].isComplex,true);
 assert.equal(r.rows[0].isTied,false);assert.equal(r.rows[0].isCancelled,false);assert.equal(r.rows[0].bidPrice,4);assert.equal(r.rows[0].askPrice,5);
 assert.equal(r.rows[1].isCancelled,null);assert.equal(r.rows[1].isComplex,null);
});
test('cancelled or corrected records are separated without silently losing their evidence',()=>{
 const r=tape({data:[{isCancelled:true,premium:100},{tradeType:'CANCEL_LAST',premium:200},{isCancelled:false,premium:300}],nextSearchAfter:['cursor']},'options');
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].premium,300);
 assert.equal(r.excludedRows.length,2);assert.equal(r.returnedRowCount,3);assert.equal(r.rowCount,1);assert.equal(r.partial,true);
});
test('an empty OD heatmap cannot masquerade as available model context',()=>{
 const r=normalizeGamma([],date,{slot:date+'T16:00:00',min:7600,max:7800});
 assert.equal(r.available,false);assert.equal(sourceStatus({id:'gamma',sessionDate:date,data:{available:true,rows:[],actualSlot:null}},date,now).state,'unavailable');
});
test('empty legacy evidence cannot support a scenario',()=>{
 const s={id:'od-gex-mm-strike',sessionDate:date,data:{available:true,ticker:'SPX',rows:[],rowCount:0}};
 assert.equal(evidenceConstraint(s,null,{date,instrument:'SPX'}).effect,'unavailable');
});
test('successful empty QD responses remain unavailable at the collection boundary',async()=>{
 const collect=createMarketContext({env:{QUANT_DATA_API_KEY:'test'},request:async()=>({ok:true,json:async()=>({data:{SPX:{exposureMap:{}}}})})});
 const r=await collect(date);assert.equal(r.sources.find(s=>s.id==='qd-gamma').data.available,false);
});
test('ES bars outside the selected futures session are rejected',()=>{
 for(const t of ['2026-09-03T21:59:00Z','2026-09-04T21:00:00Z'])assert.throws(()=>summarizeES(raw([bar(t)]),now),/session/i);
});
test('ES bars must occupy distinct aligned minute slots, regardless of timestamp spelling',()=>{
 assert.throws(()=>summarizeES(raw([bar(),bar('2026-09-04T19:59:00.000Z')]),now),/Invalid/);
 assert.throws(()=>summarizeES(raw([bar('2026-09-04T19:59:01Z')]),now),/Invalid/);
});
test('an unfinished minute cannot enter completed-bar structure',()=>{
 assert.throws(()=>summarizeES(raw([bar()]),Date.parse('2026-09-04T19:59:58Z')),/completed|Future/i);
});
test('ES quotes from another session cannot be relabeled with the requested date',()=>{
 assert.throws(()=>summarizeES({...raw([bar()]),quote:{price:7710,instrumentId:123,timestamp:'2026-09-05T14:00:00Z'}},now),/session/i);
});
test('empty ES responses do not assert an available price',()=>{
 const r=summarizeES(raw([]),now);assert.equal(r.available,false);assert.equal(r.ok,false);assert.equal(r.count,0);
});
test('valid boundary minutes preserve exact session volume and aggregate coverage',()=>{
 const r=summarizeES(raw([bar('2026-09-03T22:00:00Z'),bar('2026-09-04T20:59:00Z')]),now);
 assert.equal(r.session.volume,100);assert.equal(r.latestPrice,7700);assert.equal(r.bars5m[0].complete,false);
});
test('OD API exposure cannot establish directional support from model values alone',()=>{
 const s={id:'od-gex-mm-strike',sessionDate:date,data:{available:true,ticker:'SPX',family:'gamma',rows:[{strike:7700,value:10}]}};
 assert.equal(evidenceConstraint(s,null,{date,instrument:'SPX'}).effect,'context');
});
test('mislabeling a single API feed cannot turn it into several supporting families in a saved read',()=>{
 const level={id:'l1',price:7700,sourceIds:[]};
 const read={date,instrument:'SPX',sources:[{id:'qd-order-flow-unconsolidated',title:'Options flow',sessionDate:date,data:{available:true,ticker:'SPX',family:'flow',rows:[{premium:1}]}}],result:{analysis:{levels:[level],panels:[],confluence:['flow','volatility','price'].map(family=>({levelId:'l1',sourceId:'qd-order-flow-unconsolidated',panelId:null,family,effect:'supports'}))}}};
 assert.equal(confluenceLabel(levelConfluence(read,level)).count,1);
});
