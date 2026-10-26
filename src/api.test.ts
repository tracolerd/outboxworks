import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { app } from './api.js';
import { pool } from './db.js';
test('Durable Enqueue API & Idempotency Pipeline', async (t) => {
  // Setup isolated test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;
  let endpointId: string;
  await t.test('1. Should create a new endpoint', async () => {
    const res = await fetch(`${baseUrl}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/webhook', secret: 'test_super_secret_key_123' })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    endpointId = data.id;
  });
  const idempotencyKey = `test-key-${Date.now()}`;
  let enqueuedEventId: string;
  await t.test('2. Should enqueue event and create pending delivery', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint_id: endpointId, payload: { msg: 'hello' }, idempotency_key: idempotencyKey })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.message, 'Event enqueued successfully');
    assert.ok(data.id);
    enqueuedEventId = data.id;
  });
  await t.test('3. Should reject invalid endpoint_id', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint_id: '00000000-0000-0000-0000-000000000000', payload: { msg: 'hello' }, idempotency_key: 'another-key' })
    });
    assert.strictEqual(res.status, 400);
  });
  await t.test('4. Should handle duplicate idempotency key correctly (Idempotent 200 OK)', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint_id: endpointId, payload: { msg: 'different payload but same key' }, idempotency_key: idempotencyKey })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, 'Event already accepted (idempotent)');
  });
  await t.test('5. Verify durable database state transaction', async () => {
    const dbCheck = await pool.query('SELECT * FROM deliveries WHERE event_id = $1', [enqueuedEventId]);
    assert.strictEqual(dbCheck.rows.length, 1, 'Delivery record must exist');
    assert.strictEqual(dbCheck.rows[0].status, 'PENDING', 'Delivery status must be PENDING');
  });
  // Cleanup
  server.close();
  await pool.end();
});
