import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

test('private preview is locked, health stays available, and authenticated page loads', async () => {
  const server = createServer('test-secret');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/healthz')).status, 200);
    assert.equal((await fetch(base)).status, 401);
    const headers = { Authorization: 'Basic ' + Buffer.from('drkleal:test-secret').toString('base64') };
    const page = await fetch(base, { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /scenario desk/);
    assert.equal((await fetch(base + '/server.mjs', { headers })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('missing password fails closed', async () => {
  const server = createServer('');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}`)).status, 503);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('basis rejects blank and impossible dates before contacting providers',async()=>{
 const server=createServer('test-secret');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Basic '+Buffer.from('drkleal:test-secret').toString('base64'),'X-GreeksDesk-Action':'manual-check'};
 try{for(const date of ['', '2026-02-30']){const response=await fetch(base+'/api/basis',{method:'POST',headers,body:JSON.stringify({date,image:'unused'})});assert.equal(response.status,400);assert.match((await response.json()).message,/Select a valid session date/);}const module=await fetch(base+'/session.mjs',{headers});assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);}finally{await new Promise(resolve=>server.close(resolve));}
});


test('new desk and analysis routes preserve authentication and reject cross-site analysis',async()=>{
 const server=createServer('test-secret');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const headers={Authorization:'Basic '+Buffer.from('drkleal:test-secret').toString('base64')};
 try{assert.equal((await fetch(base+'/api/config')).status,401);assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers})).status,403);assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{...headers,'X-GreeksDesk-Action':'manual-check','sec-fetch-site':'cross-site'},body:'{}'})).status,403);const css=await fetch(base+'/desk.css',{headers});assert.match(css.headers.get('content-type'),/text\/css/);const preview=await fetch(base+'/preview',{headers});assert.match(await preview.text(),/Design preview/);const result=await fetch(base+'/api/analyze',{method:'POST',headers:{...headers,'X-GreeksDesk-Action':'manual-check'},body:JSON.stringify({date:'2026-09-04',instrument:'SPX',sources:[{id:'quantdata',title:'Price',sessionDate:'2026-09-04',data:{ticker:'SPX',latestPrice:7717.81,latestTimestamp:'2026-09-04T20:59:00Z'}}]})});assert.equal((await result.json()).model,'source-reference-summary');}finally{await new Promise(resolve=>server.close(resolve));}
});

test('connector guide and download are authenticated and served with correct types',async()=>{
 const server=createServer('test-secret');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const headers={Authorization:'Basic '+Buffer.from('drkleal:test-secret').toString('base64')};
 try{assert.equal((await fetch(base+'/chart-connector.zip')).status,401);const guide=await fetch(base+'/connector',{headers});assert.match(await guide.text(),/Connect your charts once/);const script=await fetch(base+'/connector.mjs',{headers});assert.match(script.headers.get('content-type'),/javascript/);const zip=await fetch(base+'/chart-connector.zip',{headers});assert.equal(zip.headers.get('content-type'),'application/zip');assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');}finally{await new Promise(resolve=>server.close(resolve));}
});
