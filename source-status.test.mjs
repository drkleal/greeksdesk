import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceStatus} from './public/source-status.mjs';
const now=Date.parse('2026-09-07T14:01:30Z');
test('a holiday options trade may be fresh while its stock reference is not live',()=>{
 const r=sourceStatus({id:'qd-order-flow',title:'SPX trades',data:{rows:[{tradeTime:now-3000}]}},'2026-09-07',now);
 assert.equal(r.state,'fresh');assert.match(r.detail,/not a live ES quote/);
});
test('refreshing a request cannot make old data fresh',()=>{
 const r=sourceStatus({id:'quantdata',capturedAt:new Date(now).toISOString(),data:{latestTimestamp:'2026-09-04T20:00:00Z'}},'2026-09-07',now);
 assert.equal(r.state,'context');
});
test('fresh ES status ages out and models never claim freshness from coordinates',()=>{
 assert.equal(sourceStatus({id:'databento',data:{freshness:'fresh',latestTimestamp:new Date(now-21000).toISOString(),latestPrice:7714}},'2026-09-07',now).label,'ES price is not live');
 assert.equal(sourceStatus({id:'od-gex-mm-strike',data:{actualSlot:'2026-09-07T10:01:00',checkedAt:new Date(now).toISOString()}},'2026-09-07',now).label,'Model slot \u00b7 0 min old');
});
test('empty and failed providers remain visible as unavailable',()=>{
 assert.equal(sourceStatus({id:'qd-oi-expiration',data:{rowCount:0}},'2026-09-07',now).state,'unavailable');
 assert.equal(sourceStatus({id:'timestamps',data:{available:false,message:'No model timestamps'}},'2026-09-07',now).detail,'No model timestamps');
});
