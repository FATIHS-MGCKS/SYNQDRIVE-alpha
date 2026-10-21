# ERD E5.5 — Product-read RECHARGE dedupe (2026-09-25)

**Status:** IMPLEMENTED (read projection only; **default OFF**).  
**Baseline:** post E5.4 merge `5d2af42d28077f69250bcb34b7e506f565fdacbc`  
**Stage:** `ERD_E5_5_PRODUCT_READ_DEDUPE`

## Purpose

Deterministic **product-facing** deduplication when legacy direct DIMO `VehicleEnergyEvent.RECHARGE` and canonical ERD projection rows coexist. **No DB mutation**, no write authority change, not E5.6 cutover.

## Fail-open principle

`UNCERTAIN_DUPLICATE_POLICY=SHOW_BOTH` — false negative (hiding a real recharge) is worse than showing a duplicate.

## Independent of E5.4 shadow

- **Does not** query `erd_recharge_projection_shadow_observations`
- **Does not** use shadow pairing, parity class, or `UNIQUE_PHYSICAL_WINDOW_OVERLAP`
- E5.4 time-window pairing remains **observational science only**

## Product-read identity v1

`erd_recharge_product_read_identity_v1`

| Evidence | Rule |
|----------|------|
| **P1 EXACT_DIMO_ID** | Both rows have non-null `dimoSegmentId` and equal |
| **P2 LEGACY_COALESCED_LINEAGE** | Canonical `dimoSegmentId` ∈ legacy `rawDetectionMeta.coalescedFromSegmentIds` |
| **Forbidden** | Time overlap, SOC/energy similarity, coordinates, shadow |

## Row roles

- **CANONICAL_ERD_RECHARGE:** `SYNQDRIVE_ERD_RECHARGE_PROJECTION` + `canonicalChargeSessionId` + non-empty `sourceEventKey`
- **LEGACY_DIRECT_DIMO_RECHARGE:** same predicate as E5.4 legacy cohort
- **OTHER_RECHARGE:** always visible; never suppresses others

## Suppression rules

- Strong proof → show canonical, hide legacy (read projection only)
- Fallback canonical with `dimoSegmentId=null` → **cannot** suppress legacy (`FALLBACK_ONLY_TIME_MATCH_SUPPRESSES_LEGACY=NO`)
- Coalesced legacy parent: hide only when **every** `coalescedFromSegmentIds` entry has a distinct canonical row with lineage proof (**full cover**); partial coverage → legacy stays visible
- Ambiguous competing proofs → show all (`AMBIGUOUS_PRODUCT_DEDUPE_FAILS_OPEN=YES`)
- Malformed ERD projection rows cannot suppress legacy

## Feature gate

| Flag | Default |
|------|---------|
| `ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED` | **OFF** (`1`/`true` only enable) |

Independent of `ERD_RECHARGE_SHADOW_PARITY_ENABLED`.

## Product surfaces (inventoried)

| Surface | Dedupe when flag ON |
|---------|---------------------|
| `EnergyEventsService.listCanonicalEnergyEvents` | YES |
| `EnergyEventsService.buildTripsTimeline` | YES (via canonical list) |
| `VehicleIntelligenceController` energy canonical API | YES |
| `listEnergyEventsRaw` / `listEnergyEvents` (forensic) | **NO** |

REFUEL canonicalization unchanged.

## Tests

- Unit: `erd-recharge-product-read-dedupe.spec.ts` (R1–R32 policy coverage)
- PostgreSQL: `erd-e5-5-product-read-dedupe.postgres.integration.spec.ts`
- CI: `boundary-repair-postgres-ci.sh` step **12/12**

## E5.6 boundary

Does not disable legacy writer, activate projector, backfill, delete rows, or set cutover timestamp.

## Next

`ERD_E5_6_CUTOVER_GATE` — write authority / Production activation (not started)
