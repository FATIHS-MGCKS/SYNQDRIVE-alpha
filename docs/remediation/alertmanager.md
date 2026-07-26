# Alertmanager — Phase 2F.2

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** Production-ready Alertmanager routing for SynqDrive VPS monitoring stack

---

## Executive summary

Phase 2F.2 closes the **Alertmanager gap** identified in Phase 2F.1. SynqDrive now ships:

- Alertmanager configuration with **severity routing**, **grouping**, **deduplication**, **maintenance windows**, **retry** (`repeat_interval`), and **escalation**
- Infrastructure alert rules (`alerts-infra.yml`) for platform + host coverage
- VPS bootstrap scripts for Alertmanager, node_exporter, and blackbox_exporter
- Backend gauge `synqdrive_dependency_up{dependency}` for PostgreSQL/Redis/ClickHouse probes

---

## Architecture

```
Prometheus (:9090)
    │ evaluate alerts.yml + alerts-infra.yml
    │ fire alerts
    ▼
Alertmanager (:9093)
    │ route by severity + component
    │ group_by [alertname, severity, component, cluster]
    │ inhibit_rules (cascade suppression)
    │ mute_time_intervals (maintenance windows)
    ▼
Receivers
    ├── synqdrive-critical   → Slack #critical + email on-call (repeat 30m)
    ├── synqdrive-escalation → email escalation (repeat 2h)
    ├── synqdrive-warning    → Slack #alerts + email ops (repeat 6h)
    └── synqdrive-null       → info / maintenance-muted
```

**Scrape targets (VPS):**

| Job | Target | Purpose |
|-----|--------|---------|
| `synqdrive-backend` | `127.0.0.1:3001` | App metrics + dependency gauges |
| `node` | `127.0.0.1:9100` | CPU, RAM, disk + backup textfile |
| `blackbox-ssl` | `127.0.0.1:9115` → `https://app.synqdrive.eu` | TLS cert expiry |

---

## Alertmanager features

### Routing by severity

| Severity | Receiver | `group_wait` | `repeat_interval` |
|----------|----------|--------------|-------------------|
| `critical` | `synqdrive-critical` + `synqdrive-escalation` | 10s | 30m / 2h |
| `warning` | `synqdrive-warning` | 1m | 6h |
| `info` | `synqdrive-null` (dropped) | — | — |

### Grouping & deduplication

- `group_by: ['alertname', 'severity', 'component', 'cluster']`
- `group_wait: 30s` — batch initial notifications
- `group_interval: 5m` — batch updates within a group
- Alertmanager natively deduplicates identical alert fingerprints

### Maintenance windows

`time_intervals: synqdrive-maintenance`

- Sunday 02:00–04:00 Europe/Berlin
- Weekdays 01:00–01:30 Europe/Berlin

During maintenance, **warning/info** alerts route to `synqdrive-null`. **Critical** alerts still page.

### Silence management

Operator silences via Alertmanager UI (SSH tunnel):

```bash
ssh -L 9093:127.0.0.1:9093 root@srv1374778.hstgr.cloud
# http://127.0.0.1:9093/#/silences
```

Create silences by `alertname`, `component`, or `severity` matchers.

### Retry

`repeat_interval` on each route controls re-notification until resolved.

### Escalation

Critical alerts use `continue: true` on the primary route, then a secondary route to `synqdrive-escalation` with a longer `repeat_interval` (2h) targeting `ALERTMANAGER_EMAIL_ESCALATION`.

### Inhibition (cascade suppression)

| Source | Suppresses |
|--------|------------|
| `SynqDriveBackendDown` | warning/info alerts |
| `PostgreSQLUnavailable` | bullmq, clickhouse warnings |
| `RedisUnavailable` | bullmq warnings |
| critical | same-name warning (equal: alertname, component, cluster) |

---

## Required alerts coverage

| Requirement | Alert name | Source file |
|-------------|------------|-------------|
| Backend Down | `SynqDriveBackendDown` | `alerts.yml` |
| PostgreSQL | `PostgreSQLUnavailable` | `alerts-infra.yml` |
| Redis | `RedisUnavailable` | `alerts-infra.yml` |
| ClickHouse | `ClickHouseUnavailable` + existing CH rules | `alerts-infra.yml` / `alerts.yml` |
| BullMQ | `BullMQWorkersDisabled`, `BullMQQueueBacklogCritical`, `BullMQFailedJobsCritical` + `QueueLagHigh` | `alerts-infra.yml` / `alerts.yml` |
| DIMO | `DimoIntegrationDegraded` + `DimoSnapshotSuccessRateLow` | `alerts-infra.yml` / `alerts.yml` |
| Stripe Webhooks | `StripeConnectWebhookBacklogCritical` + `ConnectWebhookBacklogHigh` | `alerts-infra.yml` / `alerts.yml` |
| Backup errors | `DatabaseBackupStale`, `DatabaseBackupMissing` | `alerts-infra.yml` |
| Disk Space | `HostDiskSpaceLow`, `HostDiskSpaceWarning` | `alerts-infra.yml` |
| RAM | `HostMemoryPressure` | `alerts-infra.yml` |
| CPU | `HostCpuHigh` | `alerts-infra.yml` |
| SSL expiry | `TlsCertificateExpiringSoon`, `TlsCertificateExpiringCritical` | `alerts-infra.yml` |
| Queue Stau | `BullMQQueueBacklogCritical`, `QueueLagHigh` | `alerts-infra.yml` / `alerts.yml` |

---

## VPS deployment

### First-time install

```bash
# 1. Configure notification secrets
cp /opt/synqdrive/current/backend/monitoring/alertmanager/alertmanager.env.example \
   /opt/synqdrive/shared/alertmanager/alertmanager.env
chmod 600 /opt/synqdrive/shared/alertmanager/alertmanager.env
# Edit: ALERTMANAGER_SLACK_WEBHOOK_URL, email recipients

# 2. Bootstrap full monitoring stack
MONITORING_AUTO_BOOTSTRAP=1 \
  bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh

# Or individually:
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-prometheus.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-alertmanager.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-node-exporter.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-blackbox-exporter.sh
```

### Post-deploy refresh (automatic)

`vps-deploy-release.sh` calls `vps-refresh-monitoring.sh` when `MONITORING_AUTO_REFRESH=auto`.

### Backup metric

After each successful `pg_dump`, deploy script writes:

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-backup-status-textfile.sh
```

Metric: `synqdrive_backup_last_success_timestamp` (node_exporter textfile collector).

---

## Local development

```bash
cd backend
mkdir -p monitoring/prometheus/secrets
echo -n "$METRICS_BEARER_TOKEN" > monitoring/prometheus/secrets/metrics_bearer_token
docker compose --profile monitoring up -d
```

| Service | URL |
|---------|-----|
| Prometheus | http://127.0.0.1:9090 |
| Alertmanager | http://127.0.0.1:9093 |
| node_exporter | http://127.0.0.1:9100/metrics |

Local Alertmanager uses `alertmanager.dev.yml` (null receiver — UI inspection only).

---

## Configuration files

| File | Purpose |
|------|---------|
| `backend/monitoring/alertmanager/alertmanager.yml.example` | Production template (envsubst) |
| `backend/monitoring/alertmanager/alertmanager.dev.yml` | Local compose |
| `backend/monitoring/alertmanager/alertmanager.env.example` | Secret template |
| `backend/monitoring/alertmanager/templates/synqdrive.tmpl` | Slack/email templates |
| `backend/monitoring/prometheus/alerts-infra.yml` | Platform + host alerts |
| `backend/monitoring/prometheus/prometheus.vps.yml` | VPS Prometheus + AM wiring |
| `backend/monitoring/blackbox/blackbox.yml` | TLS probe modules |

### VPS scripts

| Script | Role |
|--------|------|
| `vps-setup-alertmanager.sh` | Install Alertmanager container |
| `vps-setup-node-exporter.sh` | Host metrics + textfile dir |
| `vps-setup-blackbox-exporter.sh` | SSL probe exporter |
| `vps-backup-status-textfile.sh` | Backup timestamp gauge |
| `vps-refresh-monitoring.sh` | Sync all configs on deploy |

---

## Runbook snippets

### Backend Down {#backend-down}

1. `pm2 status synqdrive` — process running?
2. `curl -s http://127.0.0.1:3001/api/v1/health`
3. `pm2 logs synqdrive --lines 100`
4. Check disk (`df -h`) — deploy aborts at 90%

### PostgreSQL {#postgresql}

1. `sudo systemctl status postgresql`
2. `sudo -u postgres psql -c 'SELECT 1'`
3. Check `DATABASE_URL` in `/opt/synqdrive/shared/backend.env`

### Redis {#redis}

1. `redis-cli ping`
2. `systemctl status redis` (or docker if applicable)
3. BullMQ queues stall when Redis is down

### ClickHouse {#clickhouse}

1. `docker ps | grep clickhouse`
2. `cd /opt/synqdrive/current/backend && npm run clickhouse:ping:url`
3. PG remains canonical — CH outage is non-blocking for ops

### BullMQ {#bullmq}

1. Master Admin → Platform Health → queue summary
2. `synqdrive_queue_failed_jobs` in Prometheus
3. `WORKERS_ENABLED=true` in backend.env

### Stripe Webhooks {#stripe-webhooks}

1. Check `synqdrive_payment_connect_webhook_backlog`
2. Stripe Dashboard → Webhooks → delivery log
3. `POST /api/v1/webhooks/stripe-connect` reachability

### Backup {#backup}

1. `ls -lt /opt/synqdrive/shared/backups/`
2. Re-run: `sudo -u postgres pg_dump synqdrive | gzip > ...`
3. `bash vps-backup-status-textfile.sh`

### Disk Space {#disk-space}

1. `df -h /`
2. Prune old releases: `/opt/synqdrive/releases/`
3. Prune Docker: `docker system prune`

### Queue Stau {#queue-stau}

1. Identify queue from alert labels
2. Grafana → SynqDrive Ops → queue panels
3. Check worker logs; scale workers or clear poison jobs

---

## Environment variables

Set in `/opt/synqdrive/shared/alertmanager/alertmanager.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ALERTMANAGER_SLACK_WEBHOOK_URL` | Yes (Slack) | Incoming webhook URL |
| `ALERTMANAGER_SLACK_CHANNEL_WARNING` | No | Default `#synqdrive-alerts` |
| `ALERTMANAGER_SLACK_CHANNEL_CRITICAL` | No | Default `#synqdrive-critical` |
| `ALERTMANAGER_EMAIL_WARNING` | No | Warning email recipient |
| `ALERTMANAGER_EMAIL_CRITICAL` | No | On-call email |
| `ALERTMANAGER_EMAIL_ESCALATION` | No | Escalation contact |
| `ALERTMANAGER_SMTP_*` | If using email | Resend or SMTP relay |

---

## Related documents

| Document | Relevance |
|----------|-----------|
| `docs/remediation/observability-architecture.md` | Phase 2F.1 audit |
| `backend/docs/prometheus-production.md` | Prometheus operator guide |
| `architecture/PROMETHEUS_PRODUCTION_2026-07-08.md` | Original monitoring architecture |

---

## Verification checklist

- [ ] `curl http://127.0.0.1:9093/-/healthy` → OK
- [ ] Prometheus → Status → Alertmanagers → UP
- [ ] Prometheus → Alerts → pending/firing rules visible
- [ ] Test silence created and expires
- [ ] Slack test notification from critical route (temporarily lower threshold or use `amtool`)

---

*Phase 2F.2 implementation complete.*
