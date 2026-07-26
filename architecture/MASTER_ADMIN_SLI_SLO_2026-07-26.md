# Master Admin SLI/SLO — Phase 2F.7 (V4.9.904)

**Date:** 2026-07-26  
**Scope:** Production Service Level Indicators, Objectives, error budgets, and escalation thresholds for eight platform capabilities.

## Summary

Phase 2F.7 formalizes **production-ready SLOs** for API availability/latency, queue processing, Stripe, DIMO, notifications, AI, and rental dashboard surfaces. Implementation is Prometheus-native: recording rules produce `synqdrive:slo:*` time series; `Slo*` alerts encode burn-rate and threshold escalation.

**Primary doc:** `docs/remediation/service-level-objectives.md`  
**Rules file:** `backend/monitoring/prometheus/alerts-slo.yml`

## SLO domains

| Domain | SLO target | Primary SLI | Owner label |
|--------|------------|-------------|-------------|
| API availability | 99.9% / 30d | `synqdrive:slo:api_scrape_up:ratio5m` | `platform` |
| API latency | p95 < 800ms (synthetic) | `synqdrive:slo:api_blackbox_latency_p95:5m` | `platform` |
| Queue processing | lag p95 < 120s | `synqdrive:slo:queue_lag_p95:10m` | `workers` |
| Stripe | webhook ≥ 99.5% | `synqdrive:slo:stripe_webhook_success_ratio:30m` | `billing` |
| DIMO | snapshot ≥ 95% | `synqdrive:slo:dimo_snapshot_success_ratio:30m` | `dimo` |
| Notifications | delivery ≥ 99% | `synqdrive:slo:notification_delivery_success_ratio:30m` | `notifications` |
| AI | extraction ≥ 95% | `synqdrive:slo:ai_doc_extraction_success_ratio:30m` | `ai` |
| Dashboard | ready share ≥ 80% | `synqdrive:slo:dashboard_fleet_ready_share` | `fleet-health-service` |

## Architecture

```
Application metrics (TripMetricsService / domain observability)
        │
        ▼
GET /api/v1/metrics  ◄── Prometheus scrape (30s)
        │
        ├── recording rules (synqdrive_slo_recording)
        │         └── synqdrive:slo:* SLI time series
        │
        └── alert rules (synqdrive_slo_alerts)
                  └── Slo* alerts (slo, owner, severity labels)
                            │
                            ▼
                  Alertmanager (Phase 2F.2 routing)
                            │
                            ▼
                  Grafana Platform Overview (Phase 2F.6 panels)
```

### Error budget model

Availability SLOs use Google SRE-style **error budget remaining**:

```
error_budget_remaining = 1 - (actual_bad_fraction / allowed_bad_fraction)
```

`SloApiAvailabilityFastBurn` applies multi-window burn (5m + 1h) at 14.4× / 6× multipliers for the 99.9% monthly target.

### Cardinality policy

SLO recording rules and alerts **never** use `org_id`, `vehicle_id`, or other high-cardinality labels. Platform SLOs are aggregate-only; per-tenant SLOs are explicitly out of scope.

## Prometheus wiring

| File | Role |
|------|------|
| `alerts-slo.yml` | 25 recording rules + 18 `Slo*` alerts |
| `prometheus.vps.yml` | VPS rule_files entry |
| `prometheus.yml.example` | Local/docker reference |
| `docker-compose.yml` | Monitoring profile mounts `alerts-slo.yml` |
| `vps-setup-prometheus.sh` | Copies SLO rules to `/opt/synqdrive/shared/prometheus/` |
| `vps-refresh-monitoring.sh` | Reloads Prometheus after deploy |

### Verification

```bash
curl -s 'http://127.0.0.1:9090/api/v1/rules' | jq '.data.groups[].name' | grep slo
```

Backend test: `prometheus-config.spec.ts` asserts `alerts-slo.yml` is loaded and defines core recording rules.

## Relationship to prior phases

| Phase | Contribution |
|-------|--------------|
| 2F.1 | Observability architecture audit |
| 2F.2 | Alertmanager routes for `slo` label |
| 2F.4 | Queue lag/failed-job metrics |
| 2F.5 | `synqdrive_dependency_up` complementary dependency SLIs |
| 2F.6 | Grafana dashboards visualize `synqdrive:slo:*` |

## Future work

1. Global NestJS HTTP histogram for all `/api/v1/*` routes
2. Dedicated SLO/error-budget row on Platform Overview Grafana board
3. Alertmanager `slo` → PagerDuty severity mapping
