# Notification Engine — Production VPS Control Audit

**Date:** 2026-07-26 (UTC)  
**Auditor:** Cursor Cloud Agent (read-only)  
**Scope:** Production VPS `srv1374778.hstgr.cloud` — Notification Engine remediation alignment  
**Method:** SSH inspection, health checks, `prisma migrate status`, read-only SQL — **no writes, no restarts, no flag changes**

---

## 1. Executive summary

| Area | Status | Notes |
|------|--------|-------|
| Service health | **Pass** | Backend online; local + public health `ok` |
| Notification data integrity | **Pass** | 0 duplicate fingerprints, 0 orphans |
| Notification Engine base schema | **Present** | Core tables + partial unique index applied |
| Remediation code on VPS | **Behind** | Prod `4a479c1` vs remediation branch `8a9b56df` (+13 commits) |
| Remediation DB migrations | **Missing** | Audit/GDPR/task-linking/idempotency migrations not applied |
| Legacy backfill | **Not executed** | 10 active insights unbridged; 4 `legacy_insight_id` rows |
| Delivery | **Disabled** | `NOTIFICATIONS_DELIVERY_ENABLED=false` (intentional) |
| Observability (remediation) | **Absent** | No `observability/` module, no notification Grafana dashboard |
| Prisma migration history | **Warn** | 15 historical failed migration records (non-notification) |

**Verdict:** Production is **operationally stable** for the deployed Notification Engine V2 baseline, but **not aligned** with the remediation branch (Prompts 25–32). Deploy and migration execution are required before remediation sign-off.

---

## 2. Deployment topology

| Item | Value |
|------|-------|
| Deploy root | `/opt/synqdrive/` |
| Current release symlink | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260725233142_v4994` |
| Release ID | `20260725233142_v4994` |
| Git commit (release) | `4a479c1ef1548b89ed5a06337356248100e0bb00` |
| Git branch | `main` (shallow clone in release) |
| Git status | Clean except untracked `backend/uploads` |
| Release count on disk | 29 retained releases |

### Process model

| Component | Runtime | Status |
|-----------|---------|--------|
| Backend API | PM2 `synqdrive` | online |
| PM2 helper | `pm2-logrotate` | online |
| PostgreSQL 16 | Native (Ubuntu) | reachable |
| Redis | Native | `PONG` |
| Prometheus | Docker `synqdrive-prometheus` | Up 9 days |
| Grafana | Docker `synqdrive-grafana` | Up 19 hours, DB ok |
| ClickHouse | Docker `synqdrive-clickhouse` | Up 8 days (healthy) |

No separate PM2 worker process — notification evaluation/delivery runs inside the `synqdrive` NestJS monolith (BullMQ consumers in-process).

### PM2 `synqdrive` snapshot

| Field | Value |
|-------|-------|
| Script | `/opt/synqdrive/current/backend/dist/src/main.js` |
| CWD | `/opt/synqdrive/current/backend` |
| Status | online |
| Uptime (at audit) | ~3 h (since `2026-07-25T23:36:33Z` deploy) |
| Lifetime restarts | 3169 (historical) |
| Unstable restarts | 0 |
| Memory | ~455 MB |

---

## 3. Health checks

| Endpoint | Result |
|----------|--------|
| `http://127.0.0.1:3001/api/v1/health` | `{"status":"ok"}` |
| `https://app.synqdrive.eu/api/v1/health` | `{"status":"ok"}` |
| Prometheus target `synqdrive-backend` | up |
| Grafana `/api/health` | database ok, v11.2.0 |

No notification-related errors in the last 200 PM2 log lines (grep filter).

---

## 4. Feature flags (names and safe status only)

| Flag | Status |
|------|--------|
| `NODE_ENV` | `production` |
| `NOTIFICATIONS_V2` | `true` |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false` |
| `VITE_NOTIFICATIONS_V2` | `on` |
| `REDIS_*` | configured (values not recorded) |

---

## 5. Prisma migration status

```
276 migrations found in prisma/migrations
Database schema is up to date!
```

### Notification-related applied migrations

| Migration | Applied |
|-----------|---------|
| `20260711120000_notification_engine_tables` | yes |
| `20260711140000_notification_delivery_outbox` | yes |

### Remediation migrations **not** on production DB

| Migration | Purpose |
|-----------|---------|
| `20260726120000_workflow_notification_idempotency` | Workflow action dedup keys |
| `20260726130000_notification_task_linking` | `org_tasks.notification_id` etc. |
| `20260726140000_notification_gdpr_retention` | GDPR retention / legal hold |
| `20260726150000_notification_audit_events` | `notification_audit_events` table |

**Verified:** `notification_audit_events` table **does not exist** on production.  
**Verified:** `org_tasks` columns `notification_id`, `workflow_run_id`, `source_event_type` **do not exist**.

### Historical migration failures (non-notification)

15 rows in `_prisma_migrations` with `finished_at IS NULL` (failed apply attempts dating from 2026-07-14 through 2026-07-24). Examples:

- `20260714170000_payment_request_status_lifecycle` — enum commit safety
- `20260715170000_org_task_fine_invoice_links` — duplicate enum type
- `20260723230000_privacy_domain_foundation` — FK type mismatch

These are **pre-existing ops debt**. They did not block the current release deploy but should be resolved before the next `prisma migrate deploy` that includes new migrations.

---

## 6. Notification schema (production)

### Tables present

- `notifications`
- `notification_occurrences`
- `notification_receipts`
- `notification_delivery_outbox`

### Key indexes verified

- Partial unique: `notifications_active_fingerprint_generation_key` on `(organization_id, fingerprint, lifecycle_generation)` WHERE status IN (OPEN, ACKNOWLEDGED, SNOOZED)
- Outbox: `idempotency_key` unique, `(status, available_at)`, `(organization_id, status)`

---

## 7. Read-only SQL audit results

| Check | Count |
|-------|------:|
| Duplicate active fingerprint groups | **0** |
| Orphan occurrences | **0** |
| Orphan receipts | **0** |
| Orphan outbox rows | **0** |
| Open CRITICAL notifications | **0** |
| Dead-letter outbox rows | **0** |
| Outbox PENDING/FAILED backlog | **0** |

### Row counts (anonymized aggregates)

| Table | Count |
|-------|------:|
| `notifications` | 26 |
| `notification_occurrences` | 7,750 |
| `notification_receipts` | 0 |
| `notification_delivery_outbox` | 0 |
| `dashboard_insights` (active) | 10 |

### Status distribution (`notifications`)

| Status | Count |
|--------|------:|
| OPEN | 18 |
| RESOLVED | 8 |

### Active severity distribution

| Severity | Count |
|----------|------:|
| WARNING | 9 |
| INFO | 9 |
| CRITICAL | 0 |

### Legacy bridge state

| Metric | Count |
|--------|------:|
| Notifications with `legacy_insight_id` | 4 |
| Active insights without bridge (legacy or occurrence `source_ref`) | **10** |

### Outbox status distribution

Empty table (0 rows) — delivery disabled.

---

## 8. Workers and queues (Redis / BullMQ)

| Queue | wait | active | failed | delayed | completed |
|-------|-----:|-------:|-------:|--------:|----------:|
| `notification.evaluation` | 0 | 0 | 0 | 0 | 8 |
| `notification.delivery` | 0 | 0 | 0 | 0 | 0 |

Workers are available via the running `synqdrive` process. No backlog or failed jobs at audit time.

---

## 9. Code alignment: production vs repository

| Reference | Commit | Description |
|-----------|--------|-------------|
| **Production VPS** | `4a479c1` | Deployed release `20260725233142_v4994` |
| **origin/main** | `3cdf772b` | +2 commits ahead of prod |
| **Remediation branch** | `8a9b56df` | +13 commits ahead of prod |

### Present on production (baseline)

- `backend/src/modules/notifications/` (core, delivery, api, adapters, migration baseline)
- Migration CLI scripts: `notification-migration-dry-run.ts`, `backfill.ts`, `acceptance.ts`
- Migrations: `20260711120000`, `20260711140000`

### Absent on production (remediation stack)

- `notifications/observability/` (Prometheus metrics, structured ingest logs)
- `notifications/audit/` (`NotificationAuditService`)
- `notifications/compliance/` (GDPR retention)
- Hardened migration tooling (Prompt 32: CLI util, expanded acceptance)
- Grafana `notification-engine-ops.json`
- Security regression tests, access isolation hardening
- Prisma migrations `20260726120000` – `20260726150000`

---

## 10. Findings

### Pass

1. Backend healthy; Redis and PostgreSQL reachable.
2. Notification integrity checks clean (no duplicates, no orphans).
3. Base V2 schema and partial unique index in place.
4. `NOTIFICATIONS_V2=true` with delivery safely off.
5. Evaluation queue operational (8 completed jobs, no failures).

### Warn

1. **Code lag:** Production is 13 commits behind remediation branch; 2 commits behind `origin/main`.
2. **Backfill not run:** All 10 active legacy insights remain unbridged to V2.
3. **Zero receipts:** No user read/ack state in V2 (may be expected pre-cutover usage).
4. **High historical PM2 restart count** (3169) — current instance stable (0 unstable restarts).
5. **15 failed migration records** in `_prisma_migrations` — blocks clean future migrate until resolved.

### Fail (remediation readiness)

1. **Remediation migrations not deployed** — audit, GDPR, task linking, workflow idempotency schema missing.
2. **Remediation code not deployed** — observability, audit, hardened migration tooling absent.
3. **Migration tooling on prod is pre-hardening** — acceptance checks incomplete vs Prompt 32 spec.

---

## 11. Critical production blockers (for remediation sign-off)

| # | Blocker | Action required (not executed in this audit) |
|---|---------|---------------------------------------------|
| 1 | Prod commit `4a479c1` ≠ remediation `8a9b56df` | Deploy remediation stack to VPS |
| 2 | 4 notification Prisma migrations missing | `prisma migrate deploy` after resolving historical failures |
| 3 | Legacy backfill not executed | Per-org dry-run → apply → acceptance (read-only audit shows 10 unbridged) |
| 4 | Historical Prisma migration failures (15) | Ops recovery before next migrate |
| 5 | No notification observability on prod | Deploy + verify Grafana dashboard and metrics |
| 6 | No audit trail table | Requires `20260726150000` migration |

**Not blockers (by design):** `NOTIFICATIONS_DELIVERY_ENABLED=false`, empty outbox, 0 receipts.

---

## 12. Audit constraints observed

- No production data modified
- No migrations executed
- No feature flags changed
- No services restarted
- No secrets recorded in this document

---

## Related

- `docs/operations/notification-engine-migration-runbook.md`
- `docs/notification-engine-production-readiness.md`
- `docs/operations/notification-engine-observability-runbook.md`
