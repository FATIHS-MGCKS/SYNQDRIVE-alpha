# Battery V2 — REST Shadow Canary (F.S Mobility Service)

**Status:** ACTIVE (Phase 3)  
**T0:** 2026-07-17 (UTC)  
**T+7 Review:** 2026-07-24  
**T+28 Minimum Gate Review:** 2026-08-14  

---

## Scope

| Field | Value |
|-------|-------|
| **Organization** | F.S Mobility Service |
| **Org ID** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **Vehicles (5)** | `c10351f8-b6a2-4258-947f-631aeaa6d359`, `19fedd4b-c4e8-4de8-a125-dab293326e7e`, `8c850ff1-4201-432b-af2e-2711dbc7ca48`, `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, `c43c3b45-b911-498f-baf9-4376dd585588` |
| **Pre-requisite** | Option B backfill completed (91 `REST_60M` measurements, 48 VALID) |

### Flags (VPS `/opt/synqdrive/shared/backend.env`)

| Flag | Value | Notes |
|------|-------|-------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | `true` | **ON** — starts live REST window pipeline |
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` | Must stay OFF |
| `BATTERY_V2_READINESS_ENABLED` | `false` | Must stay OFF |
| `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | (unset → false) | Must stay OFF |

**Scope note:** Flag is global (no org-scoped override). Only this org has battery V2 data today.

---

## What changes at T0

With `BATTERY_V2_REST_SHADOW_ENABLED=true`:

1. `LvRestWindowService` opens `REST_60M` / `REST_6H` windows on resting vehicles
2. `BATTERY_REST_TARGET_EVALUATE` jobs enqueue after rest delay (`BATTERY_REST_60M_MS`, `BATTERY_REST_6H_MS`)
3. New measurements get `quality=SHADOW` — **no** customer publication, **no** rental readiness blocks
4. Backfill measurements (`hist-snap-rest:*` idempotency keys) remain separate from live capture

---

## Post-start smoke (T0 + 1h)

```bash
# 1) Health
curl -sS https://app.synqdrive.eu/api/v1/health | jq .

# 2) Confirm flag in running process (on VPS)
grep BATTERY_V2_REST /opt/synqdrive/shared/backend.env
pm2 env 1 | grep BATTERY_V2 || true

# 3) Shadow report baseline (from release dir on VPS or agent with DB access)
cd /opt/synqdrive/current/backend
BATTERY_DATA_DIAGNOSTIC_ALLOW_REMOTE=1 BATTERY_DATA_DIAGNOSTIC_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --observation-days=1 --format=console

# 4) After vehicles rest 60+ min — expect live REST (not backfill keys)
# SQL (read-only): battery_measurements where idempotency_key NOT LIKE 'hist-snap-rest:%'
```

**T0 baseline expectation:** `liveRestCount` may still be 0 until first rest window completes (~60 min after engine-off).

**T0 actual (2026-07-17 ~14:34 UTC):** Shadow report (1d) shows `2 geplant, 2 erfasst` REST targets — pipeline active immediately after flag ON. Wake contamination 50% on n=2 (too early; review at T+7). `insufficient_data` expected until ≥28d.

---

## T+7 review checklist (2026-07-24)

- [ ] `liveRestCount > 0` (live `REST_60M`, idempotency keys **not** `hist-snap-rest:*`)
- [ ] `battery_measurement_sessions` with type `LV_REST_WINDOW` for canary vehicles
- [ ] `battery.v2` queue: `BATTERY_REST_TARGET_EVALUATE` jobs **completed** (not stuck in DLQ)
- [ ] Prometheus: `synqdrive_battery_rest_measurements_total` > 0
- [ ] Wake contamination `≤ 35%` (`BatteryRestWakeContaminationHigh` not firing persistently)
- [ ] Alert `BatteryRestCaptureMissingDespiteWindows` not firing
- [ ] Rental health: **no** new `battery_readiness_not_ready` blockers on canary fleet
- [ ] Shadow report:

```bash
cd backend
BATTERY_DATA_DIAGNOSTIC_ALLOW_REMOTE=1 BATTERY_DATA_DIAGNOSTIC_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --observation-days=7 \
  --format=markdown \
  --output=./tmp/battery-shadow-t7-faa710c9.md
```

### Decision at T+7

| Outcome | Action |
|---------|--------|
| Live REST capture working, gates OK | **Continue shadow** — keep flag ON, schedule T+28 formal gate review |
| `liveRestCount` still 0 | Root-cause: DIMO snapshots, trip FSM, job queue, capability — **do not** enable publication |
| Wake contamination > 35% | Investigate FSM/rest anchor timing — flag may stay ON but document RCA |
| Unexpected rental blockers | **Rollback:** `BATTERY_V2_REST_SHADOW_ENABLED=false` → `pm2 restart synqdrive --update-env` |

---

## Rollback

```bash
# On VPS — edit /opt/synqdrive/shared/backend.env
BATTERY_V2_REST_SHADOW_ENABLED=false
pm2 restart synqdrive --update-env
```

Shadow data **retained** (no purge required).

---

## References

- Deployment phases: `docs/runbooks/battery-health-v2-deployment.md` §7, §18.1d
- Shadow validation: `docs/runbooks/battery-health-v2-shadow-validation.md`
- Option B backfill: `docs/runbooks/battery-health-v2-deployment.md` §18.1c
