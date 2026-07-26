# Grafana Production Dashboards — Phase 2F.6

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** Master Admin observability UI — dashboard audit, production boards, VPS provisioning

---

## Executive summary

Phase 2F.6 delivers **eight professional Master Admin dashboards** in the SynqDrive Grafana folder, with consistent KPI rows, Prometheus alert visibility, cross-dashboard drilldowns, and VPS deploy scripts that copy **all** dashboard JSON files (not a partial subset).

Existing domain dashboards (Battery V2, DI V2, Document Intake V2, Fleet Health, Evaluations, Notification Engine Ops, legacy Ops) are retained and linked from the new **Platform Overview** entry point.

---

## Dashboard inventory (audit)

### Before 2F.6

| Dashboard | UID | VPS deploy | Gaps |
|-----------|-----|------------|------|
| SynqDrive Ops | `synqdrive-ops` | ✅ | Mixed domain panels; no alert row; weak drilldowns |
| Battery V2 | — | ✅ | Domain-specific |
| Driving Intelligence V2 | — | ✅ | Domain-specific |
| Document Intake V2 | — | ✅ | Domain-specific |
| Fleet Health Service | — | ✅ | Domain-specific |
| Evaluations | — | ❌ **not copied** | Orphaned in repo |
| Notification Engine Ops | — | ❌ **not copied** | Orphaned in repo |

**Cross-cutting gaps:** No dedicated boards for infrastructure, databases, queues, billing, DIMO, AI, or tenant/IAM overview. Alert state not visible on dashboards. `vps-setup-grafana.sh` copied only 5 of 7 files.

### After 2F.6

| Dashboard | UID | Purpose |
|-----------|-----|---------|
| **Platform Overview** | `synqdrive-platform-overview` | Executive KPIs, dependency map, firing alerts table |
| **Infrastructure** | `synqdrive-infrastructure` | Host CPU/mem/disk, cAdvisor, nginx, blackbox |
| **Databases** | `synqdrive-databases` | Postgres, Redis, ClickHouse (app + exporters) |
| **Queues & Workers** | `synqdrive-queues-workers` | BullMQ failures, lag, domain queue drilldowns |
| **Billing & Payments** | `synqdrive-billing-payments` | Stripe Connect, reconciliation, email DLQ |
| **DIMO Integration** | `synqdrive-dimo-integration` | Snapshot polling, connectivity webhooks |
| **AI Platform** | `synqdrive-ai-platform` | LLM probe, doc AI pipeline, Voice AI |
| **Tenant Overview** | `synqdrive-tenant-overview` | IAM, fleet health SLO, evaluations (aggregate) |

Plus **7 legacy/domain dashboards** (15 JSON files total).

---

## Design principles

### 1. Vollständigkeit (completeness)

Each board covers:
- **KPI row** — current health stats with green/red thresholds
- **Alert row** — `sum(ALERTS{alertstate="firing", ...})` filtered by domain
- **Trend panels** — rates, histogram p95, backlog gauges
- **Drilldown links** — dashboard header links to all Master Admin boards

### 2. Lesbarkeit (readability)

- Consistent layout: KPI → Alerts → domain sections (row panels)
- `graphTooltip: 1` (shared crosshair) on new boards
- Legend tables with mean/max on time series
- 30s auto-refresh on platform board
- Prometheus annotation layer for firing `ALERTS`

### 3. KPI selection

KPIs use **actionable signals** already emitted by the backend or infra exporters:

| Board | Primary KPIs |
|-------|----------------|
| Platform | scrape UP, workers, dependency_up (postgres/redis/queue), CH available |
| Infrastructure | node/cAdvisor/nginx/blackbox `up`, disk free % |
| Databases | dependency_up per store, CH schema status, exporter `up` |
| Queues | workers, failed jobs sum, enrichment pending, outbox gauges |
| Billing | Stripe probe, webhook backlog, reconciliation mismatches |
| DIMO | DIMO probe, snapshot success %, connectivity coverage |
| AI | AI + doc-extract probes, OCR fail rate, voice DLQ |
| Tenant | login success/fail, cross-tenant denials, fleet ready share |

**Cardinality rule preserved:** no `org_id`, `vehicle_id`, or tenant labels in PromQL.

### 4. Alarmdarstellung (alert display)

Three mechanisms:
1. **Stat panels** — firing alert counts by severity/domain
2. **Annotations** — `ALERTS{alertstate="firing"}` timeline markers
3. **Table panel** (Platform) — instant query on firing alerts for operator detail

Requires Prometheus alert rules loaded (`alerts.yml`, `alerts-app-health.yml`, and infra rules when deployed).

### 5. Drilldowns

- Every new dashboard includes **header links** to all Master Admin boards + Legacy Ops
- Platform **dependency_up** chart → identify failing integration → open domain board
- Queues board → per-queue panels (DIMO, doc extraction, voice) → domain dashboards

---

## Infrastructure exporter dependency

The **Infrastructure** and parts of **Databases** boards include panels for:

| Exporter | Job label | Phase |
|----------|-----------|-------|
| node_exporter | `node` | 2F.3 |
| cAdvisor | `cadvisor` | 2F.3 |
| postgres_exporter | `postgres` | 2F.3 |
| redis_exporter | `redis` | 2F.3 |
| nginx_exporter | `nginx` | 2F.3 |
| blackbox_exporter | `blackbox` | 2F.2 |

When exporters are not deployed, panels show **No data** — app-level `synqdrive_dependency_up` panels still work via the Databases/Platform boards.

---

## File layout

```
backend/monitoring/grafana/
├── dashboards/
│   ├── synqdrive-platform-overview.json      # NEW
│   ├── synqdrive-infrastructure.json         # NEW
│   ├── synqdrive-databases.json              # NEW
│   ├── synqdrive-queues-workers.json         # NEW
│   ├── synqdrive-billing-payments.json       # NEW
│   ├── synqdrive-dimo-integration.json       # NEW
│   ├── synqdrive-ai-platform.json            # NEW
│   ├── synqdrive-tenant-overview.json        # NEW
│   ├── synqdrive-ops.json                    # legacy
│   ├── synqdrive-battery-v2.json
│   ├── synqdrive-driving-intelligence-v2.json
│   ├── synqdrive-document-intake-v2.json
│   ├── synqdrive-fleet-health-service.json
│   ├── synqdrive-evaluations.json
│   └── notification-engine-ops.json
├── provisioning/
│   ├── datasources/prometheus.yml
│   └── dashboards/default.yml
└── scripts/
    └── generate-dashboards.mjs               # Regenerate 8 Master Admin boards
```

---

## Regenerating dashboards

After editing `generate-dashboards.mjs`:

```bash
node backend/monitoring/grafana/scripts/generate-dashboards.mjs
```

Commit the generated JSON files — Grafana provisioning reads static JSON, not the script at runtime.

---

## VPS deployment

### First install

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-grafana.sh
```

### Refresh after deploy

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh
```

Both scripts now call `copy-grafana-dashboards.sh` to sync **all** `dashboards/*.json` files.

### Access

```bash
ssh -L 3000:127.0.0.1:3000 root@srv1374778.hstgr.cloud
# Open http://localhost:3000 — folder: SynqDrive
```

Credentials: `GRAFANA_ADMIN_PASSWORD` in `/opt/synqdrive/shared/backend.env`.

---

## Recommended navigation

1. Start at **SynqDrive — Platform Overview**
2. Check KPI + firing alerts table
3. Drill into failing domain (e.g. Queues, DIMO, Databases)
4. For deep domain ops, open legacy boards (Battery V2, DI V2, Notification Engine Ops)

---

## Testing

```bash
cd backend && npm test -- --testPathPattern=grafana-dashboards
```

Validates JSON structure, required Master Admin files, uid/title/tags, and platform drilldown links.

---

## Related phases

| Phase | Contribution |
|-------|----------------|
| 2F.1 | Observability architecture audit |
| 2F.2 | Alertmanager + blackbox |
| 2F.3 | Infra exporters (Infrastructure/DB panels) |
| 2F.4 | Worker queue metrics (Queues board) |
| 2F.5 | `synqdrive_dependency_up` (Platform/DB/AI boards) |

---

## Changes / Architektur

Updated in `ChangesView.tsx` and `ArchitekturView.tsx` (V4.9.903).
