import test from 'node:test';
import assert from 'node:assert/strict';
import {exposureSnapshot} from '../market-context.mjs';
import {cashBasisReference} from '../basis.mjs';
import {conversionFor,exposureColumns,levelConfluence,confluenceSummary,confluenceLabel,sanitizeConfluence,familyInventory} from '../public/confluence.mjs';
const date='2026-09-04';
test('ordered exposure ladder keeps 0DTE separate from the all-expiry total',()=>{
 const x=exposureSnapshot({data:{SPX:{stockPrice:7718,exposureMap:{[date]:{'7715':{callExposure:20,putExposure:-5},'7720':{callExposure:30,putExposure:null}},'2026-09-08':{'7715':{callExposure:200,putExposure:-50},'7725':{callExposure:50}}}}}},date);
 assert.deepEqual(x.ladder.map(r=>r.strike),[7715,7720,7725]);assert.equal(x.ladder[0].net,165);assert.equal(x.ladder[0].zeroDte.net,15);assert.equal(x.ladder[1].net,null);assert.equal(x.ladder[1].call,null);assert.equal(x.ladder[2].zeroDte,null);
 assert.equal(x.zeroDteAvailable,true);assert.equal(x.representationMode,'RAW');
 const noSlice=exposureSnapshot({data:{SPX:{stockPrice:7718,exposureMap:{'2026-09-08':{'7715':{callExposure:20}}}}}},date);assert.equal(noSlice.zeroDteAvailable,false);assert.equal(noSlice.ladder[0].zeroDte,null);
});
test('cash anchor uses paired cash observations, never the later futures closing print',()=>{
 const es={ok:true,ticker:'ES',contract:'ESU6',priceObservations:[{price:7723,timestamp:date+'T19:59:00Z'},{price:7715,timestamp:date+'T21:00:00Z'}]},spx={priceObservations:[{price:7718,timestamp:date+'T19:59:00Z'},{price:7718,timestamp:date+'T21:00:00Z'}]};
 const r=cashBasisReference(es,spx,date);assert.equal(r.basis,5);assert.equal(r.esPrice,7723);assert.equal(r.kind,'cash_anchor');
 assert.equal(cashBasisReference({...es,contract:'NQU6'},spx,date),null);assert.equal(cashBasisReference({...es,priceObservations:[es.priceObservations[1]]},spx,date),null);
 assert.equal(cashBasisReference(es,{priceObservations:[{price:7718,timestamp:date+'T19:55:00Z'}]},date),null);
});
const level={id:'reclaim',price:7720,role:'structure',sourceIds:['databento'],panelIds:[],identity:{derivation:'Repeated ES rejection'},evidence:'Price rejected twice',watch:'Acceptance',invalidation:'Failed reclaim'};
function fixture(){return {date,instrument:'ES',basis:null,sources:[{id:'databento',title:'Databento ES',sessionDate:date,data:{ticker:'ES',contract:'ESU6',available:true}},{id:'qd-gamma',title:'Quant Data GAMMA',sessionDate:date,data:{ticker:'SPX',available:true,strongest:[{strike:7715,net:500,call:600,put:-100}]}},{id:'chart',title:'OD',sessionDate:date,image:'image'}],result:{analysis:{levels:[level],checkpoints:[],scenarios:[],sources:[],panels:[{id:'forward',sourceId:'chart',title:'Gamma',observedDate:'2026-09-08',dateRole:'projected_session',instrument:'SPX',status:'context'}]}}};}
test('no implicit +5 basis; frozen anchors remain approximate and cannot count as support',()=>{
 const read=fixture();assert.equal(conversionFor(read).kind,'unmapped');assert.equal(levelConfluence(read,level).length,1);
 read.sources[0].data.basisReference={ok:true,kind:'cash_anchor',sessionDate:date,contract:'ESU6',basis:5,esTime:date+'T19:59:00Z',spxTime:date+'T19:59:00Z'};
 assert.equal(conversionFor(read).kind,'anchor');const items=levelConfluence(read,level);assert.equal(items.length,2);assert.equal(items[1].effect,'context');assert.equal(items[1].coordinateOnly,true);assert.deepEqual(confluenceSummary(items).support,['price']);assert.equal(read.basis,null);
 read.sources[0].data.basisReference.contract='ESZ6';assert.equal(conversionFor(read).kind,'unmapped');
});
test('confluence retains the actual forward observation but removes a false support claim',()=>{
 const read=fixture(),a=read.result.analysis;a.confluence=[{levelId:'reclaim',sourceId:'chart',panelId:'forward',family:'gamma',effect:'supports',observation:'Sep 8 model is negative at SPX 7715',mechanism:'Potential expansion if that exposure persists',watch:'Recheck at open'}];
 sanitizeConfluence(a,read);assert.equal(a.confluence[0].effect,'context');assert.match(a.confluence[0].observation,/negative/);assert.match(a.confluence[0].scopeNote,/Forward model/);
 assert.throws(()=>sanitizeConfluence({...a,confluence:[{...a.confluence[0],levelId:'invented'}]},read));assert.throws(()=>sanitizeConfluence({...a,confluence:[a.confluence[0],a.confluence[0]]},read));
});
test('repeat provider views never increase the supporting family count and unknown 0DTE stays blank',()=>{
 const read=fixture();assert.equal(exposureColumns(read).find(c=>c.id==='qd-gamma-0dte').rows.length,0);
 assert.deepEqual(confluenceSummary([{family:'gamma',effect:'supports'},{family:'gamma',effect:'supports'},{family:'flow',effect:'opposes'}]),{support:['gamma'],oppose:['flow'],context:[]});
 const f=familyInventory(read);assert.equal(f.find(x=>x.id==='gamma').items.length,2);assert.equal(f.find(x=>x.id==='volatility').items.length,0);
});

test('gold stars require three or four distinct supporting families',()=>{
 const rows=['gamma','delta','acceptance','flow','positioning'].map(family=>({family,effect:'supports'}));
 assert.equal(confluenceLabel([]).text,'');assert.equal(confluenceLabel(rows.slice(0,2)).stars,'');
 assert.equal(confluenceLabel(rows.slice(0,3)).stars,'★');assert.equal(confluenceLabel(rows.slice(0,4)).stars,'★★');assert.equal(confluenceLabel(rows).stars,'★★');
 assert.equal(confluenceLabel([...rows.slice(0,2),rows[0],rows[1]]).count,2);
});
test('coordinate overlap, missing evidence and conflicting views cannot earn a star',()=>{
 const rows=[{family:'gamma',effect:'supports'},{family:'gamma',effect:'opposes'},{family:'delta',effect:'supports'},{family:'vanna',effect:'context'},{family:'charm',effect:'supports',coordinateOnly:true},{family:'flow',effect:'unavailable'}];
 assert.deepEqual(confluenceLabel(rows).families,['delta']);assert.equal(confluenceLabel(rows).text,'DEX');assert.equal(confluenceLabel(rows).stars,'');
});
test('visible labels preserve named profile contributions without multiplying one family',()=>{
 const label=confluenceLabel([{family:'gamma',effect:'supports'},{family:'acceptance',effect:'supports',observation:'RTH VWAP and HVN meet at the boundary'},{family:'acceptance',effect:'supports',observation:'POC in the same source profile'}]);
 assert.equal(label.text,'GEX · VWAP / POC / HVN');assert.equal(label.count,2);assert.equal(label.stars,'');
});
