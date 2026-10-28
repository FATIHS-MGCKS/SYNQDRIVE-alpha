# Tire Wear V3 — global production activation attestation (2026-10-28)

| Field | Value |
|-------|--------|
| **Date (Europe/Berlin)** | 2026-10-28 ~21:24 (UTC 20:24) |
| **Owner authorization** | Explicit GO for global V3 despite missing authenticated HTTP baseline |
| **Binary SHA** | `6ec3844c3293e8b4a5863fe75562fd82f8f3a839` (release `20261028182651_v4994`, PR #2222 fail-closed hotfix) |
| **Mode** | Shared env flag activation + rolling PM2 `--update-env` — **no** binary redeploy |
| **Env backup** | `/opt/synqdrive/shared/backend.env.bak-tire-v3-cutover-20261028202439` |
| **Authenticated HTTP smoke** | **NOT VERIFIED** (401 without Clerk JWT; documented BLOCKED pre-cutover) |
| **Validation** | Read-only Nest `ApplicationContext` service-level checks (4 P3 vehicles) |

## Effective configuration (post-activation)

| Variable | Value |
|----------|--------|
| `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED` | `true` |
| `TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE` | `true` |
| `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` | unset / false |
| `MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED` | `false` |

Both replicas consume `/opt/synqdrive/shared/backend.env` via symlink (`backend/.env`).

## T-0 preflight (same day, before activation)

| Check | Result |
|-------|--------|
| SHA on `/opt/synqdrive/current` | `6ec3844c3…` |
| CI gate | `CI_GATE_PASS` on deploy SHA |
| V3 flags pre-cutover | absent / false |
| DB backup | `db-pre-deploy-20261028182651.sql.gz` — `gzip -t` PASS |
| V2 service baseline (4 vehicles) | PASS — `wearReadModel=v2`, no `wearV3` |
| `tire_health_snapshots` count / max `created_at` (T-0) | **9246** / **2026-10-28T19:41:19.827Z** |

## Activation procedure

1. Upsert both customer V3 flags in shared `backend.env`.
2. `pm2 restart … --only synqdrive --update-env` → wait health/readiness.
3. `pm2 restart … --only synqdrive-b --update-env` → scheduler convergence gate PASS (1 LEADER).
4. Public `GET https://app.synqdrive.eu/api/v1/health` → ok.

Post-activation scheduler: **3001=LEADER**, **3002=FOLLOWER** (observed at convergence).

## Service-level V3 validation (org `faa710c9-6d91-4079-a7d5-91fdccdec14a`)

| Vehicle | `wearReadModel` | `wearV3` | Notes |
|---------|-----------------|----------|--------|
| Tesla Model 3 | v3 | present | `BASELINE_ESTIMATE`; no point `treadDepthMm`; rental tires `unknown` + measurement-required copy |
| VW Tiguan | v3 | present | same pattern |
| Audi A4 | v3 | present | same pattern |
| VW Arteon | v3 | present | `INSUFFICIENT` wheel class; rental unevaluable / inspection copy |

Org isolation: wrong-org `getVehicleHealth` → `NotFoundException`. **Verdict: PASS** (all four).

No legacy GOOD fallback under authoritative V3; no fabricated point mm in insufficient-evidence cohort.

## Persistence (cutover window → +~79 min spot check)

| Metric | Since activation (`2026-10-28 20:24:39+00`) |
|--------|---------------------------------------------|
| New `tire_health_snapshots` rows | **0** |
| New `tire_wear_v3_prior_shadow_v1` rows | **0** |
| Total snapshots | **9246** (unchanged max `created_at`) |

## Rollback

**Not executed.** Flag rollback per `integration/TIRE_WEAR_V3_CUTOVER_PRODUCTION.md` §E.1 remains available without binary change.

## Agent artifacts (Cloud Agent run, not in git)

- `/opt/cursor/artifacts/t0-v2-baseline.json`
- `/opt/cursor/artifacts/tire-v3-activation.log`
- `/opt/cursor/artifacts/post-v3-validation.json`

## Follow-ups

1. Authenticated org-scoped HTTP GET smokes when Clerk JWT available (`fleet.read`).
2. Monitor hourly recalculation on scheduler LEADER for continued V2 snapshot suppression under authoritative flags.
3. Customer communication: intervals / evidence class — not workshop gauge precision (see runbook §G).
