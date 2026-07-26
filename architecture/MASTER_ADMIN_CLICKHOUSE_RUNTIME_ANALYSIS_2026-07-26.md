# Master Admin — ClickHouse Runtime Analysis (Phase 2D.1)

**Date:** 2026-07-26  
**Type:** Pre-remediation baseline documentation (no runtime changes)

---

## Summary

Phase 2D.1 documents the **current intended ClickHouse runtime** before any remediation work:

- **Container:** `synqdrive-clickhouse` from `backend/docker-compose.yml`
- **Image:** `clickhouse/clickhouse-server:25.8`
- **Data:** Docker volume `clickhouse_data` → `/var/lib/clickhouse`
- **Backups:** Local disk `backups` at `/backups` (dev: `./storage/clickhouse/backups`; VPS: `/opt/synqdrive/shared/clickhouse/backups`)
- **Storage policy:** Default single-disk MergeTree — **no** tiered hot/cold policy
- **Replication:** **None** — all tables `MergeTree` / `ReplacingMergeTree`
- **Schema:** Migrations 001–006, database `synqdrive`, 8 analytics tables + `schema_migrations`
- **TTL:** Per-table retention (90–365 days) on event-time columns; system logs hardened (7d query_log)

## Live runtime status

| Check | Result |
|-------|--------|
| Cloud Agent Docker | Unavailable (no socket) |
| VPS SSH inspection | **Not performed** (auth failure) |
| Code/repo baseline | Documented in `docs/remediation/clickhouse-runtime-analysis.md` |

## Architecture boundaries (unchanged)

- PostgreSQL = system of record
- ClickHouse = optional append-only analytics mirror
- Backend binds via `CLICKHOUSE_URL` only — no Docker coupling
- DIMO Segments remain canonical trip boundaries; CH assists evidence/repair only

## Operator action required

Run the read-only bundle in `docs/remediation/clickhouse-runtime-analysis.md` §22 on production and attach output before Phase 2D.2 implementation.

## References

- `docs/remediation/clickhouse-runtime-analysis.md`
- `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`
