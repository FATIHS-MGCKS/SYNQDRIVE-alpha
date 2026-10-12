# R9 resilience — engineering scope (runtime/ops only)

Engineering draft PR **#1985** (`cursor/r26-r9-resilience-engineering-1d7d`). DIMO audit/evidence: **#1982** only.

See `PR_ANCESTRY_R9_RESILIENCE.md` for PR overlap / R24 authority.

## R2.7b abort safety (2026-10-11 UTC)

| Command | Result |
|---------|--------|
| `test/vo5c-orchestrator-abort-injection.selftest.sh` | PASS (explicit exit, idempotent restore, SIGTERM) |
| `test/vo5c-phase1-routing-gate.selftest.sh` | PASS (no POST probe) |
| `lib/vps-vo5c-orchestrator-abort.lib.sh` | Central EXIT/INT/TERM + `vo5c_abort_fail` restore |

## R2.7 executed tests (2026-10-11 UTC)

| Command | Env | Exit | Result |
|---------|-----|------|--------|
| `vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh` | agent | 0 | PASS |
| `test/vo5c-http-check.selftest.sh` | agent | 0 | PASS (503 without curl -f) |
| `test/r9-resilience-nginx.config-test.sh` | agent + nginx | 0 | PASS `nginx -t` |
| `test/r9-resilience-nginx.local-failover.sh` | agent | 0 | PASS |
| `test/r9-resilience-nginx.composite-integration.sh` | agent | 0 | PASS (generated Phase-1 config) |
| `node --test r9-r25-circuit-monitor.lib.spec.mjs` | agent | 0 | PASS (10 cases) |
| `node --test r9-r24-webhook-recovery.lib.spec.mjs` | agent | 0 | PASS |
| `vps-vo5c-security-floor-rollback.selftest.sh` | agent | 0 | PASS |
| `vps-vo5c-pinned-deploy-execution-contract.selftest.sh` | agent | 0 | PASS |
| `test/r9-resilience-nginx.docker-failover.sh` | agent | — | **NOT_RUN** (no dockerd) |

## Staging-only gates (not executed offline)

- Full `vo5c-joint-deploy-orchestrate.webhook-safe.sh` on VPS (requires owner SHA pins + replicas)
- Competing deploy / build-migration failure / nginx reload failure with real `systemctl`
- Docker compose failover harness

## Monitor contract (R2.7)

- No POST to `/api/v1/webhooks/dimo`
- DIMO GET + optional `--check-public-health`
- Malformed subscribers / unknown `failureCount` / contract drift → unhealthy
- Local rate limit via `R9_MONITOR_STATE_PATH` + `R9_MONITOR_MIN_INTERVAL_MS` (exit 3)
- No credentials in JSON output

## Rollout

1. Human merge #1985 after CI green + review
2. Staging VO5C drill with webhook-safe orchestrator
3. Separate approval: VPS Phase-1 swap + optional read-only monitor cron

## R3.1 Master Admin monitoring (engineering)

- API: `GET /api/v1/admin/ops/dimo-webhook-health` (`?refresh=1` manual, rate-limited)
- UI: Plattform & Betrieb → Diagnostik → **DIMO Webhooks**
- Evaluation: `r9-r25-circuit-monitor.lib.mjs` via server bridge (cohort override via env `DIMO_R9_AUTHORIZED_COHORT_TOKEN_IDS` / `DIMO_R9_EXCLUDED_TOKEN_IDS`)
