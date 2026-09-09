import test from 'node:test';
import assert from 'node:assert/strict';
import {createChartRestore} from '../public/chart-restore.mjs';
import {analysisReadiness} from '../public/analysis-readiness.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('changing sessions restores that session and ignores a late previous-session load',async()=>{
 let date='2026-09-08';const jobs=[],accepted=[];
 const restore=createChartRestore({load:d=>{const job=deferred();jobs.push({...job,date:d});return job.promise;},accept:async s=>{accepted.push(s);return true;},currentDate:()=>date,locked:()=>false,versions:new Map(),onRestored:()=>{}});
 const first=restore.restore();date='2026-09-09';const second=restore.restore();
 jobs[1].resolve([{id:'es-snapshot',sessionDate:date}]);await second;
 jobs[0].resolve([{id:'es-snapshot',sessionDate:'2026-09-08'}]);await first;
 assert.deepEqual(accepted.map(s=>s.sessionDate),['2026-09-09']);
 date='2026-09-08';const third=restore.restore();jobs[2].resolve([{id:'es-snapshot',sessionDate:date}]);await third;
 assert.deepEqual(accepted.map(s=>s.sessionDate),['2026-09-09','2026-09-08']);
});
test('restoration does not overwrite a pasted or removed chart while storage is loading',async()=>{
 const job=deferred(),versions=new Map(),accepted=[];
 const restore=createChartRestore({load:()=>job.promise,accept:async s=>{accepted.push(s);return true;},currentDate:()=>'2026-09-08',locked:()=>false,versions,onRestored:()=>{}});
 const pending=restore.restore();versions.set('es-snapshot',1);versions.set('paste-dg',1);
 job.resolve(['es-snapshot','paste-dg','paste-vp'].map(id=>({id,sessionDate:'2026-09-08'})));await pending;
 assert.deepEqual(accepted.map(s=>s.id),['paste-vp']);await restore.whenReady();
});
test('options-only updates cannot masquerade as a full chart analysis',()=>{
 const date='2026-09-08',options={id:'qd-gamma',sessionDate:date,data:{available:true}};
 const failedES={id:'databento',sessionDate:date,data:{available:false}};
 assert.equal(analysisReadiness([options,failedES],'ES',date).ready,false);
 assert.match(analysisReadiness([options,failedES],'ES',date).message,/Full analysis not started/);
 assert.equal(analysisReadiness([options,{id:'es-snapshot',sessionDate:date,image:'saved-image'}],'ES',date).ready,true);
 assert.equal(analysisReadiness([{sessionDate:'2026-09-04',image:'old-chart'},options],'ES',date).ready,false);
 const native={id:'databento',sessionDate:date,data:{available:true,ticker:'ES',dataset:'GLBX.MDP3',contract:'ESU6',recentBars:[{close:7715}]}};
 assert.equal(analysisReadiness([native,options],'ES',date).ready,true);
 assert.equal(analysisReadiness([{...native,data:{...native.data,contract:'SPX'}}],'ES',date).ready,false);
});
