import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { code } from '../schema/test-helpers.ts';
import { route, startServer } from './server.ts';

function get(origin: string, path: string, method = 'GET'): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request(origin + path, { method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves only allowlisted routes on 127.0.0.1 with strict headers', async () => {
  const s = await startServer(new Map([['/a.txt', route('hello', 'text/plain')]]));
  try {
    assert.match(s.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const ok = await get(s.origin, '/a.txt');
    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'hello');
    assert.match(String(ok.headers['content-security-policy']), /default-src 'none'/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    for (const p of ['/', '/b.txt', '/a.txt/..', '/../package.json', '/src/render/server.ts', '/%2e%2e/package.json']) {
      assert.equal((await get(s.origin, p)).status, 404, p);
    }
    assert.equal((await get(s.origin, '/a.txt', 'POST')).status, 405);
    assert.equal((await get(s.origin, '/a.txt?x=1')).status, 200); // query bị bỏ qua, không mở đường mới
  } finally {
    await s.close();
  }
});

test('faults: notFound, tamper and delay', async () => {
  const s = await startServer(
    new Map([
      ['/x', route('abcdef', 'text/plain')],
      ['/y', route('abcdef', 'text/plain')],
      ['/z', route('abcdef', 'text/plain')],
    ]),
    { notFound: new Set(['/x']), tamper: new Set(['/y']), delayMs: new Map([['/z', 150]]) },
  );
  try {
    assert.equal((await get(s.origin, '/x')).status, 404);
    const t = await get(s.origin, '/y');
    assert.equal(t.status, 200);
    assert.notEqual(t.body, 'abcdef');
    const t0 = Date.now();
    assert.equal((await get(s.origin, '/z')).body, 'abcdef');
    assert.ok(Date.now() - t0 >= 140);
  } finally {
    await s.close();
  }
});

test('SERVER_ROUTE: invalid route paths are refused', async () => {
  for (const p of ['relative', '/a/../b', '/a b']) {
    await assert.rejects(startServer(new Map([[p, route('x', 'text/plain')]])), code('SERVER_ROUTE'));
  }
});
