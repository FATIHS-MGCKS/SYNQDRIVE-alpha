# Master Admin — Grafana Production Dashboards (Phase 2F.6)

**Date:** 2026-07-26

## Summary

Eight new Master Admin Grafana dashboards with KPI rows, Prometheus alert stats, annotations, and cross-board drilldown links. VPS scripts now copy all dashboard JSON files.

## Dashboards (UID)

| Title | UID |
|-------|-----|
| Platform Overview | `synqdrive-platform-overview` |
| Infrastructure | `synqdrive-infrastructure` |
| Databases | `synqdrive-databases` |
| Queues & Workers | `synqdrive-queues-workers` |
| Billing & Payments | `synqdrive-billing-payments` |
| DIMO Integration | `synqdrive-dimo-integration` |
| AI Platform | `synqdrive-ai-platform` |
| Tenant Overview | `synqdrive-tenant-overview` |

## Tooling

- `backend/monitoring/grafana/scripts/generate-dashboards.mjs` — source generator
- `backend/scripts/ops/copy-grafana-dashboards.sh` — VPS sync all `*.json`
- `grafana-dashboards.spec.ts` — CI validation

## Related

- `docs/remediation/grafana-production.md`
