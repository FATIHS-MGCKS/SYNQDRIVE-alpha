# R9 resilience — engineering scope (runtime/ops only)

This document belongs to the **isolated engineering PR** (not DIMO audit PR #1982).

## Files

| Path | Role |
|------|------|
| `r9-r24-webhook-recovery.mjs` | Authorized PUT recovery (gated) |
| `r9-r25-circuit-monitor.mjs` | Read-only DIMO GET monitor |
| `lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh` | Phase-1 nginx generator |
| `test/r9-resilience-nginx.docker-failover.sh` | Docker failover tests |
| `templates/vo5c-joint-deploy-phase1-webhook-safe.README.md` | Orchestrator integration notes |

## Monitor contract (R2.6)

- **No** POST to `/api/v1/webhooks/dimo`.
- Optional `--check-public-health` → GET `/api/v1/health` only.
- DIMO API/auth failures → exit **2**, `healthy: false`.
- Rate limit: set `R9_MONITOR_MIN_INTERVAL_MS` when wrapping with cron (default 60s documented).

## Rollout gates

1. Merge engineering PR.
2. VPS: adopt Phase-1 generator in joint orchestrator (separate change).
3. Staging deploy drill + `test/r9-resilience-nginx.local-failover.sh` green.
4. Enable read-only monitor cron (separate approval).

## R2.6 executed tests (2026-10-11 UTC)

| Scenario | Harness | Result |
|----------|---------|--------|
| Generator validation + injection rejection | `vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh` | PASS |
| Full `nginx -t` on Phase-1 snippet | `test/r9-resilience-nginx.config-test.sh` | PASS |
| Both replicas up / A down / both down | `test/r9-resilience-nginx.local-failover.sh` | PASS |
| Monitor lib contract | `node --test r9-r25-circuit-monitor.lib.spec.mjs` | PASS |
| R24 recovery lib | `node --test r9-r24-webhook-recovery.lib.spec.mjs` | PASS |
| Docker compose failover | `test/r9-resilience-nginx.docker-failover.sh` | BLOCKED (no dockerd in CI agent) |

## Documented-only (staging/VPS drill before prod)

- nginx reload failure → golden restore
- Build/migration failure → Phase 4 restore path
- Competing deploy lock
- Security-floor preflight violation
- Incompatible Prisma migration

Operator escalation (monitor): exit 2 → page on-call; inspect `dimoApiError.state`, `FAILURE_COUNT_NONZERO`, `COHORT_DRIFT`; no auto PUT (use gated `r9-r24-webhook-recovery.mjs`).
