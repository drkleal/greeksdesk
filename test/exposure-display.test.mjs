import test from 'node:test';
import assert from 'node:assert/strict';
import {barValues,seriesScale,gammaConcentrations} from '../public/exposure-display.mjs';
import {vixDailyRange} from '../public/straddle.mjs';

test('selected-expiry scale uses its own actual leg values and leaves exposures unchanged',()=>{
 const all={id:'qd-gamma',family:'gamma',rows:[{price:7720,call:32e9,put:-3e9,net:29e9}]};
 const expiry={id:'qd-gamma-0dte',family:'gamma',rows:[{price:7750,call:2344511942,put:-783279556,net:1561232386}]};
 assert.equal(seriesScale(all,all.rows),32e9);assert.equal(seriesScale(expiry,expiry.rows),2344511942);assert.equal(expiry.rows[0].net,1561232386);
 assert.deepEqual(barValues({id:'qd-delta',family:'delta'},{call:500,put:-400,net:100}),[100]);
 assert.deepEqual(barValues({id:'qd-oi-strike',family:'positioning'},{call:500,put:400,net:900}),[-400,500]);
});
test('gamma reference ranking preserves exact values, conversion and visible bounded scope',()=>{
 const c={source:{id:'qd-gamma'},rows:[{price:7700,call:1300,put:-300,net:1000},{price:7750,call:2300,put:-800,net:1500},{price:7800,call:1e6,put:-1e6,net:0}]};
 const r=gammaConcentrations(c,7700,7780,5.94);assert.deepEqual(r.map(x=>x.price),[7750,7700]);assert.equal(r[0].gross,3100);assert.equal(r[0].net,1500);assert.deepEqual(gammaConcentrations(c,7700,7780,null),[]);
});
test('VIX daily benchmark uses percent points and the matched anchor, not straddle plus VIX',()=>{
 const o={ready:true,spot:7743.45,vix:14.1,premium:25.2,timestamp:'2026-09-04T13:36:00Z'},m={ready:true,anchor:7749.5};
 const v=vixDailyRange(o,m),expected=7743.45*.141/Math.sqrt(252);
 assert.ok(Math.abs(v.points-expected)<1e-8);assert.equal(v.upper,7749.5+expected);assert.equal(v.lower,7749.5-expected);
 assert.equal(vixDailyRange({...o,vix:null},m).ready,false);assert.equal(vixDailyRange(o,{ready:false}).ready,false);
});
