# EED-EV-0111 — ERD legacy RECHARGE fragment product-read collapse (Tesla Natural Test #1)

**Status:** IMPLEMENTED (code PR; **flag OFF by default**; no production rollout)  
**Incident:** Tesla `68868291-5478-42cd-b0c4-cc77b2a78e21` — 2026-10-12 — 8 legacy VEE / 8 product rows / 1 `HvChargeSession`  
**Production SHA at forensics:** `a4d06c602ff192aa7ba6688a6472100033417bca`

## Root cause (read-model)

Incremental DIMO sliding-window recharge segments persist as separate legacy `VehicleEnergyEvent` rows (`coalescedFromCount=1`). `pruneStaleCoalescedSubSegments` only deletes sub-segments when a **single detect batch** coalesces multiple segment IDs. This is **not** canonical-vs-legacy duplication (E5.5 scope).

## Correction (product-read only)

- Module: `erd-recharge-legacy-fragment-product-read/`
- Gate: `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED` — strict `1`/`true` only
- Proof (fail-closed): E5.4A-aligned **strict temporal containment** + **shared `dimo-recharge-{tokenId}-*` identity** + **incremental single-segment coalesce metadata** + **unique maximal legacy envelope** per vehicle cohort
- Preserves all raw DB rows; `listEnergyEventsRaw` unchanged
- Does **not** modify HvChargeSession, write authority, or E5.5 identity rules

## Tests

| ID | File | Coverage |
|----|------|----------|
| T1–T12 | `erd-recharge-legacy-fragment-product-read.spec.ts` | Tesla fixture, gate OFF/ON, independence, ambiguity, malformed, tenant isolation, determinism, projection path, energy semantics, E5.5 regression, write authority LEGACY |

## Operational truth

Production continues to return **8** product RECHARGE cards until operators separately authorize enabling `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED`.
