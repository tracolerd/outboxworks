import express from 'express';
import path from 'path';
import { z } from 'zod';
import { pool } from './db.js';
import { validateWebhookUrl } from './ssrf.js';
import { requireAdmin, requireProducer } from './auth.js';
import { encryptSecret } from './crypto.js';
import { config } from './config.js';
export const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));
const createEndpointSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
});
const createEventSchema = z.object({
  endpoint_id: z.string().uuid(),
  payload: z.record(z.string(), z.any()),
  idempotency_key: z.string().min(1),
});
// Admin Route: Create Endpoint (Encrypts secret)
app.post('/endpoints', requireAdmin, async (req, res) => {
  try {
    const { url, secret } = createEndpointSchema.parse(req.body);
    const isSafeUrl = await validateWebhookUrl(url);
    if (!isSafeUrl) {
      res.status(400).json({ error: 'URL violates SSRF security policy' });
      return;
    }
    const encryptedSecret = encryptSecret(secret, config.ENCRYPTION_KEY);
    const result = await pool.query('INSERT INTO endpoints (url, secret) VALUES ($1, $2) RETURNING id', [url, encryptedSecret]);
    res.status(201).json({ id: result.rows[0].id, url });
  } catch (error) {
    if (error instanceof z.ZodError) res.status(400).json({ error: error.issues });
    else res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Producer Route: Enqueue Event
app.post('/events', requireProducer, async (req, res) => {
  try {
    const { endpoint_id, payload, idempotency_key } = createEventSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const eventResult = await client.query(
        `INSERT INTO events (endpoint_id, payload, idempotency_key) VALUES ($1, $2, $3) ON CONFLICT (endpoint_id, idempotency_key) DO NOTHING RETURNING id`,
        [endpoint_id, payload, idempotency_key]
      );
      if (eventResult.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(200).json({ message: 'Event already accepted (idempotent)' });
        return;
      }
      const eventId = eventResult.rows[0].id;
      await client.query(`INSERT INTO deliveries (event_id, status) VALUES ($1, 'PENDING')`, [eventId]);
      await client.query('COMMIT');
      res.status(201).json({ id: eventId, message: 'Event enqueued successfully' });
    } catch (dbError: any) {
      await client.query('ROLLBACK');
      if (dbError.code === '23503') {
        res.status(400).json({ error: 'Invalid endpoint_id' });
        return;
      }
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) res.status(400).json({ error: error.issues });
    else res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Admin Route: Replay
app.post('/deliveries/:id/replay', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE deliveries SET status = 'PENDING', next_attempt_at = NOW(), attempt_count = 0 WHERE id = $1 AND status = 'DEAD_LETTERED' RETURNING id`, [id]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Delivery not found or not in DEAD_LETTERED state' });
      return;
    }
    await client.query(`INSERT INTO audit_events (delivery_id, action) VALUES ($1, 'MANUAL_REPLAY')`, [id]);
    await client.query('COMMIT');
    res.json({ message: 'Delivery successfully queued for replay' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
});
// Admin Routes: Dashboard APIs (Secrets omitted intentionally)
app.get('/api/endpoints', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, url, created_at FROM endpoints ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/deliveries', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.status, d.attempt_count, d.updated_at, ep.url 
      FROM deliveries d
      JOIN events e ON d.event_id = e.id
      JOIN endpoints ep ON e.endpoint_id = ep.id
      ORDER BY d.updated_at DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
