# EED-EV-0111 — ERD legacy RECHARGE fragment product-read collapse (Tesla Natural Test #1)

**Status:** IMPLEMENTED (code on main; **default OFF** until operator env activation)  
**Incident:** Tesla `68868291-5478-42cd-b0c4-cc77b2a78e21` — 2026-10-12 — 8 legacy VEE / 8 product rows / 1 `HvChargeSession`  
**Production SHA at forensics:** `a4d06c602ff192aa7ba6688a6472100033417bca`

## Root cause (read-model)

Incremental DIMO sliding-window recharge segments persist as separate legacy `VehicleEnergyEvent` rows (`coalescedFromCount=1`). `pruneStaleCoalescedSubSegments` only deletes sub-segments when a **single detect batch** coalesces multiple segment IDs. This is **not** canonical-vs-legacy duplication (E5.5 scope).

## Correction (product-read only)

- Module: `erd-recharge-legacy-fragment-product-read/`
- Gate: `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED` — strict `1`/`true` only
- Proof (fail-closed, PR #1997 hardening):
  - **Primary physical anchor:** legacy envelope `dimoSegmentId` must **exactly match** a bounded `HvChargeSession` native segment for the same vehicle (read-only), with temporal overlap — not token scope alone
  - E5.4A **strict temporal containment** of fragment inside envelope
  - **Incremental single-segment** coalesce metadata on fragment
  - **SOC/energy telemetry nesting** from `rawDetectionMeta` (reject distinct nested physical bands)
  - **Cross-episode HV identity conflict** checks (E5.4A-style) before suppression
  - **Unique** proven HV episode envelope owner; ambiguity → fail open
- Bounded product-read query: RECHARGE rows fetched by **interval overlap** with window; missing HV parent envelopes fetched by `dimoSegmentId` (vehicle-scoped) before projection
- Preserves all raw DB rows; `listEnergyEventsRaw` unchanged
- Does **not** modify HvChargeSession persistence, write authority, or E5.5 identity rules

## Tests

| ID | File | Coverage |
|----|------|----------|
| T1–T12 | `erd-recharge-legacy-fragment-product-read.spec.ts` | Tesla fixture, gate OFF/ON, independence, ambiguity, malformed, tenant isolation, determinism, projection path, energy semantics, E5.5 regression, write authority LEGACY |

## Operational truth

- **Default (gate unset / not `1`/`true`):** product read returns one card per legacy DIMO fragment (Tesla Natural Test #1: **8** product RECHARGE rows).
- **Production activation (2026-10-13):** owner-authorized global `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1` @ SHA `1bc3a3a1863abaa4feab7d242b0678f071e806b2` — see **EED-EV-0112** and prospective ledger **EED-NCA-LEDGER-2026-10-13.md**.
- Raw `VehicleEnergyEvent` rows and write authority are unchanged by product-read collapse.
