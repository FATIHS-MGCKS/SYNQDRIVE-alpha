# M3.1 — Pre-cutover safety gate (PKG-01)

**Audit date:** 2026-09-03  
**Production read-only:** 24 PKG-01 ENQUEUED identities (23 `CONTAMINATED_*`, 1 `MISSED`)  
**Code guard:** PR #1527 — `isCanonicalRestAssessmentHandoffEligible` requires `VALID` quality + reconciliation terminalization

## Executive result

```
BATTERY_V2_M3_1_PRE_CUTOVER_SAFETY_GATE=COMPLETE
CORRECTED_STAGE2_ACTIVATION_READY=YES
PRE_CUTOVER_GUARD_REQUIRED=YES
GUARD_TYPE=C_CODE_GUARD_PLUS_RECONCILIATION_TERMINALIZATION
CUSTOMER_EFFECT_PREVENTED_PREEMPTIVELY=YES
```

Deploy this commit **before** executing `vps-enable-battery-v2-stage2-production.sh`.

---

## Step 1 — PKG-01 repair path (deterministic)

**Gate:** `isBatteryV2RestShadowEnabled()` — reconciliation repair returns 0 when false.

| Stage | Gate | CONTAMINATED | MISSED | Pre-cutover timestamp |
|-------|------|--------------|--------|----------------------|
| Reconciliation candidate SQL | `sourceObservationId` present; handoff not EXECUTED/terminal FAILED | Included | Included (if `sourceObservationId`) | 7-day lookback only |
| `isCanonicalRestAssessmentHandoffEligible` | **`quality === VALID`** + `sourceObservationId` + REST type | **Rejected** | **Rejected** | No |
| `isRestAssessmentHandoffReconciliationTerminalCandidate` | `sourceObservationId` + not handoff-eligible | **Terminalized** | **Terminalized** | No |
| `ensureAssessmentHandoff` | handoff-eligible measurement | Skipped (`measurement_not_handoff_eligible`) | Skipped | No |
| Evidence selection | `CONTAMINATED_MEASUREMENT` / `QUALITY_NOT_VALID` | **Rejected** | **Rejected** | Freshness windows apply |
| `publicationEligible` assessment | CANONICAL + score + confidence | N/A (not selected) | N/A | No |
| `evaluateLvPublicationPolicy` | maturity gates + contamination dominance | Blocks if dominance | Blocks if dominance | Evidence freshness |

```
PKG01_REPAIR_PATH_RECONSTRUCTED=YES
CONTAMINATED_CAN_CREATE_ASSESSMENT=NO
MISSED_CAN_CREATE_ASSESSMENT=NO
CONTAMINATED_CAN_REACH_PUBLICATION=NO
MISSED_CAN_REACH_PUBLICATION=NO
```

**Historical defect (pre-guard):** contaminated rows with `sourceObservationId` passed `isCanonicalRestAssessmentHandoffEligible`, enqueued vehicle-level `BATTERY_ASSESSMENT_RECOMPUTE`, which could select **other** fresh `VALID` REST on the same vehicle — pre-T0 publication risk at T0+ε for `c10351f8`.

---

## Step 2 — 24 identity classification

| Category | Count |
|----------|------:|
| `SAFE_TERMINAL` | **24** |
| `SAFE_REPAIR_NO_PUBLICATION` | 0 |
| `SAFE_REPAIR_PUBLICATION_ELIGIBLE` | 0 |
| `UNSAFE_PRE_T0_PUBLICATION_POSSIBLE` | 0 |
| `UNRESOLVED` | 0 |

All 24: pre-T0 ENQUEUED, `assess_row_exists=0`, reconciliation terminalizes to `EXECUTED/POLICY_SKIPPED` without assess enqueue.

```
PKG01_TOTAL=24
PKG01_SAFE_TERMINAL=24
PKG01_SAFE_REPAIR_NO_PUBLICATION=0
PKG01_SAFE_REPAIR_PUBLICATION_ELIGIBLE=0
PKG01_UNSAFE_PRE_T0_PUBLICATION_POSSIBLE=0
PKG01_UNRESOLVED=0
```

---

## Step 3 — Reactivation simulation (read-only)

Simulated with production measurement snapshots at `T0+1h` and audit-now with quality gate:

```
WOULD_REPAIR_COUNT=0
WOULD_TERMINALIZE_COUNT=24
WOULD_ASSESS_COUNT=0
WOULD_CREATE_PUBLICATION_HANDOFF_COUNT=0
WOULD_CREATE_CUSTOMER_PUBLICATION_COUNT=0
WOULD_SKIP_COUNT=24
UNRESOLVED_COUNT=0
```

---

## Step 4 — Pre-cutover guard

```
PRE_CUTOVER_GUARD_REQUIRED=YES
GUARD_TYPE=C_CODE_GUARD_PLUS_RECONCILIATION_TERMINALIZATION
CUSTOMER_EFFECT_PREVENTED_PREEMPTIVELY=YES
```

**Implementation:**
- `lv-rest-assessment-handoff.policy.ts` — `VALID` quality required for handoff eligibility
- `battery-v2-reconciliation.service.ts` — terminalize ineligible ENQUEUED without assess enqueue
- `pkg01-pre-cutover-safety.policy.ts` + production fixture tests

---

## Step 5 — Activation path neutralization

```
INVALID_ACTIVATION_PATH_NEUTRALIZED=YES
ACTIVATION_SCRIPT_STRATEGY=DEPRECATE_INVALID_SCRIPT_ADD_STAGE2_SCRIPT
DRY_RUN_SUPPORTED=YES
STAGE2_CONTRACT_ASSERTED=YES
```

| Script | Behavior |
|--------|----------|
| `vps-enable-battery-v2-full-fleet-production.sh` | **FAIL CLOSED** (deprecated) |
| `vps-enable-battery-v2-stage2-production.sh` | Stage-2 cutover + rolling restart |
| `battery-v2-stage2-production-preflight.sh` | Read-only preflight: scheduler topology fail-closed, full PKG-01 ENQUEUED backlog, guard deployment proof |
| `battery-v2-stage2-production-activation.selftest.sh` | Contract + topology + dry-run/ACK + guard selftests |

**Preflight hardening (PR #1527 final):**
- `SCHEDULER_TOPOLOGY_PREFLIGHT=PASS` only when exactly one leader and no UNKNOWN/UNREACHABLE replica roles
- PKG-01 SQL audits **all** ENQUEUED REST handoff identities (no 7-day age bound); runtime reconciliation retains bounded lookback
- `PKG01_GUARD_DEPLOYED=YES` required via `BATTERY_V2_PKG01_PRE_CUTOVER_GUARD_VERSION` marker in deployed release
- `DRY_RUN=1` on activation script: preflight only, no `BATTERY_V2_STAGE2_PREFLIGHT_ACK` required
- Post-`backend.env` mutation failure: emits `BACKUP_FILE` + `ROLLBACK_COMMAND` (+ automatic restore attempt)

---

## Step 7 — Root cause refinement

```
PRIMARY_ROOT_CAUSE=CONFIGURATION_DEFECT
CONTRIBUTING_CAUSE=DOCUMENTATION_DEFECT
DESIGN_DEBT=REST_SHADOW_SEMANTIC_OVERLOAD
```

`MULTIPLE_DEFECTS` remains accurate as summary; runtime Stage-2 behavior was **tested and correct** — the misleading `REST_SHADOW` name is design debt, not a runtime code defect.

---

## Step 9 — GO/NO-GO

```
CORRECTED_STAGE2_ACTIVATION_READY=YES
```

**Prerequisites before execute (not yet done):**
1. Merge + deploy this commit (quality gate)
2. `sudo bash battery-v2-stage2-production-preflight.sh`
3. `sudo BATTERY_V2_STAGE2_PREFLIGHT_ACK=YES bash vps-enable-battery-v2-stage2-production.sh`
4. Establish new `BATTERY_V2_STAGE2_T0`; run 30m + ≥6h validation

**Rollback:** restore `backend.env` backup; rolling restart; document rollback T0.

---

## Machine-readable block

```
BATTERY_V2_M3_1_PRE_CUTOVER_SAFETY_GATE=COMPLETE
PKG01_REPAIR_PATH_RECONSTRUCTED=YES
PKG01_TOTAL=24
PKG01_SAFE_TERMINAL=24
PKG01_SAFE_REPAIR_NO_PUBLICATION=0
PKG01_SAFE_REPAIR_PUBLICATION_ELIGIBLE=0
PKG01_UNSAFE_PRE_T0_PUBLICATION_POSSIBLE=0
PKG01_UNRESOLVED=0
WOULD_REPAIR_COUNT=0
WOULD_ASSESS_COUNT=0
WOULD_CREATE_PUBLICATION_HANDOFF_COUNT=0
WOULD_CREATE_CUSTOMER_PUBLICATION_COUNT=0
PRE_CUTOVER_GUARD_REQUIRED=YES
CUSTOMER_EFFECT_PREVENTED_PREEMPTIVELY=YES
INVALID_ACTIVATION_PATH_NEUTRALIZED=YES
STAGE2_CONTRACT_ASSERTED=YES
PRIMARY_ROOT_CAUSE=CONFIGURATION_DEFECT
CONTRIBUTING_CAUSE=DOCUMENTATION_DEFECT
DESIGN_DEBT=REST_SHADOW_SEMANTIC_OVERLOAD
CORRECTED_STAGE2_ACTIVATION_READY=YES
PRODUCTION_CHANGED=NO
```
