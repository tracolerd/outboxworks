# OutboxWorks Production Readiness Plan
## Baseline Information
- **Date**: 2026-10-26
- **Target Branch**: hardening/production-readiness
- **Baseline Commit**: 6c11765
## Phase 0: Prioritized Audit Findings
### Critical Severity
1. **Worker Transaction Held During I/O (Reliability)**: The worker holds a PostgreSQL transaction (BEGIN) open while making the external HTTP etch. This can cause database connection pool exhaustion and lock contention.
2. **Plaintext Endpoint Secrets (Security)**: endpoints.secret is stored in plaintext in the database.
3. **No Authentication (Security)**: The enqueue (/events) and dashboard APIs are entirely unprotected. 
### High Severity
4. **Dashboard XSS Risk (Security)**: public/index.html interpolates API data directly via innerHTML.
5. **Insecure Defaults (Security)**: The replay API falls back to a hardcoded dev-admin-secret if ADMIN_SECRET is missing.
### Medium Severity
6. **No Graceful Shutdown (Reliability)**: API and worker processes do not handle SIGINT/SIGTERM, leading to aborted queries and unclosed DB pools on restart.
7. **No CI/CD Pipeline (Automation)**: Missing GitHub Actions workflow for automated testing and type checking.
## Phase 0 Checklist
- [x] Local and remote states compared.
- [x] Safe branch created (hardening/production-readiness).
- [x] Audit findings documented.
## Phase 1: Runtime, Package, and Configuration Foundation
- [x] Standardized package scripts (build, test, start).
- [x] Enforced strict configuration without insecure defaults.
- [x] Graceful shutdown implemented for API server.
- [x] Fixed TypeScript typing issues for strict mode.
## Phase 2: Database Integrity and Migrations
- [x] Implemented version-controlled migration system (schema_migrations).
- [x] Refactored db.ts to enforce max connection pool limits and timeouts.
- [x] Tested migration integrity within isolated database transactions.
