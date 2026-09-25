# ERD E5.3 — Late-native canonical VEE handoff (2026-09-25)

**Status:** IMPLEMENTED (product handoff + tests only; **no runtime activation**, no cutover).  
**Baseline main:** post E5.2 merge `d6ff7e198110ff7401d03389c232398af47766f0`  
**Workstream stage:** `ERD_E5_3_LATE_NATIVE_HANDOFF`

## Problem

Fallback session **F** may project VEE **V** with immutable product anchor `sourceEventKey = erd:physical:v1:{vehicleId}:{F.segmentFingerprint}`.  
When E3 later proves native **N** is the **SAME** physical episode and supersedes **F**, product authority must move to **N** **without** minting a second row or rewriting `sourceEventKey`.

Native mint key uses **N.segmentFingerprint** — it will **not** rediscover **V**. Handoff must consume **persisted E3 supersession evidence**, not re-run physical matching.

## Authority hierarchy

1. **E3** commits physical convergence (`metadata.supersededBySegmentFingerprint`, `supersededAt`, `erdMatchVersion`, `erdMatchReason`) independently.  
2. **E5.3** handoff is a separate, retryable PostgreSQL transaction under the **same E3 vehicle advisory lock**.  
3. Product projection failure must **not** roll back valid E3 native authority.

`PHYSICAL_AUTHORITY_BLOCKED_BY_PRODUCT_PROJECTION=NO`

## Handoff transaction (binding)

1. `BEGIN`
2. `acquireErdHvChargeSessionVehicleAuthorityLock(tx, vehicleId)`
3. Re-read native session **N**
4. Eligibility on **N**
5. Resolve authoritative superseded fallback **F** via persisted E3 metadata (`resolveAuthoritativeFallbackPredecessorForNative`)
6. If **F** owns canonical ERD VEE **V** → atomic update **same row**:
   - `canonicalChargeSessionId`: `F.id` → `N.id`
   - Reconcile projection-owned fields from **N** mapped with **original V anchor** (not `N.segmentFingerprint`)
   - Immutable: `V.id`, `sourceEventKey`, `anchorSegmentFingerprint`
7. `COMMIT`

## Post-handoff identity validation (E5.2 fix)

After handoff, do **not** compare `V.sourceEventKey` to mint(`N.segmentFingerprint`).  
Rebuild expected key from **immutable anchor** on **V** via `readAnchorSegmentFingerprintFromVee`.

## Bounded outcomes (added in E5.3)

`HANDOFF_COMPLETED`, `DUAL_PROJECTION_CONFLICT`, `AMBIGUOUS_PREDECESSOR`, `INVALID_SUPERSESSION_EVIDENCE` (+ existing E5.2 outcomes)

`HANDOFF_REQUIRED` remains when E3 predecessor proof is absent (E5.2 boundary).

## Runtime reachability

| Flag | Value |
|------|-------|
| Handoff implemented | YES — inside `projectCanonicalRecharge()` |
| Automatic triggers | NO |
| Nest provider | NO |

## Tests

- Unit: `erd-late-native-predecessor.resolver.spec.ts`
- PostgreSQL: `erd-e5-3-late-native-handoff.postgres.integration.spec.ts` (real E3 `persistRechargeSegment` + explicit projector; multi-client race; rollback/retry)
- CI: `boundary-repair-postgres-ci.sh` step **10/10**

## Explicit non-goals

- E5.4 shadow parity, E5.5/E5.6 cutover, legacy writer disable, backfill, automatic hooks

## Next

`ERD_E5_4_SHADOW_PARITY`
