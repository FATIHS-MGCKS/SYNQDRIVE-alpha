# P2.5 DSC-2 — Device source cadence closure + Battery V2 safety

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-DSC2-CADENCE-CLOSURE-001 |
| **Captured at (UTC)** | `2026-10-03T00:12:00Z` |
| **Method** | Read-only Production PostgreSQL + ClickHouse (`sudo docker exec synqdrive-clickhouse`) |
| **Window** | P2.5 T7 epoch: `2026-09-18T09:33:25Z` → `2026-09-25T09:33:25Z` (7d) |
| **Cohort** | R9 authorized LTE_R1 (`tokenId` 186946, 187336, 187361, 187784, 192922) |
| **Production change** | **NONE** |

Tooling: `backend/scripts/ops/p25-dsc2-source-cadence-closure-readonly.sh`

---

## A. Per-source standby cadence (T7 7d)

**Standby filter (CH):** `speed_kmh <= 0.5` AND `is_ignition_on = 0` on `telemetry_snapshots` rows.  
**LV filter (PG):** strict engine-off rest (`LIVE_VOLTAGE`, `provider_timestamp`, speed ≤ 0.5, not charging).

Intervals = strict source-time gaps **> 60 s** between deduplicated source observations.

| Source | ADVANCE_GAP_COUNT (fleet) | MEDIAN (s) | P75 (s) | P90 (s) | P95 (s) | P99 (s) | MAX (s) | Notes |
|--------|---------------------------:|-----------:|--------:|--------:|--------:|--------:|--------:|-------|
| **BATTERY_VOLTAGE** | 74 | 20,813 | 28,910 | 31,429 | **54,062** | 78,680 | 81,525 | `battery_measurements.provider_timestamp` |
| **TOP_LEVEL_SOURCE** | 417 | 120 | 1,145 | 21,428 | **28,909** | 83,944 | 1.79e9* | CH `recorded_at` in standby rows |
| **IGNITION** | 145 gaps | — | — | — | **65,258** | — | — | CH `telemetry_state_changes` (`ignition`) |
| **SPEED** | — | — | — | — | — | — | — | **Sparse in standby** (speed stable at 0); value-change cadence not a primary standby driver |
| **OBD** | 565 gaps | — | — | — | **28,875** | — | — | **Proxy:** PG `device_connection_physical_state_transitions` with `SNAPSHOT%` evidence (`evidence_observed_at`); not raw `obdIsPluggedIn` time series |

\*One extreme CH top-level gap reflects long standby without `recorded_at` advance (vehicle not continuously eligible / connectivity), not device 8h clock.

**Information gain (T7 7d, fleet):**

| Metric | Value |
|--------|------:|
| SUCCESS SNAPSHOT polls (`dimo_poll_logs`) | **18,307** |
| TOP_LEVEL standby advance gaps | 417 |
| Implied **NO_ADVANCE_RATE** (polls per top-level gap) | ~**44 polls/advance** (upper bound; polls include non-standby) |
| **INFORMATION_GAIN_RATE** (top-level standby advances / polls) | ~**2.3%** order-of-magnitude |

Do **not** use `providerFetchedAt` as source time for any row above.

---

## B. T7 `STANDBY_P95_ANY_SOURCE_ADVANCE ≈ 30347 s` reconstruction

| Field | Value |
|-------|-------|
| Reported | `STANDBY_P95_ANY_SOURCE_ADVANCE_INTERVAL_SECONDS = 30347.14` (~8.43 h) |
| **Reconstructed (this audit)** | **TOP_LEVEL_SOURCE P95 = 28,909 s** (~8.03 h) in T7 7d standby CH filter |
| **OBD proxy P95** | **28,875 s** (~8.02 h) |
| **BATTERY_VOLTAGE P95 (same window)** | **54,062 s** (~15.0 h) — **not** the 8.43 h mode |

**Conclusion (evidence-based, not inferred beyond data):**

| Field | Value |
|-------|-------|
| **T7_8_43H_P95_PRIMARY_SOURCE** | **TOP_LEVEL_SOURCE** (CH `recorded_at` standby advances) — closest numeric match to 30347 |
| **T7_8_43H_P95_LV_SPECIFIC** | **NO** — LV P95 in same window is ~15 h fleet aggregate |
| **T7_8_43H_P95_BATTERY_CONTRIBUTION_RATE** | **NOT_PRIMARY** for the 8.43 h P95 (LV tail longer in fleet mix) |
| **T7_8_43H_P95_OBD_CONTRIBUTION_RATE** | **ALIGNED** with ~8 h mode (proxy P95 ≈ 28.9 ks) — co-temporal with top-level standby advances |
| **T7_8_43H_P95_SPEED_CONTRIBUTION_RATE** | **NEGLIGIBLE** in standby |
| **T7_8_43H_P95_IGNITION_CONTRIBUTION_RATE** | **LOW** for 8 h mode (ignition P95 ~18 h) |
| **T7_8_43H_P95_TOP_LEVEL_CONTRIBUTION_RATE** | **DOMINANT** for reproducing ~8.43 h P95 |

Attribution counts at merged ANY-source gap ends were **not** stably exported in the bash pass; numeric reconstruction above uses **per-source P95** comparison (do not treat as double-counted attribution percentages).

---

## C. Per-vehicle LV profiles (T7 7d, ICE)

| tokenId | Plate | VALID_INTERVAL_COUNT | MEDIAN (h) | P90 (h) | P95 (h) | 7–9h % | 6–10h % | **LV_CADENCE_PROFILE** |
|--------:|-------|---------------------:|-----------:|--------:|--------:|-------:|--------:|------------------------|
| 187336 | KS MX 2024 | 16 | **8.03** | 9.13 | 12.87 | **75.0** | 81.3 | **STABLE_PERIODIC** |
| 187361 | KS MS 661 | 16 | **8.02** | 15.13 | 17.28 | 50.0 | 50.0 | **STABLE_PERIODIC** (wider tail) |
| 192922 | WOB L 7503 | 42 | 2.80 | 8.29 | 8.66 | 21.4 | 21.4 | **MULTIMODAL** |
| 187784 | HMÜ C 215 | 0 | — | — | — | — | — | **INSUFFICIENT_EVIDENCE** (T7 strict-rest LV gaps) |

| Field | Value |
|-------|-------|
| **PHASE_STABILITY** | **HIGH** only where 7–9h match ≥ 50% (KS MX, KS MS); **LOW** elsewhere |
| **ACTIVITY_RESET_EVIDENCE** | **YES** for WOB (short median + mixed buckets); **NO** for KS MX/KS MS periodic modes |

---

## D. Shorter-than-8h LV advances (fleet history + T7)

Prior fleet-wide LV audit (all-time R9 ICE strict-rest, 425 gaps): **<1h 38.6%**, **1–4h 16.0%**, **4–6h 6.8%**.

**Interpretation (allowed causes — not mutually exclusive):**

| Cause class | Share (indicative) | Evidence |
|-------------|-------------------|----------|
| Event-driven LV reports (activity settle, threshold, reconnect) | **Dominant** for <4h | Multimodal M3.3B + high <1h bucket |
| Trip end / recently-active → standby | **Plausible** | Short gaps cluster after movement (WOB profile) |
| Configured **8h periodic** standby upload | **Does not forbid** extra reports | User operational context + KS MX/MS ~8h medians |

**Critical:** configured ~8h periodic reporting is **not** a prohibition on additional voltage reports.

---

## E. Long tail (>8h) — LV fleet buckets (historical 425 gaps)

| Bucket | Count | % |
|--------|------:|--:|
| 9–12h | 18 | 4.2% |
| 12–24h | 44 | 10.4% |
| 24–48h | 32 | 7.5% |
| >48h | (in >24h tail) | — |

**Classification (hypothesis — phase-aware policy input):**

| Bucket | Likely mix |
|--------|------------|
| 9–12h / 12–24h | **Multimodal clock** (24h top-level mode) + jitter, not only “missed 8h upload” |
| 24–48h+ | **Vehicle not continuously eligible standby**, connectivity/provider freeze, or **missed upload** — requires per-vehicle timeline join (not fully automated here) |

---

## F. Battery V2 dependency matrix (LTE_R1 snapshot/LV path)

| Consumer | Input signal | Source timestamp | Arrival timestamp | REQUIRES_EVERY_POLL | REQUIRES_NEW_SOURCE_ADVANCE | MAX_SAFE_DISCOVERY_DELAY | MISSING_POLL | MISSING_SOURCE_ADVANCE |
|----------|--------------|------------------|-------------------|--------------------:|----------------------------:|-------------------------:|--------------|------------------------|
| **M3.3A generalized evidence** | `lvBatteryVoltage` / LIVE_VOLTAGE | `lvBatteryObservedAt` → `provider_timestamp` | `providerFetchedAt` / `observed_at` | **NO** (semantic) | **YES** for new classified row | **Bounded by rest-session policy** (hours–days; not sub-minute) | Skips capture | Skips / stale replay metrics |
| **M3.3B provider observability gap** | LV + engine context bundle | `provider_timestamp` | ingest time | **NO** | **YES** | Gap contract hours-scale | No gap row | No new gap detection |
| **M3.3B rest cadence qualification** | REST ages from LV timeline | `provider_timestamp` only | — | **NO** | **YES** | **Not validated** for auto promotion (M3.3B.1) | Research unqualified | Cadence ladder not promoted |
| **Shutdown evidence** | LV + ignition/engine bundle | signal-specific observedAt | snapshot ingest | **NO** | **YES** for bundle freshness | Trip-adjacent (minutes–hours) | Shadow skip | Stale classification |
| **LV rest-window / rest-session** | LIVE_VOLTAGE series | `provider_timestamp` | poll-driven classify | **YES** (needs snapshot classify **arrival**) | **YES** for monotonic new observation | **≤ ~1–2 poll periods** for timely session boundaries (5m standby tier) | Delayed session open/close | Repeated value may skip persist |
| **LV live voltage ingest** | `lowVoltageBatteryCurrentVoltage` | `lvBatteryObservedAt` | `providerFetchedAt` | **YES** (on classify job) | **YES** per provider observation policy | **~minutes** (standby poll cadence) | No measurement | No row / duplicate skip |
| **M3.3C/D/E/F longitudinal & health** | Derived from measurements / evidence | propagated `provider_timestamp` | materialization time | **NO** | **YES** upstream | **Hours** (downstream of evidence) | Stale profiles | Missing evidence rows |

**Axis split:**

| Field | Value |
|-------|-------|
| **BATTERY_V2_ARRIVAL_FREQUENCY_DEPENDENCY** | **MODERATE** — rest-window + live ingest need snapshot **classify** arrivals |
| **BATTERY_V2_SOURCE_ADVANCE_DEPENDENCY** | **HIGH** — semantic writes keyed on **provider** time / new observation policy |
| **BATTERY_V2_MAX_SAFE_DISCOVERY_DELAY** | **~5–15 min** for rest-window boundary accuracy at current RESTING_STANDBY poll; **hours** acceptable for slow rest-cadence **research** only |

---

## G. Counterfactual battery reconciliation (T7 7d, read-only model)

**Control:** 18,307 SUCCESS SNAPSHOT polls (fleet, 7d).

**Discovery after LV source time (all distinct LV `provider_timestamp`, not gap-only):**  
median **12 s**, P95 **49 s**, max **1,399 s** to next SUCCESS poll — existing polling discovers provider LV **quickly once uploaded**.

| Strategy | Intent | Poll reduction (order-of-magnitude) | LV missed risk |
|----------|--------|-------------------------------------|----------------|
| **CONTROL** | Current | 0% | baseline |
| **SOURCE_WINDOW_A** (per-vehicle cadence + ±30m) | Phase-aware | **~70–85%** on STABLE_PERIODIC vehicles only | **NON-ZERO** without heartbeat |
| **SOURCE_WINDOW_B** (±60m) | Wider tolerance | **~60–75%** | Lower miss, still non-zero |
| **SOURCE_WINDOW_C** (P90 error adaptive) | Per-profile | **~50–70%** | Requires profile confidence |
| **HYBRID** (sparse heartbeat + tight window) | Fail-safe | **~40–60%** with **LOW** miss on 8h vehicles | Best tradeoff candidate |

**Not simulated to single-number certification in this pass** — requires per-vehicle poll trace replay (NEXT_ACTION).

**R9 wake polls excluded** by definition.

---

## H. Fail-safe conditions (policy design only)

Fall back to **conservative reconciliation** (current-tier polling density) when:

1. `provider_timestamp` missing for LV path  
2. Per-vehicle **LV_CADENCE_PROFILE** ∉ {STABLE_PERIODIC} or **INSUFFICIENT_EVIDENCE**  
3. Provider gap / `lastSignal` stale beyond profile tolerance  
4. Device reconnect / connection status transition  
5. Ignition on / speed > threshold / trip active  
6. **R9 wake** or trip-start watchdog event (force immediate canonical snapshot)  
7. Provider capability or hardware profile change  

---

## I. Closure fields

| Field | Value |
|-------|-------|
| **PER_SOURCE_CADENCE_COMPLETE** | **YES** (LV, TOP_LEVEL, IGNITION, OBD proxy); **SPEED** = negligible standby advances (documented) |
| **FLEET_WIDE_FIXED_8H_MODEL_VALID** | **NO** |
| **PER_VEHICLE_CADENCE_MODEL_REQUIRED** | **YES** |
| **SAFE_TO_DECOUPLE_BATTERY_RECONCILIATION_FROM_GENERAL_POLLING** | **YES_WITH_FAILSAFES** (not from trip polling) |
| **PHASE_AWARE_RECONCILIATION_ELIGIBLE** | **YES** for STABLE_PERIODIC ICE units only |
| **PHASE_AWARE_RECONCILIATION_REQUIRES_PER_VEHICLE_PROFILE** | **YES** |
| **MAX_BATTERY_RECONCILIATION_POLL_REDUCTION_ZERO_MISSED_LV_ADVANCES** | **NOT_PROVEN** — HYBRID + heartbeat required; estimate **≤ ~40–50%** with low miss |
| **MAX_BATTERY_RECONCILIATION_POLL_REDUCTION_WITH_BATTERY_V2_SAFE_DELAY** | **~40–60%** HYBRID (indicative); rest-window needs **≤15 min** discovery on stable units |
| **TRIP_WAKE_UNCHANGED** | **YES** |
| **TRIP_WATCHDOG_UNCHANGED** | **YES** |
| **PRODUCTION_CHANGE_PERFORMED** | **NO** |
| **POLLING_CHANGED** | **NO** |
| **BATTERY_V2_CHANGED** | **NO** |

**BLOCKERS:** Full SOURCE_WINDOW A/B/C/HYBRID replay with per-poll trace; HMÜ T7 LV sample; CH SPEED micro-advance stats.

**NEXT_ACTION:** APD policy parameter selection + implement offline replay job for HYBRID certification on STABLE_PERIODIC vehicles only.
