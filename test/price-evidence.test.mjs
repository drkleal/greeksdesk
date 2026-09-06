import test from 'node:test';
import assert from 'node:assert/strict';
import {priceEvidence} from '../public/price-evidence.mjs';
const bar={timestamp:'2026-09-03T14:00:00Z',end:'2026-09-03T15:00:00Z',open:7700,high:7720,low:7690,close:7710};
const sources=()=>[{id:'databento',sessionDate:'2026-09-04',data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',priorContext:{available:true,contract:'ESU6',sessions:[{sessionDate:'2026-09-03',bars:[bar]}]}}}];
const level=()=>({price:7720,apiOrigin:{sourceId:'databento',sessionDate:'2026-09-03',timeframe:'1h',timestamp:bar.timestamp,field:'high'}});
test('source price viewer selects the exact cited prior bar without changing its prices',()=>{
 const e=priceEvidence(level(),sources());assert.equal(e.selected,0);assert.equal(e.date,'2026-09-03');assert.equal(e.rows[0].high,7720);assert.equal(e.contract,'ESU6');
 for(const change of [{price:7721},{apiOrigin:{...level().apiOrigin,sessionDate:'2026-09-02'}},{apiOrigin:{...level().apiOrigin,field:'low'}}])assert.equal(priceEvidence({...level(),...change},sources()),null);
 const wrong=sources();wrong[0].data.priorContext.contract='ESZ6';assert.equal(priceEvidence(level(),wrong),null);
});
test('summary extrema show their full source interval rather than falsely selecting the opening bar',()=>{
 const s=sources();s[0].sessionDate='2026-09-03';s[0].data.session={from:bar.timestamp,through:bar.end,high:7720};s[0].data.bars5m=[{...bar,end:'2026-09-03T14:05:00Z'}];
 const e=priceEvidence({...level(),apiOrigin:{...level().apiOrigin,timeframe:'session'}},s);assert.equal(e.selected,null);assert.equal(e.frame,'5m');assert.equal(e.scope.high,7720);
});
test('trade profile and VWAP viewer keeps exact origins and uses bars only for price context',()=>{
 const s=sources();s[0].sessionDate='2026-09-03';const d=s[0].data;
 d.bars5m=[{...bar,end:'2026-09-03T14:05:00Z'}];
 d.volumeProfile={available:true,contract:'ESU6',schema:'trades',completeWindow:true,from:bar.timestamp,through:bar.end,nodes:[{kind:'POC',price:7705.25,volume:90,reason:'Highest-volume bucket.'}]};
 d.sessionProfiles={RTH:{from:bar.timestamp,through:bar.end,vwap:7706.123,volume:200,vwapMethod:'Actual trade-weighted VWAP'}};
 const make=(field,timeframe,price)=>({price,apiOrigin:{sourceId:'databento',sessionDate:'2026-09-03',timeframe,timestamp:bar.end,field}});
 for(const l of [make('poc','volume_profile',7705.25),make('vwap','rth_profile',7706.123)]){
  const e=priceEvidence(l,s);assert.equal(e.selected,null);assert.ok(e.profileReference);assert.equal(e.rows[0].high,7720);
  assert.equal(priceEvidence({...l,price:l.price+.01},s),null);
  assert.equal(priceEvidence({...l,apiOrigin:{...l.apiOrigin,timestamp:bar.timestamp}},s),null);
 }
 d.volumeProfile.contract='ESZ6';assert.equal(priceEvidence(make('poc','volume_profile',7705.25),s),null);
});
