# Communication Center C13.2 — Observability & Reconciliation Health

**Status:** PARTIAL — production-safe observability foundation with truthful unknown states
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
- Bounded DB-backed signals (UNKNOWN sends per channel, handoff backlog, webhook backlog, retention runs)
- PostgreSQL integration tests + metrics label bounds tests
- Truthful UNKNOWN / NOT_MEASURABLE states (no false-green unmeasured components)
- Tenant-scoped voice webhook backlog via `VoiceProviderWebhookEvent.organizationId`
- Channel-correct UNKNOWN send attribution (WHATSAPP, VOICE, SMS, EMAIL)

Out of scope (later phases):
- C13.3 legacy navigation redirects
- C13.4 legacy UI removal
- C13.5 API/component deletion
- New pager/Slack alerting subsystem
- Grafana dashboards / alert rules for Communication metrics
- Canonical projection lag instrumentation
- Media operational counters
- AI failure-rate instrumentation

---

## 2. Existing observability authority (reused)

| Layer | Authority |
|-------|-----------|
| Prometheus registry | `TripMetricsService` → `GET /api/v1/metrics` |
| Gauge refresh pattern | `CommunicationMetricsRefreshService` (cron */5) |
| Voice webhook lag/backlog | `VoiceProviderWebhookEvent` + org-scoped health queries |
| Retention audit | `CommunicationRetentionPurgeRun` + `CommunicationRetentionMetrics` |
| Handoff delivery | Notification engine (`NotificationProducerRouter`) |
| Master Admin ops | Platform Ops hub + `GET /admin/ops/*` |
| Channel readiness | **DEFERRED_TO_EXISTING_C10_AUTHORITY** — not evaluated in C13.2 |

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
- `synqdrive_communication_send_unknown_current{channel}` (gauge, per canonical channel)
- `synqdrive_communication_send_unknown_oldest_seconds{channel}` (gauge, per canonical channel)
- `synqdrive_communication_reconciliation_total{channel,result}`
- `synqdrive_communication_handoff_total{channel,result}`
- `synqdrive_communication_retention_runs_total{dry_run,status}`
- `synqdrive_communication_retention_last_success_timestamp` (gauge)

**Label bounds:**
- `event_type`: normalized to `CommunicationEventType` enum or `UNKNOWN_EVENT_TYPE`
- `error_code`: normalized to `CommunicationNormalizationErrorCode` + `PROJECTION_FAILURE`
- `operation` (AI): normalized to bounded set or `unknown`
- `channel`: `whatsapp|voice|sms|email|unknown`

Gauge refresh explicitly sets `current=0` and `oldest=0` for channels with no UNKNOWN backlog (no stale series).

### B. Health evaluation

States: `HEALTHY`, `DEGRADED`, `UNHEALTHY`, `UNKNOWN`, `DISABLED`, `NOT_APPLICABLE`, `NOT_CONFIGURED`

Components:
- `projection`, `outbound`, `reconciliation`, `handoff`, `media`, `ai`, `retention`, `channelReadiness`

Diagnostics include: `NOT_MEASURABLE`, `NOT_MEASURABLE_FOR_TENANT`, `CANONICAL_PROJECTION_LAG_NOT_MEASURABLE`, `RETENTION_TENANT_EVIDENCE_GLOBAL_ONLY`, `DEFERRED_TO_EXISTING_C10_AUTHORITY`

### C. Overall aggregation rule

1. Measured core `UNHEALTHY` → overall `UNHEALTHY`
2. Measured core `DEGRADED` → overall `DEGRADED`
3. Optional unmeasured `media`/`ai` `UNKNOWN` (with `mediaMetricsInstrumented=false` / `aiFailureRateMeasurable=false`) **does not** block overall health
4. Never promote component `UNKNOWN` to overall `HEALTHY` when a measured core component is `UNKNOWN`
5. `channelReadiness` `NOT_APPLICABLE` does not degrade overall health

### D. Operator surface

`GET /admin/communication/operational-health?organizationId=` — Master Admin RBAC + MFA.

Nonexistent `organizationId` → `404 Organization not found` (no fake healthy empty snapshot).

Master Admin Platform Ops UI uses German presentation labels (DE-only convention for this surface).

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

Bounded counts use `findMany(take: 1000)` — when exactly 1000 rows returned, `countAtLeastLimit=true` (actual count may be ≥1000).

---

## 5. Projection health

**Measured today (ingestion pipeline evidence):**
- WhatsApp webhook backlog oldest age (bounded sample, org-scoped when requested)
- Voice webhook backlog oldest age (`RECEIVED|QUEUED`, org-scoped via `VoiceProviderWebhookEvent.organizationId`)
- Projection failure counter at WhatsApp canonical projection boundary

**NOT_MEASURABLE — canonical projection lag:**
Native event → `CommunicationEvent.createdAt` lag is **NOT_MEASURABLE** without additional persisted correlation timestamps. Diagnostic: `CANONICAL_PROJECTION_LAG_NOT_MEASURABLE`. Webhook backlog health does not imply full canonical projection-lag health.

**Voice tenant scope:**
`VoiceProviderWebhookEvent.organizationId` (nullable) is the authoritative tenant relation. Tenant-scoped queries filter by `organizationId`; events without org are excluded from tenant snapshots (never cross-attributed). Global Master Admin health uses unscoped voice backlog.

---

## 6. Outbound / SEND_UNKNOWN

First-class signal from `CommunicationReplyCommand.sendState = UNKNOWN` with:
- Aggregate bounded count + oldest age
- Per-channel breakdown: WHATSAPP, VOICE, SMS, EMAIL (canonical `CommunicationChannel` enum only)
- Prometheus gauges per channel with explicit zero-reset

---

## 7. Media / AI health

**NOT_MEASURABLE in C13.2:**
- `media`: `UNKNOWN` + `NOT_MEASURABLE` (`mediaMetricsInstrumented=false`)
- `ai`: `UNKNOWN` + `NOT_MEASURABLE` (`aiFailureRateMeasurable=false`)

No false-green `HEALTHY` merely because no query failed.

---

## 8. Retention health

Reuses C13.1 purge-run audit. `RETENTION_LOCK_LOST` → UNHEALTHY. Lock contention skip is not an incident.

- `dryRun=true`: enabled in safe mode; no DEGRADED solely for missing destructive success
- Tenant-scoped: org-specific purge run rows required; if only global (`organizationId=null`) runs exist → `UNKNOWN` + `RETENTION_TENANT_EVIDENCE_GLOBAL_ONLY`

---

## 9. Channel readiness

`channelReadiness` → `NOT_APPLICABLE` with `DEFERRED_TO_EXISTING_C10_AUTHORITY`. C10 readiness authority is not integrated in C13.2; component does not report PASS.

---

## 10. Safe logging

Communication health boundary logs use normalized codes only:
- Component failure: `communication_health_component_failed component=… errorClass=…`
- Metrics refresh: `communication_metrics_refresh_failed errorClass=…`
- Handoff notification: `communication_handoff_notification_ingest_failed` (no raw provider/exception messages)

---

## 11. PostgreSQL evidence

`communication-operational-health.postgres.integration.spec.ts`:
- UNKNOWN per-channel attribution (WA=2, Voice=1)
- Voice tenant isolation
- Handoff tenant isolation
- Retention lock-lost, dry-run, global-only tenant evidence
- Nonexistent organization 404
- Cache tenant isolation
- Media/AI NOT_MEASURABLE (no false-green)
- Sensitive-data exclusion
- Per-channel gauge refresh

`communication-prometheus.metrics.spec.ts`: bounded label normalization

---

## 12. Remaining gaps (explicit)

| Gap | Status |
|-----|--------|
| Canonical projection lag measurement | NOT_MEASURABLE |
| Media operational counters | NOT_MEASURABLE |
| AI failure-rate instrumentation | NOT_MEASURABLE |
| Channel readiness evaluation | DEFERRED_TO_C10 |
| Grafana dashboards / alert rules | Future |
| Template send counters | Future |

---

## 13. C13.2 sign-off

**PARTIAL** — production-safe observability foundation + truthful unknown states + no tenant leakage + bounded metrics.

---

## 14. C13.3 readiness

**READY** (C13.2 truthfulness hardening does not block C13.3 navigation work)
