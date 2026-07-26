# Master Admin — ClickHouse Remediation (Phase 2D.7)

**Date:** 2026-07-26  
**Type:** Controlled remediation execution (repo + ops)

---

## Summary

Phase 2D.7 implements approved remediation from analyses 2D.1–2D.6:

| Change | Source |
|--------|--------|
| G1 backup + orchestrator | 2D.2 |
| M1–M4 storage topology | 2D.2 |
| Migration 007 + org_id writes | 2D.4 |
| async_insert + resource limits | 2D.5 |
| Health/integrity gates per step | 2D.3, 2D.6 |

## Safety contract

- Backup before any mount/container change
- Named volumes preserved on recreate
- Integrity + health audit after each step
- Rollback documented — no `down -v`, no DROP

## Deliverables

- `docs/remediation/clickhouse-remediation.md`
- `backend/docker-compose.vps-clickhouse.yml`
- `backend/docker/clickhouse/config.d/z_async_insert.xml`
- Ops: `vps-clickhouse-remediation.sh`, `vps-clickhouse-backup.sh`, `vps-clickhouse-backfill-org-id.sh`
- App: org_id on CH snapshot/state-change mirror writes

## VPS execution

Operator-driven via `vps-clickhouse-remediation.sh --dry-run` then `--execute`.

## References

- `docs/remediation/clickhouse-remediation.md`
