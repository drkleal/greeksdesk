import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createProviderChecks } from './providers.mjs';

function matches(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createServer(password = process.env.DESK_PASSWORD) {
  const checkProvider = createProviderChecks();
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    if (!password) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('GreeksDesk is installed. Set the DESK_PASSWORD secret in Fly.io to open the private preview.');
    }
    const header = req.headers.authorization || '';
    const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
    if (!matches(supplied, `drkleal:${password}`)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GreeksDesk", charset="UTF-8"' });
      return res.end('Sign in with username drkleal and your desk password.');
    }
    if (req.url?.startsWith('/api/check?')) {
      if (req.method !== 'POST' || req.headers['x-greeksdesk-action'] !== 'manual-check' || req.headers['sec-fetch-site'] === 'cross-site') {
        res.writeHead(403); return res.end('Manual same-origin check required');
      }
      try {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const result = await checkProvider(query.get('provider'), query.get('date'), {slot:query.get('slot'),min:Number(query.get('min')),max:Number(query.get('max'))});
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ok:false,message:'Select a valid provider and session date.'}));
      }
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    const scripts = {'/exposure.js':'./public/exposure.js','/connections.mjs':'./public/connections.mjs','/update-loop.mjs':'./public/update-loop.mjs'};
    if (!['/', '/index.html', '/connections', ...Object.keys(scripts)].includes(req.url)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    try {
      const page = await readFile(new URL(scripts[req.url] || (req.url === '/connections' ? './public/connections.html' : './public/index.html'), import.meta.url));
      res.writeHead(200, { 'Content-Type': scripts[req.url] ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
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
