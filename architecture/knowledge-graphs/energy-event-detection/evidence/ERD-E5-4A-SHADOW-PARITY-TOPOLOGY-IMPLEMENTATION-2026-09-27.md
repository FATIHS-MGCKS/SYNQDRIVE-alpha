# ERD E5.4A — Shadow parity topology implementation (Step 1)

**Status:** IMPLEMENTED (runtime comparator v2; **Shadow Parity flag remains OFF by default**)  
**Production SHA at ADR:** `1b5a7f6cd91d175e82f9ee0df111d4df015b3555`  
**Implementation baseline main:** `ee26a1bf6acec7fe0fe27f81340dfc162601aec5` (includes merged ADR #1802)  
**Evidence ID:** EED-EV-0093  
**Decision:** EED-DEC-ERD-002 → **VALIDATED** (topology only)

## Scope delivered

- Pure fragment sibling policy (`erd-recharge-shadow-fragment.policy.ts`) with strict temporal containment (fail closed on multi-canonical ownership and strong cross-canonical identity).
- `evaluateRechargeShadowParity` emits one `MULTIPLE_LEGACY_ONE_CANONICAL` diagnostic per primary-paired canonical with sorted extra fragment IDs (primary anchor excluded).
- Proven fragments no longer emit `LEGACY_ONLY`.
- Aggregator physical settled denominator excludes fragment topology diagnostics when a primary pair exists for the same canonical.
- Report fields: `legacyRowCount`, `legacyPhysicalClusterCount`, `canonicalPhysicalEpisodeCount`, `pairedPhysicalEpisodeCount`, `legacyFragmentRowCount`, `trueLegacyOnlyPhysicalClusterCount` (compat aliases preserved).

## Version pins

| Constant | Before | After |
|----------|--------|-------|
| `ERD_RECHARGE_SHADOW_COMPARATOR_VERSION` | `erd_recharge_shadow_comparator_v1` | `erd_recharge_shadow_comparator_v2` |
| `ERD_RECHARGE_SHADOW_PARITY_CLASSIFICATION_VERSION` | `erd_recharge_shadow_parity_v1` | `erd_recharge_shadow_parity_v2` |
| `ERD_RECHARGE_SHADOW_PAIRING_MODEL_VERSION` | `erd_recharge_shadow_pairing_v1` | **unchanged** |

## Explicit non-goals (verified)

- No `energyDeltaKwh` / canonical mapper / `chargingEnergyAddedKwh` changes (Step 2 not started).
- No Prisma schema or migration.
- No Shadow Parity enablement, cutover, dedupe, E6.3, Production mutation.

## Tests

| ID | Coverage |
|----|----------|
| T1–T8 | `erd-recharge-shadow-topology.spec.ts` (unit) |
| PG-T2, PG-T3, PG-T5, PG-T8 | `erd-e5-4-recharge-shadow-parity.postgres.integration.spec.ts` |
| R1–R4, S1–S28 | Existing E5.4 matrix (regression) |

## PRE/POST defect

| | Value |
|---|--------|
| PRE_FIX_FRAGMENT_CLASS (v1) | `LEGACY_ONLY` for contained sibling |
| POST_FIX_FRAGMENT_CLASS (v2) | `MULTIPLE_LEGACY_ONE_CANONICAL` diagnostic |
| PRE_FIX_MULTIPLICITY_INFORMATION_LOST | YES |
| POST_FIX_MULTIPLICITY_INFORMATION_LOST | NO |

## Production-shaped fixture (unit T8)

`legacyRowCount=65`, `pairedPhysicalEpisodeCount=1`, `legacyFragmentRowCount=64`, `settledParityDenominator=1`, `LEGACY_ONLY count=0`.
