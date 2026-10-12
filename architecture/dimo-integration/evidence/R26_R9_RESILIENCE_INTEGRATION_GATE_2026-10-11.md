# R2.6 — R9 resilience integration gate (engineering isolation)

**Recorded:** 2026-10-11 UTC  
**Classification:** ENGINEERING_GATE (no production activation)

## PR isolation

| PR | Branch | Role | Status |
|----|--------|------|--------|
| #1982 | `cursor/dimo-integration-deep-audit-r1-1d7d` | DIMO audit / evidence | Active docs |
| #1984 | `cursor/r25-webhook-resilience-1d7d` | Mixed ~84 files with #1982 | **SUPERSEDED** → use #1985 |
| #1985 | `cursor/r26-r9-resilience-engineering-1d7d` | Isolated ops/runtime (16 files) | Draft engineering |

**Engineering HEAD:** `2a79e16f4` (R2.6 commit on #1985)  
**origin/main @ gate:** `0633d08311803b1473c6e7a274e5074e4cb69a08`  
**Production SHA (read-only SSH):** `92d3d61133ad524ae6d328dd0f603c525b0bd178`

## T+24 observation window

R2.4 authorized recovery ≈ **2026-10-11T20:40:46Z** / **20:40:55Z** UTC.  
Regular **T+24** window opens **earliest 2026-10-12T20:41:00Z**. Until then all provider/nginx wake claims remain **EARLY_OBSERVATION** (see R25).

## Executed offline tests (R2.6)

| Test | Result |
|------|--------|
| `vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh` | PASS |
| `test/r9-resilience-nginx.config-test.sh` (`nginx -t`) | PASS |
| `test/r9-resilience-nginx.local-failover.sh` | PASS (both up / A down / both down fail-closed) |
| `node --test` monitor + R24 lib | PASS |
| `test/r9-resilience-nginx.docker-failover.sh` | NOT_RUN (no dockerd in cloud agent) |

## VO5C orchestrator (read-only prod reference)

Production script: `/opt/synqdrive/shared/deploy-state/vo5c-joint-deploy-orchestrate.sh` (204 lines).  
Phase 1 global `return 503` confirmed — root cause for DIMO delivery failure during deploy.

Repo integration reference (not applied on VPS):

- `backend/scripts/ops/vo5c-joint-deploy-orchestrate.webhook-safe.sh`
- `backend/scripts/ops/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh`

## Monitor read-only contract (R2.6)

- No POST to `/api/v1/webhooks/dimo`
- DIMO Vehicle Triggers API GET only; optional `--check-public-health` → GET `/api/v1/health`
- DIMO API/auth/timeout → exit 2, `healthy: false`
- No JWT/private key logging; cohort allowlist 186946, 187361, 187784, 192922; exclude 187336, 190497
- Activation (cron) **not** enabled in R2.6

## Explicit non-actions (R2.6)

No production deploy, nginx reload, PM2 change, provider PUT/subscribe, monitor cron, MFA, local 187336 offboard, SQL/Redis mutation, merge, authority promotion.

## Rollout gate

1. Merge #1985 to `main`
2. Staging: VO5C drill with webhook-safe Phase 1 + docker failover script
3. Separate owner approval: replace VPS orchestrator Phase 1 + optional read-only monitor cron
4. T+24 read-only audit after **2026-10-12T20:41Z**
