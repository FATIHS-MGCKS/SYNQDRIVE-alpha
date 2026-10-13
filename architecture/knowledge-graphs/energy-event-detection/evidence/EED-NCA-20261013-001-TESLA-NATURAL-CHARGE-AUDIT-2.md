# EED-NCA-20261013-001 — Tesla Natural Charge Audit #2 (prospective)

**Classification:** `TELEMETRY_CONSISTENT_GT_MISSING`  
**Observation tag:** `TRANSIENT_FALSE_SPLIT` (product-read collapse lag vs primary VEE envelope convergence)  
**Production SHA (read-only audits):** `6d68289018b65ce0c061dc5dbf8c66db7954ab29`  
**ERD flag:** `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1`  
**Audit cutoff:** `2026-10-13T07:17:13Z`

## Identity

| Field | Value |
|-------|--------|
| `vehicle_id` | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| `dimo_token_id` | `186946` (Tesla Model 3) |
| `first_detection_at` | `2026-10-13T13:20:31.405Z` (first VEE `created_at`) |
| `latest_detection_at` | `2026-10-13T18:02:32.540Z` (primary anchor VEE `updated_at`) |
| `episode_interval_utc` | `2026-10-13T13:06:30.194Z` → `2026-10-13T16:12:09.193Z` |
| `episode_berlin` | ~15:06 → ~18:12 CEST |

## Owner Ground Truth (partial — not physically verified end state)

| Field | Status |
|-------|--------|
| Plug-in | ~15:06 Europe/Berlin — **consistent** with telemetry start 15:06:30 CEST |
| Initial SOC | ~83–85% — **consistent** with HV/VEE ~84% |
| Unplug / final SOC / metered kWh | **pending** |

## Telemetry summary

| Layer | Count / value |
|-------|----------------|
| Raw legacy RECHARGE VEE | **11** |
| `HvChargeSession` | **1** (`795c7dcb-4f71-4105-9868-5830ebc67597`) |
| Primary DIMO anchor | `dimo-recharge-186946-1791896790194` |
| HV energy added | **~5.14 kWh** |
| HV SOC | **84.00% → 94.02%** |

## Product projection (offline — not authenticated HTTP API)

Read-only `listCanonicalEnergyEvents` logic replayed on production DB + deployed dist (`applyLegacyRechargeFragmentProductReadToProductRows`).

| Phase | When | Raw | Product | Metric labels |
|-------|------|-----|---------|----------------|
| **A — transient false split** | After fragments 2–11 arrived; primary VEE still short-ended (~`13:49:30Z`) | 11 | **11** | `envelope_preserved`×10, `unproven_episode_preserved`×1 |
| **B — converged** | After primary VEE stretch (`updated_at` **18:02:32Z**); end aligned to HV `16:12:09Z` | 11 | **1** (`b9e82751-3afc-49cd-a808-67f8e48adaad`) | `envelope_preserved`×1, `fragment_suppressed`×10 |

**Authenticated product API:** `GET /api/v1/vehicles/{id}/energy-events` without Clerk JWT → **401** (live card count **not** attested).

## Delays

| Delay | Duration | Notes |
|-------|----------|--------|
| Detection (segment start → first VEE `created_at`) | ~14 min | `13:06:30Z` → `13:20:31Z` |
| HV row `created_at` | ~44 min after segment start | `13:50:30Z` |
| Primary-envelope convergence (first VEE → primary `updated_at` full span) | ~4h 42m | `13:20:31Z` → `18:02:32Z` |
| Late DIMO fragments after `16:32:26Z` | **0** | No new `created_at` after last fragment |

## SOC / energy discrepancy (documentary — no physical conclusion)

- **HV** ends at **94.02%** SOC with `qualityStatus=PARTIAL`, `socProvenance=SEGMENT_EXTREMA`, reason codes include `soc_extrema_proxy` / `soc_delta_partial_m2`.
- **Primary / late VEE** `raw_detection_meta.socEndPercent` reaches **100%** on some sliding-window segments (provider segment extrema / saturation signaling).
- **HV** bookend energy **51.62 kWh** vs primary VEE meta end **54.76 kWh** — different aggregation paths on the same episode window; **not** treated as proof of two physical sessions.

## Root cause (transient false split)

ERD collapse requires a **strictly containing**, **HV-proven maximal** legacy envelope VEE. Until the HV-primary VEE row (`b9e82751…`) was stretched to the full episode interval, incremental sliding-window segments were mutually maximal → fail-open **11** product cards. After convergence, behavior matches Tesla Natural Test #1 (2026-10-12): **11 raw → 1 product**.

## Algorithm change

**Not recommended yet.** Capture owner GT and at least one additional natural episode exhibiting the same envelope-lag pattern before changing consolidation timing (e.g. HV-bound envelope for containment). See settlement PR discussion.

## Cross-workstream

No changes to EXP021, APDS, Battery V2, RFRF, or production env during this audit.
