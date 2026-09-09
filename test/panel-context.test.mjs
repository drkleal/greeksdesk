import test from 'node:test';
import assert from 'node:assert/strict';
import {ivRank,volatilityGrid,oiRows,series} from '../quant-panels.mjs';
import {optionsDepthRequests,positionalRows,depthRows,createOptionsDepthContext} from '../optionsdepth-context.mjs';
import {validatePacket} from '../analysis.mjs';
import {sourceStatus} from '../public/source-status.mjs';
const date='2026-09-04',selection={slot:date+'T17:00:00',min:7570,max:7870};

test('live IV percent fields and 25-delta skew are not multiplied by 100',()=>{
 const iv={lastIv:10,windowMinIv:5,windowMaxIv:25};
 const result=ivRank({data:{[date]:{contractTypeToIVData:{CALL:iv,PUT:iv}}}},date);
 assert.equal(result.legs.CALL.lastIv,10);assert.equal(result.legs.CALL.rankPercent,25);
 assert.equal(ivRank({data:{'2026-09-08':{contractTypeToIVData:{CALL:iv}}}},date).available,false);
 const surface=volatilityGrid({stockPrice:7720,data:{[date]:{7700:{PUT:{delta:-.25,iv:12}},7740:{CALL:{delta:.25,iv:10}}}}},date,true);
 assert.equal(surface.expirations[0].delta25.putMinusCallVolPoints,2);
 assert.equal(volatilityGrid({stockPrice:7720,data:{[date]:{7700:{PUT:{delta:-.4,iv:12}},7740:{CALL:{delta:.25,iv:10}}}}},date,true).expirations[0].delta25,null);
});
test('flow converts provider cents once; missing fields remain unknown',()=>{
 const result=series({data:{1000:{callSum:12345,putSum:10},2000:{callSum:5000,putSum:null}}},['callSum','putSum'],{cents:true,totals:true});
 assert.equal(result.totals.callSum,173.45);assert.equal(result.totals.putSum,null);assert.equal(result.latest.putSum,null);
});
test('OI keeps near-market strikes even when distant strikes dominate the ranking',()=>{
 const data=Object.fromEntries(Array.from({length:100},(_,i)=>[1000+i*5,{callOpenInterest:1e6,putOpenInterest:2e6}]));data[7720]={callOpenInterest:10,putOpenInterest:null};
 const r=oiRows({data},'strike',date,7718);assert.ok(r.rows.some(r=>r.strike===7720));assert.equal(r.rows.find(r=>r.strike===7720).putOpenInterest,null);assert.ok(r.rows.length<=93);
 assert.deepEqual(oiRows({data:{'2026-09-03':{callOpenInterest:3},'2026-09-08':{callOpenInterest:9}}},'sessionDate',date).rows.map(r=>r.sessionDate),['2026-09-03']);
});
test('OptionsDepth requests use supported participant metrics and bounded Depth View expirations',()=>{
 const tasks=optionsDepthRequests(date,selection);assert.equal(tasks.length,20);assert.equal(new Set(tasks.map(t=>t.id)).size,20);
 for(const t of tasks){if(t.query.customer_type==='all_cust')assert.ok(['DEX','NET_POSITION'].includes(t.query.metric));if(t.path.startsWith('breakdown'))assert.equal(t.query.with_markers,'true');if(t.path==='depthview/'){assert.equal(t.query.expiration_type,'range');assert.equal(t.query.expiration_range_start,date);assert.equal(t.query.expiration_range_end,'2026-12-03');}}
});
test('actual snake-case model rows select one dated slot and preserve null comparison values',()=>{
 const rows=[{strike_price:7720,effective_datetime:date+'T16:00:00',latest_value:10},{strike_price:7720,effective_datetime:date+'T17:00:00',latest_value:20,prior_update:19},{strike_price:7720,effective_datetime:'2026-09-08T17:00:00',latest_value:999}];
 const r=positionalRows(rows,date,selection);assert.equal(r.rows.length,1);assert.equal(r.rows[0].value,20);assert.equal(r.rows[0].open,null);assert.equal(r.actualSlot,selection.slot);assert.equal(r.timezone,null);
 assert.equal(positionalRows(rows.slice(-1),date,selection).available,false);
 const expiry=positionalRows([{expiration_date:'2026-09-08T16:00:00',effective_datetime:selection.slot,latest_value:30}],date,selection,true);assert.equal(expiry.rows[0].expirationDate,'2026-09-08T16:00:00');
});
test('Depth View sums all returned cells before retaining its display excerpt',()=>{
 const r=depthRows(Array.from({length:90},(_,i)=>({strike_price:7720,expiration_date:'2026-09-'+String(10+i%10),net_value:1})));
 assert.equal(r.rows.length,80);assert.equal(r.byStrike[0].net,90);assert.equal(r.rowCount,90);assert.equal(r.partial,true);assert.equal(depthRows([]).available,false);
});
test('OD failures are cached without leaking the credential or retrying',async()=>{
 let count=0;const collect=createOptionsDepthContext({env:{OPTIONSDEPTH_API_KEY:'private-key'},request:async()=>{count++;return {ok:false,status:403};}});
 const result=await collect(date,selection);assert.equal(count,20);assert.equal(result.sources.length,21);assert.ok(!JSON.stringify(result).includes('private-key'));assert.ok(result.sources.every(s=>s.data.available===false));
 const cached=await collect(date,selection);assert.equal(cached.requestCount,0);assert.equal(count,20);assert.equal(cached.cached,true);
});
test('expanded evidence packet retains all supplied panel sources',()=>{
 const sources=Array.from({length:50},(_,i)=>({id:'source-'+i,title:'Source '+i,sessionDate:date,data:{available:true}}));
 assert.equal(validatePacket({date,instrument:'ES',basis:null,sources}).sources.length,50);
});

test('empty after-close OD positions use one verified earlier snapshot, preserving heatmap time and provenance',async()=>{
 const calls=[];
 const collect=createOptionsDepthContext({env:{OPTIONSDEPTH_API_KEY:'private-key'},request:async url=>{
  const u=new URL(url),slot=u.searchParams.get('date_time').replace(' ','T');calls.push({path:u.pathname,slot});
  let rows=[];
  if(slot===date+'T15:59:00')rows=[{effective_datetime:slot,strike_price:7720,expiration_date:date,latest_value:23,net_value:23}];
  return {ok:true,json:async()=>rows};
 }});
 const result=await collect(date,selection),gex=result.sources[0],heatmap=result.sources.find(s=>s.id==='gamma');
 assert.equal(result.requestCount,21);assert.equal(gex.data.available,true);assert.equal(gex.data.actualSlot,date+'T15:59:00');
 assert.equal(gex.data.requestedSlot,selection.slot);assert.equal(gex.data.requestScope.date_time,date+' 15:59:00');
 assert.equal(gex.data.snapshotFallback.usedSlot,date+'T15:59:00');
 assert.equal(heatmap.data.requestScope.date_time,date+' 17:00:00');assert.equal(heatmap.data.snapshotFallback,undefined);
 assert.equal(calls.filter(c=>c.slot===selection.slot).length,4);
 assert.equal(sourceStatus(gex,date).label,'Earlier model snapshot');
 assert.equal((await collect(date,selection)).requestCount,0);
});

test('OD fallback does not turn empty cash-session data into an earlier-date reading',async()=>{
 let calls=0;const collect=createOptionsDepthContext({env:{OPTIONSDEPTH_API_KEY:'key'},request:async()=>{calls++;return {ok:true,json:async()=>[]};}});
 const result=await collect(date,{...selection,slot:date+'T12:00:00'});
 assert.equal(calls,20);assert.ok(result.sources.every(s=>!s.data.snapshotFallback));
});
