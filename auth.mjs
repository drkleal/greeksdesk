import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const cookieName='__Host-greeksdesk';
const csrfCookie='__Host-greeksdesk-login';
const lifetime=12*60*60;
export function matches(a,b){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export function createDeskAuth(password,{now=Date.now}={}){
 const attempts=new Map();
 const sign=value=>createHmac('sha256',password).update('greeksdesk-session-v1:'+value).digest('base64url');
 function sessionValid(req){
  const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token||token.length>256)return false;
  const [expires,nonce,signature,...rest]=token.split('.');
  return !rest.length&&/^\d+$/.test(expires)&&/^[a-f0-9]{64}$/.test(nonce||'')&&Number(expires)>now()&&Number(expires)<=now()+lifetime*1000&&matches(signature||'',sign(expires+'.'+nonce));
 }
 function authorized(req){const h=req.headers.authorization||'';return (h.startsWith('Basic ')&&matches(Buffer.from(h.slice(6),'base64').toString('utf8'),'drkleal:'+password))||sessionValid(req);}
 function loginPage(res,error='',status=200){
  const csrf=randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie',csrfCookie+'='+csrf+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900');
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · GreeksDesk</title><style>body{margin:0;background:#001522;color:#e3faff;font:17px system-ui;display:grid;min-height:100vh;place-items:center}main{box-sizing:border-box;width:min(440px,92vw);padding:32px;background:#062238;border:1px solid #21516b;border-radius:14px}h1{font-size:25px}span{color:#1cdef5}label{display:block;margin:20px 0 7px}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:6px;font:inherit}input{background:#001522;color:white;border:1px solid #568399}button{margin-top:24px;border:0;background:#1cdef5;color:#001522;font-weight:700;cursor:pointer}p{line-height:1.5;color:#b3ccde}.error{color:#ffacbb}</style></head><body><main><h1>GREEKS<span>DESK</span></h1><p>Sign in to your scenario desk.</p>${error?'<p class="error" role="alert">'+error+'</p>':''}<form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><label for="username">Username</label><input id="username" name="username" autocomplete="username" required maxlength="100"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit">Sign in</button></form><p>Use your existing GreeksDesk username and password. This is separate from the Greeks app.</p></main></body></html>`);
 }
 async function login(req,res){
  if(req.method==='GET'){loginPage(res);return;}
  if(req.method!=='POST'){res.writeHead(405,{Allow:'GET, POST'});res.end();return;}
  const host=req.headers.host;
  // Sandboxed browsers may send a null Origin. Require the same-origin
  // Fetch Metadata signal plus the cookie-bound form token in that case.
  const origins=['https://'+host];if(/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host||''))origins.push('http://'+host);
  const sameOrigin=origins.includes(req.headers.origin)||(req.headers.origin==='null'&&req.headers['sec-fetch-site']==='same-origin');
  if(!sameOrigin||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end('Open GreeksDesk directly to sign in.');return;}
  if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){res.writeHead(415);res.end('Use the sign-in form.');return;}
  const ip=req.headers['fly-client-ip']||req.socket.remoteAddress||'unknown';
  let record=attempts.get(ip);if(record&&record.until<=now()){attempts.delete(ip);record=null;}
  if(record?.count>=5){res.setHeader('Retry-After',String(Math.ceil((record.until-now())/1000)));loginPage(res,'Too many attempts. Wait 15 minutes before trying again.',429);return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192){res.writeHead(413);res.end('Sign-in request too large.');return;}}
  const form=new URLSearchParams(raw);
  const csrf=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(csrfCookie+'='))?.slice(csrfCookie.length+1)||'';
  if(!/^[a-f0-9]{64}$/.test(csrf)||!matches(form.get('csrf')||'',csrf)){res.writeHead(403);res.end('Sign-in form expired. Reload the page and try again.');return;}
  if(!matches(form.get('username')||'','drkleal')||!matches(form.get('password')||'',password)){
   if(attempts.size>=1000&&!attempts.has(ip))attempts.delete(attempts.keys().next().value);
   attempts.set(ip,{count:(record?.count||0)+1,until:record?.until||now()+15*60*1000});loginPage(res,'Username or password incorrect. Please try again.',401);return;
  }
  attempts.delete(ip);const value=String(now()+lifetime*1000)+'.'+randomBytes(32).toString('hex');
  res.writeHead(303,{'Set-Cookie':cookieName+'='+value+'.'+sign(value)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+lifetime,Location:'/'});res.end();
 }
 return {authorized,login};
}

