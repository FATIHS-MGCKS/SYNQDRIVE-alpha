# M3.3B — R1 Natural Cadence Forensics + REST Ladder Qualification

**Audit timestamp (read-only):** `2026-09-21T14:30:00Z`  
**M3.3B.1 methodology correction:** `2026-09-21T15:45:00Z`  
**Canonical predecessor:** M3.3A / M3.3A.1 merged via PR #1710 @ `b83271dfb958c951bab831eae1b3a2fbbd4afd55`  
**Target PR:** #1713  
**Production DB access:** VPS `sudo` + `/opt/synqdrive/shared/backend.env` (`DATABASE_URL` query string stripped for `psql`)  
**No production mutation** in this workstream.

> **Epistemic split (M3.3B.1):** **Periodic ~8h-scale parked LV behavior is observed** (`R1_NATURAL_PERIODIC_PARKED_LV_OBSERVED=YES`). **Automatic REST_WAKE qualification tolerance is not validated** (`R1_CADENCE_EMPIRICALLY_VALIDATED=NO` for promotion policy). See **§M3.3B.1** below; §2–§7 under “Initial M3.3B draft” retain the first pass for audit history.

---

## M3.3B.1 — Corrected methodology and policy gate (authoritative)

| Requirement | Result |
|-------------|--------|
| `CADENCE_FORENSICS_PROVIDER_TIME_ONLY` | **YES** (`provider_timestamp` only; **0** rows excluded for missing provider time on engine-off cohort) |
| `NULL_SPEED_TREATED_AS_REST` | **NO** (strict cohort requires `speedKmh IS NOT NULL`) |
| `STRICT_SESSION_SEGMENTATION_USED` | **YES** (activity rows break sessions on full provider-timestamp timeline) |

### Cohort counts (ICE LTE_R1, engine-off LV rows)

| Metric | Value |
|--------|-------|
| `TOTAL_PARKED_ROWS` (engine-off) | **1,368** |
| `PROVIDER_TIMESTAMP_QUALIFIED_ROWS` | **1,368** |
| `ROWS_EXCLUDED_NO_PROVIDER_TIMESTAMP` | **0** |
| `STRICT_REST_OBSERVATIONS` | **260** |
| `RELAXED_REST_OBSERVATIONS` | **521** (includes NULL speed — **not** used for policy calibration) |
| `UNKNOWN_SPEED_EXCLUDED` (from strict) | **0** (all engine-off rows had speed; relaxed-only unknown N/A) |
| `CHARGING_CONTAMINATED_EXCLUDED` | **162** (LV/HV charging while otherwise parked-speed) |
| `STRICT_REST_SESSIONS` | **183** |

### Two distributions (session-segmented, strict)

| Distribution | Count | Notes |
|--------------|-------|-------|
| `INTERARRIVAL_COUNT` | **77** | LV[n]−LV[n−1] within session; **P50 ≈ 16 min** (964,000 ms) — many short gaps |
| `REST_AGE_OBSERVATION_COUNT` | **55** | LV−anchor, age > 3 min |

**Unfiltered inter-arrival bins (within session):** 0–1h **44**; 1–4h **7**; 4–6h **1**; 6–10h **9**; 10–14h **2**; 14–18h **3**; 22–26h **10**; >26h **1**.

**Unfiltered rest-age bins (age > 3 min):** 0–1h **13**; 1–4h **7**; 6–10h **4**; 10–14h **3**; 14–18h **8**; 22–26h **10**; >26h **10**.

| Field | Value |
|-------|-------|
| `UNFILTERED_INTERVAL_MODE` | **MULTIMODAL** (dominant short 0–1h inter-arrival; secondary mass at multi-hour rest ages) |
| `UNFILTERED_REST_AGE_CLUSTERING` | **PARTIAL** (mass at 14–18h, 22–26h, >26h rest-age — consistent with 16h/24h-scale ladder **hypothesis**, not proof) |
| `EIGHT_HOUR_COMPONENT_SUPPORTED` | **YES** (6–10h inter-arrival + multi-hour rest-age side modes; not a tight unimodal 8h clock) |

### Rung residual (nearest rung k≥1; session anchor; strict)

`rungResidualMs = actualRestAgeMs − k×8h` (k chosen to minimize |residual|).

| Stat | Global (n=55) |
|------|----------------|
| P50 | **110,000 ms** (~1.8 min) |
| P95 \|residual\| | **28,531,200 ms** (~7.92 h) |
| MAX \|residual\| | **28,610,000 ms** |

Per-vehicle P95 \|residual\|: HMÜ **28.0M**, KS MS 661 **28.6M**, KS MX **16.8M**, WOB **28.4M** ms.

### Tolerance derivation audit (M3.3B draft)

Initial draft claimed **±4.5h** from “P95−median spread.” Using draft inter-arrival numbers: 38,726,000 − 28,890,000 = **9,836,000 ms (~2.73 h)**, not 4.5h.

| Field | Value |
|-------|-------|
| `CURRENT_PLUS_MINUS_4_5H_DERIVATION_VALID` | **NO** — claim **removed** |

### Policy decision (exactly one)

**`CADENCE_POLICY_DECISION=CADENCE_EXISTS_BUT_POLICY_TOLERANCE_NOT_READY`**

| Field | Value |
|-------|-------|
| `REST_CADENCE_POLICY_VERSION` | **`M3_3B_V1_1`** |
| `LADDER_BANDS_OVERLAP` | **NO** (midpoint partitions: index 0 `<4h`; index k≥1 in `[ (k−½)×8h , (k+½)×8h )`) |
| `BROAD_TIME_WINDOW_ALONE_CAN_PROMOTE_REST_WAKE` | **NO** |
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** in code — retain **`PARKED_REST_CANDIDATE`** |
| `NOMINAL_REST_INTERVAL_INDEX` | **Research metadata only** when mappable |
| `GLOBAL_POLICY_SUPPORTED` | **YES** (per-vehicle residual tails similar; no per-vehicle policy fork) |
| `VEHICLE_SPECIFIC_POLICY_REQUIRED` | **NO** |
| `R1_CADENCE_EMPIRICALLY_VALIDATED` (auto REST_WAKE) | **NO** |
| `B0_TARGET_SHOULD_INCLUDE_M3_3B_CODE` | **YES** — deploy merged **M3.3A + M3.3B.1** once; flag OFF; then optional B1 |

---

## Initial M3.3B draft (2026-09-21T14:30Z — superseded methodology)

**Do not use for policy calibration.** Kept for scientific history.

- Used `COALESCE(provider_timestamp, observed_at)` — **invalid** for cadence authority.
- Used `COALESCE(speedKmh,0)≤0.5` — **invalid** (NULL speed treated as rest).
- Consecutive parked samples across vehicle history **without** activity-broken sessions.
- Primary stats pre-filtered to **4–12h** band (selection bias).
- Promoted `M3_3B_V1` with overlapping bands and **±4.5h** tolerance — **reverted in code**.

Draft numbers (historical): inter-arrival 4–12h band **n=61**, median **28,890,000 ms**, P95 **38,726,000 ms**.

---

## 0 — Governance

| Check | Result |
|-------|--------|
| PR #1710 merged @ `b83271dfb…` | **YES** |
| PR #1709 merged | **NO** (still OPEN) |
| `SUPERSEDED_BY_1710` | **YES** — do not merge or depend on #1709 |

---

## 1 — Deployment state audit

| Field | Value |
|-------|-------|
| `CURRENT_MAIN_SHA` | `b83271dfb958c951bab831eae1b3a2fbbd4afd55` |
| `CURRENT_PRODUCTION_SHA` | `6e3bce843ed09c3603f02fcdb835a1840429372b` |
| `CURRENT_PRODUCTION_RELEASE` | `20260921103500_v4994` (`/opt/synqdrive/current`) |
| `M3_3A_CODE_DEPLOYED` | **NO** (prod SHA predates #1710; generalized-evidence tables **absent** on prod DB) |
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_EFFECTIVE` | **FALSE** (key absent from `backend.env`) |

---

## 2 — Methodology (raw LIVE_VOLTAGE)

- **Source:** `battery_measurements` where `type = LIVE_VOLTAGE`, `quality = VALID`.
- **Provider time authority:** `COALESCE(provider_timestamp, observed_at)`.
- **Parked engine-off filter:** `context.engineRunning = false` AND `speedKmh ≤ 0.5`.
- **Cohort:** ICE (`GASOLINE` / `DIESEL`) vehicles with `hardware_type = LTE_R1`.
- **No synthetic intervals** — all deltas are consecutive parked-rest samples per vehicle ordered by provider time.

**Fleet (production):** 6× `LTE_R1` vehicles; **4× ICE** with parked-rest LV history (WOB L 7503, KS MS 661, KS MX 2024, HMÜ C 215). WOB L 9755 had no parked engine-off LV rows in window. KS FH 660E is **ELECTRIC** (excluded from ICE cadence stats).

---

## 3 — Natural ~8h sequence statistics

### Global parked-rest consecutive inter-arrival (ICE LTE_R1)

Filter: delta between **4h and 12h** (candidate first-rung band, not exact equality).

| Metric | Value |
|--------|-------|
| `R1_INTERVAL_COUNT` | **61** |
| `R1_INTERVAL_MIN_MS` | **14,619,000** (~4.06 h) |
| `R1_INTERVAL_MAX_MS` | **39,872,000** (~11.08 h) |
| `R1_INTERVAL_P25_MS` | **17,457,000** (~4.85 h) |
| `R1_INTERVAL_MEDIAN_MS` | **28,890,000** (~8.025 h) |
| `R1_INTERVAL_P75_MS` | **32,397,000** (~9.00 h) |
| `R1_INTERVAL_P95_MS` | **38,726,000** (~10.76 h) |

**Higher rungs (consecutive parked-rest deltas):**

| Band | Count | Interpretation |
|------|-------|----------------|
| 12–20 h | 29 | Consistent with ~16 h second wake spacing |
| 20–28 h | 29 | Consistent with ~24 h third wake spacing |
| 1–4 h | 71 | Short gaps (partial wakes, re-park, or provider clustering) — **not** treated as R1 ladder rungs |

### Session-anchored ladder heuristics (≥3 parked obs, session max age ≥12 h)

| Metric | Value |
|--------|-------|
| Long-rest sessions (≥12 h span) | **10** sessions / **45** observations |
| `MISSING_EXPECTED_INTERVAL_COUNT` | **24** (nominal round(age/8h) > observation index; age ≥10 h) |
| First wake 9–11 h from anchor | **2** |
| Late first wake (>11 h, 2nd obs) | **14** |

### Provider integrity

| Metric | Value |
|--------|-------|
| `DUPLICATE_TIMESTAMP_COUNT` | **0** (no duplicate `vehicle_id + provider_timestamp` for LIVE_VOLTAGE) |
| `STALE_REPLAY_COUNT` (raw measurements) | **Not separately tagged in `battery_measurements`** — M3.3 shadow classifies via `providerObservationOutcome` at capture time |

---

## 4 — Vehicle-specific comparison

Per-vehicle inter-arrival in 4–12 h band:

| Vehicle | `R1_INTERVAL_COUNT` | Median ms | P95 ms |
|---------|---------------------|-----------|--------|
| HMÜ C 215 | 6 | 27,684,500 | 38,624,750 |
| KS MS 661 | 28 | 24,353,500 | 38,328,150 |
| KS MX 2024 | 9 | 32,211,000 | 33,073,200 |
| WOB L 7503 | 18 | 26,030,000 | 38,734,400 |

**Verdict:** `R1_CADENCE_CROSS_VEHICLE = PARTIALLY_DIFFERENT` — all show ~8h-scale medians, but KS MS 661 first-rung median is **lower** (~6.76 h) and KS MX 2024 **tighter** (~8.95 h). Causes **not inferred** (sleep, ignition semantics, wake implementation) without paired VLS/load forensics per wake.

---

## 5 — Wake semantics

For each natural parked wake, production rows include `context` speed/ignition/engineRunning/isLvCharging and VLS-aligned fields at ingest. **No controlled experiment** ties LV sample order to modem/OBD load.

| Field | Value |
|-------|-------|
| `R1_WAKE_LOAD_ORDER_KNOWN` | **NO** |
| `REST_WAKE_VOLTAGE vs OCV` | **Distinct** — wake samples may reflect post-wake electrical load; do not treat as laboratory OCV |

---

## 6 — Cadence qualification policy (superseded by M3.3B.1)

~~M3_3B_V1 automatic promotion~~ → **`M3_3B_V1_1` metadata-only; promotion disabled** (see §M3.3B.1).

---

## 7 — PARKED_REST_CANDIDATE → REST_WAKE (superseded)

~~`PARKED_REST_CANDIDATE_PROMOTION_READY=YES`~~ → **NO automatic promotion** until a validated rung-residual tolerance exists.

---

## 8 — Nominal ladder index

| Field | Value |
|-------|-------|
| `NOMINAL_REST_INTERVAL_INDEX_IMPLEMENTED` | **YES** (persisted on shadow observations when flag ON) |

---

## 9 — Metrics (Prometheus)

Wired counters (low cardinality, no vehicle IDs):

- `synqdrive_battery_generalized_evidence_created_total`
- `synqdrive_battery_generalized_evidence_duplicate_total`
- `synqdrive_battery_rest_session_opened_total`
- `synqdrive_battery_rest_session_ended_total`
- `synqdrive_battery_rest_session_invalidated_total`
- `synqdrive_battery_rest_observation_total`
- `synqdrive_battery_valid_rest_observation_total`
- `synqdrive_battery_rest_wake_qualified_total`
- `synqdrive_battery_late_trip_association_total`
- `synqdrive_battery_cadence_out_of_tolerance_total`
- `synqdrive_battery_generalized_evidence_state_ambiguous_total`
- `synqdrive_battery_generalized_evidence_stale_replay_total`

---

## 10 — Shadow production rollout plan

**Phase B0** (required before shadow writes):

1. Deploy **merged M3.3A + M3.3B.1** (e.g. PR #1713 on top of #1710) with `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=false`.
2. Verify migration applies; both PM2 replicas same SHA; `/api/v1/health` PASS; single scheduler leader.
3. Confirm **zero** rows in `battery_generalized_evidence_observations` while flag OFF.

**Do not** deploy #1710 alone and immediately redeploy for M3.3B — **single B0** should include hardened cadence code.

**Phase B1** (explicit authorization only):

1. Set `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true` on one replica canary → rolling restart.
2. Collect natural shadow evidence; compare cadence metrics to this forensic baseline.
3. **No** authoritative REST_60M/6H, assessment, publication, or health score changes.

**Current state:** B0 **not started** (M3.3A code not deployed).

---

## 11 — Authoritative isolation

| Field | Value |
|-------|-------|
| `REST_60M` / `REST_6H` | **Unchanged** |
| Assessment / publication / health score | **Unchanged** |
| Failure risk | **Not implemented** |
| `AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED` | **NO** |

---

## 12 — Reproducibility

Shell helper (read-only, VPS):

`backend/scripts/ops/battery-v2-m3-3b-r1-cadence-forensics.sh`

---

## FINAL MACHINE BLOCK (M3.3B.1 authoritative)

```
M3_3B_1_RESULT=COMPLETE_METHODOLOGY_CORRECTION_AND_POLICY_GATE

R1_NATURAL_PERIODIC_PARKED_LV_OBSERVED=YES

CADENCE_FORENSICS_PROVIDER_TIME_ONLY=YES
NULL_SPEED_TREATED_AS_REST=NO
STRICT_SESSION_SEGMENTATION_USED=YES

STRICT_REST_OBSERVATIONS=260
STRICT_REST_SESSIONS=183

UNFILTERED_INTERVAL_MODE=MULTIMODAL
EIGHT_HOUR_COMPONENT_SUPPORTED=YES

INTERARRIVAL_COUNT=77
REST_AGE_OBSERVATION_COUNT=55
RUNG_RESIDUAL_P50_MS=110000
RUNG_RESIDUAL_P95_ABS_MS=28531200

CURRENT_PLUS_MINUS_4_5H_DERIVATION_VALID=NO
LADDER_BANDS_OVERLAP=NO
BROAD_TIME_WINDOW_ALONE_CAN_PROMOTE_REST_WAKE=NO

R1_CADENCE_EMPIRICALLY_VALIDATED=NO
CADENCE_POLICY_DECISION=CADENCE_EXISTS_BUT_POLICY_TOLERANCE_NOT_READY
REST_CADENCE_POLICY_VERSION=M3_3B_V1_1

GLOBAL_POLICY_SUPPORTED=YES
VEHICLE_SPECIFIC_POLICY_REQUIRED=NO

R1_WAKE_LOAD_ORDER_KNOWN=NO
REST_STABLE_PROMOTION_ALLOWED=NO

B0_TARGET_SHOULD_INCLUDE_M3_3B_CODE=YES

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
PRODUCTION_CHANGED=NO

PR_1713_READY_TO_MERGE=PENDING_CI
B0_DEPLOY_ALLOWED=NO
B1_ALLOWED=NO
```

### Historical — initial M3.3B draft machine block (superseded)

```
M3_3B_RESULT=SUPERSEDED_BY_M3_3B_1
R1_CADENCE_EMPIRICALLY_VALIDATED=YES  # overclaim — retracted
REST_CADENCE_POLICY_VERSION=M3_3B_V1    # replaced by M3_3B_V1_1
```
