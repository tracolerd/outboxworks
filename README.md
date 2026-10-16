# OutboxWorks

**Reliable webhook delivery with observable retries and explicit failure states.**

OutboxWorks is a planned event-delivery service for applications that need to send webhooks to downstream systems and understand what happened when delivery succeeds, fails, times out, or must be retried.

> **Project status:** Initial planning and repository setup. The delivery service, persistence layer, UI, and retry worker are not implemented yet.

## Problem

A webhook sender must handle unreliable receivers and networks. A request may time out after the receiver processed it; workers may restart; the same event may be enqueued more than once. A robust system needs durable state, bounded retries, idempotency, signatures, and an honest representation of delivery guarantees.

OutboxWorks aims to make these mechanisms visible and testable.

## Planned MVP

- Accept an event through a validated API.
- Persist the event and its delivery state before attempting delivery.
- Sign webhook payloads using HMAC-SHA256.
- Use idempotency keys to prevent duplicate enqueue operations according to a documented policy.
- Record each attempt, response status, duration, and failure category.
- Retry configured transient failures with bounded exponential backoff.
- Move exhausted deliveries to a dead-letter state.
- Support a controlled replay workflow with audit events.
- Expose delivery history through a small API.

## Proposed architecture

~~~mermaid
flowchart TD
    A[Producer API] --> B[Database Transaction]
    B --> C[Durable Event and Delivery]
    C --> D[Worker Claims Pending Delivery]
    D --> E[Signed HTTP Request]
    E -->|Success| F[Delivered]
    E -->|Retryable Failure| G[Scheduled Retry]
    G --> D
    E -->|Attempts Exhausted| H[Dead Letter]
    F --> I[Attempt History]
    H --> I
~~~

A database-backed worker is a sensible first step. Redis or a separate message broker can be evaluated later if measurements show the initial design is insufficient.

## Proposed technology

| Area | Planned choice |
|---|---|
| Runtime | Node.js and TypeScript |
| Durable state | PostgreSQL |
| Delivery | HTTP webhooks |
| Local environment | Docker Compose, once configuration is established |
| Optional queue | Redis, only if justified by the implementation |
| Example receiver | A small PHP receiver may demonstrate signature verification |

## Delivery semantics

The system should be designed and documented as **at-least-once delivery attempts**, not exactly-once execution at the receiver. A timeout cannot tell the sender with certainty whether the remote side completed its work. Receiver applications must verify signatures and use their own idempotency strategy for side effects.

The database design should prevent two workers from intentionally claiming the same active delivery concurrently, while still treating duplicated delivery as a possible distributed-systems outcome.

## Security requirements

Webhook infrastructure can become a path to server-side request forgery. The implementation must not blindly send requests to arbitrary user-supplied URLs. Define an endpoint policy, block loopback/private/link-local/reserved destinations where appropriate, validate resolved addresses, handle redirects carefully, and design protections against DNS rebinding. Test the behavior at the network boundary.

Additional safeguards:

- Store endpoint secrets securely and never print them in logs.
- Verify HMAC signatures using constant-time comparison.
- Include timestamp/replay guidance in the signing scheme.
- Apply request timeouts, payload limits, and rate limits.
- Avoid logging sensitive payloads by default.
- Require authorization for replay and endpoint changes.

## Development roadmap

1. Define event and delivery schemas, states, and API contracts.
2. Implement durable enqueue with transaction-backed idempotency.
3. Build a single worker and a local test receiver.
4. Add HMAC signing and signature verification examples.
5. Add bounded retries, attempt history, and dead-letter handling.
6. Test worker concurrency, restart recovery, and idempotency behavior.
7. Harden endpoint validation and authorization.
8. Add a dashboard and consider external queue integration only when useful.

## Testing strategy

- Successful delivery and non-2xx responses.
- Network timeout and receiver unavailable scenarios.
- Duplicate event submission and idempotency-key collisions.
- Worker interruption and stale-claim recovery.
- Retry limit and dead-letter transitions.
- Signature verification, timestamp tolerance, and replay-related cases.
- SSRF policy tests for prohibited destinations and redirects.
- Concurrent worker tests against real database transactions.
- Tests that confirm secrets and payload contents do not leak into logs.

## Current status

This repository currently contains the project brief and MIT license. The delivery engine, retry logic, dashboard, and security controls are planned and have not yet been verified in code.

## Author & Development

**Project author and solo developer:** [Nurul Faiyaz](https://github.com/tracolerd).

This project is independently developed and maintained by Nurul Faiyaz. AI-assisted tools may be used as part of the development workflow; the project author remains responsible for technical decisions, code review, validation, and maintenance.

## License

MIT. See [LICENSE](LICENSE).
