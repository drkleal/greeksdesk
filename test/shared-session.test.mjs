import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedSession} from '../shared-session.mjs';
import {createSharedController} from '../public/shared-session-client.mjs';
import {createServer} from '../server.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=';
const state=(date='2026-09-11')=>({version:1,date,instrument:'ES',basis:null,charts:['paste-dg','es-snapshot','es-five-minute','paste-vp','paste-vp-prior','paste-vp-composite'].map(id=>({id,title:id,sessionDate:date,capturedAt:date+'T20:00:00Z',image})),read:null});
function memoryClient(){let body=null,etag=null,n=0;return {async send(c){if(c.constructor.name==='GetObjectCommand'){if(!body)throw {$metadata:{httpStatusCode:404}};return {ETag:etag,Body:{transformToByteArray:async()=>body}};}const i=c.input;if(i.IfNoneMatch==='*'?body!==null:i.IfMatch!==etag)throw {$metadata:{httpStatusCode:412}};body=i.Body;etag='"'+(++n)+'"';return {ETag:etag};}};}
const wire=store=>async(url,init)=>{try{const r=init.method==='POST'?await store.save(JSON.parse(init.body)):await store.load();return {json:async()=>structuredClone(r)};}catch{return {json:async()=>({ok:false,message:'Storage unavailable'})};}};
test('shared store survives separate app instances and rejects stale writes, malformed charts and unconfigured storage',async()=>{
 const client=memoryClient(),a=createSharedSession({client}),b=createSharedSession({client});
 assert.equal((await a.load()).state,null);const saved=await a.save({etag:null,state:state()});
 const loaded=await b.load();assert.equal(loaded.etag,saved.etag);assert.equal(loaded.state.charts.length,6);
 assert.equal((await b.save({etag:null,state:state('2026-09-10')})).code,'conflict');
 assert.equal((await a.load()).state.date,'2026-09-11');
 const changed=state();changed.charts[0].image='https://example.com/private';await assert.rejects(a.save({etag:saved.etag,state:changed}));
 assert.equal((await createSharedSession({env:{}}).load()).code,'not_configured');
 const newer=await b.save({etag:saved.etag,state:state('2026-09-12')});assert.notEqual(newer.etag,saved.etag);
 assert.equal((await a.save({etag:saved.etag,state:state()})).code,'conflict');
});
test('new browser opens all six charts without analysis; a populated browser never silently replaces either copy',async()=>{
 const store=createSharedSession({client:memoryClient()});await store.save({etag:null,state:state()});
 let local={...state('2026-09-09'),charts:[]},backups=[],messages=[];
 const c=createSharedController({getState:()=>local,applyState:async s=>{local=s;},backup:async s=>backups.push(s),request:wire(store),status:m=>messages.push(m)});
 await c.start();assert.equal(local.date,'2026-09-11');assert.equal(local.charts.length,6);assert.equal(backups.length,0);
 let other=state('2026-09-10');const d=createSharedController({getState:()=>other,applyState:async s=>{other=s;},backup:async s=>backups.push(s),request:wire(store),status:m=>messages.push(m)});
 await d.start();assert.equal(other.date,'2026-09-10');assert.equal((await store.load()).state.date,'2026-09-11');assert.match(messages.at(-1),/different saved work/);
 await d.open();assert.equal(backups[0].date,'2026-09-10');assert.equal(other.date,'2026-09-11');
});
test('local edits during initial load and concurrent writes cannot be erased by asynchronous restoration',async()=>{
 const store=createSharedSession({client:memoryClient()});await store.save({etag:null,state:state()});
 let release;const gate=new Promise(r=>release=r);let local={...state('2026-09-09'),charts:[]};
 const c=createSharedController({getState:()=>local,applyState:async s=>{local=s;},backup:async()=>{},request:async(...args)=>{await gate;return wire(store)(...args);},status:()=>{}});
 const starting=c.start();local=state('2026-09-12');c.changed();release();await starting;assert.equal(local.date,'2026-09-12');assert.equal((await store.load()).state.date,'2026-09-11');
});
test('authenticated endpoint shares a complete result across app instances without invoking any model or provider',async()=>{
 const client=memoryClient(),password='fixture',servers=[0,1].map(()=>createServer(password,{sharedSessionOptions:{client},analysisOptions:{env:{},request:async()=>{throw Error('Must not call model');}}}));
 for(const server of servers)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const urls=servers.map(s=>'http://127.0.0.1:'+s.address().port+'/api/shared-session');
 const headers={Authorization:'Basic '+Buffer.from('drkleal:'+password).toString('base64'),'Content-Type':'application/json','X-GreeksDesk-Action':'manual-check'};
 const s=state();s.read={id:'2026-09-11T21:01:00.000Z',date:s.date,instrument:'ES',basis:null,sources:s.charts,result:{ok:true,checkedAt:'2026-09-11T21:01:00Z',analysis:{headline:'Historical fixture',summary:'Test only',levels:[],scenarios:[],sources:[],gaps:[],changes:[]}}};
 try{
  assert.equal((await fetch(urls[0])).status,401);
  assert.equal((await fetch(urls[0],{method:'POST',headers:{...headers,'sec-fetch-site':'cross-site'},body:JSON.stringify({etag:null,state:s})})).status,403);
  assert.equal((await fetch(urls[0],{method:'POST',headers,body:JSON.stringify({etag:null,state:s})})).status,200);
  const r=await(await fetch(urls[1],{headers})).json();assert.equal(r.state.charts.length,6);assert.equal(r.state.read.result.checkedAt,s.read.result.checkedAt);assert.equal(r.state.read.sources[0].image,image);
 }finally{for(const server of servers)await new Promise(r=>server.close(r));}
});
