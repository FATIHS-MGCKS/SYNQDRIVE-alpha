# Master Admin — ClickHouse Tenant Isolation (Phase 2D.4)

**Date:** 2026-07-26  
**Type:** Tenant isolation analysis + additive migration design (not applied)

---

## Summary

Phase 2D.4 audits ClickHouse multi-tenant isolation across all `synqdrive.*` tables.

### Key findings

| Finding | Severity |
|---------|----------|
| No `tenant_id` — uses `org_id` only | Info |
| Legacy tables (`telemetry_snapshots`, `telemetry_state_changes`) lack `org_id` | P1 |
| All read queries filter `vehicle_id` only, not `org_id` | P2 |
| HF tables have `org_id` leading ORDER BY | Good (schema) |
| No materialized views | OK |
| No ClickHouse RLS / constraints | P2 — app-layer only |

### Mitigation today

- `Vehicle.id` = global UUID
- API: `OrgScopingGuard` + `assertVehicle`
- Trip reads: PG ownership check before CH

### Designed (not executed)

- Migration **007**: additive `org_id` on legacy tables
- Phase **2D.5**: backfill + query/write hardening
- Migration **008** (future): tenant-leading sort keys via new tables

## Deliverables

- `docs/remediation/clickhouse-tenant-isolation.md`
- `backend/src/modules/clickhouse/migrations/007_legacy_mirror_org_id_columns.sql`
- `backend/scripts/ops/vps-clickhouse-tenant-isolation-audit.sh`

## References

- `docs/remediation/clickhouse-tenant-isolation.md`
