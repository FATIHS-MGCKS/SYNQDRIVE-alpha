# P2.5 APD-PS1 — Per-poll hybrid replay + Battery safe-bound certification

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APD-PS1-001 |
| **Captured at (UTC)** | `2026-10-03T01:05:00Z` |
| **Method** | Read-only Production PostgreSQL replay (`dimo_poll_logs`, `battery_measurements`, `vehicle_trips`) |
| **Window** | T7: `2026-09-18T09:33:25Z` → `2026-09-25T09:33:25Z` |
| **Cohort** | R9 LTE_R1 (`tokenId` 186946, 187336, 187361, 187784, 192922) |
| **Tooling** | `backend/scripts/ops/p25-apd-ps1-offline-replay.mjs`, `p25-apd-ps1-offline-replay-readonly.sh` |
| **Machine artifact** | Cloud agent: `/opt/cursor/artifacts/p25-apd-ps1-replay.json` (no secrets) |
| **DSC-2 commit** | `9f7dfcb27` verified on `origin/cursor/r9o-1-2-forensic-foundation-dafe` |
| **Production change** | **NONE** |

---

## A. Per-poll trace + lookahead

| Field | Value |
|-------|-------|
| **PER_POLL_TRACE_COMPLETE** | **PARTIAL_POLL_LV_TRIP_TIMELINE** |
| **Gap** | `providerFetchedAt`, per-poll top-level/OBD/ignition, operational tier/FSM not joined in v1 exporter |
| **LOOKAHEAD_BIAS_CHECK** | **PASS** — at simulated poll end `T`, LV visibility uses `observed_at <= T`; phase windows use `lastLvSourceMs` from prior allowed polls only |
| **Trip context** | Active `vehicle_trips` intervals suppress **reconciliation** gating only; all trip-interval polls treated as allowed (R9/trip path unchanged by construction) |

---

## B. Source-cadence capability profiles (T7 strict-rest LV)

| tokenId | Plate | Profile | Gap count | Median interval | P90 error (s) | Notes |
|--------:|-------|---------|----------:|----------------:|--------------:|-------|
| 186946 | KS FH 660E | **PROVIDER_OBSERVABILITY_GAP** | 0 | — | — | ELECTRIC; SNAPSHOT polls but no strict-rest LV rows in T7 |
| 187336 | KS MX 2024 | **STABLE_PERIODIC** | 16 | ~8.03 h | ~23.4 ks | Aligns DSC-2 |
| 187361 | KS MS 661 | **STABLE_PERIODIC** | 16 | ~8.02 h | ~27.7 ks | Wider tail vs KS MX |
| 187784 | HMÜ C 215 | **INSUFFICIENT_EVIDENCE** | 0 | — | — | No strict-rest LV + no off-trip reconciliation polls in T7 |
| 192922 | WOB L 7503 | **MULTIMODAL** | 42 | ~2.80 h | ~19.8 ks | Short + long mix (DSC-2 consistent) |

| Aggregate | Count |
|-----------|------:|
| STABLE_PERIODIC | 2 |
| MULTIMODAL | 1 |
| INSUFFICIENT_EVIDENCE | 1 |
| PROVIDER_OBSERVABILITY_GAP | 1 |
| SPARSE_IRREGULAR | 0 |

Non-stable / insufficient vehicles use **5 m** reconciliation fallback in phase-aware variants (simulation).

---

## C–K. Simulation summary

**Policies:** B0 control + B1–B7 variants (9 total). **Eligibility:** `MISSED_LV_ADVANCES = 0` **and** Battery V2 semantic proxy (`additional_discovery_delay_vs_B0 > 15 min` on any LV advance) = 0.

**Battery V2 semantic proxy (offline):** count of LV advances where simulated first discovery is **>15 min later** than B0 discovery (rest/shutdown/longitudinal consumer stand-in). Not a full Battery V2 engine replay.

**Fleet LV advances (strict-rest, T7):** **83**  
**Early event-driven advances (< min(6h, 0.75×median gap)):** **32** — **0 missed** under every simulated policy.

## Policy replay (fleet T7, reconciliation SNAPSHOT polls only)

| Policy | Class | Eligible | Baseline | Simulated | Reduction | LV missed | Add delay P50 | Add delay P95 | Add delay MAX | B2V2 semantic | Early missed |
|--------|-------|----------|----------|-----------|-----------|-----------|---------------|---------------|---------------|---------------|-------------|
| B0_CONTROL | CONTROL | YES | 9990 | 9990 | 0.0% | 0 | 0.00m | 0.00m | 0.00m | 0 | 0 |
| B1_CONSERVATIVE_HB5 | CONSERVATIVE | YES | 9990 | 6925 | 30.7% | 0 | 0.00m | 4.95m | 5.00m | 0 | 0 |
| B2_HB10_IN1 | BALANCED | YES | 9990 | 3731 | 62.7% | 0 | 0.00m | 9.45m | 10.00m | 0 | 0 |
| B3_HB15_IN1 | BALANCED | NO | 9990 | 2644 | 73.5% | 0 | 0.00m | 14.45m | 19.50m | 4 | 0 |
| B4_PHASE_30M | BALANCED | YES | 9990 | 6861 | 31.3% | 0 | 0.00m | 4.95m | 5.00m | 0 | 0 |
| B5_PHASE_60M | AGGRESSIVE | YES | 9990 | 6882 | 31.1% | 0 | 0.00m | 4.95m | 5.00m | 0 | 0 |
| B6_P90_ERROR | BALANCED | YES | 9990 | 7122 | 28.7% | 0 | 0.00m | 4.95m | 5.00m | 0 | 0 |
| B7_HYBRID_15M_1M | BALANCED | NO | 9990 | 4654 | 53.4% | 0 | 0.00m | 9.50m | 19.50m | 3 | 0 |
| B7_HYBRID_30M_1M | AGGRESSIVE | NO | 9990 | 4091 | 59.0% | 0 | 0.00m | 14.01m | 30.50m | 4 | 0 |

## Per-vehicle (B2_HB10_IN1 — best eligible zero-miss)

| tokenId | Plate | Profile | Baseline | Simulated | Reduction | LV adv | Missed | Disc P50 | Disc P95 | Disc MAX | Early LV | B2V2 Δ |
|--------:|-------|---------|----------:|----------:|----------:|-------:|-------:|---------:|---------:|---------:|---------:|-------:|
| 186946 | KS FH 660E | PROVIDER_OBSERVABILITY_GAP | 2655 | 849 | 68.0% | 0 | 0 | — | — | — | 0 | 0 |
| 187336 | KS MX 2024 | STABLE_PERIODIC | 2795 | 954 | 65.9% | 20 | 0 | 4.48m | 9.62m | 9.81m | 5 | 0 |
| 187361 | KS MS 661 | STABLE_PERIODIC | 2096 | 921 | 56.1% | 19 | 0 | 0.57m | 10.74m | 23.33m | 7 | 0 |
| 187784 | HMÜ C 215 | INSUFFICIENT_EVIDENCE | 0 | 0 | 0.0% | 0 | 0 | — | — | — | 0 | 0 |
| 192922 | WOB L 7503 | MULTIMODAL | 2444 | 1007 | 58.8% | 44 | 0 | 0.53m | 10.21m | 10.38m | 20 | 0 |

## Early-event LV safety (all policies)

| Policy | Expected periodic | Early event-driven | Early missed | Early disc P50 | Early disc P95 |
|--------|------------------:|-------------------:|-------------:|---------------:|---------------:|
| B0_CONTROL | 25 | 32 | 0 | 0.25m | 3.26m |
| B1_CONSERVATIVE_HB5 | 25 | 32 | 0 | 0.29m | 5.55m |
| B2_HB10_IN1 | 25 | 32 | 0 | 0.46m | 10.17m |
| B3_HB15_IN1 | 25 | 32 | 0 | 0.34m | 19.17m |
| B4_PHASE_30M | 25 | 32 | 0 | 0.29m | 5.55m |
| B5_PHASE_60M | 25 | 32 | 0 | 0.29m | 5.55m |
| B6_P90_ERROR | 25 | 32 | 0 | 0.29m | 5.55m |
| B7_HYBRID_15M_1M | 25 | 32 | 0 | 0.29m | 14.10m |
| B7_HYBRID_30M_1M | 25 | 32 | 0 | 0.38m | 21.31m |

## Battery V2 semantic proxy (>15m additional discovery vs B0)

| Policy | Eligible | Semantic change count |
|--------|----------|------------------------:|
| B0_CONTROL | YES | 0 |
| B1_CONSERVATIVE_HB5 | YES | 0 |
| B2_HB10_IN1 | YES | 0 |
| B3_HB15_IN1 | NO | 4 |
| B4_PHASE_30M | YES | 0 |
| B5_PHASE_60M | YES | 0 |
| B6_P90_ERROR | YES | 0 |
| B7_HYBRID_15M_1M | NO | 3 |
| B7_HYBRID_30M_1M | NO | 4 |

## Pareto non-dominated (eligible)

- **B2_HB10_IN1**: reduction 62.7%, add-delay P95 9.45m, discovery max 23.33m
- **B4_PHASE_30M**: reduction 31.3%, add-delay P95 4.95m, discovery max 23.33m
- **B0_CONTROL**: reduction 0.0%, add-delay P95 0.00m, discovery max 23.33m

## Provider call economics (B2 example, linear extrapolation)

| Fleet size | Baseline recon calls | Simulated | Saved | Reduction |
|-----------:|---------------------:|----------:|------:|----------:|
| 10 | 24975 | 9328 | 15648 | 62.7% |
| 100 | 249750 | 93275 | 156475 | 62.7% |
| 1000 | 2497500 | 932750 | 1564750 | 62.7% |
| 10000 | 24975000 | 9327500 | 15647500 | 62.7% |

*Extrapolation: linear from T7 4-vehicle comparable cohort (excludes HMÜ); label `LINEAR_FROM_T7_R9_5V_COMPARABLE_COHORT`.*

---

## Fail-safe matrix (design — simulation class only)

| Trigger | Simulated behavior |
|---------|-------------------|
| Profile `INSUFFICIENT_EVIDENCE` | 5 m heartbeat (no phase tightening) |
| Profile `MULTIMODAL` / `SPARSE_IRREGULAR` | 5 m heartbeat |
| Profile `PROVIDER_OBSERVABILITY_GAP` | 5 m heartbeat; do not infer LV freshness |
| Missing / stale LV source timestamp | Phase window closed → fallback heartbeat |
| Phase error > P90 residual (B6) | Widen window; else 5 m outside |
| Active trip | Reconciliation throttle **not applied** (polls always allowed) |
| Unexpected early LV advance | Discovered on next allowed poll; measured in early-event table |
| R9 wake / trip watchdog | **Not modeled** — assumed unchanged; coalescing defers to existing canonical snapshot semantics |

**Profile invalidation (recommended):** recompute median/P90 gaps on rolling 7 d; drop `STABLE_PERIODIC` if 7–9 h bucket share falls below 40% or P95 gap < 6 h.

---

## Required result block

```
P25_APD_PS1_OFFLINE_REPLAY_RESULT=

PER_POLL_TRACE_COMPLETE=PARTIAL_POLL_LV_TRIP_TIMELINE
LOOKAHEAD_BIAS_CHECK=PASS_NO_LOOKAHEAD_LV_VISIBLE_AT_OR_BEFORE_ALLOWED_POLL_END

VEHICLE_PROFILE_COUNT=5
STABLE_PERIODIC_COUNT=2
MULTIMODAL_COUNT=1
INSUFFICIENT_EVIDENCE_COUNT=1
PROVIDER_OBSERVABILITY_GAP_COUNT=1

SIMULATED_POLICY_COUNT=9
ELIGIBLE_POLICY_COUNT=6
NON_DOMINATED_POLICY_COUNT=3

LV_ADVANCES_TOTAL=83

BEST_ZERO_MISS_CALL_REDUCTION=62.7% (B2_HB10_IN1)
BEST_ZERO_MISS_LV_DISCOVERY_P50=1.12m
BEST_ZERO_MISS_LV_DISCOVERY_P95=10.11m
BEST_ZERO_MISS_LV_DISCOVERY_MAX=23.33m

MAX_REDUCTION_ADDITIONAL_LV_P95_LE_5M=31.3% (B4_PHASE_30M)
MAX_REDUCTION_ADDITIONAL_LV_P95_LE_10M=62.7% (B2_HB10_IN1)
MAX_REDUCTION_ADDITIONAL_LV_P95_LE_15M=62.7% (B2_HB10_IN1; B3 ineligible on semantic proxy)

EARLY_EVENT_DRIVEN_LV_ADVANCES_TOTAL=32
EARLY_EVENT_DRIVEN_LV_ADVANCES_MISSED_BEST_ELIGIBLE=0

BATTERY_V2_SEMANTIC_CHANGE_COUNT_BEST_ELIGIBLE=0

PHASE_AWARE_POLICY_SUPPORTED=YES
PER_VEHICLE_PROFILE_REQUIRED=YES
FLEET_FIXED_8H_POLICY_SUPPORTED=NO

R9_WAKE_PATH_MODIFIED=NO
TRIP_WATCHDOG_MODIFIED=NO
TRIP_FSM_MODIFIED=NO
ACTIVE_TRIP_POLLING_MODIFIED=NO

PRODUCTION_CHANGE_PERFORMED=NO
POLLING_CHANGED=NO
BATTERY_V2_CHANGED=NO

BLOCKERS=per_poll_trace_replay_for_WINDOW_A/B/C_certification (CH+PG join); HMÜ_T7_LV_INSUFFICIENT; full Battery V2 consumer replay not run (15m semantic proxy only)
EVIDENCE_SUMMARY=T7 offline replay: zero LV misses for all policies; eligible best reduction ~63% (B2) at ~9.45m additional discovery P95 vs control; phase-aware ±30m ~31% at ~4.95m P95; early event-driven LV (32) always discovered; B3/B7 hybrids ineligible due to semantic proxy
NEXT_ACTION=Extend trace exporter (poll-level CH sources); optional Battery V2 shadow diff on historical rows; do not activate policy until WINDOW_A/B/C trace certification + HMÜ LV evidence
```

---

## Simulation class labels (not production selection)

| Class | Example policy | Fleet recon reduction | Add-delay P95 vs B0 |
|-------|----------------|----------------------:|--------------------:|
| **CONSERVATIVE** | B1_CONSERVATIVE_HB5 | 30.7% | 4.95 m |
| **BALANCED** | B2_HB10_IN1 | 62.7% | 9.45 m |
| **AGGRESSIVE (ineligible)** | B3_HB15_IN1 | 73.5% | 14.45 m (4 semantic proxy hits) |

**Tail note:** B2 additional delay **max = 10.00 m** (at cap); discovery **max = 23.33 m** absolute (KS MS 661) — P95 guardrails met for 10 m **additional** bound; absolute discovery tail remains material for Battery V2 consumers sensitive to worst-case delay.
