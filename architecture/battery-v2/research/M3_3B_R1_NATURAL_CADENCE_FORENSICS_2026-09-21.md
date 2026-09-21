# M3.3B — R1 Natural Cadence Forensics + REST Ladder Qualification

**Audit timestamp (read-only):** `2026-09-21T14:30:00Z`  
**Canonical predecessor:** M3.3A / M3.3A.1 merged via PR #1710 @ `b83271dfb958c951bab831eae1b3a2fbbd4afd55`  
**Production DB access:** VPS `sudo` + `/opt/synqdrive/shared/backend.env` (`DATABASE_URL` query string stripped for `psql`)  
**No production mutation** in this workstream.

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

## 6 — Cadence qualification policy (M3.3B V1)

Empirical evidence is **sufficient for a first shadow-only qualification policy** (not for health scoring or authoritative publication).

| Field | Value |
|-------|-------|
| `CADENCE_POLICY_READY` | **YES** (shadow ladder metadata + REST_WAKE promotion when flag ON) |
| `REST_CADENCE_POLICY_VERSION` | **`M3_3B_V1`** |
| Nominal cadence metadata | `R1_NOMINAL_REST_CADENCE_MS = 8h` (metadata only) |
| Index 1 age band | **[4h, 12h]** from production min/max in candidate band |
| Index n≥2 band | **[n×8h − 4h, n×8h + 4.5h]** |
| Center tolerance | **±4.5h** from nominal rung (from P95−median spread) |
| Skipped rung | **Supported** — e.g. ~16h maps to index **2** without fabricating index 1 |
| `actualRestAgeMs` | **Remains authoritative**; `nominalRestIntervalIndex` is metadata only |

**Code:** `rest-cadence-qualification.policy.ts` + capture hook (flag-gated).

---

## 7 — PARKED_REST_CANDIDATE → REST_WAKE

Promotion requires (all):

- Active rest session
- Provider-qualified `actualRestAgeMs`
- `restWakeCadenceQualified` (M3_3B_V1 band + center tolerance)
- State alignment ALIGNED or PARTIAL
- Not `STALE_REPLAY`

| Field | Value |
|-------|-------|
| `PARKED_REST_CANDIDATE_PROMOTION_READY` | **YES** (implementation; effective only when generalized-evidence flag ON) |

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

1. Deploy `main` ≥ `b83271dfb…` with `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=false`.
2. Verify migration applies; both PM2 replicas same SHA; `/api/v1/health` PASS; single scheduler leader.
3. Confirm **zero** rows in `battery_generalized_evidence_observations` while flag OFF.

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

## FINAL MACHINE BLOCK

```
M3_3B_RESULT=COMPLETE_READ_ONLY_FORENSICS_PLUS_SHADOW_QUALIFICATION_CODE

CURRENT_MAIN_SHA=b83271dfb958c951bab831eae1b3a2fbbd4afd55
CURRENT_PRODUCTION_SHA=6e3bce843ed09c3603f02fcdb835a1840429372b
M3_3A_CODE_DEPLOYED=NO

R1_NATURAL_PRODUCTION_SEQUENCE_OBSERVED=YES
R1_CADENCE_EMPIRICALLY_VALIDATED=YES

R1_INTERVAL_COUNT=61
R1_INTERVAL_MEDIAN_MS=28890000
R1_INTERVAL_P95_MS=38726000

R1_SIGNAL_PATTERN=PERIODIC_PARKED_REST_LV_APPROX_8H_MEDIAN_WITH_JITTER_AND_SKIPPED_RUNGS
R1_WAKE_LOAD_ORDER_KNOWN=NO

CADENCE_POLICY_READY=YES
REST_CADENCE_POLICY_VERSION=M3_3B_V1

PARKED_REST_CANDIDATE_PROMOTION_READY=YES
NOMINAL_REST_INTERVAL_INDEX_IMPLEMENTED=YES

ACTUAL_REST_AGE_REMAINS_AUTHORITY=YES
EXACT_8H_EQUALITY_REQUIRED=NO

PROMETHEUS_METRICS_WIRED=YES

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
HEALTH_SCORE_CHANGED=NO
FAILURE_RISK_IMPLEMENTED=NO

GENERALIZED_EVIDENCE_FLAG_EFFECTIVE=FALSE

PRODUCTION_CHANGED=NO

NEXT_ACTION=DEPLOY_M3_3A_B0_THEN_OPTIONAL_B1_SHADOW; CONTINUE_WAKE_LOAD_FORENSICS; M3_3C_REST_STABLE_PROMOTION_RESEARCH
```
