# Prioritized Engineering Backlog

These candidates are scoped to OutboxWorks' durable event enqueueing, signed outbound delivery, retries, dead-letter handling, and operator visibility.

## Candidate issues

1. **Test idempotent enqueue under concurrent requests** — Prove duplicate idempotency keys create one logical event when requests race, including database uniqueness conflicts.
2. **Document and test the outbound signature canonicalization** — Specify exactly which method, path, timestamp, and body bytes are signed; add positive and tampering test vectors.
3. **Bound retry scheduling with jitter and a maximum age** — Ensure retry storms are dampened and events reach a clearly defined terminal state after policy limits.
4. **Enforce outbound request deadlines** — Set connection and total request timeouts so a hung destination cannot hold delivery workers indefinitely.
5. **Make dead-letter replay auditable and idempotent** — Record who replayed an event, when, and the resulting attempt; prevent operator retries from creating duplicate side effects where possible.
6. **Bound response-body handling** — Limit destination response bytes and redact secrets before recording any response details.
7. **Expose per-destination rate limiting and backpressure** — Prevent a slow or throttling endpoint from consuming all worker capacity.
8. **Test lease recovery after worker crashes** — Prove stuck in-progress deliveries become eligible for recovery after lease expiry without double-processing.
9. **Verify event ordering guarantees explicitly** — Document whether order is guaranteed per destination or aggregate, and test the promised behavior under retries.
10. **Add operator metrics and actionable failure reasons** — Surface queue age, attempts, delivery latency, and dead-letter counts without logging signed secrets or full sensitive payloads.

## Suggested order

Start with idempotency, signature correctness, timeouts, and crash recovery because they define delivery correctness. Then address retry policy, payload safety, backpressure, and operator observability.
