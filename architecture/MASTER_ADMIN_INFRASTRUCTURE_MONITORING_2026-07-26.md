# Master Admin — Infrastructure Monitoring (Phase 2F.3)

**Date:** 2026-07-26  
**Version:** V4.9.900

## Summary

Full infrastructure exporter stack: node_exporter, cAdvisor (Docker), postgres_exporter, redis_exporter, ClickHouse native Prometheus, nginx-prometheus-exporter.

## Delivered

- VPS setup scripts for all exporters + `vps-setup-infra-exporters.sh` orchestrator
- ClickHouse `prometheus.xml` (port 9363)
- nginx `stub_status` snippet (localhost :8081)
- Prometheus scrape jobs in `prometheus.vps.yml` / `prometheus.docker.yml`
- `alerts-infra.yml` exporter alert group
- Doc: `docs/remediation/infrastructure-monitoring.md`

## Security

All exporters bind `127.0.0.1` only. Nginx stub_status not exposed on :443.
