# Project State: OutboxWorks
## Mission
Producer event durableভাবে গ্রহণ করা, signed webhook পাঠানো, retry attempts track করা, dead-letter handling এবং controlled replay দেওয়া।
## Current Phase
**Completed**: All MVP Phases (0 to 6) successfully implemented and verified.
## Tech Stack
Node.js v24.13.0, TypeScript, PostgreSQL 16.4. Dependencies: express, pg, zod, ipaddr.js.
## Completed Milestones
- [x] Phase 0-3: Environment, DB schema, Idempotent Enqueue API, Worker, Webhook Signing.
- [x] Phase 4: Retry limits, dead-lettering, and authorized replay endpoint.
- [x] Phase 5: SSRF hardening tests and DNS resolution checks.
- [x] Phase 6: Monitoring APIs and Dashboard UI.
