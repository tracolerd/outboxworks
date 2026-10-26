<!--
  OutboxWorks — audited project documentation.
  This README describes the merged implementation on the default `main` branch.
-->

<p align="center">
  <img src="assets/outboxworks-banner.svg" alt="OutboxWorks — durable event delivery, observable retries, and explicit failure states" width="100%" />
</p>

<h1 align="center">OutboxWorks</h1>

<p align="center">
  <strong>Durable events. Observable retries. Explicit failure states.</strong><br/>
  A TypeScript and PostgreSQL webhook-delivery service exploring idempotent enqueueing, signed outbound requests, retry scheduling, dead-letter handling, and operator monitoring.
</p>

<p align="center">
  <a href="https://github.com/tracolerd/outboxworks/actions/workflows/ci.yml"><img src="https://github.com/tracolerd/outboxworks/actions/workflows/ci.yml/badge.svg?branch=main" alt="OutboxWorks CI status on hardening branch" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2563EB?style=for-the-badge" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Runtime-Node.js%2024-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Stage-Hardened%20Portfolio%20MVP-D97706?style=for-the-badge" alt="Hardened portfolio MVP" />
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#capabilities">Capabilities</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#verification">Verification</a> ·
  <a href="#security-review-and-known-limitations">Security review</a>
</p>

---

> [!IMPORTANT]
> **The hardening snapshot is merged into `main`.** It was merged through [PR #2](https://github.com/tracolerd/outboxworks/pull/2) as commit [`bd49108`](https://github.com/tracolerd/outboxworks/commit/bd49108de60997508c67a5eb8011dc7617c4c714). The release candidate passed the configured [GitHub Actions checks](https://github.com/tracolerd/outboxworks/actions/runs/40355627588) and the [GitGuardian secret scan](https://github.com/tracolerd/outboxworks/runs/121687208999). The workflow covers dependency installation, type checking, compilation, PostgreSQL migration setup, and the configured test suite. This is automated verification, not an independent penetration test or production deployment.
>
> **Release status: hardened portfolio MVP; public production exposure is not recommended yet.** Remaining items include broader IPv4/IPv6 SSRF coverage, a tested migration path from older plaintext-secret databases, stale-worker claim fencing, rate limiting/quotas, dependency vulnerability auditing, and deployment/backup/recovery verification. See the security review below.

## Overview

OutboxWorks is a small event-delivery service for applications that need to send webhooks reliably. Direct HTTP calls alone do not provide durable queueing: a receiver may be down, a request may time out, or a sender may lose the response after the receiver has already processed the event.

This project stores events and delivery state in PostgreSQL, uses a worker to attempt delivery, signs outbound payloads with HMAC-SHA256, records attempt results, schedules bounded retries, and moves exhausted deliveries to a dead-letter state. Operators can inspect endpoints and recent delivery states through a minimal server-served dashboard.

The hardening branch also introduces separate Admin and Producer bearer-token checks, AES-256-GCM encryption for newly stored endpoint secrets, a request-body size limit, versioned SQL migration tracking, safer dashboard DOM rendering, and a GitHub Actions pipeline.

OutboxWorks is a learning and portfolio project focused on reliability and defensive engineering. It is not a managed webhook SaaS, and the remaining issues in the security review must be resolved before treating it as a generally exposed production service.

## Capabilities

| Area | Current implementation | Scope and caveat |
|---|---|---|
| Durable enqueue | `POST /events` inserts an event and its `PENDING` delivery in one PostgreSQL transaction | Requires a Producer bearer token |
| Idempotency | Unique constraint on `(endpoint_id, idempotency_key)` prevents duplicate enqueue records for the same endpoint/key pair | Reusing a key with a different payload returns an idempotent response; payload equivalence is not checked |
| Endpoint management | `POST /endpoints` validates the URL and encrypts the supplied signing secret using AES-256-GCM before storage | Requires an Admin bearer token; key rotation and migration of older plaintext values need more work |
| Outbound signing | HMAC-SHA256 signs the serialized payload with a timestamp; header name is `OutboxWorks-Signature` | Receiver must verify the exact raw payload, timestamp and digest |
| SSRF controls | URL validation at registration plus a custom lookup in the HTTP sender; redirects are rejected | Additional reserved/IPv6 range coverage and direct-IP regression cases are still required |
| Retry scheduling | Worker uses a five-attempt limit and exponential delays capped at one hour | The current policy is fixed; jitter and `Retry-After` handling are not implemented |
| Worker coordination | PostgreSQL `FOR UPDATE SKIP LOCKED` claims eligible work; claim and delivery-result writes use short transactions around the network call | A fencing/claim-ownership check is still needed to rule out stale-worker result writes in edge cases |
| Attempt history | Stores response status, duration, failure reason, and creation time | A protected endpoint for complete attempt history is not implemented |
| Dead-letter replay | Admin-protected `POST /deliveries/:id/replay` resets an eligible dead-lettered delivery and writes an audit event | Replay is an at-least-once operation; inspect the historical attempt records before replaying |
| API hardening | Admin/Producer token separation, Zod validation, JSON body limit of 100 KB, health and readiness routes | No rate-limit or quota layer is currently configured |
| Monitoring | Protected API routes expose endpoint metadata and the 50 most recently updated deliveries | Minimal UI; not a complete incident-management or metrics platform |
| Dashboard | Static HTML/CSS/JavaScript served by Express; user-supplied endpoint values are rendered through text nodes | Admin token is manually entered; use only over a trusted local connection or an appropriately secured HTTPS deployment |
| Automated CI | GitHub Actions installs dependencies, type-checks, builds, initializes a PostgreSQL schema and runs tests | No deployment workflow, comprehensive end-to-end/load suite, or dedicated dependency-audit step is configured |

## Delivery lifecycle

~~~mermaid
flowchart TD
    A[Producer] --> B[POST /events]
    B --> C{Valid token and payload?}
    C -- No --> D[Reject request]
    C -- Yes --> E[PostgreSQL transaction]
    E --> F[Persist event and PENDING delivery]
    F --> G[Worker claims eligible delivery]
    G --> H[Decrypt endpoint secret]
    H --> I[Sign payload with HMAC-SHA256]
    I --> J[Validate destination at send boundary]
    J --> K[HTTP POST]
    K --> L{2xx response?}
    L -- Yes --> M[DELIVERED]
    L -- No --> N{Attempts exhausted?}
    N -- No --> O[SCHEDULED retry]
    O --> G
    N -- Yes --> P[DEAD_LETTERED and audit event]
    P --> Q[Admin-authorized replay]
    Q --> G
    M --> R[Protected monitoring API]
    P --> R
    R --> S[Monitoring dashboard]
~~~

### Delivery states

| State | Meaning |
|---|---|
| `PENDING` | The event is durably queued and waiting for a worker |
| `IN_PROGRESS` | A worker has claimed the delivery under a temporary lease |
| `SCHEDULED` | A failed delivery is waiting for its next attempt |
| `DELIVERED` | The receiver returned a 2xx HTTP response |
| `DEAD_LETTERED` | The configured attempt limit was reached; an operator may request a replay |

### Delivery semantics: at-least-once attempts

OutboxWorks does not guarantee exactly-once remote execution. A receiver can perform its work and the sender can still lose the response or fail before recording the outcome. That can lead to another attempt.

Consumers should verify the `OutboxWorks-Signature` header, enforce their own idempotency for business side effects, and treat webhook delivery as an at-least-once interaction. A 2xx response shows that the receiver returned a successful HTTP status; it does not prove that the entire downstream business workflow completed exactly once.

## Architecture

~~~mermaid
flowchart LR
    subgraph API[Express API]
      A[Zod request validation]
      B[Admin / Producer token middleware]
      C[URL policy and encrypted secret storage]
      A --> B --> C
    end
    subgraph PostgreSQL
      E[(endpoints)]
      V[(events)]
      D[(deliveries)]
      T[(delivery_attempts)]
      U[(audit_events)]
      S[(schema_migrations)]
    end
    subgraph DeliveryWorker
      W[Claim with SKIP LOCKED]
      K[Decrypt secret and sign]
      H[HTTP sender and DNS lookup policy]
      R[Persist outcome / schedule retry]
      W --> K --> H --> R
    end
    subgraph Monitoring
      M[Protected monitoring endpoints]
      UI[Static dashboard]
      M --> UI
    end
    C --> E
    C --> V
    C --> D
    D --> W
    R --> D
    R --> T
    R --> U
    V --> M
    E --> M
    D --> M
~~~

### PostgreSQL tables

| Table | Responsibility |
|---|---|
| `endpoints` | Destination URL, encrypted endpoint secret, and creation time |
| `events` | JSON payload and idempotency key scoped to an endpoint |
| `deliveries` | Current state, attempt count, next attempt time, lease and timestamps |
| `delivery_attempts` | Per-attempt HTTP result, latency, failure reason and timestamp |
| `audit_events` | Records important transitions such as dead-lettering and manual replay |
| `schema_migrations` | Tracks applied SQL migration filenames |

SQL migrations live under `src/migrations/`. The migration runner tracks applied filenames and executes a new migration in a transaction. The current history begins with an initial-schema migration; it should not be treated as a complete upgrade path for every database created by earlier revisions of the project.

## API reference

The route definitions are in `src/api.ts`.

| Method | Route | Required credential | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Lightweight process liveness response |
| `GET` | `/ready` | None | Checks database connectivity for readiness |
| `POST` | `/endpoints` | Admin | Register a webhook destination and encrypt its secret |
| `POST` | `/events` | Producer | Enqueue a JSON event with an idempotency key |
| `POST` | `/deliveries/:id/replay` | Admin | Replay a dead-lettered delivery and record an audit event |
| `GET` | `/api/endpoints` | Admin | List endpoint URLs and creation timestamps |
| `GET` | `/api/deliveries` | Admin | List the most recent 50 delivery records |

Authentication currently uses static shared bearer secrets configured through environment variables. This is a deliberately small single-service trust model, not an identity-provider integration or a full user/role administration system. Use unique, high-entropy values and transmit them only over a trusted local connection or HTTPS.

### Register an endpoint

Send this JSON to `POST /endpoints` using the Admin bearer token:

~~~json
{
  "url": "https://receiver.example.com/webhooks/outboxworks",
  "secret": "replace-with-a-unique-secret-at-least-16-chars"
}
~~~

The response includes the generated endpoint UUID and URL. The supplied signing secret is encrypted for storage using the configured application encryption key. It is not returned by the monitoring API.

### Enqueue an event

Send this JSON to `POST /events` using the Producer bearer token. Replace the placeholder with an existing endpoint UUID.

~~~json
{
  "endpoint_id": "REPLACE_WITH_ENDPOINT_UUID",
  "payload": {
    "event": "invoice.created",
    "invoice_id": "demo-invoice-001"
  },
  "idempotency_key": "invoice.created:demo-invoice-001"
}
~~~

A newly accepted event returns HTTP 201. A duplicate endpoint/key combination returns an idempotent response without creating a second event record. The API currently does not compare the repeated payload with the payload from the original request.

### Signature format

The outbound sender includes a header in this form:

~~~text
OutboxWorks-Signature: t=<timestamp>,v1=<hex-digest>
~~~

The digest is HMAC-SHA256 over `<timestamp>.<serialized-payload>`. The timestamp is expressed in milliseconds. `src/signer.ts` provides generation and verification helpers, including a five-minute default timestamp tolerance and constant-time digest comparison. A receiving service must apply verification to the exact serialized payload and reject stale signatures.

## Technology

| Layer | Technology |
|---|---|
| Runtime | Node.js 24.x |
| Language and module system | TypeScript, ES modules, NodeNext compilation |
| API | Express 5 |
| Validation and configuration | Zod, dotenv |
| Database | PostgreSQL 16, `pg` |
| Secret encryption | Node.js crypto, AES-256-GCM |
| Webhook signatures | HMAC-SHA256 |
| Destination validation | Node.js HTTP/HTTPS and DNS APIs, `ipaddr.js` |
| Tests | Node.js built-in test runner through `tsx` |
| Automation | GitHub Actions with a PostgreSQL service container |
| Dashboard | Static HTML, CSS and browser JavaScript |
| License | MIT |

## Run locally

The steps below are intended for a **local development environment with a disposable database** using the merged `main` branch.

### Prerequisites

- Git
- Node.js 24.x and npm
- PostgreSQL 16.x and `psql`
- Windows PowerShell

### 1. Clone the hardening branch

~~~powershell
git clone https://github.com/tracolerd/outboxworks.git
Set-Location .\outboxworks
npm ci
~~~

### 2. Configure environment variables

The checked-in `.env.example` lists all required variable names, but secret and database-password values are intentionally blank. Fill them with locally generated credentials before startup. Never commit the resulting `.env` file or reuse local values in production.

Generate three separate high-entropy values in PowerShell:

~~~powershell
$adminSecret = (& node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))").Trim()
$producerSecret = (& node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))").Trim()
$encryptionKey = (& node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))").Trim()
~~~

Create the local configuration, replacing the PostgreSQL password with your local database role's password:

~~~powershell
$envContent = @"
NODE_ENV=development
PORT=3000
ADMIN_SECRET=$adminSecret
PRODUCER_SECRET=$producerSecret
ENCRYPTION_KEY=$encryptionKey
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=REPLACE_WITH_YOUR_LOCAL_POSTGRES_PASSWORD
DB_NAME=outboxworks
"@

[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) ".env"),
  $envContent,
  [System.Text.UTF8Encoding]::new($false)
)
~~~

Keep the generated values private. The encryption key must remain stable for as long as encrypted endpoint secrets depend on it. Losing the key makes those secrets undecryptable; replacing it requires a planned re-encryption/rotation procedure.

### 3. Create a dedicated local database

If the database does not already exist:

~~~powershell
psql -U postgres -c "CREATE DATABASE outboxworks;"
~~~

Do not point the test workflow or migration command at a database containing valuable data. **Do not run the initial migration blindly against an older OutboxWorks database.** The current migration set does not establish a fully verified conversion path for existing plaintext endpoint secrets.

### 4. Initialize the schema

From the repository root:

~~~powershell
npm exec tsx -- src/migrate.ts
~~~

The migration runner applies the checked-in SQL files under `src/migrations/`. Review the migration output and stop if it reports an error.

### 5. Type-check, build, and test

~~~powershell
npm run typecheck
npm run build
npm test
~~~

The integration tests require a reachable PostgreSQL instance and the configured test credentials. Some SSRF policy tests perform DNS lookups and therefore depend on network/DNS availability. The suite is not a substitute for full worker concurrency, adversarial network, load, or deployment testing.

### 6. Start the API

After a successful build:

~~~powershell
npm start
~~~

The server listens on port `3000` by default, or on the port configured by `PORT`. In a browser, the local dashboard is served from the same origin. Enter the local Admin bearer token only in a trusted local session.

### 7. Start the worker

Open a second PowerShell terminal in the project directory, using the same private environment configuration:

~~~powershell
npm run worker
~~~

Keep PostgreSQL running. Stop the development processes with Ctrl+C. Do not expose this setup to an untrusted network as-is.

## Verification

The checked-in GitHub Actions workflow is at `.github/workflows/ci.yml`. Its current pipeline performs:

1. Dependency installation using `npm ci`.
2. Type checking via `npm run typecheck`.
3. Compilation via `npm run build`.
4. PostgreSQL-backed migration setup.
5. The automated Node.js test suite.

The release candidate passed [PR CI run #9](https://github.com/tracolerd/outboxworks/actions/runs/40355627588) on commit [`8b5b2f0`](https://github.com/tracolerd/outboxworks/commit/8b5b2f0877582a46416f5ff2ed390a1a86010df0), plus the GitGuardian secret scan. After merge, [main CI run #14](https://github.com/tracolerd/outboxworks/actions/runs/40356473820) also passed for commit [`aee3122`](https://github.com/tracolerd/outboxworks/commit/aee3122eb8556a2049c159d490c02e3f105e0b38). The current `main` badge above and the [Actions page](https://github.com/tracolerd/outboxworks/actions) show the status of later changes.

**The CI result must be read within its scope.** It does not establish that SSRF protection covers every special-purpose address, that old databases migrate without data loss, that multiple workers remain safe under every lease-expiry race, or that the service has passed independent security, load, recovery, or production deployment testing. The workflow also does not currently run a dedicated `npm audit` step.

The current test files cover API enqueue/idempotency and authorization cases, HMAC signature behavior, selected SSRF cases, secret encryption, and migration behavior. They do not yet constitute comprehensive end-to-end verification of every failure mode.

## Security review and known limitations

This section reflects a source-level review of the current `hardening/production-readiness` branch. It is not a penetration test, external security certification, or statement that all issues are fixed.

### High-priority items before public production exposure

1. **Complete SSRF range handling.** The outbound lookup blocks several address classes, but the current denylist does not cover every reserved IPv4/IPv6 range (including IPv6 unique-local/reserved categories) and needs explicit tests for IP-literal destinations. Do not treat the existing SSRF controls as a complete egress security boundary.
2. **Safe migration from older data.** The migration history begins with an initial schema using `CREATE TABLE IF NOT EXISTS`. It does not provide a verified data migration from an older database that stores endpoint secrets in plaintext to the current AES-GCM ciphertext representation. Use a clean disposable database for the documented setup until a backup-aware conversion migration is implemented and tested.
3. **Worker claim ownership.** The worker releases its database connection during the HTTP request, which avoids holding the transaction open across network I/O. The result update still needs a claim-token/fencing or equivalent ownership guard to prevent a stale worker from overwriting the outcome of a later claim in rare lease-expiry scenarios.
4. **Rate limiting and quotas.** Authentication and a 100 KB JSON body limit are present, but there is no configured request-rate or durable-queue quota policy. Add suitable controls before accepting requests from untrusted producers.
5. **Shared bearer credentials.** Admin and Producer permissions use long-lived shared bearer secrets from environment configuration, not per-user identities, short-lived credentials, or a managed identity provider. Restrict distribution, plan rotation, and transmit them only over a trusted local connection or HTTPS.
6. **Deployment and recovery.** TLS termination, production secret distribution/rotation, backup restoration drills, service monitoring, data retention, and a deployment rollback procedure are not verified by the repository. These require an explicit deployment environment and operational tests.

### Additional reliability and maintenance notes

- `/ready` should be tested for connection cleanup on the database-error path, not only the healthy path.
- Retry policy currently uses fixed attempt limits and exponential backoff without jitter or a documented `Retry-After` strategy.
- The API does not yet provide pagination/filtering or a protected complete delivery-attempt/audit history endpoint.
- The current CI run succeeded, but dependency vulnerability auditing and broad end-to-end or load tests are not part of the workflow.
- A successful 2xx response cannot establish exactly-once remote business execution.

Use synthetic payloads and development-only credentials. Restrict access to the local development environment, protect the encryption key, and do not interpret a green CI badge or a visible dashboard as proof that the service is production-safe.

## Repository layout

~~~text
.
├── assets/
│   └── outboxworks-banner.svg
├── docs/
│   ├── DECISIONS.md
│   ├── PROJECT_STATE.md
│   └── PRODUCTION_READINESS_PLAN.md
├── public/
│   └── index.html
├── src/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── api.ts
│   ├── api.test.ts
│   ├── auth.ts
│   ├── auth.test.ts
│   ├── config.ts
│   ├── crypto.ts
│   ├── crypto.test.ts
│   ├── db.ts
│   ├── health.ts
│   ├── migrate.ts
│   ├── migrate.test.ts
│   ├── sender.ts
│   ├── server.ts
│   ├── signer.ts
│   ├── signer.test.ts
│   ├── ssrf.ts
│   ├── ssrf.test.ts
│   └── worker.ts
├── .github/workflows/ci.yml
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
└── LICENSE
~~~

---

## Creator, Developer & Maintainer

**Created, designed, developed, and maintained by [Nurul Faiyaz](https://github.com/tracolerd).**

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
  <a href="https://nurul-faiyaz.netlify.app/">Portfolio</a>
</p>

## License

MIT. See [LICENSE](LICENSE).
