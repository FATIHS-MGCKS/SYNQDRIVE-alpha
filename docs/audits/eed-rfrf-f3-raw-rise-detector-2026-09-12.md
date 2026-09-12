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
| `raw-fuel-rise-detector-negative.spec.ts` | negative/hold matrix | **PASS** |
| `raw-fuel-rise-detector-invariance.spec.ts` | window/order/duplicate | **PASS** |
| F2 unit regression (`raw-refuel-candidate`) | 25 | **PASS** |
| F2 handoff PG (`RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1`) | 1 | **PASS** |

**Total F3 unit tests:** 27

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
