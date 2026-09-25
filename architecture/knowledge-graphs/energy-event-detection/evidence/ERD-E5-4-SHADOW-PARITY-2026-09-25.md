# ERD E5.4 — Canonical vs legacy recharge shadow parity (2026-09-25)

**Status:** IMPLEMENTED (measurement-only; **default OFF**; no product mutation).  
**Baseline main:** post E5.3 merge `a3c8ffe00e0af5532109fa95345daf8cc49643f9`  
**Workstream stage:** `ERD_E5_4_SHADOW_PARITY`

## Purpose

Compare **legacy truth** (direct DIMO → `VehicleEnergyEvent.RECHARGE` via `EnergyEventsService.detectEnergyEvents`) against **canonical future truth** (eligible `HvChargeSession` → pure E5.1 projection draft) **without persisting product VEE rows**.

E5.4 answers parity questions for later E5.5/E5.6 — it does **not** cut over product authority.

## Non-mutation contract

| Rule | Value |
|------|--------|
| Calls `projectCanonicalRecharge()` | **NO** |
| Mutates `VehicleEnergyEvent` / `HvChargeSession` | **NO** |
| Mutates legacy recharge writer | **NO** |
| Product reads | **NO change** |

Canonical shadow uses only:

- `evaluateErdRechargeProjectionEligibility()`
- `mapCanonicalHvChargeSessionToErdRechargeProjectionDraft()`

## Legacy cohort — `LEGACY_DIRECT_DIMO_RECHARGE`

Repository predicate (`legacy-recharge-cohort.policy.ts`):

- `kind = RECHARGE`
- `detectionMechanism = recharge`
- `canonicalChargeSessionId IS NULL`
- `dimoSegmentId IS NOT NULL`
- `detectionSource IS NULL` **or** `DIMO_NATIVE` (historical RECHARGE rows)
- **Exclude** `SYNQDRIVE_ERD_RECHARGE_PROJECTION`
- **Exclude** REFUEL and all non-legacy mechanisms

## Canonical shadow cohort

Eligible completed `HvChargeSession` rows passing E5.1 projectability in scope/window, including native DIMO and non-superseded fallback. **Superseded fallback F excluded** after E3 SAME (only native N counts).

## Pairing hierarchy (observational — `PAIRING_IS_PRODUCT_AUTHORITY=NO`)

1. **P1** `EXACT_NATIVE_DIMO_ID` — native session `dimoSegmentId` = legacy `dimoSegmentId`
2. **P2** `LEGACY_COALESCED_LINEAGE` — native id ∈ legacy `rawDetectionMeta.coalescedFromSegmentIds`
3. **P3** `UNIQUE_PHYSICAL_WINDOW_OVERLAP` — mutual unique interval overlap only

Ambiguous multi-match → `AMBIGUOUS_MATCH` (fail closed, no winner).

## Parity taxonomy

`EXACT_MATCH`, `SEMANTIC_MATCH`, `FIELD_MISMATCH`, `CANONICAL_ONLY`, `LEGACY_ONLY`, `AMBIGUOUS_MATCH`, `LEGACY_COALESCED_MULTIPLE_CANONICAL`, `MULTIPLE_LEGACY_ONE_CANONICAL`, `PENDING_SETTLEMENT`, `NOT_COMPARABLE`.

## Finality (`PARITY_FINALITY_MODEL_DEFINED=YES`)

- **PENDING_SETTLEMENT** — fallback-only canonical without legacy counterpart (provider/E3 lateness; not a final defect)
- **SETTLED** — paired episodes, legacy-only, native canonical-only, cardinality anomalies
- **OBSERVED** — reserved for unsettled native-only observations

Aggregator **settled parity rate** excludes `PENDING_SETTLEMENT` and `AMBIGUOUS_MATCH` from denominator.

## Expected semantic differences (`EXPECTED_SEMANTIC_DIFFERENCES_DOCUMENTED=YES`)

Field severities: `AUTHORITY_CRITICAL`, `PRODUCT_VISIBLE`, `PROVENANCE_ONLY`, `EXPECTED_BY_DESIGN`.

Documented gap: canonical mapper may emit **null coordinates** while legacy DIMO VEE retains coordinates (`S14` / E6 relevance).

## Shadow evidence

Table: `erd_recharge_projection_shadow_observations` (`ErdRechargeProjectionShadowObservation`)

- Diagnostic-only FK to `Vehicle` (cascade delete)
- **No** FK to product VEE / HvChargeSession
- Idempotency: deterministic `comparisonFingerprint` (SHA-256 of comparator version + scope + snapshots + class + finality)

## Runtime

| Flag | Default |
|------|---------|
| `ERD_RECHARGE_SHADOW_PARITY_ENABLED` | **OFF** (`0` / unset) |

When OFF: no shadow DB writes from service path; legacy detection unchanged.

When ON: `ErdRechargeShadowParityRuntimeService.runAfterEnergyDetectionSafe()` runs **after** `detectEnergyEvents` completes (fail-open, isolated transaction from product upserts).

## Metrics (bounded labels)

- `synqdrive_erd_recharge_shadow_comparisons_total{parity_class}`
- `synqdrive_erd_recharge_shadow_pairing_total{pairing_evidence}`
- `synqdrive_erd_recharge_shadow_field_mismatch_total{field}`
- `synqdrive_erd_recharge_shadow_runs_total{result}`

No high-cardinality entity ids in labels.

## Tests

- Unit: pairing, aggregator
- PostgreSQL: `erd-e5-4-recharge-shadow-parity.postgres.integration.spec.ts` (**S1–S28**)
- CI: `boundary-repair-postgres-ci.sh` step **11/11**

## Explicit non-goals

- E5.5 product-read dedupe, E5.6 cutover, legacy writer disable, backfill, Production flag enablement

## Next

`ERD_E5_5_PRODUCT_READ_DEDUPE` (not started in this workstream)

---

## E6.1 addendum (2026-09-25)

E6.1 (`ERD-E6-1-CANONICAL-RECHARGE-LOCATION-PROVENANCE-2026-09-25.md`) projects native DIMO coordinates from trusted `HvChargeSession.metadata` into canonical shadow drafts when present. E5.4 historical runs that recorded `EXPECTED_BY_DESIGN` coordinate gaps remain valid evidence for the pre-E6.1 mapper era. Post-E6.1, coordinate parity may be compared when both legacy and canonical snapshots include coordinates.
