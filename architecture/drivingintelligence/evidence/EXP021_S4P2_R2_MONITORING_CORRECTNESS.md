# EXP021-S4P2-R2 — Monitoring correctness (final pre-merge)

| Field | Value |
|-------|-------|
| PR | **#1988** (draft) |
| Production | **READ-ONLY** — no deploy this slice |
| GLOBAL_KILL | **KILLED** (unchanged) |

## 1. Alert self-suppression

**Problem:** `markDiV0S4OperationalRefreshFailed()` cleared `activity_signal`, while `DiV0S4OperationalMetricsStale` required `activity_signal >= 1`, so a failed refresh could silence the stale/failure alert.

**Change:**

- New gauge `synqdrive_di_v0_s4_shadow_plane_engaged` — set on successful refresh; **retained** across refresh failures via `lastShadowPlaneEngaged` in `DiV0S4OperationalMetricsService`.
- Stale alert gates on `shadow_plane_engaged >= 1` (and refresh_error / last_success age).

**Tests:** Jest `markDiV0S4OperationalRefreshFailed` retention + recovery; promtool `refresh_failure_retains_engaged_stale_fires` / `refresh_recovery_clears_stale`.

## 2. Dormant history & authorized pilot

**Problem:** Summing all work lifecycle statuses treated historical `COMPLETED` as “active”. `DiV0S4GlobalKillOpen` paged authorized `NOT_KILLED` + staged pilots.

**Change:**

- `sumInFlightShadowWorkItems()` — PENDING, LEASED, FAILED_RETRYABLE, FAILED_TERMINAL only.
- `computeDiV0S4ShadowPlaneEngaged()` — KILLED + no in-flight work → 0 even if config staged; NOT_KILLED + staged → 1 (normal pilot).
- Replaced `DiV0S4GlobalKillOpen` with **`DiV0S4GlobalKillSuspectOrphan`** (NOT_KILLED, attestation not STAGED, shadow_plane_engaged == 0, 30m).

### global-kill

Authorized production pilot: `global_not_killed=1`, `runtime_config_attestation_info{state="STAGED"}=1`, `shadow_plane_engaged=1` → **no** suspect alert.

## 3. VPS Prometheus refresh

**Problem:** `docker exec … promtool` could validate the **running** container’s `/etc/prometheus` copy, not the release candidate.

**Change (`vps-refresh-monitoring.sh`):**

- Validate **candidate** files from `SYNQDRIVE_ROOT` via host `promtool` or `docker run -v mount` only.
- Fail closed if promtool unavailable (no skip).
- Snapshot `PROM_DIR` before copy; on reload failure restore snapshot and reload — **no** container restart on failed reload.

**Tests:** `backend/scripts/test/vps-refresh-monitoring-promtool-contract.sh` (+ rollback snapshot contract).

## Merge coordination

1. Merge **#1987** (S4P1) first.
2. Rebase **#1988** onto `main`; drop duplicate S4P1 cherry-pick `074cbd9f2b`.
3. Keep **#1988** draft until human merge after CI green.

## Validation commands

```bash
cd backend && npm run test:di:s4p2:prometheus-rules
cd backend && npm run test:di:s4p2:vps-monitoring-contract
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
cd backend && npx jest di-v0-s4-operational-prometheus.metrics.spec.ts --runInBand
```
