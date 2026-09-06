import test from 'node:test';
import assert from 'node:assert/strict';
import {isChart,isDesk,captureTab} from '../browser-connector/policy.mjs';
test('connector only permits chart pages and the private desk',()=>{
 assert.equal(isChart('https://v3.quantdata.us/page/custom/abc'),true);
 assert.equal(isChart('https://app.optionsdepth.com/dashboard?tab=table'),true);
 for(const url of ['https://app.optionsdepth.com/api-units-docs','https://v3.quantdata.us/settings','https://evil.test/page/abc','https://v3.quantdata.us.evil.test/page/a','http://v3.quantdata.us/page/a'])assert.equal(isChart(url),false);
 assert.equal(isDesk('https://greeksdesk.fly.dev/'),true);assert.equal(isDesk('https://greeksdesk.fly.dev/connector'),false);
});
function mock(after,fail=false){const calls=[];let gets=0;const original={url:'https://v3.quantdata.us/page/custom/a',title:'SPX gamma',status:'complete'};return {calls,api:{tabs:{get:async()=>++gets===1?original:after||original},debugger:{attach:async()=>calls.push('attach'),sendCommand:async(t,command)=>{calls.push(command);if(fail)throw Error('failed');return command==='Runtime.evaluate'?{result:{value:{width:1000,height:800,panels:[]}}}:{data:'aGVsbG8='};},detach:async()=>calls.push('detach')}}};}
test('capture takes a selected viewport and always releases debugger',async()=>{const m=mock();const result=await captureTab(m.api,4);assert.equal(result.id,'connected-4');assert.equal(result.title,'SPX gamma');assert.deepEqual(m.calls,['attach','Runtime.evaluate','Page.captureScreenshot','Runtime.evaluate','detach']);assert.deepEqual(result.capturedPanels,[]);const failed=mock(null,true);await assert.rejects(captureTab(failed.api,4));assert.equal(failed.calls.at(-1),'detach');});
test('capture refuses images if tab navigates during capture',async()=>{const m=mock({url:'https://v3.quantdata.us/settings',status:'complete'});await assert.rejects(captureTab(m.api,4),/navigated/);assert.equal(m.calls.at(-1),'detach');});

test('Quant Data home dashboard is eligible',()=>{assert.equal(isChart('https://v3.quantdata.us/'),true);assert.equal(isChart('https://v3.quantdata.us/settings'),false);});

test('capture rejects a resize between chart measurement and screenshot',async()=>{
 const m=mock();let n=0;const send=m.api.debugger.sendCommand;
 m.api.debugger.sendCommand=async(t,c,p)=>{const r=await send(t,c,p);if(c==='Runtime.evaluate')r.result.value.width=++n===1?1000:900;return r;};
 await assert.rejects(captureTab(m.api,4),/layout moved/);assert.equal(m.calls.at(-1),'detach');
});
