import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function matches(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createServer(password = process.env.DESK_PASSWORD) {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
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
    if (!matches(supplied, `desk:${password}`)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GreeksDesk", charset="UTF-8"' });
      return res.end('Sign in with username desk and your desk password.');
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    if (req.url !== '/' && req.url !== '/index.html') {
      res.writeHead(404);
      return res.end('Not found');
    }
    try {
      const page = await readFile(new URL('./public/index.html', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
