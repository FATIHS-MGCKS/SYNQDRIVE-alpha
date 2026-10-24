# Tires Health — Production Baseline (read-only)

| Field | Value |
|-------|-------|
| Captured | 2026-10-24T17:21Z – 17:23Z (UTC) |
| Host | `srv1374778.hstgr.cloud` (single Hostinger VPS) |
| Access | SSH `synqdrive-admin`, `StrictHostKeyChecking=yes`; `psql` read-only via `sudo -u postgres`; `SET statement_timeout=10000` |
| Mode | `VERIFIED_READ_ONLY` — no writes, no flag changes, no restarts |
| Release path | `/opt/synqdrive/releases/20261024135142_v4994` |
| Deployed SHA | `c169ddfab5a180ba93d0dbd09eaf7bd02c59be7d` (PR #2154, motion event P1 spike bracket + P2 plausibility, shadow) |
| Public health | `GET /api/v1/health` → `{"status":"ok","uptime":11641,...}` at 17:22:02Z |
| PM2 | `PM2_READ_UNAVAILABLE` (process table not readable as `synqdrive-admin`) |
| Repo drift | `origin/main 1c1e3bfa4` is one commit ahead (#2156 APDS); tire and DS4 event code identical |

Earlier same-day read-only counts from the Tire Module full audit (2026-10-24, same deployed release) are included and marked accordingly.

## Tire module tables

| Metric | Value | Source query (read-only) | Captured in |
|--------|-------|--------------------------|-------------|
| Vehicles (not deleted) | 6 | `vehicles WHERE deleted_at IS NULL` | Tire Module audit |
| Active tire setups | 6 (one per vehicle); one filter variant returned 5 → `TIRE-GAP-ACTIVE-SETUP-COUNT-RECONCILE-001` | `vehicle_tire_setups status='ACTIVE' AND removed_at IS NULL` | Tire Module audit |
| Tread measurements | 5 | `vehicle_tire_tread_measurements` | Tire Module audit |
| Tire health snapshots (30 d) | 2046 | `tire_health_snapshots created_at > now()-30d` | Tire Module audit |
| Tire health snapshots (total) | 8945 | `tire_health_snapshots` | Tire Module audit |
| Trip usage ledger rows | 1304 → **1308** | `tire_trip_usage_ledger` | Tire Module audit → P1 (17:22Z) |
| Ledger rows with Driving-Impact summary | 1308 of 1308 | `driving_impact_summary IS NOT NULL` | P1 |
| Open tire health alerts | 7 | `tire_health_alerts` open | Tire Module audit |
| Active setups without odometer anchor | 0 | `installed_odometer_km IS NULL` | Tire Module audit |
| Vehicles with current driving impact | 6 | `vehicle_driving_impact_current` | P1 |
| Wear data points (ground-truth regression) | 0 (unchanged since July 2026 audit) | `tire_wear_data_points` | Tire Module audit / historical |
| Last recalculation | same day (hourly scheduler active) | `tire_health_snapshots max(created_at)` | Tire Module audit |

Interpretation: the module is **production-active** (hourly recalculation, per-trip ledger attribution, alerts). Ground truth is **sparse** (5 measurements, 0 wear points) — neither V2 nor any successor is statistically validated in production.

## DS4 motion-core shadow (Driving Intelligence, read-only cross-module evidence)

### Control plane (`/opt/synqdrive/current/backend/.env` and `/opt/synqdrive/shared/backend.env`, identical values)

| Flag | Value |
|------|-------|
| `DI_V0_S4_WORKER_ENABLED` | `true` |
| `DI_V0_S4_ORGANIZATION_ALLOWLIST` / `DI_V0_S4_VEHICLE_ALLOWLIST` | set (ids redacted) |
| `DI_V0_MOTION_CORE_SHADOW_ENABLED` | `true` |
| `DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED` | `true` |
| `DI_V0_MOTION_CORE_SHADOW_ORGANIZATION_ALLOWLIST` / `_VEHICLE_ALLOWLIST` | set (ids redacted) |
| `DI_V0_MOTION_CORE_SHADOW_ENABLED_SINCE` | `2026-10-22T06:47:37.000Z` |
| `DI_V0_MOTION_CORE_SHADOW_BATCH_LIMIT` | `10` |
| `DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED` | `true` (since `2026-10-23T21:47:00.000Z`) |
| `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED` | `true` (since `2026-10-24T09:50:18.000Z`) |

### Runs (`di_v0_motion_core_shadow_runs_v1`)

| shadow_status | bundle | runs | first | last |
|---------------|--------|------|-------|------|
| SUCCEEDED | `..._BUNDLE_V1_FABLE_REVIEW_RECOMMENDED` | 19 | 2026-10-22 09:02Z | 2026-10-23 10:54Z |
| SUCCEEDED | `..._BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4` | 29 | 2026-10-23 11:16Z | 2026-10-24 05:08Z |
| SUCCEEDED | `..._BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4_EVENT_V0_3_PLAUS_V0_2` | 29 | 2026-10-24 14:09Z | 2026-10-24 14:12Z |
| SUCCEEDED | `..._BUNDLE_V4_C5_1_AND_FSM_GAP_BRIDGE_V1_3_1` | 3 | 2026-10-24 10:16Z | 2026-10-24 11:16Z |
| SUCCEEDED | `..._BUNDLE_V4_C5_1_AND_FSM_GAP_BRIDGE_V1_3_1_EVENT_V0_3_PLAUS_V0_2` | 5 | 2026-10-24 14:12Z | 2026-10-24 17:03Z |

Totals: **85 SUCCEEDED**, 0 other statuses; **4 vehicles**, **34 trips**; `summary_json` accepted events 1111, artefact-suspect 2 (across all runs, including reprocessed bundles).

### Latest SUCCEEDED run per trip (payload decoded in-session, gzip → JSON, bounded to 34 rows)

| Metric | Value |
|--------|-------|
| Trips | 34 |
| Events | 449 |
| Quality | OK 394 · DEGRADED 21 · LIMITED 32 · ARTEFACT_SUSPECT 2 |
| Kind | DECELERATION 262 · ACCELERATION 187 |
| Persisted rows with `meanAccelMps2` | **0** (field not persisted) |
| `speedAuthority` | C4_ONLY 29 · C5_1_PREFERRED 5 |
| Bundles | V1 `..._EVENT_V0_3_PLAUS_V0_2` 29 · V4 `..._EVENT_V0_3_PLAUS_V0_2` 5 |

Interpretation: DS4 events are **available in Production as shadow payloads** for allowlisted vehicles only (4 of 6). Intensity fields (mean/duration/peak) are **not persisted**; a consumer must derive duration from `startLabel`/`endLabel` and mean from `deltaKmh/duration`, inheriting the C4 attenuation bias (Fable B3). Quality labels **are** persisted and `ARTEFACT_SUSPECT` is already excluded from accepted counts by contract.

## Not observed / not claimed

- No DS4 → tire runtime edge exists in Production (none in code either).
- No tire shadow store exists.
- PM2 process list not inspected.
- No per-vehicle allowlist membership is recorded here (ids redacted); coverage statement "4 of 6" derives from distinct `vehicle_id` in shadow runs vs vehicles count.
