<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0B1723,50:0F766E,100:111827&height=190&section=header&text=OutboxWorks&fontSize=42&fontColor=F1F5F9&fontAlignY=38&animation=fadeIn&desc=Planned%20webhook%20delivery%20with%20observable%20retries%20and%20explicit%20failure%20states&descAlignY=61&descSize=15" alt="OutboxWorks animated project banner" width="100%" />
</p>
<h1 align="center">OutboxWorks</h1>
<p align="center"><img src="https://img.shields.io/badge/Stage-Planning-8B5CF6" alt="Planning stage" /></p>


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
---

## Creator, Developer & Maintainer

**Created, designed, developed, and maintained by [Nurul Faiyaz](https://github.com/tracolerd).**

This project is independently built and maintained by Nurul Faiyaz. The project's design, implementation, and documentation are his work.

<p align="center">
  <a href="https://www.facebook.com/faiyaz.888"><img src="https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white" alt="Facebook" /></a>
  <a href="https://www.instagram.com/tracolerd"><img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram" /></a>
  <a href="https://www.linkedin.com/in/faiyaz-xyz"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
  <a href="https://x.com/faiyaz_explores"><img src="https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white" alt="X" /></a>
  <a href="https://github.com/tracolerd"><img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
  <a href="mailto:scrollfaiyaz@gmail.com"><img src="https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Email" /></a>
  <a href="https://nurul-faiyaz.netlify.app/"><img src="https://img.shields.io/badge/Portfolio-Visit%20Website-0F766E?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Personal website" /></a>
</p>

<p align="center">
  <a href="https://www.facebook.com/faiyaz.888">Facebook</a> ·
  <a href="https://www.instagram.com/tracolerd">Instagram</a> ·
  <a href="https://www.linkedin.com/in/faiyaz-xyz">LinkedIn</a> ·
  <a href="https://x.com/faiyaz_explores">X / Twitter</a> ·
  <a href="https://github.com/tracolerd">GitHub</a> ·
  <a href="mailto:scrollfaiyaz@gmail.com">Email</a> ·
  <a href="https://nurul-faiyaz.netlify.app/">Website</a>
</p>

## License

MIT. See [LICENSE](LICENSE).