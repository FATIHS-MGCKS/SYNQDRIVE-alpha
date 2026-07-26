# Disaster Recovery — Production Readiness (ClickHouse scope)

**Date:** 2026-07-26  
**Status:** ClickHouse DR path documented — closes P1-DR for analytics mirror  
**Related:** [clickhouse-remediation.md](./clickhouse-remediation.md) · [clickhouse-production-readiness.md](./clickhouse-production-readiness.md)

---

## Scope

This document covers **ClickHouse analytics mirror** disaster recovery only. PostgreSQL DR remains the primary platform recovery path (see `vps-deploy-release.sh` pre-deploy `pg_dump`).

---

## RPO / RTO (analytics mirror)

| Metric | Target | Mechanism |
|--------|--------|-----------|
| **RPO** | ≤ 24h (backup cadence) + mirror retry queue | `vps-clickhouse-backup.sh` + BullMQ `clickhouse.mirror.retry` |
| **RTO** | ≤ 30 min (container recreate + restore drill) | G1 backup + `docker compose` recreate |

Analytics gaps during outage do **not** block rental/trip operations.

---

## Backup inventory

| Artifact | Script / location |
|----------|-------------------|
| ClickHouse `BACKUP DATABASE` | `vps-clickhouse-backup.sh` → `/opt/synqdrive/shared/clickhouse/backups/` |
| sha256 manifest | `shared/clickhouse/backup-manifests/*.sha256` |
| PostgreSQL pre-deploy | `/opt/synqdrive/shared/backups/db-pre-deploy-*.sql.gz` |

**Schedule:** Run G1 backup before any remediation or monthly; verify restore drill quarterly.

---

## Restore procedure (operator)

1. Stop analytics-dependent dashboards only (optional — ops continues).
2. Identify latest G1 backup manifest + `sha256sum -c`.
3. Restore to drill instance OR replace production volume from backup ZIP per ClickHouse docs.
4. Recreate container with VPS compose override.
5. Run `vps-clickhouse-acceptance-audit.sh` — exit 0 required.
6. Verify `GET /api/v1/health/readiness` → `clickhouse=available`.

---

## DR verdict (ClickHouse)

| Question | Answer |
|----------|--------|
| Backup path defined? | **Yes** — G1 script + shared `/backups` |
| Restore tested? | **Operator pending** — drill required for formal GO |
| Platform blocked if CH lost? | **No** — PostgreSQL canonical |

**P1-DR status:** **Mitigated in repo** — formal DR GO requires one successful restore drill logged in acceptance §14.

---

*ClickHouse DR — documentation only; no runtime change.*
