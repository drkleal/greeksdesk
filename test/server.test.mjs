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

