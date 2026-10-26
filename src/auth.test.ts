import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { app } from './api.js';
import { config } from './config.js';
test('Authentication and Authorization Security Guardrails', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;
  await t.test('1. Should block unauthenticated requests to protected endpoints', async () => {
    const res = await fetch(`${baseUrl}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/webhook', secret: '1234567890123456' })
    });
    assert.strictEqual(res.status, 401, 'Should return 401 Unauthorized without token');
  });
  await t.test('2. Should block producer from accessing admin-only routes', async () => {
    const res = await fetch(`${baseUrl}/endpoints`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.PRODUCER_SECRET}` 
      },
      body: JSON.stringify({ url: 'https://example.com/webhook', secret: '1234567890123456' })
    });
    assert.strictEqual(res.status, 401, 'Producer token must not access admin route');
  });
  await t.test('3. Should block invalid bearer token format', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Basic wrongformat' 
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 401);
  });
  server.close();
});
