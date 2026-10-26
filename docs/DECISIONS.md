# Architecture Decisions
## 001. Local PostgreSQL without Docker
**Date**: 2026-10-26
**Context**: The host Windows environment lacks Docker/Docker Compose.
**Decision**: We will use the locally installed PostgreSQL 16.4 for durable state. MVP will rely on local connection strings.
**Consequences**: Developer must ensure a local \outboxworks\ database and user are created manually via psql.
## 002. At-Least-Once Delivery
**Date**: 2026-10-26
**Context**: Webhook delivery over unreliable networks.
**Decision**: The system will guarantee at-least-once delivery attempts. Receivers must implement idempotency. We do not claim exactly-once remote execution.
