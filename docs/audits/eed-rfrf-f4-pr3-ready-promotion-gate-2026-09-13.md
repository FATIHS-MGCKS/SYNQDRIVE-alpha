# RFRF F4-PR3 — Ready Evaluator + Promotion Eligibility + Promotion Draft + F5 Gate Stub

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F4-PR3 — Pre-promotion control plane (STOP before VehicleEnergyEvent)  
**Date:** 2026-09-13  
**Base main SHA:** `b16afefffddef140a88fcafeb4c7cd0078a3cb59`  
**PR #1636 merge:** `08e6829462c44b956c8309d87c407dde3ed400e1` (ancestor verified)  
**Post-#1636 delta:** Trip FSM #1635 only — orthogonal to RFRF  

---

## Executive verdict

```
RFRF_F4_PR3 = PASS
F4_FALLBACK_VEE_UPSERT_REACHABLE = NO
F5_CONVERGENCE_IMPLEMENTED = NO
F5_CONVERGENCE_PROVEN = NO
PRISMA_SCHEMA_CHANGED = NO
PRODUCTION_MUTATED = NO
```

F4 dark runtime now continues after F2 persist into a **pre-promotion preparation layer** that evaluates readiness, promotion eligibility, advisory native overlap, and constructs promotion drafts — then **hard-stops** at the F5 convergence gate stub. No fallback `VehicleEnergyEvent`, no `PROMOTED`, no G2, no BullMQ.

---

## Main delta review (post #1636)

| Commit | Classification |
|--------|----------------|
| `b16afefff` Trip FSM R12 (#1635) | Orthogonal — no RFRF material conflict |

F4-PR1 / F4.1 / F4-PR2 artifacts verified present on base main.

---

## Readiness contract

`evaluateRawRefuelCandidateReadiness()` re-evaluates **persisted** F2 candidates (not raw F3 observation lifecycle alone).

Explicit reason codes include: `READY`, `INSUFFICIENT_EVIDENCE`, `POST_PLATEAU_NOT_FINAL`, `CANDIDATE_SETTLING`, `CANDIDATE_OBSERVED`, `DETECTION_NOT_ADMISSIBLE`, `CAPABILITY_*`, `TERMINAL_REJECTED`, `MISSING_IDENTITY_KEY`, etc.

Deterministic for identical persisted evidence.

---

## Promotion eligibility contract

Orthogonal to F2 lifecycle (`RawRefuelPromotionEligibilityStatus`):

- `ELIGIBLE_FOR_F5_REVIEW` — only when all pre-F5 checks pass **and** F5 gate authorized (unreachable in F4)
- `NOT_READY`, `BLOCKED_CAPABILITY`, `BLOCKED_DETECTION_ADMISSIBILITY`, `BLOCKED_NATIVE_OVERLAP_REVIEW`, `BLOCKED_PROMOTION_TRUST`, `BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED`, `AMBIGUOUS`

**F5 absence does NOT terminal-reject candidates.**

---

## Native overlap advisory

`classifyRawRefuelNativeOverlapAdvisory()` reuses `classifyPhysicalRefuelSibling()`.

```
F4_NATIVE_OVERLAP_CLASSIFICATION = ADVISORY_ONLY
F4_NATIVE_OVERLAP_TERMINAL_REJECTION = NO
```

SAME → `BLOCKED_NATIVE_OVERLAP_REVIEW` (F5 convergence pending). Multiple SAME → fail closed `AMBIGUOUS`. INSUFFICIENT → fail closed for promotion authorization; candidate preserved.

---

## F3/F2 tolerance integration gate

| Layer | Pre-plateau (L) | Post-plateau (L) |
|-------|-----------------|------------------|
| F3 detector | 0.5 | 0.5 |
| F2 matcher | 0.5 | 1.0 |

F2 post-plateau envelope is **wider** than F3 — delayed evidence within F3 coalescence remains one F2 identity. Boundary tests in `raw-refuel-f3-f2-tolerance.integration.spec.ts`.

```
F3_F2_TOLERANCE_INTEGRATION_GATE = PASS
```

---

## Promotion draft mapping

`mapRawRefuelCandidateToPromotionDraft()` consumed from persisted candidate via `RawRefuelPromotionPreparationService`.

- `sourceEventKey = candidateIdentityKey` (stable across fingerprint maturation)
- Zero VEE writes

---

## F5 authority boundary

```typescript
isRfrfNativeFallbackConvergenceAuthorized(): false  // always in F4-PR3
canCreateFallbackVehicleEnergyEvent(): false
```

Not bypassable by master/persist flags, READY, draft construction, or env `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED=true` in F4 stub.

---

## Real PostgreSQL evidence

Gate: `backend/scripts/test/rfrf-f4-pr3-ready-promotion-gate.sh`

```
REAL_PG_F4_PR3_TEST_COUNT = 48 (7 PR3 + 41 PR2/F2/F3 matrix in gate)
REAL_PG_F4_PR3_PASS_COUNT = 48
REAL_PG_F4_PR3_REQUIRED_TESTS_SKIPPED = 0
FALLBACK_VEE_CREATED = 0
PROMOTED_CANDIDATE_COUNT = 0
```

---

## KS MS 661

Fixture-only path through dark runtime + preparation:

```
KS_MS_661_F4_PR3_PATH_EXECUTED = YES
KS_MS_661_PHYSICAL_CANDIDATE_COUNT = 1
KS_MS_661_PROMOTION_DRAFT_COUNT = 0 (BLOCKED_PROMOTION_TRUST — UNKNOWN promotion trust)
KS_MS_661_FALLBACK_VEE_COUNT = 0
```

---

## F5 entry blockers (unchanged)

1. Synthetic dimoSegmentId fleet compatibility NOT_PROVEN  
2. G2 native↔fallback convergence matrix not executed  
3. Late-native sibling policy not implemented  

---

## Known limitations

- F4-PR3 PG matrix covers representative A–R scenarios; full 10-scenario F5 matrix deferred  
- Promotion trust remains fail-closed UNKNOWN unless real fleet authority exists  
- F4-PR4 closure (full matrix hardening) not started  

---

## Epistemic status

| Claim | Status |
|-------|--------|
| Pre-promotion path reachable in dark runtime | CONFIRMED (code + PG) |
| Zero fallback VEE | PROVEN_BY_INTEGRATION_TEST |
| F5 convergence | NOT_IMPLEMENTED |
