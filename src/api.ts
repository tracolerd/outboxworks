import express from 'express';
import { z } from 'zod';
import { pool } from './db.js';
export const app = express();
app.use(express.json());
// Validation Schemas
const createEndpointSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16, 'Secret must be at least 16 characters for HMAC'),
});
const createEventSchema = z.object({
  endpoint_id: z.string().uuid(),
  payload: z.record(z.any()),
  idempotency_key: z.string().min(1),
});
// Route: Register new webhook destination
app.post('/endpoints', async (req, res) => {
  try {
    const { url, secret } = createEndpointSchema.parse(req.body);
    const result = await pool.query(
      'INSERT INTO endpoints (url, secret) VALUES ($1, $2) RETURNING id',
      [url, secret]
    );
    res.status(201).json({ id: result.rows[0].id, url });
  } catch (error) {
    if (error instanceof z.ZodError) res.status(400).json({ error: error.errors });
    else res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Route: Enqueue Event (Transactional + Idempotent)
app.post('/events', async (req, res) => {
  try {
    const { endpoint_id, payload, idempotency_key } = createEventSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Attempt insert. If unique constraint violated, do nothing.
      const eventResult = await client.query(
        `INSERT INTO events (endpoint_id, payload, idempotency_key) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (endpoint_id, idempotency_key) DO NOTHING 
         RETURNING id`,
        [endpoint_id, payload, idempotency_key]
      );
      if (eventResult.rowCount === 0) {
        // Idempotency Collision: already exists
        await client.query('ROLLBACK');
        res.status(200).json({ message: 'Event already accepted (idempotent)' });
        return;
      }
      const eventId = eventResult.rows[0].id;
      // Initialize state machine
      await client.query(
        `INSERT INTO deliveries (event_id, status) VALUES ($1, 'PENDING')`,
        [eventId]
      );
      await client.query('COMMIT');
      res.status(201).json({ id: eventId, message: 'Event enqueued successfully' });
    } catch (dbError: any) {
      await client.query('ROLLBACK');
      if (dbError.code === '23503') { // Foreign key violation
        res.status(400).json({ error: 'Invalid endpoint_id: Endpoint does not exist' });
        return;
      }
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) res.status(400).json({ error: error.errors });
    else {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});
