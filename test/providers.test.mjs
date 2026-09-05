import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderChecks} from '../providers.mjs';
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
