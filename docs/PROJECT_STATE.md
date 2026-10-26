# Project State: OutboxWorks
## Mission
Producer event durableভাবে গ্রহণ করা, signed webhook পাঠানো, retry attempts track করা, dead-letter handling এবং controlled replay দেওয়া।
## Current Phase
**Phase 3**: Single worker, local receiver, signing and attempt history.
## Tech Stack
Node.js v24.13.0, TypeScript, PostgreSQL 16.4. Dependencies: express, pg, zod.
## Completed Milestones
- [x] Phase 0 & 1: Environment inspection, scaffolding, config validation, database migration.
- [x] Phase 2: Durable enqueue API and transaction-backed idempotency.
- [ ] Phase 3: Webhook signing, HTTP sender utility, and worker logic.
