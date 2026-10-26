# Project State: OutboxWorks
## Mission
Producer event durableভাবে গ্রহণ করা, signed webhook পাঠানো, retry attempts track করা, dead-letter handling এবং controlled replay দেওয়া।
## Current Phase
**Phase 2**: Durable enqueue and transaction-backed idempotency.
## Tech Stack
Node.js v24.13.0, npm v11.6.2, TypeScript, PostgreSQL 16.4 (Local Database). Dependencies include express, pg, zod.
## Completed Milestones
- [x] Phase 0: Environment inspection (Docker unavailable, using local Postgres).
- [x] Phase 1: Project scaffolding, config validation, and database migration.
- [ ] Phase 2: Durable enqueue API.
