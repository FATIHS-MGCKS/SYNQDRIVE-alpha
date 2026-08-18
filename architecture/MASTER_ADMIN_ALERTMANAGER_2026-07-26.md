# Master Admin — Alertmanager (Phase 2F.2)

**Date:** 2026-07-26 (runtime closure 2026-08-18)  
**Version:** V4.9.917

## Summary

Production-ready Alertmanager deployment for SynqDrive VPS monitoring stack. **MA-OBS-P1-001 CLOSED** 2026-08-18.

## Delivered

- Alertmanager config: severity routing, grouping, deduplication, maintenance windows, retry, escalation
- Email-only path via Resend SMTP when Slack webhook unset (`alertmanager.email.yml.example`)
- `alerts-infra.yml`: PostgreSQL, Redis, ClickHouse, BullMQ, DIMO, Stripe, backup, disk, RAM, CPU, SSL, queue backlog
- VPS scripts: `vps-setup-alertmanager.sh`, `vps-alertmanager-acceptance-test.sh`, `vps-setup-node-exporter.sh`, `vps-setup-blackbox-exporter.sh`
- Backend gauge: `synqdrive_dependency_up{dependency}`
- `PlatformOpsAlertmanagerService` → Master Admin `/admin/ops/alerts` (read-only AM state)
- Prometheus wired to Alertmanager on `127.0.0.1:9093` (localhost only)
- Persistence: `/opt/synqdrive/shared/alertmanager/data`
- Fail-closed: `amtool check-config` before container start
- Doc: `docs/remediation/alertmanager.md`, closure: `docs/final/master-admin-alertmanager-production-closure.md`

## Ops

```bash
# Bootstrap / refresh (requires /opt/synqdrive/shared/alertmanager/alertmanager.env)
bash backend/scripts/ops/vps-setup-alertmanager.sh

# Full monitoring stack
MONITORING_AUTO_BOOTSTRAP=1 bash backend/scripts/ops/vps-refresh-monitoring.sh

# Production acceptance (synthetic alert + delivery verification)
bash backend/scripts/ops/vps-alertmanager-acceptance-test.sh
```

## Production state (2026-08-18)

| Check | Status |
|-------|--------|
| Container `synqdrive-alertmanager` | Running (`prom/alertmanager:v0.27.0`) |
| `/-/healthy`, `/-/ready` | 200 |
| Prometheus `activeAlertmanagers` | `127.0.0.1:9093` |
| Receiver | Email via Resend SMTP (tested) |
| Network | `127.0.0.1:9093` only — not public |
