# Master Admin — ClickHouse Pipeline Analysis (Phase 2D.6)

**Date:** 2026-07-26  
**Type:** End-to-end analytics pipeline analysis (not applied)

---

## Summary

Phase 2D.6 traces the full analytics data path:

```
DIMO → BullMQ → DimoSnapshotProcessor → PostgreSQL → ClickHouse → Analytics → Dashboard
```

Post-trip branch: trip finalize → enrichment queue → HF/waypoint/activity mirrors.

### Key findings

| Dimension | Verdict |
|-----------|---------|
| Completeness | PG canonical; CH best-effort; HF/waypoint/activity mirrors default **off** |
| Latency | ~30s poll + async CH write; enrichment minutes post-trip |
| Duplicates | Snapshot/state-change append-only — retry risk; HF/waypoints have trip guards |
| Lost events | No CH DLQ — outage = permanent gap |
| Ordering | Per-vehicle jobId + VLS monotonic guard |
| Retry | BullMQ 3× on jobs; CH inserts not retried |
| Idempotency | Partial — ReplacingMergeTree tables safe; snapshots are not |

### Top risks (P1–P2)

1. Async CH mirror failure does not fail the snapshot job.
2. Snapshot duplicates possible on BullMQ retry after PG commit.
3. Mirror feature flags default off — analytics tables may be empty despite live polls.

## Deliverables

- `docs/remediation/clickhouse-pipeline-analysis.md`
- `backend/scripts/ops/vps-clickhouse-pipeline-audit.sh`

## No changes in 2D.6

Pipeline behavior documented only — no outbox, dedup, or flag changes implemented.

## References

- `docs/remediation/clickhouse-pipeline-analysis.md`
- Prior phases 2D.1–2D.5 remediation docs
