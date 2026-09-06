import test from 'node:test';
import assert from 'node:assert/strict';
import {enforceEvidenceScope,evidenceMetadata,chartDateCaption} from '../public/evidence-policy.mjs';
import {validateAnalysis} from '../analysis.mjs';

function fixture(){
 const sources=[{id:'databento',data:{ticker:'ES',available:true}},{id:'quantdata',data:{ticker:'SPX',available:true}},{id:'qd-gamma',data:{ticker:'SPX',available:true}},{id:'darkpool',data:{ticker:'SPY',available:true}}].map(s=>({...s,title:s.id,sessionDate:'2026-09-04'}));
 const packet={date:'2026-09-04',instrument:'ES',basis:null,sources};
 const analysis={headline:'Historical read',summary:'Observed ES',gaps:[],changes:[],levels:[],panels:[],sources:sources.map(s=>({id:s.id,shows:'Reported values',importance:'Source evidence',lookFor:'Price response',priceEffect:'The sign proves buying at ES support.'})),scenarios:['up','down','neutral'].map(direction=>({direction,status:'insufficient',triggerId:null,targetId:null,condition:'Wait',confirmation:'Retest',invalidation:'Unconfirmed',drivers:sources.map(s=>({sourceId:s.id,panelId:null,effect:'supports',reason:'Nearby support confirms this path.'}))}))};
 return {packet,analysis};
}

test('server and saved-read display both remove cross-instrument confirmation and its misleading explanation',()=>{
 for(const apply of [validateAnalysis,enforceEvidenceScope]){
  const {packet,analysis}=fixture(),result=apply(analysis,packet);
  for(const scenario of result.scenarios){
   assert.equal(scenario.drivers[0].effect,'supports'); // Retain native ES evidence.
   for(const d of scenario.drivers.slice(1)){assert.equal(d.effect,'context');assert.doesNotMatch(d.reason,/Nearby support confirms/);}
   assert.match(scenario.drivers[1].reason,/no matched ES–SPX basis/);
  }
  assert.doesNotMatch(result.sources[2].priceEffect,/proves buying/);
 }
});

test('a basis permits SPX price evidence but never turns raw Greek signs or SPY prints into confirmation',()=>{
 const {packet,analysis}=fixture();packet.basis=2.25;
 const drivers=enforceEvidenceScope(analysis,packet).scenarios[0].drivers;
 assert.equal(drivers[1].effect,'supports');
 assert.equal(drivers[2].effect,'context');assert.match(drivers[2].reason,/Raw Greek signs/);
 assert.equal(drivers[3].effect,'context');
 packet.sources[0].data.available=false;
 assert.equal(enforceEvidenceScope(analysis,packet).scenarios[0].drivers[0].effect,'unavailable');
});

test('a future model stays future context even when its price instrument matches',()=>{
 const {packet,analysis}=fixture();analysis.panels=[{id:'forward',sourceId:'quantdata',instrument:'ES',observedDate:'2026-09-08',dateRole:'projected_session',dateEvidence:'visible',status:'context'}];
 analysis.scenarios[0].drivers[1].panelId='forward';
 const d=enforceEvidenceScope(analysis,packet).scenarios[0].drivers[1];
 assert.equal(d.effect,'context');assert.match(d.reason,/2026-09-08/);assert.doesNotMatch(d.reason,/Nearby support/);
});

test('original panel caption preserves the displayed model date independently of the analysis session',()=>{
 const source={id:'chart',sessionDate:'2026-09-04',capturedAt:'2026-09-06T12:00:00Z',panelContext:{instrument:'SPX',observedDate:'2026-09-08',dateRole:'projected_session'}};
 const caption=chartDateCaption(source);
 assert.match(caption,/Displayed model date 2026-09-08/);assert.match(caption,/Forward model/);assert.match(caption,/Analysis session 2026-09-04/);assert.doesNotMatch(caption,/assigned session/);
 assert.match(evidenceMetadata({id:'gamma',sessionDate:'2026-09-04',data:{rows:[]}}),/^SPX/);
 assert.match(evidenceMetadata({id:'timestamps',sessionDate:'2026-09-04',data:{}}),/^Model availability/);
 assert.doesNotMatch(evidenceMetadata({id:'other',sessionDate:'2026-09-04'}),/undefined|null/);
});
