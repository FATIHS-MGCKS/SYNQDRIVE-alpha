# Data Authorization — Production Rollout

## Pre-deploy checklist

- [ ] `DATA_AUTH_DECISION_DEV_BYPASS=false`
- [ ] `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=true`
- [ ] `DATA_AUTH_DECISION_GLOBAL_DENY=false` (unless incident)
- [ ] `npm run test:data-auth:coverage` passes (no unregistered paths)
- [ ] CI workflow `data-authorization-production-readiness.yml` green
- [ ] Grafana dashboard `synqdrive-data-authorization` imported
- [ ] Prometheus alert group `synqdrive_data_auth` loaded

## dev-bypass

Never enable `DATA_AUTH_DECISION_DEV_BYPASS` in production. Alert `DataAuthDevBypassEnabledInProduction` is **critical**.

## enforcement-disabled

`DATA_AUTH_DECISION_ENFORCEMENT_ENABLED` must be `true` in production. Shadow mode is per-policy, not global disable.

## Monitoring after deploy

1. `data_auth_build_info` shows expected `git_commit` and `build_version`.
2. `data_auth_dev_bypass_enabled == 0`
3. `data_auth_unregistered_path_total == 0`
4. Decision latency p95 stable below 500ms under normal load.

## VPS monitoring refresh

```bash
bash backend/scripts/ops/vps-refresh-monitoring.sh
```

Imports dashboards from `backend/monitoring/grafana/dashboards/` and reloads `alerts.yml`.
