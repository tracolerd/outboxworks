import { pool } from './db.js';
import { sendWebhook } from './sender.js';
import { generateSignature } from './signer.js';
import { decryptSecret } from './crypto.js';
import { config } from './config.js';
const POLL_INTERVAL_MS = 2000;
const LOCK_TIMEOUT_MINUTES = 2;
const MAX_ATTEMPTS = 5; // Bounded retry limit
export async function processNextDelivery(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Claim a pending or scheduled delivery
    const claimResult = await client.query(`
      WITH claimed AS (
        SELECT d.id
        FROM deliveries d
        WHERE d.status IN ('PENDING', 'SCHEDULED')
           OR (d.status = 'IN_PROGRESS' AND d.locked_until < NOW())
        ORDER BY d.next_attempt_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE deliveries d
      SET status = 'IN_PROGRESS',
          locked_until = NOW() + INTERVAL '${LOCK_TIMEOUT_MINUTES} minutes',
          attempt_count = d.attempt_count + 1,
          updated_at = NOW()
      FROM claimed
      WHERE d.id = claimed.id
      RETURNING d.id, d.event_id, d.attempt_count;
    `);
    if (claimResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const delivery = claimResult.rows[0];
    // 2. Fetch event and endpoint
    const eventResult = await client.query(`
      SELECT e.payload, ep.url, ep.secret
      FROM events e
      JOIN endpoints ep ON e.endpoint_id = ep.id
      WHERE e.id = $1
    `, [delivery.event_id]);
    const { payload, url, secret } = eventResult.rows[0];
    const payloadStr = JSON.stringify(payload);
    // 3. Send Webhook
    const decryptedSecret = decryptSecret(secret, config.ENCRYPTION_KEY);
    const signatureHeader = generateSignature(payloadStr, decryptedSecret);
    const result = await sendWebhook(url, payloadStr, signatureHeader, 5000);
    // 4. Record Attempt
    await client.query(`
      INSERT INTO delivery_attempts (delivery_id, status_code, response_duration_ms, error_reason)
      VALUES ($1, $2, $3, $4)
    `, [delivery.id, result.statusCode, result.durationMs, result.errorReason]);
    // 5. Update State (Success vs Failure with Backoff/Dead-letter)
    if (result.success) {
      await client.query(`
        UPDATE deliveries SET status = 'DELIVERED', updated_at = NOW(), locked_until = NULL WHERE id = $1
      `, [delivery.id]);
      console.log(`✅ [Delivery ${delivery.id}] SUCCESS to ${url} in ${result.durationMs}ms`);
    } else {
      if (delivery.attempt_count >= MAX_ATTEMPTS) {
        // Dead-Letter Transition
        await client.query(`
          UPDATE deliveries SET status = 'DEAD_LETTERED', updated_at = NOW(), locked_until = NULL WHERE id = $1
        `, [delivery.id]);
        await client.query(`
          INSERT INTO audit_events (delivery_id, action, details)
          VALUES ($1, 'DEAD_LETTER_TRANSITION', $2)
        `, [delivery.id, JSON.stringify({ reason: result.errorReason, attempts: delivery.attempt_count })]);
        console.error(`💀 [Delivery ${delivery.id}] DEAD-LETTERED after ${delivery.attempt_count} attempts.`);
      } else {
        // Exponential Backoff (2s, 4s, 8s, 16s...)
        const backoffSecs = Math.min(2 * Math.pow(2, delivery.attempt_count - 1), 3600);
        await client.query(`
          UPDATE deliveries SET status = 'SCHEDULED', next_attempt_at = NOW() + INTERVAL '${backoffSecs} seconds', updated_at = NOW(), locked_until = NULL WHERE id = $1
        `, [delivery.id]);
        console.warn(`⏳ [Delivery ${delivery.id}] FAILED. Retry ${delivery.attempt_count}/${MAX_ATTEMPTS} in ${backoffSecs}s. Reason: ${result.errorReason}`);
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Worker error:', error);
    return false;
  } finally {
    client.release();
  }
}
async function startWorker() {
  console.log('👷 OutboxWorks Worker started... polling for jobs');
  while (true) {
    const processed = await processNextDelivery();
    if (!processed) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
// Windows path safe entry point check (Node 20.11+)
if (process.argv[1] === import.meta.filename || process.argv[1].endsWith('worker.ts')) {
  startWorker();
}

