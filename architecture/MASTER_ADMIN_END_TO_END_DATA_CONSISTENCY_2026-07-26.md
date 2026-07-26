# Master Admin — End-to-End Data Consistency (Phase 2E.6)

**Date:** 2026-07-26  
**Version:** V4.9.896

## Summary

Phase 2E.6 audits the full data pipeline from DIMO ingestion through PostgreSQL, workers, ClickHouse, dashboard, AI, notifications, and workflow automation. PostgreSQL remains the canonical system of record; ClickHouse is a best-effort analytics mirror.

## Pipeline truth model

```
DIMO → Backend/Workers → PostgreSQL (canonical)
                              ├─► ClickHouse (analytics mirror, optional)
                              ├─► Notifications (fingerprint dedupe)
                              ├─► Workflows (idempotency keys)
                              └─► AI tools (PG-only reads)
Dashboard reads PG primary; CH for debug/evidence only.
```

## Key findings

| Station | Status | Top gap |
|---------|--------|---------|
| DIMO | Strong IDs, global mirror | Org only after registration |
| PostgreSQL | Strong uniques/FKs | `vehicle_trips` lacks `organization_id` |
| Workers | Deterministic job IDs | CH mirror fire-and-forget |
| ClickHouse | Partial org attribution | `telemetry_snapshots` no `org_id` |
| Dashboard | Org-scoped APIs | CH block empty when mirror off |
| AI | PG-only, context-bound | By design no CH |
| Notifications | Fingerprint dedupe | V1/V2 parallel during pilot |
| Workflows | Run idempotency | `scheduleEmit` no outbox |

## P1 remediation targets

1. Add `org_id` to CH snapshot tables + backfill
2. CH replay design after outage
3. Run waypoint `org_id` backfill in production

## References

- `docs/remediation/end-to-end-data-consistency.md`
- `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`
