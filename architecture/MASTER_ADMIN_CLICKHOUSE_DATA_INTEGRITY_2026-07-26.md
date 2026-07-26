# Master Admin — ClickHouse Data Integrity (Phase 2D.3)

**Date:** 2026-07-26  
**Type:** Data integrity analysis framework (no repairs executed)

---

## Summary

Phase 2D.3 documents integrity checks for all 8 productive `synqdrive.*` analytics tables:

- Damaged / missing parts (`CHECK TABLE`, `system.parts`)
- Detached orphaned parts (`system.detached_parts`)
- ReplacingMergeTree duplicate pressure (expected until merge)
- Partition fragmentation and TTL drift
- Engine / ORDER BY drift vs migrations 001–006

## Productive tables

| Table | Engine | TTL |
|-------|--------|-----|
| `telemetry_snapshots` | MergeTree | 180d |
| `telemetry_state_changes` | MergeTree | 365d |
| `telemetry_waypoints` | MergeTree | 365d |
| `trip_activity_windows` | ReplacingMergeTree | 365d |
| `trip_segment_candidates` | ReplacingMergeTree | 180d (expected empty) |
| `telemetry_hf_points` | MergeTree | 90d |
| `telemetry_hf_windows` | ReplacingMergeTree | 180d |
| `telemetry_hf_events` | ReplacingMergeTree | 365d |

## Deliverables

- `docs/remediation/clickhouse-data-integrity.md`
- `backend/scripts/ops/vps-clickhouse-data-integrity-audit.sh`

## Live status

Production metrics and `CHECK TABLE` results **pending VPS audit**.

## No changes in 2D.3

- No `OPTIMIZE`, `ATTACH`, `ALTER`, or data mutations
- PostgreSQL canonical truth untouched

## References

- `docs/remediation/clickhouse-data-integrity.md`
- `docs/remediation/clickhouse-storage-topology.md` (2D.2)
