# Master Admin — ClickHouse Performance (Phase 2D.5)

**Date:** 2026-07-26  
**Type:** Performance analysis + optimization recommendations (not applied)

---

## Summary

Phase 2D.5 analyzes ClickHouse runtime performance across CPU/RAM, inserts, merges, queries, compression, indexes, partitions, and storage policy.

### Top bottlenecks (suggestions only)

| ID | Issue | Suggestion |
|----|-------|------------|
| B1 | Single-row snapshot inserts (~30s poll) | `async_insert` or micro-batching |
| B2 | No Docker CPU/RAM limits | Add compose resource caps |
| B3 | Data Analyse 7d multi-column scans | Narrow window / cache |
| B4 | `FINAL` on ReplacingMergeTree reads | Scheduled OPTIMIZE |

### Assessment

Monthly partitioning and `vehicle_id`-leading ORDER BY are appropriate for current query patterns. Primary risk is **merge pressure** from granular inserts on a small VPS.

## Deliverables

- `docs/remediation/clickhouse-performance.md`
- `backend/scripts/ops/vps-clickhouse-performance-audit.sh`

## No changes in 2D.5

Optimizations documented only — not implemented.

## References

- `docs/remediation/clickhouse-performance.md`
