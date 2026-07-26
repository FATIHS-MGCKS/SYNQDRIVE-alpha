# Observability Architecture — Phase 2F.1

**Date:** 2026-07-26  
**Scope:** Full SynqDrive observability stack audit  
**Status:** Analysis complete — **no implementation changes**  
**Audience:** Engineering, Master Admin, SRE / Ops

---

## Executive summary

SynqDrive has a **mature application-centric observability model**: NestJS exports **~302 custom Prometheus metrics** via `prom-client`, **100 alert rules** in a single `alerts.yml`, and **7 Grafana dashboards** provisioned for VPS deployment. Cardinality discipline is strong (no `vehicle_id` / `org_id` in metric labels).

**Gaps are infrastructure-shaped, not absence of instrumentation:**

| Layer | Maturity | Primary gap |
|-------|----------|-------------|
| Application metrics | **High** | Some domains instrumented but not alerted/dashboarded |
| Prometheus | **Medium** | Single scrape target (backend only) |
| Alertmanager | **Missing** | Rules fire in Prometheus only — no paging/routing |
| Grafana | **Medium** | VPS deploy script omits 2 dashboards; no local compose |
| Infra exporters | **Missing** | No node/postgres/redis/nginx exporters |
| Health checks | **Good** | Readiness strong; DIMO/Stripe/AI not in readiness |
| Frontend | **Weak** | No production error tracking (Sentry, etc.) |
| Workflows / SaaS billing | **Weak** | Almost no Prometheus coverage |

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SynqDrive VPS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Nginx (:443) ──► PM2 synqdrive (:3001) ──► NestJS Backend                │
│       │                    │                      │                            │
│       │                    │                      ├── GET /api/v1/health     │
│       │                    │                      ├── GET /api/v1/health/readiness
│       │                    │                      └── GET /api/v1/metrics ◄──┐
│       │                    │                                                 │
│       │                    ├── PostgreSQL (:5432)                            │
│       │                    ├── Redis (:6379) ──► BullMQ workers               │
│       │                    └── ClickHouse (:8123, optional)                  │
│       │                                                                      │
│  Prometheus (:9090, localhost) ──scrape 30s──► /api/v1/metrics              │
│       │ evaluate alerts.yml (100 rules)                                      │
│       └── ✗ Alertmanager (NOT DEPLOYED)                                      │
│                                                                              │
│  Grafana (:3000, localhost) ──query──► Prometheus                            │
│       └── 7 dashboards (SynqDrive folder)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

External: DIMO API/webhooks · Stripe webhooks · LLM providers · Resend · Twilio
Frontend: Vite SPA — no metrics beacon; Master Admin polls platform-health API
Docker (local dev): postgres + redis + clickhouse healthchecks; Prometheus optional profile
```

**Design principle:** Metrics are **emitted by the application**, not by sidecar exporters. Operational truth for queues and integrations is often **dual-sourced** (Prometheus + PostgreSQL poll logs / admin APIs).

---

## Component inventory

### 1. Prometheus

| Item | Status | Location |
|------|--------|----------|
| Scrape config (local) | ✅ | `backend/monitoring/prometheus/prometheus.yml.example` |
| Scrape config (VPS) | ✅ | `backend/monitoring/prometheus/prometheus.vps.yml` |
| Alert + recording rules | ✅ | `backend/monitoring/prometheus/alerts.yml` (100 alerts, 9 recording rules) |
| VPS deploy script | ✅ | `backend/scripts/ops/vps-setup-prometheus.sh` |
| Local docker-compose | ✅ Optional `--profile monitoring` | `backend/docker-compose.yml` |
| Alertmanager | ❌ | Not in repo |
| Infra exporters | ❌ | No node/postgres/redis/nginx exporters |
| Long-term storage | ❌ | No Thanos/Mimir/Cortex |

**Scrape target:** single job `synqdrive-backend` → `GET /api/v1/metrics` with Bearer token (`METRICS_BEARER_TOKEN`).

**Recording rules (9):** Fleet Health SLO (7) + Evaluations SLO (2) — no trip/notification/payment SLO recordings.

---

### 2. Alertmanager

| Item | Status |
|------|--------|
| Configuration | ❌ Not in repository |
| Routing (PagerDuty/Slack/email) | ❌ |
| Silences / inhibition | ❌ |
| Integration with `alerts.yml` | ❌ Rules evaluated only |

**Impact:** Operators must manually watch Prometheus UI or Grafana alert panels. No automated incident notification pipeline.

---

### 3. Grafana

| Dashboard | File | VPS deploy script |
|-----------|------|-------------------|
| SynqDrive Ops (general) | `synqdrive-ops.json` | ✅ |
| Battery V2 | `synqdrive-battery-v2.json` | ✅ |
| Document Intake V2 | `synqdrive-document-intake-v2.json` | ✅ |
| Driving Intelligence V2 | `synqdrive-driving-intelligence-v2.json` | ✅ |
| Fleet Health Service | `synqdrive-fleet-health-service.json` | ✅ |
| Evaluations / Forecast | `synqdrive-evaluations.json` | ❌ **Not copied by `vps-setup-grafana.sh`** |
| Notification Engine Ops | `notification-engine-ops.json` | ❌ **Not copied by setup script** |

**Provisioning:** `backend/monitoring/grafana/provisioning/` (datasource → `http://127.0.0.1:9090`, folder **SynqDrive**).

**Gaps:** No local Grafana in docker-compose; no IAM/connectivity/payments/brakes/tires/stations dashboards despite metrics existing.

---

### 4. ClickHouse

| Signal | Exists | Missing |
|--------|--------|---------|
| App metrics | ✅ `synqdrive_clickhouse_*` (status, mirror writes, HF inserts, analytics queries) | — |
| Alerts | ✅ 4 rules (`ClickHouseConfiguredUnavailable`, mirror failures, schema) | — |
| Health in readiness | ⚠️ Soft check (degraded, not blocking) | Hard fail when CH required |
| CH-native exporter | ❌ | All metrics app-emitted |
| Row-count gauges | ✅ Refreshed by `MetricsRefreshService` | Per-table SLO recordings |
| Ops scripts | ✅ `clickhouse-ping-url.sh`, `npm run clickhouse:ping:url` | — |
| Diagnostics API | ✅ Data Analyse + `clickhouse-diagnostics.service` | — |

**Dashboard:** Panels in `synqdrive-ops.json` — no dedicated CH board.

---

### 5. PostgreSQL

| Signal | Exists | Missing |
|--------|--------|---------|
| Readiness | ✅ `SELECT 1` via Prisma | — |
| Prometheus metrics | ⚠️ Battery table row gauges only | Connection pool, slow queries, bloat |
| Alerts | ❌ | No Postgres-specific rules |
| Ops SQL | ✅ `pg-bloat-report.sql`, reclaim scripts | Automated scheduling |
| Exporter | ❌ | `postgres_exporter` |
| Deploy backup | ✅ `pg_dump` in `vps-deploy-release.sh` | — |

---

### 6. Redis

| Signal | Exists | Missing |
|--------|--------|---------|
| Readiness | ✅ `PING` | — |
| Worker version check | ✅ Redis `INFO server` major ≥ 5 | — |
| Prometheus | ⚠️ Via BullMQ queue metrics; `synqdrive_evaluations_redis_errors_total` | Memory, evictions, keyspace |
| Alerts | ⚠️ Evaluations-path Redis errors only | General Redis health |
| Exporter | ❌ | `redis_exporter` |
| Docker healthcheck | ✅ `redis-cli ping` | — |

---

### 7. BullMQ / Workers

| Signal | Exists | Missing |
|--------|--------|---------|
| Queue lag histogram | ✅ `synqdrive_queue_lag_seconds` | — |
| Failed jobs gauge | ✅ `synqdrive_queue_failed_jobs` | — |
| Per-queue monitoring | ✅ `QueueMonitoringService` (17 queues) | — |
| Admin API | ✅ `/admin/monitoring/queues`, `platform-health` | — |
| Alerts | ✅ `QueueLagHigh`, `QueueFailedJobsHigh` + domain queues | — |
| Bull Board UI | ❌ | No queue browser |
| PM2 worker metrics | ❌ | Restart count, memory not in Prometheus |
| DLQ unified view | ⚠️ Per-domain (battery, notifications, voice) | Single DLQ dashboard |

**Monitored queues:** `dimo.snapshot.poll`, `dimo.vehicle.sync`, `dimo.dtc.poll`, `trip.tracking`, `trip.behavior.enrichment`, `notification.evaluation`, `notification.delivery`, `document.extraction`, `connectivity.webhook.process`, voice webhooks, fleet-health, evaluations, brake recalculation, etc.

---

### 8. PM2

| Signal | Exists | Missing |
|--------|--------|---------|
| Process management | ✅ VPS (`pm2 restart synqdrive`) | — |
| Ecosystem config in git | ❌ | `ecosystem.config.js` VPS-only |
| Log rotation | ✅ `setup-log-limits.sh` (50M×14) | — |
| Prometheus metrics | ❌ | Restarts, CPU, memory |
| PM2 Plus / monit | ❌ | — |

---

### 9. Docker

| Service | Healthcheck | Observability |
|---------|-------------|---------------|
| `postgres` | ✅ `pg_isready` | No exporter |
| `redis` | ✅ `redis-cli ping` | No exporter |
| `clickhouse` | ✅ `clickhouse-client SELECT 1` | App metrics only |
| `prometheus` | ❌ | Optional `--profile monitoring` |
| `grafana` | ❌ | Not in compose |

**Note:** `npm run infra:up` does not start Prometheus/Grafana.

---

### 10. Nginx

| Signal | Exists | Missing |
|--------|--------|---------|
| Security snippets | ✅ `nginx-synqdrive-hardening.snippet` (blocks public `/metrics`) | — |
| `stub_status` | ❌ | No status module config in repo |
| Access/error log aggregation | ❌ | VPS-only, not in repo |
| Prometheus exporter | ❌ | `nginx-prometheus-exporter` |
| Upstream health | ❌ | No active health check config in repo |

---

### 11. Backend (NestJS)

| Endpoint / module | Purpose |
|-------------------|---------|
| `GET /api/v1/health` | Liveness (uptime) |
| `GET /api/v1/health/readiness` | Postgres, Redis, workers, document extraction (hard); CH (soft) |
| `GET /api/v1/metrics` | Prometheus scrape (Bearer auth) |
| `GET /api/v1/admin/platform-health` | Aggregated ops (Master Admin) |
| `GET /api/v1/admin/monitoring/*` | Queues, workers, poll logs, alerts summary |
| `TripMetricsService` | Central `prom-client` registry (~280 `synqdrive_*` metrics) |
| `MetricsRefreshService` | Periodic gauge refresh (queues, CH rows, voice backlog) |
| Domain metric services | IAM, fleet-health, evaluations, payments, connectivity, tires, brakes, voice, vehicle-detail, stations-v2 |

**Cardinality policy:** Forbidden labels enforced in `prometheus-config.spec.ts` — no `vehicle_id`, `org_id`, `trip_id`, `vin`, etc.

---

### 12. Frontend

| Signal | Exists | Missing |
|--------|--------|---------|
| Master Admin platform health UI | ✅ Polls `platform-health` every 60s | — |
| System monitoring (poll logs) | ✅ Master Admin | — |
| Vehicle detail client counters | ⚠️ In-memory DEV only | Production export |
| Sentry / Datadog / PostHog | ❌ | Production error tracking |
| RUM / performance beacon | ❌ | — |
| Frontend health endpoint | ❌ | — |

**Backend vehicle-detail metrics** (`synqdrive_vehicle_detail_*`) cover API-side observability only.

---

### 13. DIMO Integration

| Signal | Exists | Missing |
|--------|--------|---------|
| Snapshot poll counter | ✅ `synqdrive_dimo_snapshot_poll_total` | DTC/sync as separate Prometheus counters |
| Connectivity webhooks | ✅ 18+ `synqdrive_connectivity_*` metrics | DIMO trigger-specific counters (RPM/ignition) |
| Alerts | ✅ Snapshot success rate + connectivity group (6 rules) | Dedicated DIMO alert group for auth |
| Poll logs (DB) | ✅ `dimo_poll_logs` + admin APIs | — |
| Token health snapshot | ✅ `DimoAuthService.getHealthSnapshot()` | Not in Prometheus |
| Webhook health endpoint | ✅ `GET /webhooks/dimo/health` | Not in readiness |
| Grafana | ⚠️ Panels in ops + battery dashboards | Dedicated DIMO board |
| Readiness probe | ❌ | DIMO API reachability not checked |

---

### 14. Stripe

| Path | Prometheus | Alerts | Dashboard |
|------|------------|--------|-----------|
| **Connect payments** (end-customer) | ✅ 9 metrics (`synqdrive_payment_*`) | ✅ 5 rules | Partial (ops) |
| **SaaS billing** (org subscriptions) | ❌ | ❌ | ❌ |

**SaaS billing monitoring:** `BillingMonitoringService` — DB-driven alerts (`BILLING_WEBHOOK_FAILED`, `BILLING_OUTBOX_DEAD_LETTER`, reconciliation drift) logged only, not exported to Prometheus or `alerts.yml`.

---

### 15. AI Services

| Service | Prometheus | Health | Alerts | Dashboard |
|---------|------------|--------|--------|-----------|
| **Document extraction / Intake V2** | ✅ ~30 metrics | In readiness | ✅ 12 rules | ✅ |
| **Voice assistant** | ✅ ~15 metrics | Provider util | ✅ 6 rules | Partial |
| **Evaluations / insights** | ✅ ~18 metrics | — | ✅ 12 rules | ✅ (not in VPS deploy) |
| **Fleet chat / LLM** | ❌ | Config-only `/ai/health` | ❌ | ❌ |

**Fleet chat gap:** Token usage in `AiRequestAuditLog` (DB) only — no `synqdrive_ai_*` counters, latency histograms, or cost metrics.

---

## Metrics inventory (by domain)

**Total:** ~302 custom metrics (`synqdrive_*` + `iam_*`) + Node.js default metrics (`process_*`, `nodejs_*`).

| Domain | Approx. count | Representative metrics | Alerted? | Dashboard? |
|--------|---------------|------------------------|----------|------------|
| Trips / enrichment | ~25 | `synqdrive_trip_finalized_total`, `synqdrive_enrichment_pending` | Partial | Ops |
| ClickHouse / DIMO poll | ~15 | `synqdrive_clickhouse_mirror_writes_total`, `synqdrive_dimo_snapshot_poll_total` | ✅ | Ops |
| Queues / workers | ~5 | `synqdrive_queue_lag_seconds`, `synqdrive_queue_failed_jobs` | ✅ | Ops + domain |
| Document extraction + Intake V2 | ~30 | `synqdrive_document_upload_total`, `_ocr_failed_total` | ✅ | ✅ |
| Notifications | ~25 | `synqdrive_notification_delivery_sent_total`, `_outbox_pending` | ✅ | ✅ |
| Task automation | ~7 | `synqdrive_task_automation_outbox_failed_total` | Partial | Fleet health |
| Driving Intelligence V2 | ~12 | `synqdrive_driving_intelligence_job_completed_total` | ❌ | ✅ |
| Battery V2 | ~35 | `synqdrive_battery_rest_measurements_total` | ✅ | ✅ |
| Brakes | ~22 | `synqdrive_brake_recalculation_total`, `_alert_total` | ✅ | ❌ |
| Tires | ~18 | `synqdrive_tire_recalculation_total`, `_alert_total` | ❌ | ❌ |
| Connectivity (DIMO) | ~18 | `synqdrive_connectivity_episode_opened_total` | ✅ | ❌ |
| Fleet Health | ~14 | `synqdrive_fleet_health_availability_total` | ✅ | ✅ |
| Evaluations | ~18 | `synqdrive_evaluations_insights_runs_total` | ✅ | ✅ |
| Payments (Connect) | ~9 | `synqdrive_payment_connect_webhook_backlog` | ✅ | ❌ |
| Voice | ~15 | `synqdrive_voice_webhook_dlq_total` | ✅ | Partial |
| Vehicle detail | ~6 | `synqdrive_vehicle_detail_request_total` | ❌ | ❌ |
| Stations V2 | ~3 | `synqdrive_stations_v2_summary_latency_seconds` | ❌ | ❌ |
| IAM | 21 | `iam_login_success_total`, `iam_audit_dead_letter_total` | ✅ | ❌ |
| **Workflows** | **0** | (notification bridge only: `synqdrive_notification_workflow_runs_total`) | ❌ | ❌ |
| **SaaS billing** | **0** | — | ❌ | ❌ |
| **Fleet chat AI** | **0** | — | ❌ | ❌ |

---

## Alert inventory (100 rules, 14 groups)

| Group | Count | Examples |
|-------|-------|----------|
| `synqdrive_availability` | 1 | `SynqDriveMetricsScrapeDown` |
| `synqdrive_clickhouse` | 4 | `ClickHouseConfiguredUnavailable`, `ClickHouseMirrorWritesFailing` |
| `synqdrive_workers` | 4 | `QueueLagHigh`, `DimoSnapshotSuccessRateLow`, `TripEnrichmentPendingHigh` |
| `synqdrive_document_extraction` | 8 | `DocumentExtractionQueueAgeHigh` |
| `synqdrive_document_intake_v2` | 4 | `DocumentIntakeUploadRejectionRateHigh` |
| `synqdrive_notifications` | 13 | `NotificationDeliveryWorkerStalled`, `NotificationCriticalOpenAgeHigh` |
| `synqdrive_payments` | 5 | `PaymentReconciliationMismatch`, `ConnectWebhookBacklogHigh` |
| `synqdrive_voice` | 6 | `VoiceWebhookDlqGrowing`, `VoiceMcpErrorRateHigh` |
| `synqdrive_battery_v2` | 7 | `BatteryV2DeadLetterJobsPresent` |
| `synqdrive_brakes` | 8 | `BrakeRecalculationFailureRateHigh` |
| `synqdrive_connectivity` | 6 | `ConnectivityWebhookDeadLetterGrowth` |
| `synqdrive_fleet_health` | 12 | `FleetHealthUnavailableShareHigh` |
| `synqdrive_iam` | 10 | `IamAuditOutboxDeadLetter` |
| `synqdrive_evaluations` | 12 | `EvaluationsApiLatencyP95Critical` |

**File:** `backend/monitoring/prometheus/alerts.yml`

Many alerts include `runbook_url`, `clear_condition`, and `owner` labels.

---

## Missing alerts (prioritized)

| ID | Domain | Suggested alert | Severity |
|----|--------|-----------------|----------|
| A-1 | **Alertmanager** | Wire routing to Slack/PagerDuty/email | P1 infra |
| A-2 | **Postgres** | Connection errors / readiness failure rate | P1 |
| A-3 | **Redis** | Memory > threshold / evictions | P2 |
| A-4 | **SaaS billing** | Export `BillingMonitoringService` codes to Prometheus + rules | P1 |
| A-5 | **Fleet chat AI** | LLM error rate, latency p95, token burn rate | P2 |
| A-6 | **Workflows** | Run failure rate, action DLQ, trigger backlog | P2 |
| A-7 | **Tires** | Mirror brake alert pattern (`TireRecalculationFailureRateHigh`) | P2 |
| A-8 | **Driving Intelligence** | Job failure rate (metrics exist, no dedicated rules) | P2 |
| A-9 | **DIMO auth** | Token fetch failure rate from health snapshot | P2 |
| A-10 | **Nginx** | 5xx rate / upstream unavailable | P2 |
| A-11 | **PM2** | Process restart loop | P2 |
| A-12 | **Frontend** | Error rate (requires instrumentation first) | P3 |
| A-13 | **Stations V2** | Summary latency SLO | P3 |
| A-14 | **Vehicle detail** | Provider error rate spike | P3 |

---

## Missing dashboards (prioritized)

| ID | Dashboard | Metrics available | Priority |
|----|-----------|-------------------|----------|
| D-1 | **IAM / Security** | 21 `iam_*` metrics, 10 alerts | P1 |
| D-2 | **Connectivity / DIMO** | 18 connectivity + DIMO poll metrics | P1 |
| D-3 | **Payments (Connect + SaaS billing)** | Connect metrics + billing DB alerts | P1 |
| D-4 | **Brakes & Tires** | 40 combined metrics, brake alerts only | P2 |
| D-5 | **Workflow automation** | DB runs only; minimal Prometheus | P2 |
| D-6 | **Fleet chat / AI** | Audit DB only | P2 |
| D-7 | **Infrastructure** (node/redis/postgres) | Requires exporters first | P2 |
| D-8 | **Stations V2** | 3 metrics | P3 |
| D-9 | **Vehicle detail API** | 6 metrics | P3 |
| D-10 | **ClickHouse deep-dive** | CH metrics scattered in ops | P3 |

**Deploy fix (no new dashboard):** Add `synqdrive-evaluations.json` and `notification-engine-ops.json` to `vps-setup-grafana.sh`.

---

## Missing health checks (prioritized)

| ID | Check | Current | Recommended |
|----|-------|---------|-------------|
| H-1 | **DIMO API reachability** | Token snapshot in platform-health only | Optional readiness sub-check or synthetic probe |
| H-2 | **Stripe webhook endpoint** | None | Synthetic or last-event-age gauge |
| H-3 | **LLM provider reachability** | `/ai/health` config-only | Lightweight probe (cached) |
| H-4 | **ClickHouse hard fail** | Soft in readiness | Config flag `CLICKHOUSE_REQUIRED=true` for CH-dependent deploys |
| H-5 | **BullMQ worker heartbeat** | Redis version check only | Per-queue stale-job detector |
| H-6 | **Nginx upstream** | None | `stub_status` + upstream check |
| H-7 | **Disk / memory (VPS)** | None | node_exporter |
| H-8 | **Frontend availability** | None | Synthetic check on SPA + API |
| H-9 | **Resend / email provider** | Partial via notification metrics | Dedicated health gauge |
| H-10 | **Root `/health` alias** | Only `/api/v1/health` | Nginx redirect or doc for probes |

### Existing health endpoints

| Endpoint | Auth | Checks |
|----------|------|--------|
| `GET /api/v1/health` | Public | Uptime |
| `GET /api/v1/health/readiness` | Public | Postgres, Redis, workers, document extraction, CH (soft) |
| `GET /api/v1/metrics` | Bearer | Prometheus registry |
| `GET /api/v1/ai/health` | Auth | LLM configured/streaming |
| `GET /api/v1/webhooks/dimo/health` | Public | Webhook HMAC config |
| `GET /api/v1/admin/platform-health` | Master Admin | Aggregated readiness + DIMO + queues |

**Deploy probe:** `curl https://app.synqdrive.eu/api/v1/health` (via `cloud-agent-deploy.sh`).

---

## Maturity scorecard

| Component | Metrics | Alerts | Dashboards | Health | Overall |
|-----------|---------|--------|------------|--------|---------|
| Backend core | 9/10 | 8/10 | 7/10 | 9/10 | **8/10** |
| BullMQ / workers | 9/10 | 9/10 | 8/10 | 7/10 | **8/10** |
| Notifications | 10/10 | 9/10 | 9/10 | 8/10 | **9/10** |
| Document / Intake V2 | 9/10 | 9/10 | 9/10 | 8/10 | **9/10** |
| ClickHouse | 8/10 | 7/10 | 6/10 | 7/10 | **7/10** |
| DIMO | 7/10 | 7/10 | 5/10 | 6/10 | **6/10** |
| Fleet Health | 8/10 | 9/10 | 9/10 | 7/10 | **8/10** |
| IAM | 8/10 | 8/10 | 3/10 | 6/10 | **6/10** |
| Evaluations | 8/10 | 8/10 | 7/10* | 6/10 | **7/10** |
| Voice AI | 8/10 | 7/10 | 5/10 | 6/10 | **7/10** |
| Stripe Connect | 8/10 | 7/10 | 4/10 | 4/10 | **6/10** |
| Stripe SaaS billing | 2/10 | 2/10 | 1/10 | 4/10 | **2/10** |
| Fleet chat AI | 2/10 | 1/10 | 1/10 | 5/10 | **2/10** |
| Workflows | 2/10 | 1/10 | 1/10 | 4/10 | **2/10** |
| Frontend | 3/10 | 1/10 | 4/10** | 3/10 | **3/10** |
| Prometheus/Alertmanager | 7/10 | 5/10*** | N/A | 6/10 | **6/10** |
| PostgreSQL / Redis / Nginx / PM2 / Docker | 3/10 | 2/10 | 2/10 | 6/10 | **3/10** |

\*Evaluations dashboard not in VPS deploy script.  
\*\*Frontend via Master Admin platform-health only.  
\*\*\*100 rules defined but no Alertmanager routing.

---

## Recommended remediation phases (2F.2+)

| Phase | Focus | Effort |
|-------|-------|--------|
| **2F.2** | Alertmanager deploy + Slack/email routing | Infra |
| **2F.3** | Fix VPS Grafana deploy script (2 missing dashboards) | Ops |
| **2F.4** | SaaS billing Prometheus export + alerts | Backend |
| **2F.5** | Fleet chat AI metrics + alerts | Backend |
| **2F.6** | Workflow run/action metrics + alerts | Backend |
| **2F.7** | IAM + Connectivity Grafana dashboards | Grafana |
| **2F.8** | node_exporter + postgres_exporter (optional) | Infra |
| **2F.9** | Frontend error tracking (Sentry or equivalent) | Frontend |

---

## Operator quick reference

```bash
# Health
curl -s https://app.synqdrive.eu/api/v1/health
curl -s https://app.synqdrive.eu/api/v1/health/readiness | jq .

# Metrics (requires bearer token)
curl -s -H "Authorization: Bearer $METRICS_BEARER_TOKEN" \
  https://app.synqdrive.eu/api/v1/metrics | head

# ClickHouse
cd backend && npm run clickhouse:ping:url

# Local Prometheus (profile)
cd backend && docker compose --profile monitoring up -d prometheus

# VPS monitoring refresh
bash backend/scripts/ops/vps-refresh-monitoring.sh
```

### Key file paths

| Artifact | Path |
|----------|------|
| Metrics registry | `backend/src/modules/observability/trip-metrics.service.ts` |
| Metrics endpoint | `backend/src/modules/observability/metrics.controller.ts` |
| Health service | `backend/src/modules/health/health.service.ts` |
| Alert rules | `backend/monitoring/prometheus/alerts.yml` |
| Grafana dashboards | `backend/monitoring/grafana/dashboards/` |
| VPS Prometheus setup | `backend/scripts/ops/vps-setup-prometheus.sh` |
| VPS Grafana setup | `backend/scripts/ops/vps-setup-grafana.sh` |
| Architecture doc | `architecture/PROMETHEUS_PRODUCTION_2026-07-08.md` |
| Notification runbook | `docs/operations/notification-engine-observability-runbook.md` |
| Evaluations runbook | `docs/operations/evaluations-observability-runbook.md` |

---

## Related documents

| Document | Relevance |
|----------|-----------|
| `architecture/PROMETHEUS_PRODUCTION_2026-07-08.md` | Prometheus production architecture |
| `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` | CH observability boundaries |
| `docs/remediation/end-to-end-data-consistency.md` | CH mirror metrics context |
| `docs/operations/notification-engine-observability-runbook.md` | Notification ops |
| `backend/docs/prometheus-production.md` | Operator guide |

---

**Phase 2F.1 statement:** Analysis only — no code, config, or infrastructure changes were made. This document is the baseline for Phase 2F.2+ observability remediation.
