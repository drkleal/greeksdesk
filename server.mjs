import {createSharedSession,sessionLimit} from './shared-session.mjs';
import http from 'node:http';
import {createAnalysisRecovery} from './analysis-recovery.mjs';
import {createMarketContext} from './market-context.mjs';
import {createOpeningHistory} from './opening-history.mjs';
import {createOptionsDepthContext} from './optionsdepth-context.mjs';
import {createMassive} from './massive.mjs';
import {createPriorCashBasis} from './prior-basis.mjs';
import {createDatabento} from './databento.mjs';
import {validateChartContext} from './chart-context.mjs';
import {readBasis,BasisReadError,calculateBasis,cashBasisReference} from './basis.mjs';
import {validDate} from './public/session.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import {createDeskAuth} from './auth.mjs';
import { fileURLToPath } from 'node:url';
import { createProviderChecks } from './providers.mjs';
import { createAnalyzer } from './analysis.mjs';

export function createServer(password = process.env.DESK_PASSWORD, {analysisOptions={},sharedSessionOptions={}}={}) {
  const sharedSession=createSharedSession(sharedSessionOptions);
  const auth=password?createDeskAuth(password):null;
  const openingHistory=createOpeningHistory();
  const baseCheck = createProviderChecks(), marketContext = createMarketContext({openingHistory}), odContext=createOptionsDepthContext(), esData=createDatabento(), massiveData=createMassive();
  const priorBasis=createPriorCashBasis({readES:esData,readSPX:date=>baseCheck('quantdata',date)});
  const checkProvider=async(provider,date,selection)=>{
    if(provider==='quantdata-context')return marketContext(date);
    if(provider==='straddle-history')return openingHistory.batch(date,selection?.offset||0);
    if(provider==='optionsdepth-context')return odContext(date,selection);
    if(provider==='massive-es')return massiveData(date,selection?.symbol||undefined);
    if(provider==='databento'){
      const result=await esData(date,selection?.symbol||undefined);
      if(result.ok){const spx=await baseCheck('quantdata',date);result.basisReference=cashBasisReference(result,spx,date)||await priorBasis(result,date);try{if(result.freshness==='stale')throw new BasisReadError('ES price is not fresh. No current basis applied.');result.basisResult=calculateBasis({instrument:'ES',price:result.latestPrice,timestamp:result.latestTimestamp,contract:result.contract},spx,date);}catch(error){result.basisResult={ok:false,message:error instanceof BasisReadError?error.message:'No matching SPX price.'};}}
      return result;
    }
    return baseCheck(provider,date,selection);
  };
  const recovery=createAnalysisRecovery({secret:password});
  const analyze = createAnalyzer({...analysisOptions,issueRecovery:recovery.issue,onValidationFailure:review=>writeFile('/tmp/greeksdesk-analysis-review.json',JSON.stringify(review),{mode:0o600})});
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    if (!password) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('GreeksDesk is installed. Set the DESK_PASSWORD secret in Fly.io to open the private preview.');
    }
    if(req.url==='/login'){
      try{await auth.login(req,res);}catch{if(!res.headersSent)res.writeHead(400);res.end('Unable to sign in. Please reload the sign-in page.');}return;
    }
    if (!auth.authorized(req)) {
      if(req.method==='GET'&&['/','/index.html','/preview','/connections','/connector'].includes(req.url)){res.writeHead(303,{Location:'/login'});return res.end();}
      res.writeHead(401,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({ok:false,message:'Your session expired. Sign in to GreeksDesk again.'}));
    }
    if(req.url==='/api/shared-session'){
      if(!['GET','POST'].includes(req.method)||req.headers['sec-fetch-site']==='cross-site'||(req.method==='POST'&&req.headers['x-greeksdesk-action']!=='manual-check')){res.writeHead(403);return res.end();}
      try{
        let result;
        if(req.method==='GET')result=await sharedSession.load();
        else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>sessionLimit){res.writeHead(413);return res.end();}chunks.push(chunk);}result=await sharedSession.save(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
        res.writeHead(result.code==='conflict'?409:result.ok?200:503,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));
      }catch{res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,message:'Shared saving is unavailable or this snapshot is invalid. Your local work is unchanged. Try Save shared session again.'}));}
    }
    if (req.url === '/api/config') {
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({analysisConfigured:!!process.env.OPENAI_API_KEY,databentoConfigured:!!process.env.DATABENTO_API_KEY,massiveConfigured:!!(process.env.POLYGON_API_KEY||process.env.MASSIVE_API_KEY)}));
    }
    if(req.url==='/api/basis'){
      if(req.method!=='POST'||req.headers['x-greeksdesk-action']!=='manual-check'||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);return res.end();}
      try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>3100000){res.writeHead(413);return res.end();}}const input=JSON.parse(raw);if(!validDate(input.date))throw new BasisReadError('Select a valid session date before reading the ES screenshot.');const context=validateChartContext(input.confirmedContext,input.date);const spx=await checkProvider('quantdata',input.date);const result=await readBasis(input.image,spx.ok?spx:{priceObservations:[]},input.date,{context});res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));}catch(error){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,message:error instanceof BasisReadError||error.message?.startsWith('No matching')?error.message:'Unable to establish a verified basis from this image. Include ES price, date and chart timezone.'}));}
    }
    if (req.url === '/api/analyze'||req.url === '/api/recover-analysis') {
      if(req.method!=='POST'||req.headers['x-greeksdesk-action']!=='manual-check'||req.headers['sec-fetch-site']==='cross-site') {res.writeHead(403);return res.end('Same-origin action required');}
      try {
        const chunks=[];let size=0;
        for await (const chunk of req){size+=chunk.length;if(size>26000000){res.writeHead(413);res.end('Chart packet too large');return;}chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result=req.url==='/api/recover-analysis'?recovery.recover(input):await analyze(input);
        res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));
      }catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,message:'Check the source dates, chart sizes and instrument settings.'}));}
    }
    if (req.url?.startsWith('/api/check?')) {
      if (req.method !== 'POST' || req.headers['x-greeksdesk-action'] !== 'manual-check' || req.headers['sec-fetch-site'] === 'cross-site') {
        res.writeHead(403); return res.end('Manual same-origin check required');
      }
      try {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const result = await checkProvider(query.get('provider'), query.get('date'), {symbol:query.get('symbol'),slot:query.get('slot'),min:Number(query.get('min')),max:Number(query.get('max')),offset:Number(query.get('offset'))});
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ok:false,message:'Select a valid provider and session date.'}));
      }
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    const scripts = {'/evidence-policy.mjs':'./public/evidence-policy.mjs','/plan.mjs':'./public/plan.mjs','/evidence.mjs':'./public/evidence.mjs','/session.mjs':'./public/session.mjs','/connector.mjs':'./public/connector.mjs','/desk.mjs':'./public/desk.mjs','/desk.css':'./public/desk.css','/map.mjs':'./public/map.mjs','/capture.mjs':'./public/capture.mjs','/exposure.js':'./public/exposure.js','/connections.mjs':'./public/connections.mjs','/update-loop.mjs':'./public/update-loop.mjs'};
    scripts['/shared-session-client.mjs']='./public/shared-session-client.mjs';
    scripts['/price-evidence.mjs']='./public/price-evidence.mjs';
    for(const asset of ['basis-display.mjs','workbench.mjs','confluence.mjs','workbench.css','chart-intake.mjs','chart-restore.mjs','analysis-readiness.mjs','level-board.mjs','straddle.mjs','straddle-panel.mjs','verification.mjs','level-brief.mjs','exposure-display.mjs','source-status.mjs','gamma-freshness.mjs'])scripts['/'+asset]='./public/'+asset;
    if (!['/', '/index.html', '/preview', '/connections', '/connector', '/chart-connector.zip', ...Object.keys(scripts)].includes(req.url)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    try {
      const page = await readFile(new URL(scripts[req.url] || (req.url === '/connector' ? './public/connector.html' : req.url === '/chart-connector.zip' ? './public/chart-connector.zip' : req.url === '/connections' ? './public/connections.html' : req.url === '/preview' ? './public/index.html' : './public/desk.html'), import.meta.url));
      res.writeHead(200, { 'Content-Type': req.url === '/chart-connector.zip' ? 'application/zip' : req.url.endsWith('.css') ? 'text/css; charset=utf-8' : scripts[req.url] ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : page);
    } catch {
      res.writeHead(500);
      res.end('Unable to load GreeksDesk.');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('GreeksDesk listening'));
}
