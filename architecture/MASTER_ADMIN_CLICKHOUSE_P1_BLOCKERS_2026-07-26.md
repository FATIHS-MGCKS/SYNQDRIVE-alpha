# Master Admin — ClickHouse P1 Blocker Fixes

**Date:** 2026-07-26

## Summary

Closes open P1 blockers from Phase 2D.8 production readiness:

| ID | Fix |
|----|-----|
| P1-PL1 | `clickhouse.mirror.retry` BullMQ queue + dedup |
| P1-T1 | `ClickHouseOrgIdBackfillService` + env flag |
| P1-T9 | `org_id` predicates on analytics reads |
| P1-DR | `disaster-recovery-production-readiness.md` |

## References

- `docs/remediation/clickhouse-production-readiness.md` §10.2 (updated)
