# G1.2d Late-Sibling Finalization Hardening — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT)  
**origin/main:** `57ec14eabed06df0bf32e7a7a69e9ebe0c53fc88`  
**G1.2c head (before G1.2d):** `fe55eafdf72b8b7a186f210ca0413df8230bc0f0`

## Blocker

| Field | Value |
|-------|-------|
| **BLOCKER_ID** | `G12C-LATE-SIBLING-INSUFFICIENT-SINGLETON-FINALIZE` |
| **Source** | Independent Pre-G2 adversarial review (G1.2c gate) |

### Reproduction (before fix)

```
A finalized FINAL_DISTINCT at t0 (priorDistinctFinalizationIds = {A})
late B observed at t0 + horizon + 60s, INSUFFICIENT vs A
asOfMs = obsB + horizon + 1  (B settlement window CLOSED)

→ sparse B: finalityState = FINAL_DISTINCT
→ enrichmentEligibleId = B.id   // VIOLATION
→ reasonCodes included late_sibling_after_finalization but did not gate settlement
```

## Root cause

`decisionFromComponent()` only passed `priorDistinctFinalization` / `priorCanonicalFinalization` to settlement when **both**:

1. `lateSiblingConflict === true` (pairwise SAME or INSUFFICIENT vs a prior-finalized id), **and**
2. `priorDistinctHit` / `priorCanonicalHit` (prior-finalized id is in the **same component**)

Singleton late components (INSUFFICIENT vs prior A) satisfied (1) but not (2), so settlement proceeded to `FINAL_DISTINCT` with enrichment.

## Fix

**G1.2d rule:** When `hasLateSiblingFinalizationConflict()` is true for a component, settlement receives `priorDistinctFinalization: true` and `priorCanonicalFinalization: true` **regardless of component membership**.

Effect: `determinePhysicalRefuelSettlement()` returns `INSUFFICIENT_EVIDENCE`, `enrichmentEligibleId = null`, `late_sibling_after_finalization`.

## New safety rule

```
IF lateSiblingConflict(component, priorFinalizedIds)
THEN enrichmentEligibleId = null
 AND finalityState = INSUFFICIENT_EVIDENCE
 AND reasonCodes includes late_sibling_after_finalization
```

Applies to:

- same-component late SAME siblings
- singleton late INSUFFICIENT siblings
- external late ambiguous rows vs prior finalized outcomes

Unrelated DISTINCT refuels (no SAME/INSUFFICIENT link to prior finals) remain eligible for independent `FINAL_DISTINCT`.

## Tests added

| Case | Description |
|------|-------------|
| CASE 1 | A FINAL_DISTINCT → late B SAME, window closed → fail closed |
| CASE 2 | A FINAL_DISTINCT → late B INSUFFICIENT singleton, window closed → fail closed |
| CASE 3 | A FINAL_DISTINCT → late external C INSUFFICIENT → fail closed |
| CASE 4 | Unrelated refuels → both FINAL_DISTINCT (positive control) |
| CASE 5 | Same-component late SAME while window open → fail closed |
| CASE 6 | Sept04 triple arrival-order invariance preserved |

## Validation

### TARGETED_G12D_TESTS

```bash
cd backend && npm test -- --testPathPattern="physical-refuel|refuel-sibling-reconciliation.sept04" --no-coverage
```

### BROADER_REFUEL_REGRESSIONS

```bash
cd backend && npm test -- --testPathPattern="refuel|physical-refuel|fuel-station-enrichment|energy-events-fuel" --testPathIgnorePatterns=postgres.integration --no-coverage
```

### TYPECHECK_OR_BUILD

```bash
cd backend && npm run build
```

### Graph validators

```bash
bash architecture/tankstellenerkennung/scripts/validate-graph.sh
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
```

## Knowledge graph

- `FST-EVID-G12D-LATE-SIBLING-HARDENING-2026-09-04-001`
- `EED-EV-0031`
- `FST-DEC-LATE-SIBLING-RECOVERY-CONFLICT-001` / `EED-DEC-LATE-SIBLING-RECOVERY-CONFLICT-001` evidence updated
- `EED-EV-0026` title clarified: `KS MX 2024 — 2026-09-04 duplicate REFUEL forensic replay`

## Gates

| Gate | Result |
|------|--------|
| LATE_SIBLING_BLOCKER_REPRODUCED | YES |
| LATE_SIBLING_BLOCKER_FIXED | YES |
| NO_SECOND_ENRICHMENT_ON_LATE_CONFLICT | YES |
| G2_RUNTIME_WIRING_PRESENT | NO |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_RUNTIME_CHANGED | NO |
| PR_1531_STILL_DRAFT | YES |
