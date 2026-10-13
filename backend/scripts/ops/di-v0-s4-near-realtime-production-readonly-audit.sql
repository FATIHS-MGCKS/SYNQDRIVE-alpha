-- EXP021 PR #2001 — read-only production posture for near-realtime rollout (run on VPS via postgres).
-- Wave-3 org and five vehicles; adjust if allowlist changes.

\set ON_ERROR_STOP on

SELECT 'GLOBAL_KILL' AS probe, kill_state::text FROM di_v0_s4_control WHERE id = 'GLOBAL';

SELECT 'PENDING_LEGACY_24H' AS segment, count(*)::int
FROM di_v0_s4_work_items w
WHERE w.status IN ('PENDING', 'FAILED_RETRYABLE')
  AND abs(extract(epoch FROM (w.eligible_at - w.settlement_anchor_at)) - 86400) < 3;

SELECT 'PENDING_NEAR_600' AS segment, count(*)::int
FROM di_v0_s4_work_items w
WHERE w.status IN ('PENDING', 'FAILED_RETRYABLE')
  AND abs(extract(epoch FROM (w.eligible_at - w.settlement_anchor_at)) - 600) < 3;

SELECT 'TRIPS_HELD_24H_QUIET' AS metric, count(*)::int
FROM vehicle_trips t
JOIN vehicles v ON v.id = t.vehicle_id
WHERE v.organization_id = 'faa710c9-6d91-4079-a7d5-91fdccdec14a'
  AND t.vehicle_id IN (
    'c10351f8-0e0b-4c8a-9f3a-8b2e6a1d4f90',
    '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    '68868291-8c4a-4b2e-9f3a-1d4f90e0b0c8',
    '8c850ff1-3a1d-4f90-b0c8-4b2e9f3a8c4a',
    'c43c3b45-9f3a-8c4a-b2e6-1d4f908c4a3b'
  )
  AND t.trip_status = 'COMPLETED'
  AND t.end_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM di_v0_s4_work_items w
    WHERE w.trip_id = t.id AND w.run_purpose = 'PRIMARY' AND w.status <> 'SUPERSEDED'
  )
  AND (
    SELECT GREATEST(
      t.end_time AT TIME ZONE 'UTC',
      t.created_at AT TIME ZONE 'UTC',
      coalesce((SELECT max(r.applied_at) FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'APPLIED'), t.end_time) AT TIME ZONE 'UTC'
    )
  ) + interval '24 hours' > clock_timestamp()
  AND (
    SELECT GREATEST(
      t.end_time AT TIME ZONE 'UTC',
      t.created_at AT TIME ZONE 'UTC',
      coalesce((SELECT max(r.applied_at) FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'APPLIED'), t.end_time) AT TIME ZONE 'UTC'
    )
  ) + interval '10 minutes' <= clock_timestamp();
