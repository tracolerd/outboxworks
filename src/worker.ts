import { pool } from './db.js';
import { sendWebhook } from './sender.js';
import { generateSignature } from './signer.js';
import { decryptSecret } from './crypto.js';
import { config } from './config.js';
const POLL_INTERVAL_MS = 2000;
const LOCK_TIMEOUT_MINUTES = 2;
const MAX_ATTEMPTS = 5; // Bounded retry limit
export async function processNextDelivery(): Promise<boolean> {
  const claimClient = await pool.connect();
  let delivery: any;
  let eventData: any;
  try {
    // 1. Transaction 1: Claim the task (Short-lived)
    await claimClient.query('BEGIN');
    const claimResult = await claimClient.query(`
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
      await claimClient.query('ROLLBACK');
      return false; // No tasks available
    }
    delivery = claimResult.rows[0];
    const eventResult = await claimClient.query(`
      SELECT e.payload, ep.url, ep.secret
      FROM events e
      JOIN endpoints ep ON e.endpoint_id = ep.id
      WHERE e.id = $1
    `, [delivery.event_id]);
    eventData = eventResult.rows[0];
    await claimClient.query('COMMIT');
  } catch (error) {
    await claimClient.query('ROLLBACK');
    console.error('Worker claim error:', error);
    return false;
  } finally {
    claimClient.release(); // Release DB connection BEFORE making HTTP request!
  }
  // 2. Perform Network I/O without holding a database connection
  const payloadStr = JSON.stringify(eventData.payload);
  const decryptedSecret = decryptSecret(eventData.secret, config.ENCRYPTION_KEY);
  const signatureHeader = generateSignature(payloadStr, decryptedSecret);
  const result = await sendWebhook(eventData.url, payloadStr, signatureHeader, 5000);
  // 3. Transaction 2: Save the result (Short-lived)
  const resultClient = await pool.connect();
  try {
    await resultClient.query('BEGIN');
    await resultClient.query(`
      INSERT INTO delivery_attempts (delivery_id, status_code, response_duration_ms, error_reason)
      VALUES ($1, $2, $3, $4)
    `, [delivery.id, result.statusCode, result.durationMs, result.errorReason]);
    if (result.success) {
      await resultClient.query(`
        UPDATE deliveries SET status = 'DELIVERED', updated_at = NOW(), locked_until = NULL WHERE id = $1
      `, [delivery.id]);
      console.log(`✅ [Delivery ${delivery.id}] SUCCESS to ${eventData.url} in ${result.durationMs}ms`);
    } else {
      if (delivery.attempt_count >= MAX_ATTEMPTS) {
        await resultClient.query(`
          UPDATE deliveries SET status = 'DEAD_LETTERED', updated_at = NOW(), locked_until = NULL WHERE id = $1
        `, [delivery.id]);
        await resultClient.query(`
          INSERT INTO audit_events (delivery_id, action, details)
          VALUES ($1, 'DEAD_LETTER_TRANSITION', $2)
        `, [delivery.id, JSON.stringify({ reason: result.errorReason, attempts: delivery.attempt_count })]);
        console.error(`💀 [Delivery ${delivery.id}] DEAD-LETTERED after ${delivery.attempt_count} attempts.`);
      } else {
        const backoffSecs = Math.min(2 * Math.pow(2, delivery.attempt_count - 1), 3600);
        await resultClient.query(`
          UPDATE deliveries SET status = 'SCHEDULED', next_attempt_at = NOW() + INTERVAL '${backoffSecs} seconds', updated_at = NOW(), locked_until = NULL WHERE id = $1
        `, [delivery.id]);
        console.warn(`⏳ [Delivery ${delivery.id}] FAILED. Retry ${delivery.attempt_count}/${MAX_ATTEMPTS} in ${backoffSecs}s. Reason: ${result.errorReason}`);
      }
    }
    await resultClient.query('COMMIT');
    return true;
  } catch (error) {
    await resultClient.query('ROLLBACK');
    console.error('Worker result save error:', error);
    return false; // Result saving failed, but lock timeout will eventually retry it
  } finally {
    resultClient.release();
  }
}
let isShuttingDown = false;
async function startWorker() {
  console.log('👷 OutboxWorks Worker started... polling for jobs');
  while (!isShuttingDown) {
    const processed = await processNextDelivery();
    if (!processed && !isShuttingDown) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  console.log('👷 Worker loop terminated safely.');
}
if (import.meta.dirname && process.argv[1].endsWith('worker.ts')) {
  startWorker();
  process.on('SIGINT', () => { isShuttingDown = true; });
  process.on('SIGTERM', () => { isShuttingDown = true; });
}
