import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {createDeskAuth} from '../auth.mjs';

test('normal sign-in form authenticates private assets and APIs without a browser auth challenge',async()=>{
 const server=createServer('test-secret');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const page=await fetch(base+'/login');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/form-action 'self'/);assert.equal(page.headers.get('www-authenticate'),null);
  const csrf=(await page.text()).match(/name="csrf" value="([^"]+)"/)[1];
  const headers={'Content-Type':'application/x-www-form-urlencoded',Origin:base,Cookie:page.headers.get('set-cookie').split(';')[0]};
  const body=new URLSearchParams({username:'drkleal',password:'test-secret',csrf});
  for(const origin of ['https://attacker.example','null','']){const bad=await fetch(base+'/login',{method:'POST',headers:{...headers,Origin:origin},body,redirect:'manual'});assert.equal(bad.status,403);assert.equal(bad.headers.get('set-cookie'),null);}
  const wrong=await fetch(base+'/login',{method:'POST',headers,body:new URLSearchParams({username:'drkleal',password:'wrong',csrf}),redirect:'manual'});assert.equal(wrong.status,401);assert.equal(wrong.headers.get('www-authenticate'),null);assert.ok(!wrong.headers.get('set-cookie').startsWith('__Host-greeksdesk='));
  const invalid=await fetch(base+'/login',{method:'POST',headers,body:new URLSearchParams({username:'drkleal',password:'test-secret',csrf:'wrong'}),redirect:'manual'});assert.equal(invalid.status,403);
  const result=await fetch(base+'/login',{method:'POST',headers:{...headers,Origin:'null','sec-fetch-site':'same-origin'},body,redirect:'manual'});assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/');
  const cookie=result.headers.get('set-cookie');assert.match(cookie,/^__Host-greeksdesk=/);for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=43200'])assert.ok(cookie.includes(flag));assert.ok(!cookie.includes('test-secret'));
  const signed={Cookie:cookie.split(';')[0]};assert.equal((await fetch(base+'/api/config',{headers:signed})).status,200);assert.match(await (await fetch(base,{headers:signed})).text(),/The scenario desk/);
  assert.equal((await fetch(base+'/desk.mjs',{headers:signed})).status,200);
  assert.equal((await fetch(base+'/api/config',{headers:{Cookie:signed.Cookie+'x'}})).status,401);
  assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{...signed,'sec-fetch-site':'cross-site','X-GreeksDesk-Action':'manual-check'},body:'{}'})).status,403);
  const auth=createDeskAuth('test-secret',{now:()=>Date.now()+13*60*60*1000});assert.equal(auth.authorized({headers:{cookie:signed.Cookie}}),false);
  const rotated=createDeskAuth('new-secret');assert.equal(rotated.authorized({headers:{cookie:signed.Cookie}}),false);
 }finally{await new Promise(r=>server.close(r));}
});

test('repeated incorrect form logins are throttled and do not issue session cookies',async()=>{
 const server=createServer('test-secret');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{const page=await fetch(base+'/login');const csrf=(await page.text()).match(/name="csrf" value="([^"]+)"/)[1];const cookie=page.headers.get('set-cookie').split(';')[0];for(let n=0;n<6;n++){const r=await fetch(base+'/login',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'drkleal',password:'wrong',csrf}),redirect:'manual'});assert.equal(r.status,n<5?401:429);assert.ok(!r.headers.get('set-cookie').startsWith('__Host-greeksdesk='));if(n===5)assert.ok(Number(r.headers.get('retry-after'))>0);}}finally{await new Promise(r=>server.close(r));}
});
