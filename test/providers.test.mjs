import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderChecks} from '../providers.mjs';
test('Gamma request stays scoped, strips extra fields, caches duplicates and rejects invalid ranges',async()=>{
 let requests=0;const check=createProviderChecks({env:{OPTIONSDEPTH_API_KEY:'private'},request:async(url)=>{
  requests++;const query=new URL(url).searchParams;assert.equal(query.get('ticker'),'SPX');assert.equal(query.get('type'),'gamma');assert.equal(query.get('date_time'),'2026-09-04 16:00:00');
  return {ok:true,json:async()=>[{price:7720,value:-3,effectiveDatetime:'2026-09-04T16:00:00',privateField:'do not return'}]};
 }});
 const selection={slot:'2026-09-04T16:00:00',min:7650,max:7800};const result=await check('optionsdepth-gamma','2026-09-04',selection);
 assert.equal(result.ok,true);assert.equal(result.rows[0].value,-3);assert.ok(!JSON.stringify(result).includes('privateField'));
 assert.equal((await check('optionsdepth-gamma','2026-09-04',selection)).cached,true);assert.equal(requests,1);
 await assert.rejects(check('optionsdepth-gamma','2026-09-04',{...selection,max:9000}));assert.equal(requests,1);
});
test('drift recalculates sorted bucket totals and caches without extra requests',async()=>{
 let count=0;const check=createProviderChecks({env:{QUANT_DATA_API_KEY:'private-key'},request:async(url,options)=>{count++;assert.equal(JSON.parse(options.body).filter.ticker,'SPX');return {ok:true,json:async()=>({data:{'2000':{netCallPremium:4,netPutPremium:-2},'1000':{netCallPremium:3,netPutPremium:1}}})};}});
 const value=await check('quantdata','2026-09-04');assert.equal(value.callPremium,7);assert.equal(value.putPremium,-1);assert.equal((await check('quantdata','2026-09-04')).cached,true);assert.equal(count,1);
});
test('errors never return credential-bearing upstream messages and do not retry',async()=>{
 let count=0;const check=createProviderChecks({env:{OPTIONSDEPTH_API_KEY:'secret'},request:async()=>{count++;throw Error('url?key=secret');}});
 const result=await check('optionsdepth','2026-09-04');assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('secret'));assert.equal(count,1);
});
test('timestamp check only calls non-unit timestamp endpoint',async()=>{
 const check=createProviderChecks({env:{OPTIONSDEPTH_API_KEY:'secret'},request:async(url)=>{assert.match(url,/intraday-timeslots/);return {ok:true,json:async()=>({timeslots:['2026-09-04T10:00:00']})};}});assert.equal((await check('optionsdepth','2026-09-04')).count,1);
});
test('empty timestamp list succeeds; malformed response is identified separately from timeout',async()=>{
 for(const [body,ok] of [[{timeslots:[]},true],[{timeslots:['bad-date']},false],[{},false]]){
  const check=createProviderChecks({env:{OPTIONSDEPTH_API_KEY:'secret'},request:async()=>({ok:true,json:async()=>body})});
  const result=await check('optionsdepth','2026-09-04');assert.equal(result.ok,ok);if(!ok)assert.match(result.message,/data format/);
 }
 const check=createProviderChecks({env:{OPTIONSDEPTH_API_KEY:'secret'},request:async()=>{throw new DOMException('private upstream text','TimeoutError');}});
 assert.match((await check('optionsdepth','2026-09-04')).message,/timed out/);
});
test('timestamp request includes documented parameters and exposes status without upstream content',async()=>{
 const check=createProviderChecks({env:{OPTIONSDEPTH_API_KEY:'secret'},request:async(url,options)=>{
  const parsed=new URL(url);assert.equal(parsed.searchParams.get('model'),'intraday');assert.equal(parsed.searchParams.get('date'),'2026-09-04');assert.equal(options.headers.Accept,'application/json');
  return {ok:false,status:422,json:async()=>{throw Error('Must not read private error body');}};
 }});
 const result=await check('optionsdepth','2026-09-04');assert.match(result.message,/HTTP 422/);assert.equal(result.ok,false);
});


test('Gamma separates returned time slices and never sums different model times',async()=>{
 const {normalizeGamma}=await import('../providers.mjs');const selection={slot:'2026-09-04T17:00:00',min:7700,max:7800};
 const r=normalizeGamma([{price:7720,value:100,sim_datetime:'2026-09-04T08:30:00'},{price:7720,value:-3,sim_datetime:'2026-09-04T16:00:00'},{price:7725,value:4,sim_datetime:'2026-09-04T16:00:00'},{price:7725,value:999,sim_datetime:'2026-09-05T16:00:00'}],'2026-09-04',selection);
 assert.equal(r.rows.length,2);assert.equal(r.rows[0].value,-3);assert.equal(r.actualSlot,'2026-09-04T16:00:00');assert.equal(r.receivedCount,4);
 assert.equal(normalizeGamma([{price:7720,value:5,sim_datetime:'2026-09-04T18:00:00'}],'2026-09-04',selection).rows.length,0);
});
