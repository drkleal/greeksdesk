import test from 'node:test';
import assert from 'node:assert/strict';
import {selectESSource} from '../public/plan.mjs';
const source=(id,timestamp,extra={})=>({id,data:{available:true,ticker:'ES',contract:'ESU6',latestPrice:7687,latestTimestamp:timestamp,...extra}});
test('newest verified ES source wins without discarding the history source',()=>{
 const older=source('massive-es','2026-09-09T05:00:00Z'),newer=source('databento','2026-09-09T05:00:15Z',{recentBars:[{close:7687}]});
 const sources=[older,newer];assert.equal(selectESSource(sources),newer);assert.equal(sources.length,2);
 assert.equal(selectESSource([source('databento','2026-09-09T05:00:20Z',{available:false}),older]),older);
 assert.equal(selectESSource([source('massive-es','invalid'),newer]),newer);
 assert.equal(selectESSource([source('massive-es','2026-09-09T05:00:30Z',{contract:'NQU6'}),newer]),newer);
});
