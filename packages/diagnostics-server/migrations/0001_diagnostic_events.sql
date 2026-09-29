CREATE TABLE IF NOT EXISTS diagnostic_events (
  event_id text PRIMARY KEY,
  trace_id char(32) NOT NULL,
  span_id char(16) NOT NULL,
  flow_run text,
  occurred_at bigint NOT NULL,
  event jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS diagnostic_events_trace_idx
  ON diagnostic_events (trace_id, occurred_at, event_id);
CREATE INDEX IF NOT EXISTS diagnostic_events_flow_run_idx
  ON diagnostic_events (flow_run, occurred_at, event_id)
  WHERE flow_run IS NOT NULL;

-- Run daily with an authorized maintenance role; retention is 14 days.
-- DELETE FROM diagnostic_events WHERE occurred_at < (EXTRACT(EPOCH FROM now() - INTERVAL '14 days') * 1000)::bigint;
