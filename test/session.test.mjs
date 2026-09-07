import test from 'node:test';
import assert from 'node:assert/strict';
import {nyTime,initialSession,isCashObservation,validDate} from '../public/session.mjs';
test('session defaults to the last cash trading day on weekends and holidays',()=>{
 assert.equal(initialSession(null,new Date('2026-09-05T22:00:00Z')),'2026-09-04');
 assert.equal(initialSession(null,new Date('2026-09-07T14:00:00Z')),'2026-09-04');
 assert.equal(initialSession(null,new Date('2026-09-08T14:00:00Z')),'2026-09-08');
});
test('ES defaults to the observed holiday window while cash and saved choices remain separate',()=>{
 assert.equal(initialSession(null,new Date('2026-09-07T14:00:00Z'),'ES'),'2026-09-07');
 assert.equal(initialSession(null,new Date('2026-09-06T22:01:00Z'),'ES'),'2026-09-07');
 assert.equal(initialSession(null,new Date('2026-09-05T14:00:00Z'),'ES'),'2026-09-04');
 assert.equal(initialSession({date:'2026-09-04',savedOn:'2026-09-07'},new Date('2026-09-07T14:00:00Z'),'ES'),'2026-09-04');
});
test('same-day session choice survives reload; old choices do not carry into a new trading day',()=>{
 const saved={date:'2026-09-03',savedOn:'2026-09-05'};
 assert.equal(initialSession(saved,new Date('2026-09-06T01:00:00Z')),'2026-09-03');
 assert.equal(initialSession(saved,new Date('2026-09-08T14:00:00Z')),'2026-09-08');
 assert.equal(initialSession({date:'',savedOn:'2026-09-05'},new Date('2026-09-05T22:00:00Z')),'2026-09-04');
 assert.equal(validDate('2026-02-30'),false);
});
test('cash-time matching respects New York daylight saving and early closes',()=>{
 assert.equal(nyTime('2026-09-05T01:00:00Z').date,'2026-09-04');
 assert.equal(isCashObservation('2026-09-04T19:59:00Z','2026-09-04'),true);
 assert.equal(isCashObservation('2026-09-04T20:59:00Z','2026-09-04'),false);
 assert.equal(isCashObservation('2026-11-27T18:01:00Z','2026-11-27'),false);
 assert.equal(isCashObservation('2026-11-27T18:00:00Z','2026-11-27'),true);
 assert.equal(isCashObservation('2026-09-07T15:00:00Z','2026-09-07'),false);
});
