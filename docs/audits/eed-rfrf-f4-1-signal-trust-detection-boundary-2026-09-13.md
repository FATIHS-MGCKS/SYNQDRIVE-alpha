# EED RFRF F4.1 — Absolute signal trust × F3 detection boundary closure

**Date:** 2026-09-13  
**Phase:** F4.1 pre-PR2 contract closure  
**Base main:** `df8d9d756d171b24bece564fd705bd570b3d4204` (PR #1630 merged)  
**Canonical incident:** KS MS 661 observed absolute-only +24 L refuel (`docs/audits/refuel-production-incident-ks-ms-661-2026-09-06.md`)

---

## 1. Discovered cross-contract mismatch

F4-PR1 `resolveRawFuelSignalTrust()` correctly returns `absoluteSignalTrust = UNKNOWN` (no fleet-wide promotion authority).

F3 `selectPrimarySignalChannel()` required `absoluteSignalTrust === 'TRUSTED'` for `ABSOLUTE_LITERS`.

F3 test helper `buildDetectionContext()` defaulted `absoluteSignalTrust = 'TRUSTED'`, hiding the runtime gap.

**Reproduction (pre-F4.1):**

```
resolveRawFuelSignalTrust(KS_MS_661 observed samples)
  → absoluteSignalTrust=UNKNOWN, relativeSignalAvailable=false

detectRawFuelRises(runtime context)
  → candidateCount=0, reason=no_trusted_channel
```

`TRUST_CONFLATION_CONFIRMED = YES` — F3 channel field named `absoluteSignalTrust` conflated detection admissibility with promotion trust.

---

## 2. Semantic answer

| Authority | Question | Owner |
|-----------|----------|-------|
| **A — DETECTION_EVIDENCE_ADMISSIBILITY** | May absolute liters be used as F3 primary channel under detector safeguards? | F4.1 resolver + F3 channel selector |
| **B — PROMOTION_SIGNAL_AUTHORITY** | Is evidence authoritative enough for fallback VEE promotion? | F5+ (fail-closed UNKNOWN in F4) |

These are **not** the same authority. Staged candidate ≠ promotion authorized.

`DETECTION_ADMISSIBILITY_EQUALS_PROMOTION_TRUST = NO`

---

## 3. Real authority investigation

| Candidate source | Classification | Notes |
|------------------|----------------|-------|
| DIMO `fetchFuelLevelSamples()` | **SAMPLE_PRESENCE_ONLY** | Returns numeric samples; no trust metadata |
| Vehicle.fuelType | **VEHICLE_CLASS_ONLY** | Capability gate only (F4 capability resolver) |
| Provider capability metadata | **NOT_AVAILABLE** | No fleet-wide absolute-trust contract in repo |
| Signal-quality / provider-quality contracts elsewhere | **NOT_AVAILABLE** for absolute fuel liters promotion |

`REAL_ABSOLUTE_TRUST_AUTHORITY_EXISTS = NO`  
`REAL_ABSOLUTE_TRUST_AUTHORITY_SOURCE = NONE`

`ABSOLUTE_TRUST_DERIVED_FROM_SAMPLE_PRESENCE = NO` (promotion axis)  
`ABSOLUTE_TRUST_DERIVED_FROM_FUEL_TYPE_ALONE = NO`

---

## 4. Selected architecture

**SELECTED_ARCHITECTURE = B_SEPARATE_DETECTION_FROM_PROMOTION_TRUST**

### Rejected alternatives

| Option | Verdict |
|--------|---------|
| **A — REAL_TRUST_AUTHORITY** | **NOT_AVAILABLE** — no authoritative fleet-wide source today |
| **C — KEEP_CURRENT_FAIL_CLOSED** | **Rejected** — would leave KS MS 661 class unsupported at F4-PR2 wiring (`KS_MS_661_CLASS_SUPPORTED_BY_RUNTIME = NO`) |

### Implementation (F4.1)

1. **`RawFuelSignalTrustResult.absoluteDetectionAdmissibility`** — `ADMISSIBLE | INADMISSIBLE | UNKNOWN`
   - `ADMISSIBLE`: semantically valid finite non-negative absolute liters in scan window
   - Does **not** set promotion `absoluteSignalTrust` to TRUSTED

2. **`RawFuelRiseDetectionContext.absoluteDetectionAdmissibility`** — fed to F3 channel selector

3. **`selectPrimarySignalChannel()`** — uses `absoluteDetectionAdmissibility === 'ADMISSIBLE'` for absolute primary (replaces promotion-trust check)

4. **Candidate provenance** — `qualityMeta.absoluteDetectionAdmissibility` on observations; `absoluteSignalTrust` remains UNKNOWN at runtime

5. **Test epistemics** — `buildDetectorPhysicsContext()` for F3 physics tests; `buildRuntimeDetectionContextFromTrust()` for runtime-faithful integration tests

### Safety invariants

```
STAGED_CANDIDATE != PROMOTION_AUTHORIZED
UNKNOWN_PROMOTION_TRUST_NEVER_CREATES_VEE = YES
canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion() = false (structural)
```

---

## 5. KS MS 661 consequence

| Field | Post-F4.1 |
|-------|-----------|
| `absoluteSignalTrust` | UNKNOWN |
| `absoluteDetectionAdmissibility` | ADMISSIBLE |
| `candidateCount` | ≥ 1 (absolute channel) |
| `deltaLiters` | ≥ 23 L on observed fixture |
| Promotion | **Not authorized** (F5 gate) |

`KS_MS_661_CLASS_SUPPORTED_AFTER_CLOSURE = YES`

---

## 6. Phase ownership

**F4.1_PRE_PR2_CONTRACT_CLOSURE** — semantic separation required before `detectEnergyEvents()` raw wiring.

F5 retains promotion authority. F4-PR2 may stage raw candidates when flags enabled; F4-PR2 **not started** in this workstream.

---

## 7. Schema impact

`F2_SCHEMA_CHANGE_REQUIRED = NO`  
`PRISMA_CHANGE_REQUIRED = NO`  
`F3_SEMANTIC_CHANGE_REQUIRED = YES` (channel selector + context field; detector algorithm thresholds unchanged)

---

## 8. Validation

| Gate | Result |
|------|--------|
| F4.1 boundary spec + KS MS 661 runtime test | PASS |
| F3.1 / F3.2 / negative matrix | PASS |
| F2 regression | PASS (unchanged schema) |
| Backend build | PASS |

---

## ARCHITECTURE_GOVERNANCE

```
ARCHITECTURE_GOVERNANCE
- substantive_change: YES
- affected_modules: Energy Event Detection (EED)
- authority_updates: this audit; EED KG changelog/decision note
- registry_review:
 - module: Energy Event Detection (EED)
 result: UNCHANGED
 registry_status_before: AUTHORITY_ACTIVE
 registry_status_after: AUTHORITY_ACTIVE
 reason: F4.1 contract closure only; no registry metadata change
```
