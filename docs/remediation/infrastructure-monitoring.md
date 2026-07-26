# Infrastructure Monitoring — Phase 2F.3

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** Node, Docker (cAdvisor), PostgreSQL, Redis, ClickHouse, Nginx exporters  
**Prerequisite:** Phase 2F.2 Alertmanager (`docs/remediation/alertmanager.md`)

---

## Executive summary

Phase 2F.3 extends SynqDrive monitoring from **application-centric** (backend `/metrics`) to **full infrastructure coverage**. All exporters bind to **localhost only** — consistent with the existing security model (no public `/metrics`, SSH tunnel for ops UIs).

| Component | Phase 2F.1 | Phase 2F.2 | Phase 2F.3 |
|-----------|------------|------------|------------|
| Node Exporter | Missing | ✅ `:9100` | ✅ Enhanced + documented |
| Docker Exporter | Missing | — | ✅ cAdvisor `:9323` |
| PostgreSQL Exporter | Missing | App gauge only | ✅ `:9187` + `pg_up` |
| Redis Exporter | Missing | App gauge only | ✅ `:9121` + `redis_up` |
| ClickHouse Exporter | Missing | App gauges | ✅ Native `:9363` |
| Nginx Exporter | Missing | — | ✅ `:9113` + stub_status |

**Dual-layer observability** is intentional: backend `synqdrive_dependency_up` (application view) + dedicated exporters (infrastructure view).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VPS (127.0.0.1 only)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  PM2 synqdrive :3001 ──► /api/v1/metrics (bearer auth)                      │
│  PostgreSQL (native) ◄── postgres_exporter :9187                            │
│  Redis (native)      ◄── redis_exporter :9121                               │
│  Nginx (host)        ◄── stub_status :8081 ── nginx_exporter :9113           │
│  Docker containers   ◄── cAdvisor :9323                                     │
│  ClickHouse (docker) ◄── native /metrics :9363                              │
│  Host OS             ◄── node_exporter :9100 (+ backup textfile)            │
│                                                                              │
│  Prometheus :9090 ──scrapes all──► alerts-infra.yml ──► Alertmanager :9093 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Exporter inventory

### 1. Node Exporter

| Item | Value |
|------|-------|
| Image | `prom/node-exporter:v1.8.2` |
| Port | `127.0.0.1:9100` |
| VPS script | `vps-setup-node-exporter.sh` |
| Metrics | CPU, RAM, disk, filesystem, load, textfile (`synqdrive_backup_last_success_timestamp`) |
| Alerts | `HostDiskSpaceLow`, `HostMemoryPressure`, `HostCpuHigh`, `DatabaseBackupStale` |

**Status:** Implemented in 2F.2; baseline host monitoring.

---

### 2. Docker Exporter (cAdvisor)

| Item | Value |
|------|-------|
| Image | `gcr.io/cadvisor/cadvisor:v0.49.1` |
| Port | `127.0.0.1:9323` |
| VPS script | `vps-setup-cadvisor.sh` |
| Prometheus job | `cadvisor` |
| Metrics | Per-container CPU, memory, network, filesystem |

**Note:** SynqDrive uses **cAdvisor** (industry standard) rather than a separate `docker_exporter` binary. Covers Prometheus, Grafana, ClickHouse, Alertmanager, and all exporter containers.

**Alerts:** `InfrastructureExporterScrapeDown{job="cadvisor"}`

---

### 3. PostgreSQL Exporter

| Item | Value |
|------|-------|
| Image | `quay.io/prometheuscommunity/postgres-exporter:v0.15.1` |
| Port | `127.0.0.1:9187` |
| VPS script | `vps-setup-postgres-exporter.sh` |
| DSN source | `DATABASE_URL` in `/opt/synqdrive/shared/backend.env` |
| Prometheus job | `postgres` |
| Key metrics | `pg_up`, `pg_stat_activity_count`, `pg_settings_max_connections` |

**Alerts:**

| Alert | Condition |
|-------|-----------|
| `PostgresExporterDown` | `pg_up == 0` |
| `PostgreSQLUnavailable` | `synqdrive_dependency_up{dependency="postgres"} == 0` (app layer) |
| `PostgresConnectionsHigh` | active connections > 80% max_connections |

**Security:** DSN contains credentials — container uses host network; metrics endpoint localhost-only.

---

### 4. Redis Exporter

| Item | Value |
|------|-------|
| Image | `oliver006/redis_exporter:v1.62.0` |
| Port | `127.0.0.1:9121` |
| VPS script | `vps-setup-redis-exporter.sh` |
| Config source | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` from `backend.env` |
| Prometheus job | `redis` |
| Key metrics | `redis_up`, `redis_memory_used_bytes`, `redis_connected_clients` |

**Alerts:**

| Alert | Condition |
|-------|-----------|
| `RedisExporterDown` | `redis_up == 0` |
| `RedisUnavailable` | `synqdrive_dependency_up{dependency="redis"} == 0` |
| `RedisMemoryHigh` | memory > 90% maxmemory (when maxmemory set) |

---

### 5. ClickHouse Exporter (native)

| Item | Value |
|------|-------|
| Mechanism | ClickHouse built-in Prometheus endpoint |
| Config | `backend/docker/clickhouse/config.d/prometheus.xml` |
| Port | `127.0.0.1:9363` |
| Prometheus job | `clickhouse` |
| Path | `/metrics` |

**Why native, not sidecar:** ClickHouse ships first-class Prometheus support — no separate exporter container needed. Config enables metrics, events, and asynchronous_metrics.

**VPS action:** Ensure `prometheus.xml` is mounted in the ClickHouse container and port `9363` is published to localhost (same pattern as docker-compose).

**Alerts:** `ClickHouseUnavailable` (app), `ClickHouseExporterScrapeErrors`, existing `ClickHouseConfiguredUnavailable` in `alerts.yml`

---

### 6. Nginx Exporter

| Item | Value |
|------|-------|
| Image | `nginx/nginx-prometheus-exporter:1.3.0` |
| Port | `127.0.0.1:9113` |
| VPS script | `vps-setup-nginx-exporter.sh` |
| Scrape URI | `http://127.0.0.1:8081/nginx_status` |
| Prerequisite | `nginx-stub-status.snippet` applied on VPS |
| Prometheus job | `nginx` |
| Key metrics | `nginx_connections_active`, `nginx_http_requests_total`, `nginx_up` |

**stub_status setup (one-time on VPS):**

```bash
# Copy snippet to nginx conf.d
cp /opt/synqdrive/current/backend/scripts/ops/nginx-stub-status.snippet \
   /etc/nginx/conf.d/synqdrive-stub-status.conf
nginx -t && systemctl reload nginx
curl -s http://127.0.0.1:8081/nginx_status
```

**Alerts:** `NginxStubStatusUnreachable`, `NginxHighActiveConnections`

**Security:** stub_status listens on `127.0.0.1:8081` only — not exposed via public nginx `:443`.

---

## Port matrix (localhost only)

| Service | Port | Job name |
|---------|------|----------|
| Backend metrics | 3001 | `synqdrive-backend` |
| node_exporter | 9100 | `node` |
| nginx_exporter | 9113 | `nginx` |
| blackbox_exporter | 9115 | (probe relay) |
| postgres_exporter | 9187 | `postgres` |
| redis_exporter | 9121 | `redis` |
| cAdvisor | 9323 | `cadvisor` |
| ClickHouse Prometheus | 9363 | `clickhouse` |
| Prometheus UI | 9090 | — |
| Alertmanager UI | 9093 | — |
| Grafana UI | 3000 | — |

---

## VPS deployment

### Bootstrap all exporters

```bash
# Optional overrides
mkdir -p /opt/synqdrive/shared/exporters
cp /opt/synqdrive/current/backend/monitoring/exporters/exporters.env.example \
   /opt/synqdrive/shared/exporters/exporters.env

# One-shot install
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-infra-exporters.sh

# Or full monitoring stack (includes Prometheus + Alertmanager refresh)
MONITORING_AUTO_BOOTSTRAP=1 \
  bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh
```

### Per-component scripts

| Script | Component |
|--------|-----------|
| `vps-setup-node-exporter.sh` | Host metrics |
| `vps-setup-cadvisor.sh` | Docker containers |
| `vps-setup-postgres-exporter.sh` | PostgreSQL |
| `vps-setup-redis-exporter.sh` | Redis |
| `vps-setup-nginx-exporter.sh` | Nginx |
| `vps-setup-blackbox-exporter.sh` | TLS probes |
| `vps-setup-infra-exporters.sh` | All of the above |

### ClickHouse on VPS

After deploying `prometheus.xml`, recreate or restart ClickHouse with port mapping:

```bash
# Verify native metrics endpoint
curl -s http://127.0.0.1:9363/metrics | head
```

If ClickHouse was deployed before 2F.3, add `-p 127.0.0.1:9363:9363` to the container run command or docker-compose override.

---

## Local development

```bash
cd backend
mkdir -p monitoring/prometheus/secrets
echo -n "$METRICS_BEARER_TOKEN" > monitoring/prometheus/secrets/metrics_bearer_token
docker compose --profile monitoring up -d
```

Local stack includes: Prometheus, Alertmanager, node_exporter, cAdvisor, postgres_exporter, redis_exporter, blackbox_exporter. ClickHouse native metrics available when clickhouse service is running.

**Nginx exporter** is VPS-only (no nginx in local docker-compose).

---

## Configuration files

| Path | Purpose |
|------|---------|
| `monitoring/prometheus/prometheus.vps.yml` | VPS scrape config (all jobs) |
| `monitoring/prometheus/prometheus.docker.yml` | Local compose scrape config |
| `monitoring/prometheus/alerts-infra.yml` | Platform + host + exporter alerts |
| `monitoring/exporters/exporters.env.example` | Optional exporter overrides |
| `docker/clickhouse/config.d/prometheus.xml` | ClickHouse native Prometheus |
| `scripts/ops/nginx-stub-status.snippet` | Nginx stub_status (localhost) |

---

## Gap analysis (before → after)

| Gap (2F.1) | Resolution (2F.3) |
|------------|-------------------|
| No node_exporter | ✅ Phase 2F.2 + documented |
| No Docker metrics | ✅ cAdvisor |
| No postgres_exporter | ✅ postgres_exporter + `pg_up` alerts |
| No redis_exporter | ✅ redis_exporter + `redis_up` alerts |
| No ClickHouse exporter | ✅ Native Prometheus endpoint |
| No nginx stub_status | ✅ Snippet + nginx-prometheus-exporter |
| Infra alerts missing | ✅ `synqdrive_exporters` alert group |

### Remaining (out of scope 2F.3)

| Item | Notes |
|------|-------|
| SaaS billing metrics | Application layer — Phase 2F.4+ |
| Fleet chat / workflow metrics | Application layer |
| Frontend RUM | Separate initiative |
| `postgres_exporter` read-only DB user | Recommended hardening — currently uses app DSN |
| Grafana infra dashboards | Optional follow-up |

---

## Runbook snippets

### Exporter down {#exporter-down}

1. `docker ps | grep synqdrive-`
2. `docker logs synqdrive-<exporter> --tail 50`
3. Re-run setup script for the failed exporter
4. `curl http://127.0.0.1:<port>/metrics | head`

### PostgreSQL exporter {#postgresql-exporter}

1. `curl -s http://127.0.0.1:9187/metrics | grep pg_up`
2. Verify `DATABASE_URL` in `backend.env`
3. `sudo -u postgres psql -c 'SELECT 1'`
4. Check `pg_hba.conf` allows local connections

### Redis exporter {#redis-exporter}

1. `curl -s http://127.0.0.1:9121/metrics | grep redis_up`
2. `redis-cli -h 127.0.0.1 ping`
3. Verify `REDIS_PASSWORD` if auth enabled

### Nginx exporter {#nginx-exporter}

1. `curl -s http://127.0.0.1:8081/nginx_status`
2. If 404/connection refused → apply `nginx-stub-status.snippet`
3. `nginx -t && systemctl reload nginx`
4. Restart `synqdrive-nginx-exporter` container

### cAdvisor {#cadvisor}

1. `curl -s http://127.0.0.1:9323/metrics | grep container_cpu`
2. Requires Docker socket access — container runs `--privileged`
3. `docker logs synqdrive-cadvisor`

---

## Verification checklist

```bash
# All exporter health checks (on VPS)
for port in 9100 9113 9115 9187 9121 9323 9363; do
  echo -n "Port $port: "
  curl -sf "http://127.0.0.1:$port/metrics" | head -1 || echo FAIL
done

# Prometheus targets
curl -s 'http://127.0.0.1:9090/api/v1/targets' | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
```

Expected: all jobs `up`.

---

## Related documents

| Document | Relevance |
|----------|-----------|
| `docs/remediation/observability-architecture.md` | Phase 2F.1 audit |
| `docs/remediation/alertmanager.md` | Phase 2F.2 routing |
| `backend/docs/prometheus-production.md` | Operator guide |
| `architecture/PROMETHEUS_PRODUCTION_2026-07-08.md` | Original design |

---

*Phase 2F.3 implementation complete.*
