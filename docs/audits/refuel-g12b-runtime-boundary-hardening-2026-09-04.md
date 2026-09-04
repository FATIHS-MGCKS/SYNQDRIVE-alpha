# G1.2b Runtime Boundary Hardening — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT)  
**Base SHA (origin/main):** `57ec14eabed06df0bf32e7a7a69e9ebe0c53fc88`  
**G1.2 head (pre-G1.2b):** `55ed0d2a6b79d86dc5adc17728b40e294c444593`  
**G1.2b head:** _(recorded at commit)_

## Why G1.2b was required

Independent review of G1.2 identified five defects that would carry into G2 runtime wiring:

1. Provider segment start could clip valid pre-rise physical dwell evidence.
2. Incremental processing could enrich a singleton before a semantic sibling arrived.
3. Bucketed advisory lock keys risked concurrency races at minute/fuel/odo boundaries.
4. Canonical selection mixed liters and percentages in one scalar score.
5. Multi-sibling batch reconciliation used star comparison vulnerable to non-transitive identity.

G1.2b hardens pure algorithms and design contracts only — **no production wiring**.

## Issue 1 — Provider-segment-start lookback defect

### Old semantics

```typescript
lookbackStartMs = max(eventStartAt, fuelRiseOnsetAt - lookbackMax)
```

### Problem

Sept04 physical dwell (~03:44–03:47 UTC) precedes Event B provider segment start (`03:48:43`). Event B processed alone would lose forecourt cluster.

### New semantics

```typescript
lookbackStartMs = fuelRiseOnsetAt - lookbackMax
```

`eventStartAt` retained in provenance as diagnostic only (`eventStartAtMs`, `lookbackStartMs`).

### Evidence

- Event A → Esso forecourt SELECTED
- Event B alone → same forecourt region SELECTED
- Regression: segment start after dwell does not change selection

## Issue 2 — Incremental enrichment / finality defect

### Old semantics

Singleton rows immediately received `enrichmentEligibleId = self`.

### Problem

B arrives first → enriched as singleton → A arrives later → semantic SAME group but duplicate enrichment risk.

### New semantics

`physical-refuel-settlement.design.ts` models:

| State | Enrichment eligible? |
|-------|---------------------|
| PROVISIONAL | No (singleton within settlement horizon) |
| SETTLING | _(reserved for partial visibility)_ |
| FINAL_CANONICAL | Yes (canonical only) |
| FINAL_DISTINCT | Yes (confirmed singleton) |
| INSUFFICIENT_EVIDENCE | No |

Default settlement horizon: **60 minutes** (INFERRED; exceeds Sept04 ~45m provider stagger). **OPEN:** production calibration.

Invariant: **ONE_PHYSICAL_REFUEL → AT MOST ONE FINAL_ENRICHMENT_ELIGIBLE EVENT.**

## Issue 3 — Concurrency bucket-boundary defect

### Old semantics

`buildPhysicalRefuelScopeKey` bucketed end-minute, rounded fuel, rounded odometer.

### New semantics

**Stage 1:** `refuel_reconciliation:{vehicleId}` — coarse serialization  
**Stage 2:** semantic matcher + clique grouping under transaction

Lock is broader than semantic matching; identity is not encoded in lock key.

## Issue 4 — Dimensional canonical comparator defect

### Old semantics

`transitionCompletenessScore = max(literSpan, deltaLiters, percentSpan)` — dimensionally invalid.

### New semantics

`compareCanonicalRefuelCandidates` ordered precedence:

1. Suffix-compatible transition superset
2. Transition evidence completeness
3. Larger liter transition (when both have liters)
4. Percent transition only when liters absent for both
5. Temporal containment
6. Duration
7. Lexicographic ID

Symmetric: `chooseCanonicalRefuel(A,B) === chooseCanonicalRefuel(B,A)`. Sept04 canonical remains Event A.

## Issue 5 — Multi-sibling non-transitivity defect

### Old semantics

Star comparison from first row in batch loop.

### New semantics

`partitionPhysicalRefuelGroups`: clique-consistent — row joins group only if `SAME` with **every** member.

Non-transitive `A~B, B~C, A!~C` → `[A,B]` and `[C]`, not `[A,B,C]`.

All input permutations produce identical partition.

## G2 transaction boundary (updated design)

```
BEGIN
→ advisory_xact_lock(vehicle_refuel_reconciliation)
→ load_bounded_physical_refuel_candidates
→ classify_physical_identity
→ partition_fail_closed_clique_groups
→ choose_canonical_refuel
→ determine_settlement_finality_state
→ persist_semantic_state_and_evidence
→ COMMIT
→ IF FINAL_CANONICAL OR FINAL_DISTINCT: enqueue_station_enrichment(canonical_or_distinct_only)
```

**Not wired in G1.2b.**

## Test evidence

| Suite | Command | Passed | Failed |
|-------|---------|--------|--------|
| physical-refuel-coordinate.selector.spec.ts | `npm test -- --testPathPattern=physical-refuel` | 10 | 0 |
| physical-refuel-identity.matcher.spec.ts | same | 18 | 0 |
| physical-refuel-reconciliation.design.spec.ts | same | 14 | 0 |
| physical-refuel-settlement.design.spec.ts | same | 4 | 0 |
| refuel-sibling-reconciliation.sept04-2026.spec.ts | same | 5 | 0 |
| **Total** | | **51** | **0** |

Sept04 coordinate regression: **PASS**  
Sept04 identity regression: **PASS**

## Remaining uncertainties (OPEN)

- Settlement horizon production calibration (default 60m INFERRED from single incident stagger).
- Late sibling after FINAL_DISTINCT distinct settlement — fail-closed INSUFFICIENT; operational remediation path TBD at G2.
- CH HF vehicles without route GPS for dwell selector.

## G2 readiness assessment

G1.2b closes the five reviewed boundary defects in pure design code. **G2 implementation can begin** with explicit finality gate and coarse lock contract. **Production deployment remains NOT ready** until G2 runtime wiring, observability, and calibrated settlement horizon.

## Knowledge graph updates

- FST: `FST-EVID-G12B-RUNTIME-BOUNDARY-HARDENING-2026-09-04-001` + 5 decision nodes
- EED: `EED-EV-0029` + 5 decision nodes

## Mandatory gates

| Gate | Result |
|------|--------|
| PHYSICAL_LOOKBACK_PROVIDER_INDEPENDENT | YES |
| INCREMENTAL_ENRICHMENT_DUPLICATE_RISK_CLOSED | YES (design) |
| SETTLEMENT_FINALITY_MODEL_DEFINED | YES |
| CONCURRENCY_SCOPE_BOUNDARY_SAFE | YES |
| CANONICAL_COMPARATOR_DIMENSION_SAFE | YES |
| MULTI_SIBLING_ORDER_INDEPENDENT | YES |
| NON_TRANSITIVE_FALSE_MERGE_FAIL_CLOSED | YES |
| SEPT04_COORDINATE_REGRESSION | PASS |
| SEPT04_IDENTITY_REGRESSION | PASS |
| ALL_RELEVANT_TESTS | PASS |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_RUNTIME_CHANGED | NO |
| PR_1531_STILL_DRAFT | YES |
| G2_IMPLEMENTATION_READY | YES |
| PRODUCTION_DEPLOYMENT_READY | NO |
