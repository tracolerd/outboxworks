import { pool } from './db.js';
import { sendWebhook } from './sender.js';
import { generateSignature } from './signer.js';
const POLL_INTERVAL_MS = 2000;
const LOCK_TIMEOUT_MINUTES = 2; // 2 minutes lock to prevent stale leases
export async function processNextDelivery(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Claim a pending or scheduled delivery using SKIP LOCKED
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
      return false; // No tasks available
    }
    const delivery = claimResult.rows[0];
    // 2. Fetch the associated event and endpoint data
    const eventResult = await client.query(`
      SELECT e.payload, ep.url, ep.secret
      FROM events e
      JOIN endpoints ep ON e.endpoint_id = ep.id
      WHERE e.id = $1
    `, [delivery.event_id]);
    const { payload, url, secret } = eventResult.rows[0];
    const payloadStr = JSON.stringify(payload);
    // 3. Generate HMAC Signature
    const signatureHeader = generateSignature(payloadStr, secret);
    // 4. Send Webhook (Timeout will trigger if it takes > 5s)
    const result = await sendWebhook(url, payloadStr, signatureHeader, 5000);
    // 5. Record Attempt History
    await client.query(`
      INSERT INTO delivery_attempts (delivery_id, status_code, response_duration_ms, error_reason)
      VALUES ($1, $2, $3, $4)
    `, [delivery.id, result.statusCode, result.durationMs, result.errorReason]);
    // 6. Update Delivery State based on Result
    if (result.success) {
      await client.query(`
        UPDATE deliveries 
        SET status = 'DELIVERED', updated_at = NOW(), locked_until = NULL
        WHERE id = $1
      `, [delivery.id]);
      console.log(`✅ [Delivery ${delivery.id}] SUCCESS to ${url} in ${result.durationMs}ms`);
    } else {
      // Note: Phase 4 will introduce exponential backoff & dead-letter logic.
      // For now, we revert it to PENDING and schedule it 10 seconds later.
      await client.query(`
        UPDATE deliveries 
        SET status = 'PENDING', 
            next_attempt_at = NOW() + INTERVAL '10 seconds', 
            updated_at = NOW(), 
            locked_until = NULL
        WHERE id = $1
      `, [delivery.id]);
      console.error(`❌ [Delivery ${delivery.id}] FAILED. Reason: ${result.errorReason}`);
    }
    await client.query('COMMIT');
    return true; // Successfully processed a task
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Worker error:', error);
    return false;
  } finally {
    client.release();
  }
}
// Keep polling continuously
async function startWorker() {
  console.log('👷 OutboxWorks Worker started... polling for jobs');
  while (true) {
    const processed = await processNextDelivery();
    if (!processed) {
      // Sleep if no tasks to prevent spamming the database CPU
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
// Start only if this file is run directly (not imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
