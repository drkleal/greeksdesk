import test from 'node:test';import assert from 'node:assert/strict';import {calculateBasis} from '../basis.mjs';
const es={instrument:'ES',price:7725,contract:'ESU26',timestamp:'2026-09-04T19:59:00Z'},spx={latestPrice:7700,latestTimestamp:'2026-09-04T19:59:00Z'};
test('basis uses matched ES and SPX observations',()=>{assert.equal(calculateBasis(es,spx,'2026-09-04').basis,25);});
test('basis rejects stale, ambiguous and wrong-instrument screenshots',()=>{for(const change of [{timestamp:'unknown'},{timestamp:'2026-09-04T19:00:00Z'},{instrument:'NQ'},{price:null},{price:7000}])assert.throws(()=>calculateBasis({...es,...change},spx,'2026-09-04'));});

test('basis selects the nearest historical observation rather than the final price',()=>{assert.equal(calculateBasis(es,{...spx,latestPrice:7799,latestTimestamp:'2026-09-04T21:30:00Z',priceObservations:[{price:7700,timestamp:es.timestamp}]},'2026-09-04').basis,25);});
test('matching after-hours bucket timestamps cannot establish a live cash basis',()=>{
 assert.throws(()=>calculateBasis({...es,timestamp:'2026-09-04T20:59:00Z'},{...spx,latestTimestamp:'2026-09-04T20:59:00Z'},'2026-09-04'),/outside the supported SPX cash session/);
 assert.throws(()=>calculateBasis(es,{...spx,latestTimestamp:'2026-09-04T20:00:30Z'},'2026-09-04'),/No SPX price observation/);
});
