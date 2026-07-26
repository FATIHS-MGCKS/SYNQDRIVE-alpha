# Master Admin — Disaster Recovery & Backup Architecture (2C.1)

**Date:** 2026-07-26  
**Status:** Documented IST/SOLL — implementation deferred to 2C.2+

## Summary

Full-platform backup assessment for Hostinger VPS production. PostgreSQL has deploy-triggered `pg_dump` only; uploads and private documents have **no object backup**; ClickHouse backup script exists for dev but **no prod schedule**; Redis/Prometheus/Grafana treated as ephemeral/reprovisionable.

**Verdict:** Not DR-ready for VPS total loss. Rollback path for bad deploys is supported.

## Critical paths

| Tier | Components |
|------|------------|
| T0 | PostgreSQL, `backend.env` / `frontend.env`, private documents |
| T1 | Public uploads, Nginx/TLS, PM2, release rollback |
| T2 | ClickHouse, Redis (queues) |
| T3 | Prometheus, Grafana, PM2 logs |

## Top gaps (P0)

1. No offsite PostgreSQL backup
2. No scheduled DB backup (deploy-only RPO)
3. Document/upload binaries excluded from backup (`DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS=false`)

## Canonical doc

`docs/remediation/disaster-recovery-architecture.md` — backup matrix, RTO/RPO targets, RACI, gap register DR-001–DR-014.

## Follow-up phases

- **2C.2:** `vps-backup-database.sh`, retention, offsite template
- **2C.3:** Quarterly restore drill + backup alerting
- **2C.4:** Optional S3 migration for object storage
