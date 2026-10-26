-- Endpoints: Webhook receivers
CREATE TABLE IF NOT EXISTS endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Events: The actual payloads received from producers
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(endpoint_id, idempotency_key)
);
-- Deliveries: The state machine for event delivery
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'SCHEDULED', 'DEAD_LETTERED')) DEFAULT 'PENDING',
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Delivery Attempts: History of each webhook push
CREATE TABLE IF NOT EXISTS delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    status_code INT,
    response_duration_ms INT,
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Audit Events: For tracking dead-letter transitions and replays
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Index to quickly find pending or scheduled deliveries for workers
CREATE INDEX IF NOT EXISTS idx_deliveries_worker_fetch ON deliveries (status, next_attempt_at) WHERE status IN ('PENDING', 'SCHEDULED');
