# Master Admin — Alertmanager (Phase 2F.2)

**Date:** 2026-07-26  
**Version:** V4.9.899

## Summary

Production-ready Alertmanager deployment for SynqDrive VPS monitoring stack.

## Delivered

- Alertmanager config: severity routing, grouping, deduplication, maintenance windows, retry, escalation
- `alerts-infra.yml`: PostgreSQL, Redis, ClickHouse, BullMQ, DIMO, Stripe, backup, disk, RAM, CPU, SSL, queue backlog
- VPS scripts: `vps-setup-alertmanager.sh`, `vps-setup-node-exporter.sh`, `vps-setup-blackbox-exporter.sh`
- Backend gauge: `synqdrive_dependency_up{dependency}`
- Prometheus wired to Alertmanager on `127.0.0.1:9093`
- Doc: `docs/remediation/alertmanager.md`

## Ops

```bash
MONITORING_AUTO_BOOTSTRAP=1 bash backend/scripts/ops/vps-refresh-monitoring.sh
```
