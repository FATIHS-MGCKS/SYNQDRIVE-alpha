# RFRF F3 — Raw Fuel Rise Detector (STABLE_PRE → RISING → STABLE_POST)

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F3 — Pure raw fuel rise detector  
**Date:** 2026-09-12  
**Base main:** `067af8f608bf5901141d9af20757e75dcf0104e2` (includes merged F2 PR #1620 + #1621)  
**Parent documents:** F1/F1.1/F2 audits; `EED-EV-0043`

---

## 1. Scope attestation

| Field | Value |
|-------|-------|
| **F3_IMPLEMENTATION_COMPLETE** | **YES** (detector algorithm + tests only) |
| **RAW_FUEL_RISE_DETECTOR_IMPLEMENTED** | **YES** |
| **RAW_REFUEL_PERSISTENCE_RUNTIME_WIRED** | **NO** |
| **PRODUCTION_SCHEDULER_WIRED** | **NO** |
| **PROMOTION_RUNTIME_WIRED** | **NO** |
| **PRODUCTION_MUTATED** | **NO** |
| **PRODUCTION_DEPLOYED** | **NO** |

F3 produces `RawRefuelCandidateObservation[]` via pure functions. F2 `RawRefuelCandidateService` is used **test-only** for handoff proof.

---

## 2. Legacy helper audit — `refuel-fuel-rise.ts`

| Concern | Verified | Why NOT F3 core |
|---------|----------|-----------------|
| A. Global min-before-max model | **YES** | Uses envelope min/max indices as baseline/peak authority |
| B. Not local multi-event | **YES** | Single derived interval per window |
| C. `sampleValue()` prefers relative | **YES** | Per-sample channel mixing in one numeric series |
| D. Mixed units in one vector | **YES** | Same function compares % and L by numeric value |
| E. Rise-end ≈ peak timing | **YES** | `riseEndIdx` tracks peak bracket, not post-plateau median |
| F. Comment/threshold drift | **PARTIAL** | Header mentions 10% brackets; constants use 5% fractions |

**LEGACY_REFUEL_FUEL_RISE_REUSED_AS_F3_CORE = NO**

Production behavior of `deriveRefuelFuelLevelRise()` unchanged in F3.

---

## 3. F3 module map

| Artifact | Path |
|----------|------|
| Entry point | `raw-fuel-rise-detector.ts` → `detectRawFuelRises()` |
| Sample contract | `raw-fuel-signal-sample.types.ts` |
| Versioned thresholds | `raw-fuel-rise-detector.config.ts` |
| Normalization | `raw-fuel-rise-normalizer.ts` |
| Primary channel authority | `raw-fuel-rise-channel-authority.ts` |
| State machine | `raw-fuel-rise-state-machine.ts` |
| F2 observation mapper | `raw-fuel-rise-observation-mapper.ts` |

---

## 4. Algorithm

Deterministic state machine per **single primary channel series** (never mixed units):

```
SEARCHING_PRE → STABLE_PRE → RISING → STABLE_POST → emit candidate → continue scan
```

- **STABLE_PRE:** robust median plateau, ≥3 samples within tolerance  
- **RISING:** local material transition above pre (+5 L / +5 pp provisional), bounded negative wobble, 30s–45min duration  
- **STABLE_POST:** robust median plateau, ≥3 samples, ≥2 min persistence  
- **Multi-refuel:** cursor advances after each candidate; does not stop at first rise  
- **Consumption after refuel:** post plateau anchored locally; later lower samples do not erase detected refuel  

**Forbidden:** whole-window start→end delta; global min→max as existence authority.

---

## 5. Channel authority

| Rule | Implementation |
|------|----------------|
| Primary when `absoluteSignalTrust=TRUSTED` + sufficient absolute samples | `ABSOLUTE_LITERS` |
| Else when `relativeSignalAvailable` + sufficient relative samples | `RELATIVE_PERCENT` |
| Else | fail closed (`no_trusted_channel`) |
| Secondary channel | corroboration fields only — **no second candidate** |

**DUAL_CHANNEL_SINGLE_PHYSICAL_CANDIDATE = PASS**

---

## 6. Versioning policy

| Field | F3 value | Semantics |
|-------|----------|-----------|
| `detectionVersion` | `rfrf-rise-v1` | Identity-compatibility family for F2 rediscovery |
| `detectorVersion` | `rfrf-rise-detector-v1` | Implementation revision; tunable without identity break |

Bugfix/threshold tuning changes `detectorVersion` only unless physical identity semantics intentionally change.

---

## 7. Threshold epistemic labels

| Threshold | Value | Label |
|-----------|-------|-------|
| Absolute material rise | 5 L | PROVISIONAL |
| Relative material rise | 5 pp | PROVISIONAL |
| Pre-plateau samples | 3 | INFERRED |
| Post-plateau samples | 3 | INFERRED |
| Pre-plateau tolerance | ±0.5 L / ±1.0 % | INFERRED |
| Post-plateau tolerance | ±0.5 L / ±1.0 % | INFERRED |
| Max sample gap | 6 min | PROVISIONAL / INCIDENT_ANCHORED |
| Negative wobble | 1 L / 1 pp | INFERRED |
| Post persistence | 2 min | INFERRED |
| Min rise duration | 30 s | INFERRED_FROM_EXISTING_CODE |
| Max rise duration | 45 min | PROVISIONAL |

**THRESHOLDS_FLEET_CALIBRATED = NO**

---

## 8. KS MS 661 fixture results

### Observed (`ks-ms-661-2026-09-06-refuel-observed.fixture.ts`)

| Field | Result |
|-------|--------|
| Material local rise | **DETECTED** |
| Primary channel | `ABSOLUTE_LITERS` |
| Pre / post / delta | 7 L / 31 L / 24 L |
| Lifecycle | `OBSERVED` (sparse post plateau — not forced READY) |
| Native DIMO required | **NO** |

### Synthetic (`ks-ms-661-2026-09-06-refuel-synthetic.fixture.ts`)

| Field | Result |
|-------|--------|
| Full STABLE_PRE→RISING→STABLE_POST | **PASS** |
| Lifecycle | `READY_FOR_PERSIST` |
| Epistemic | SYNTHETIC_INTERPOLATED — not production proof |

---

## 9. Test evidence

| Suite | Tests | Result |
|-------|-------|--------|
| `raw-fuel-rise-detector.spec.ts` | positive + mixed-unit guard | **PASS** |
| `raw-fuel-rise-detector-fixtures.spec.ts` | KS MS 661 + multi-refuel | **PASS** |
| `raw-fuel-rise-detector-f3-1.spec.ts` | F3.1 P1 hardening gates | **PASS** |
| `raw-fuel-rise-detector-negative.spec.ts` | negative/hold matrix (22 cases) | **PASS** |
| `raw-fuel-rise-detector-invariance.spec.ts` | window/order/duplicate | **PASS** |
| F2 unit regression (`raw-refuel-candidate`) | 25 | **PASS** |
| `raw-fuel-rise-detector-f3-2.spec.ts` | F3.2 finality + channel fallback + non-finite | **PASS** |
| F2 handoff PG (`RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1`) | 4 executed on isolated PG | **PASS** |

**Total F3 unit tests:** 62 (excluding 4 PG integration proofs)
**Negative behavioral cases executed:** 21 (case 22 deferred to F4)

---

## 10. F3 completion gate

```
RFRF_F3 = PASS
DETECTOR_MODEL = STABLE_PRE_RISING_STABLE_POST
LEGACY_REFUEL_FUEL_RISE_REUSED_AS_F3_CORE = NO
GLOBAL_MIN_MAX_USED_AS_EXISTENCE_AUTHORITY = NO
ABSOLUTE_RELATIVE_UNIT_ISOLATION = PASS
MIXED_UNIT_NUMERIC_SERIES_CREATED = NO
PRIMARY_SIGNAL_CHANNEL_POLICY = TRUSTED_ABSOLUTE_THEN_RELATIVE_FAIL_CLOSED
DUAL_CHANNEL_SINGLE_PHYSICAL_CANDIDATE = PASS
MULTI_REFUEL_WINDOW_SUPPORT = PASS
KS_MS_661_OBSERVED_MATERIAL_RISE = DETECTED
KS_MS_661_OBSERVED_LIFECYCLE = OBSERVED
KS_MS_661_SYNTHETIC_FULL_LIFECYCLE = PASS
NEGATIVE_FIXTURE_MATRIX = PASS
WINDOW_INVARIANCE = PASS
INPUT_ORDER_INVARIANCE = PASS
EXACT_DUPLICATE_INVARIANCE = PASS
MIXED_CHANNEL_REGRESSION = PASS
F2_OBSERVATION_MAPPING = PASS
F2_TEST_ONLY_HANDOFF = PASS
F4_START_AUTHORIZED = YES
```

---

## 11. F4 gate (next)

| Requirement | Status |
|-------------|--------|
| Production scheduler wiring | **NOT_STARTED** |
| `detectEnergyEvents()` integration | **NOT_STARTED** |
| VehicleEnergyEvent promotion runtime | **NOT_STARTED** |
| Feature flags enablement | **NOT_STARTED** |

---

## 12. Known limitations

1. Thresholds provisional — not fleet-calibrated  
2. Sensor reset vs refuel not always distinguishable by shape alone  
3. No production metrics wiring (contract defined in diagnostics only)  
4. Relative-only path less exercised in production fixtures than absolute  

---

## 13. F3.1 — Detector hardening (2026-09-12)

Independent review closed three P1 correctness gaps without redesigning F2.

### 13.1 Epistemic correction — provider sample spacing

Provider telemetry transition duration **≠** physical fueling duration. A persistent single-step material update (`10,10,10 → 30,30,30`) is a valid physical refuel candidate when post evidence supports it; the prior 30 s minimum rise duration blocked these cases.

### 13.2 Strict plateau final-median invariant

Both `STABLE_PRE` and `STABLE_POST` plateaus require **every** sample to satisfy `abs(sample − median(all)) ≤ tolerance`.

### 13.3 Single-step persistent provider rises

| Case | Expected |
|------|----------|
| `10,10,10 → 30,30,30,30` | exactly one candidate |
| single 30 spike → back to 10 | no READY candidate |
| `10 → 30` without stable post | OBSERVED/SETTLING |
| single-step with >6 min evidence gap | fail-closed, not READY |

### 13.4 Stepped-refuel coalescence

Temporary intermediate plateaus within one physical rise neighborhood (`10 → 16 → 30`) are absorbed before post search. Post plateau is local to peak; distant consumption cannot become post authority.

### 13.5 Wobble fail-closed

Repeated strong regressions no longer reset on intermediate peaks.

### 13.6 Diagnostic metric epistemic fix

`rawRiseWithoutNativeSegmentTotal` is **`null`** in F3 — requires native segment context (F4+).

### 13.7 F3.1 completion gate

```
RFRF_F3_1_HARDENING = PASS
PR_1623_STILL_DRAFT = YES
```

---

## 14. F3.2 — Final semantic closure (2026-09-12)

### 14.1 riseMaxDurationMs ≠ same-event finality

`riseMaxDurationMs` bounds one **unresolved rise episode** only. Stepped coalescence uses separate `provisionalPostContinuationGraceMs` (10 min, PROVISIONAL) measured from **last peak update**, not rise onset. Finalized post creates an event boundary; later material rises become second candidates even within 45 minutes.

### 14.2 Primary channel fallback

`absoluteSignalTrust=TRUSTED` means absolute may be authoritative **when usable** — sparse absolute no longer suppresses valid relative fallback.

### 14.3 Non-finite sample policy

`INVALID_CHANNEL_SAMPLE_EXCLUDED_PER_CHANNEL` — NaN/±Infinity excluded per channel (converted to null for that channel); never treated as trustworthy numeric evidence; alternate valid channel may remain usable. Dedicated runtime non-finite diagnostic counters are **not** wired in F3 (owner: F4).

### 14.4 Negative matrix epistemics

21 behavioral negative cases executed (PASS). Case 22 (EV/non-fuel capability gate) **DEFERRED_TO_F4** — not counted as behavioral proof.

### 14.5 Real PostgreSQL F3→F2 handoff

Executed on isolated localhost PostgreSQL (`rfrf_f3_handoff_test`, port 5432) via `prisma migrate deploy` (resilient) + `RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1`. **4/4 PASS**, 0 skip, 0 fail.

Gate script: `backend/scripts/test/rfrf-f3-f2-handoff-postgres-gate.sh`

### 14.6 F3.2 completion gate

```
RFRF_F3_2_FINAL_SEMANTIC_CLOSURE = PASS
PROVISIONAL_POST_STATE_IMPLEMENTED = YES
CONTINUATION_GRACE_SEPARATE_FROM_RISE_MAX_DURATION = YES
REAL_PG_F3_F2_HANDOFF_EXECUTED = YES
NEGATIVE_CASES_EXECUTED = 21
CAPABILITY_GATE_CASE = DEFERRED_TO_F4
F4_START_AUTHORIZED = NO
PR_1623_READY_FOR_FINAL_MAIN_SYNC = YES
PR_1623_STILL_DRAFT = YES
```

---

## 15. Final main sync + exact-head merge closure (2026-09-12)

### 15.1 Sync record

| Field | Value |
|-------|-------|
| PRE_SYNC_RFRF_HEAD | `773a29fc1b0b2cf58dbafa4084b266c8d763f31e` |
| SYNCED_MAIN_SHA | `7cb184ffc5926521429f75524a1dcb65579769f6` |
| POST_SYNC_HEAD | `514a7fba8288d4a242e8adf04325aa285ce98c53` |

### 15.2 Main delta classification (`067af8f` → `7cb184ffc`)

| Commit / area | Classification |
|---------------|----------------|
| VDC GT-R1 unplug evidence (#1622) | NO_MATERIAL_RFRF_IMPACT |
| EXP-021 short AB plan (#1624) | NO_MATERIAL_RFRF_IMPACT |
| `reference-capture-exp021-*` backend | SHARED_MODULE_IMPACT (no RFRF file overlap) |
| VDC / drivingintelligence KG | KG_GOVERNANCE_IMPACT (no EED conflict) |
| `ChangesView.tsx` EXP-021 entry | DIRECT_FILE_CONFLICT — auto-merged; RFRF 4.9.1115–1117 preserved |

No migration impact on RFRF path. Merge strategy: merge commit (not rebase).

### 15.3 P2 epistemic wording correction

Policy string corrected to `INVALID_CHANNEL_SAMPLE_EXCLUDED_PER_CHANNEL`. Behavior unchanged; dedicated non-finite runtime diagnostics deferred to F4.

### 15.4 Epistemic level

F3 remains **PROVEN_BY_INTEGRATION_TEST** — not PROVEN_IN_PRODUCTION. No production wiring, deploy, or feature enablement in this workstream.

### 15.5 Final exact-head gate (post-sync)

```
PRE_SYNC_RFRF_HEAD = 773a29fc1b0b2cf58dbafa4084b266c8d763f31e
SYNCED_MAIN_SHA = 7cb184ffc5926521429f75524a1dcb65579769f6
POST_SYNC_HEAD = 514a7fba8288d4a242e8adf04325aa285ce98c53
MAIN_DELTA_REVIEW = PASS
MAIN_SYNC = PASS
RFRF_FILE_SURVIVAL = PASS
NON_FINITE_SAMPLE_BEHAVIOR_CHANGED = NO
NON_FINITE_SAMPLE_EPISTEMICS_CORRECT = YES
DEDICATED_NON_FINITE_RUNTIME_DIAGNOSTIC = NO
NON_FINITE_RUNTIME_DIAGNOSTIC_OWNER = F4
F3_TEST_COUNT = 62
NEGATIVE_CASES_EXECUTED = 21
CAPABILITY_GATE_CASE = DEFERRED_TO_F4
REAL_PG_F3_F2_HANDOFF = PASS (4/4 executed, 0 skip)
F2_UNIT_REGRESSION = PASS (25)
BACKEND_BUILD = PASS
PRISMA_VALIDATE = PASS
PRISMA_GENERATE = PASS
EED_GRAPH_VALIDATOR = PASS
FST_GRAPH_VALIDATOR = PASS
MODULE_REGISTRY_VALIDATOR = PASS
GIT_DIFF_CHECK = PASS
KNOWN_P0_F3_BLOCKERS = 0
KNOWN_P1_F3_BLOCKERS = 0
RFRF_F3_COMPLETE = YES (pending merge)
```
