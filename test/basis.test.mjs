import test from 'node:test';import assert from 'node:assert/strict';import {calculateBasis} from '../basis.mjs';
const es={instrument:'ES',price:7725,contract:'ESU26',timestamp:'2026-09-04T20:59:00Z'},spx={latestPrice:7700,latestTimestamp:'2026-09-04T20:59:00Z'};
test('basis uses matched ES and SPX observations',()=>{assert.equal(calculateBasis(es,spx,'2026-09-04').basis,25);});
test('basis rejects stale, ambiguous and wrong-instrument screenshots',()=>{for(const change of [{timestamp:'unknown'},{timestamp:'2026-09-04T19:00:00Z'},{instrument:'NQ'},{price:null},{price:7000}])assert.throws(()=>calculateBasis({...es,...change},spx,'2026-09-04'));});
