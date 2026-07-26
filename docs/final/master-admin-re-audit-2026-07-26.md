# Master Admin — Post-Remediation Re-Audit

| Feld | Wert |
|------|------|
| **Datum (UTC)** | 2026-07-26 |
| **Code-Stand** | `main` @ `5dcd628f` (P0/P1 remediation stack merged) |
| **Prod-Stand** | Pre-deploy (letzter Deploy vor Remediation-Merge) |
| **Auditor** | SynqDrive Engineering — automated probes + code verification |

---

## Executive Summary

Der vollständige **P0/P1-Remediation-Stack** wurde in `main` gemergt (56 Remediation-Branches konsolidiert + Gap-Fixes RBAC-TB-1, COMP-2, COMP-3).

**Production-Deploy:** **fehlgeschlagen** — SSH-Authentifizierung zum VPS (`Permission denied (publickey)` / Connection reset). Prod läuft weiterhin auf dem **vorherigen Release**.

**Re-Audit-Ergebnis (Live-Prod, unverändert):** Swagger weiterhin öffentlich (`/docs` → 200). Code-Fixes sind **nicht live**.

**Empfehlung:** Nach manuellem VPS-Deploy → **Production Ready with Conditions**.

---

## Merge-Reihenfolge (ausgeführt)

| # | Branch / Änderung | Findings |
|---|-------------------|----------|
| 1 | `openapi-hardening-2a4` | MA-NET-P1-001/002 |
| 2 | `audit-log-immutable-2a7` | MA-AUD-P1-001, COMP-1 (partial) |
| 3 | `clickhouse-backup-2c3` | MA-BKP-P0-001 (CH) |
| 4 | `offsite-backups-2c5` | MA-BKP-P0-001 (offsite) |
| 5 | `stripe-env-separation-2b2` | MA-BILL-P0-002 |
| 6 | `stripe-webhooks-2b3` | MA-BILL-P0-003 |
| 7 | `clickhouse-p1-blockers` | MA-CH-P0-001, MA-CH-P1-001 |
| 8 | `alertmanager-2f2` | MA-OBS-P1-001, MA-DIMO-P0-001 |
| 9 | Direct fixes | RBAC-TB-1, COMP-2, COMP-3 |

**Commit:** `5dcd628f` auf `main`

---

## Live Production Probes (2026-07-26, post-merge, pre-deploy)

| Probe | Erwartet (nach Deploy) | Ist (Prod jetzt) | Status |
|-------|------------------------|------------------|--------|
| `GET /api/v1/health` | 200 | 200 | ✅ |
| `GET /api/v1/health/readiness` | ok | ok (PG 3ms, Redis 1ms, CH 13ms) | ✅ |
| `GET /docs` | 404/disabled | **200** | ❌ nicht deployt |
| `GET /docs-json` | 404/disabled | **200** | ❌ nicht deployt |
| `GET /api/v1/admin/dashboard` | 401 | 401 | ✅ |
| `GET /api/v1/metrics` | 401 | 401 | ✅ |

---

## Code-Verifikation (main @ 5dcd628f)

| Finding | Code-Fix vorhanden | Datei / Mechanismus |
|---------|-------------------|---------------------|
| MA-NET-P1-001/002 | ✅ | `main.ts` — Swagger nur wenn `SWAGGER_ENABLED=true` |
| MA-AUD-P1-001 / COMP-1 | ✅ | Append-only migration; prune löscht keine Audit-Logs |
| COMP-2 | ✅ | `POST /admin/prune` — `BREAK_GLASS` step-up + `confirm` token |
| COMP-3 | ✅ | `DELETE /admin/users/:id` → `IamUserDeletionService` |
| RBAC-TB-1 | ✅ | `updateLiveSharing(id, organizationId)` org-scoped |
| MA-CH-P0-001 | ✅ | Migration 007 `org_id` + backfill service |
| MA-CH-P1-001 | ✅ | Mirror-retry queue, dedup, org predicates |
| MA-DIMO-P0-001 | ✅ | Partial unique index migration |
| MA-BILL-P0-002 | ✅ | `StripeEnvironmentModule` fail-fast |
| MA-BILL-P0-003 | ✅ | `stripe-webhook-security.util` |
| MA-BKP-P0-001 | ✅ | CH backup + offsite scripts |
| MA-OBS-P1-001 | ✅ | Alertmanager stack + `alerts-infra.yml` |

---

## VPS-Ops (nach Deploy manuell)

| # | Aktion | Script |
|---|--------|--------|
| 1 | Deploy | `bash .cursor/scripts/cloud-agent-deploy.sh` |
| 2 | Prisma migrate (CH 007, DIMO unique, audit append-only) | im Deploy-Skript |
| 3 | CH org_id backfill | `vps-clickhouse-backfill-org-id.sh` |
| 4 | CH backup cron | `vps-install-clickhouse-backup-cron.sh` |
| 5 | Offsite backup cron | `vps-install-offsite-backup-cron.sh` |
| 6 | Alertmanager | `vps-setup-alertmanager.sh` |
| 7 | Stripe LIVE key + webhook secret in `backend.env` | manuell |
| 8 | TRIALING orphan reconcile | Stripe Dashboard / billing runbook |
| 9 | Battery.v2 failed jobs drain | `vps-inspect-bullmq-redis.sh` |

---

## Aktualisierte Gate-Matrix (Code vs Prod)

| Gate | Code (main) | Prod (live) |
|------|-------------|-------------|
| Security | **PASS** (post-deploy) | FAIL (Swagger offen) |
| Tenant Isolation | **PASS** | COND |
| Billing | **COND** (Guards; env TBD) | FAIL |
| Backup/DR | **COND** (Scripts; cron TBD) | FAIL |
| Observability | **COND** (Stack; deploy TBD) | FAIL |
| Auditierbarkeit | **PASS** | FAIL |

---

## Entscheidung

| Option | Code (`main`) | Production (live) |
|--------|---------------|-------------------|
| Production Ready | ☐ | ☐ |
| **Production Ready with Conditions** | **☑** | ☐ (nach Deploy) |
| Not Production Ready | ☐ | **☑** (aktuell) |

**Begründung:** Remediation-Code ist vollständig in `main`. Production wurde nicht aktualisiert (SSH-Deploy blockiert). Nach erfolgreichem Deploy + VPS-Ops-Schritten 1–6 ist **Production Ready with Conditions** realistisch erreichbar.
