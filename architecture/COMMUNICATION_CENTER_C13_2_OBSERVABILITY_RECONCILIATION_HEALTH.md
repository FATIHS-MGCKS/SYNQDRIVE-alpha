# Communication Center C13.2 — Observability & Reconciliation Health

**Status:** PARTIAL — backend health foundation + Prometheus signals + Master Admin read surface
**Date:** 2026-08-24
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Base:** `main` after merged PR #1232 (C13.1 retention framework)
**Branch:** `feature/communication-center-c13-2-observability-health`

---

## 1. Scope

C13.2 establishes **Communication-domain operational health** — not generic infrastructure monitoring.

In scope:
- Canonical `CommunicationOperationalHealthService` (evidence-based component health)
- Prometheus metrics via existing `TripMetricsService` registry
- Master Admin protected endpoint `GET /admin/communication/operational-health`
- Bounded DB-backed signals (UNKNOWN sends, handoff backlog, webhook backlog, retention runs)
- PostgreSQL integration tests

Out of scope (later phases):
- C13.3 legacy navigation redirects
- C13.4 legacy UI removal
- C13.5 API/component deletion
- New pager/Slack alerting subsystem
- Product retention period decisions

---

## 2. Existing observability authority (reused)

| Layer | Authority |
|-------|-----------|
| Prometheus registry | `TripMetricsService` → `GET /api/v1/metrics` |
| Gauge refresh pattern | `NotificationMetricsRefreshService` (cron */5) |
| Voice webhook lag/backlog | `VoiceMetricsService` + existing Prometheus alerts |
| Retention audit | `CommunicationRetentionPurgeRun` + `CommunicationRetentionMetrics` |
| Handoff delivery | Notification engine (`NotificationProducerRouter`) |
| Master Admin ops | Platform Ops hub + `GET /admin/ops/*` |

No second Prometheus stack, tracing system, or parallel monitoring framework introduced.

---

## 3. Signal model

### A. Signals (Prometheus)

Metric families (bounded labels — no conversationId, phone, orgId):

- `synqdrive_communication_projection_total{channel,event_type,result}`
- `synqdrive_communication_projection_failures_total{channel,event_type,error_code}`
- `synqdrive_communication_projection_lag_seconds{channel,event_type}` (when measurable)
- `synqdrive_communication_send_total{channel,result}`
- `synqdrive_communication_send_unknown_total{channel,reason}`
- `synqdrive_communication_send_unknown_current{channel}` (gauge, bounded DB sample)
- `synqdrive_communication_send_unknown_oldest_seconds{channel}` (gauge)
- `synqdrive_communication_reconciliation_total{channel,result}`
- `synqdrive_communication_handoff_total{channel,result}`
- `synqdrive_communication_retention_runs_total{dry_run,status}`
- `synqdrive_communication_retention_last_success_timestamp` (gauge)

### B. Health evaluation

States: `HEALTHY`, `DEGRADED`, `UNHEALTHY`, `UNKNOWN`, `DISABLED`, `NOT_APPLICABLE`, `NOT_CONFIGURED`

Components:
- `projection`, `outbound`, `reconciliation`, `handoff`, `media`, `ai`, `retention`, `channelReadiness`

### C. Operator surface

`GET /admin/communication/operational-health?organizationId=` — Master Admin RBAC only.

---

## 4. Threshold authority

| Threshold | Authority |
|-----------|-----------|
| UNKNOWN count/age degraded/unhealthy | DERIVED_SAFE_DEFAULT (`communication-operational-health.config.ts`) |
| Handoff oldest age | DERIVED_SAFE_DEFAULT |
| WhatsApp/Voice webhook oldest age | DERIVED_SAFE_DEFAULT |
| Retention stale after success | DERIVED_SAFE_DEFAULT (26h) |
| Startup grace | DERIVED_SAFE_DEFAULT (15m) |
| Retention product days | POLICY_REQUIRED (C13.1 — not operational incident) |

---

## 5. Projection health

**Measured today:**
- WhatsApp webhook backlog oldest age (bounded sample)
- Voice webhook backlog oldest age (`RECEIVED|QUEUED`)
- Projection failure counter at WhatsApp canonical projection boundary

**GAP — canonical projection lag:**
Native event → `CommunicationEvent.createdAt` lag is **NOT_MEASURABLE** without additional persisted correlation timestamps.

---

## 6. Outbound / SEND_UNKNOWN

First-class signal from `CommunicationReplyCommand.sendState = UNKNOWN` with bounded count and oldest age.

---

## 7. Retention health

Reuses C13.1 purge-run audit. `RETENTION_LOCK_LOST` → UNHEALTHY. Lock contention skip is not an incident.

---

## 8. PostgreSQL evidence

`communication-operational-health.postgres.integration.spec.ts` — UNKNOWN, handoff, retention lock-lost, tenant isolation, no sensitive content leakage.

---

## 9. C13.2 sign-off

**PARTIAL**

---

## 10. C13.3 readiness

**READY**
