import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationStatus} from '../public/verification.mjs';
import {levelBrief,wrapBrief} from '../public/level-brief.mjs';
const date='2026-09-04';
function fixture(){
 const level=(id,price)=>({id,price,role:'structure',kind:'support',sourceIds:['es'],panelIds:[],watch:'Wait for a confirmed hold.',invalidation:'Acceptance below cancels.',label:id,evidence:'A supplied price reaction.'});
 return {date,instrument:'ES',basis:null,sources:[{id:'es',sessionDate:date,title:'ES data',data:{ticker:'ES'}},{id:'missing',title:'Not returned',sessionDate:date,data:{available:false}},{id:'new',title:'New source',sessionDate:date,data:{ticker:'SPX'}}],result:{analysis:{sources:[{id:'es',shows:'Prices supplied'}],panels:[],levels:[level('trigger',7700),level('target',7720),level('outer',7740)],checkpoints:[],scenarios:[{direction:'up',status:'conditional',triggerId:'trigger',targetId:'target',condition:'Only if price holds above 7700 on a completed five-minute retest.',confirmation:'Retest holds.',invalidation:'Acceptance below 7700 cancels.',continuation:{targetId:'outer',condition:'Only after acceptance above 7720.',confirmation:'Hold above 7720.',invalidation:'Return below 7720.',rationale:'Next supplied reaction.'}}]}}};
}
test('verification counts unavailable and newly added feeds separately and never claims a trading edge',()=>{
 const read=fixture(),v=verificationStatus(read);assert.equal(v.total,3);assert.equal(v.findings,1);assert.equal(v.unavailable,1);assert.equal(v.pending,1);assert.equal(v.outcomeValidated,false);assert.equal(v.routes[0].ready,true);
 read.result.analysis.levels[1].price=7690;assert.equal(verificationStatus(read).routes[0].ready,false);
});
test('level cards preserve the complete condition and get destinations from valid staged routes',()=>{
 const read=fixture(),a=read.result.analysis,b=levelBrief(read,a.levels[0]);assert.match(b.role,/Upside trigger.*7,720/);assert.equal(b.condition,a.scenarios[0].condition);assert.equal(b.confluence.stars,'');
 const first=levelBrief(read,a.levels[1]);assert.match(first.role,/First objective.*7,740/);assert.equal(first.condition,a.scenarios[0].continuation.condition);
 const outer=levelBrief(read,a.levels[2]);assert.match(outer.role,/Continuation objective/);
 a.scenarios[0].status='insufficient';assert.equal(levelBrief(read,a.levels[0]).role,'Watch level');
});
test('wrapping preserves qualifications and price conditions without ellipses',()=>{
 const text='Only if ES accepts above 7720 and then holds 7725; acceptance below 7715 cancels the scenario.';
 assert.equal(wrapBrief(text,30).join(' '),text);assert.ok(wrapBrief(text,30).length>1);
});
