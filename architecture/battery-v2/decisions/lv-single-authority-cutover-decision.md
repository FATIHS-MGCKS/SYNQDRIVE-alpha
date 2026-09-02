# D3 — Battery V2 Single-Authority Cutover and Configuration Invariant

**Decision ID:** `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001`  
**Package:** `BAT-V2-RUNTIME-PKG-01`, `BAT-V2-RUNTIME-PKG-02` (spec closure only — no runtime cutover)  
**Depends on:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (D1), `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` (D2)  
**Status:** `VALIDATED` (architecture / configuration authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-02

## BEFORE

Phase 4 left `CONFIGURATION_INVARIANT_SPEC_REQUIRED` unresolved: combinatorics among `BATTERY_V2_REST_SHADOW_ENABLED`, `BATTERY_V2_PUBLICATION_ENABLED`, and proposed `BATTERY_V2_LV_HANDOFF_ENABLED` created cutover traps (e.g. REST_SHADOW=ON + PUBLICATION=ON + HANDOFF=OFF). PKG-01/02 remained `IMPLEMENTATION_SPEC_REQUIRED` pending this invariant.

## PROBLEM

- Canonical Battery V2 REST is gated behind historically named `REST_SHADOW` — semantically misleading once V2 is core behavior  
- Legacy REST capture (`battery_features`) remains parallel authority during migration  
- Proposed independent `LV_HANDOFF` flag would allow intentionally incomplete V2 pipeline (REST ON, handoff OFF)  
- Permanent dual legacy + canonical authority is incompatible with single Battery truth  
- Publication effect must remain independently controllable for pre-customer validation

## OPTIONS

| Option | Summary |
|--------|---------|
| **A** | Permanent `REST_SHADOW` as final feature gate |
| **B** | Introduce `BATTERY_V2_LV_HANDOFF_ENABLED` as independent steady-state gate |
| **C** | Permanent dual Legacy + Battery V2 authority |
| **D** | Remove legacy immediately before V2 handoffs implemented/validated |
| **E** | **Single-authority target** — V2 core mandatory; legacy + REST_SHADOW retired at cutover; PUBLICATION as effect gate only |

## SELECTED

**E — Battery V2 single-authority target architecture**

Final steady-state Battery architecture:

| Component | Target status |
|-----------|---------------|
| Canonical Battery V2 REST | **Mandatory core** |
| Canonical REST → Assessment handoff | **Mandatory core** (not separate flag) |
| Canonical Battery Assessment | **Mandatory core** |
| Legacy REST capture | **RETIRED** (after M4 cutover) |
| `BATTERY_V2_REST_SHADOW_ENABLED` | **RETIRED** (temporary migration scaffold until M4) |
| `BATTERY_V2_LV_HANDOFF_ENABLED` | **NOT INTRODUCED** |
| `BATTERY_V2_PUBLICATION_ENABLED` | **RETAINED** — customer/publication effect gate |

The final architecture must **not** maintain parallel legacy and canonical battery truth indefinitely.

## TARGET_ARCHITECTURE

### Internal V2 core pipeline (normal system behavior)

```
Trip finalization
  → canonical LV REST session
  → REST_60M / REST_6H
  → BatteryMeasurement
  → canonical assessment handoff
  → BatteryAssessment
```

This is **not** a shadow feature. It is **not** optional via a separate handoff flag.

Publication remains a **distinct effect boundary** (internal truth → customer-visible publication).

### Target steady states

**State A — PUBLICATION = OFF (pre-publication validation posture)**

| Layer | Target |
|-------|--------|
| Battery V2 REST | ON |
| Assessment handoff | ON |
| Assessment | ON |
| Customer publication | OFF |

Full V2 runs internally for observation/validation; customer-visible publication suppressed.

**State B — PUBLICATION = ON (full production operation)**

| Layer | Target |
|-------|--------|
| Battery V2 REST | ON |
| Assessment handoff | ON |
| Assessment | ON |
| Customer publication | ON |

### Vehicle policy (separate from global cutover)

“Battery V2 core always active” does **not** mean every measurement type runs on every vehicle.

Eligibility remains governed by `resolveForVehicle()`, drive profile, battery policy, and measurement support rules.

**GLOBAL V2 CORE AUTHORITY ≠ EVERY VEHICLE SUPPORTS EVERY BATTERY METHOD**

Unsupported profiles remain handled by canonical policy.

## CURRENT_VS_TARGET

### CURRENT RUNTIME (facts — not rewritten)

| Mechanism | Current behavior |
|-----------|------------------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | Gates canonical V2 REST pipeline (`isBatteryV2RestShadowEnabled()`). Comment: “Historically named REST_SHADOW — when true, canonical ingestion runs.” |
| `isBatteryV2LegacyRestCaptureEnabled()` | `REST_SHADOW OFF` → legacy ON; `REST_SHADOW ON + PUBLICATION OFF` → legacy ON; `REST_SHADOW ON + PUBLICATION ON` → legacy OFF |
| `BATTERY_V2_PUBLICATION_ENABLED` | Publication persist gate |
| `BATTERY_V2_LV_HANDOFF_ENABLED` | **Does not exist** in runtime |

**Current dual-authority example:** REST_SHADOW=ON + PUBLICATION=OFF → canonical REST ON **and** legacy REST ON.

### TARGET ARCHITECTURE (post-M4 cutover — not current)

| Mechanism | Target |
|-----------|--------|
| REST_SHADOW env | **Removed** — no shadow/canonical distinction |
| Legacy REST capture | **Removed** |
| V2 core | Always active for eligible/supported vehicles |
| PUBLICATION=OFF | V2 core active; no customer publication |
| PUBLICATION=ON | V2 core + customer publication |

### Temporary migration scaffolds (until M4)

| Scaffold | Classification |
|----------|----------------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | **TEMPORARY MIGRATION / COMPATIBILITY SCAFFOLD** — do not remove in D3 doc PR |
| Legacy REST capture code | **TEMPORARY MIGRATION / COMPATIBILITY SCAFFOLD** — do not remove in D3 doc PR |

## MIGRATION_SEQUENCE

| Phase | Name | Scope |
|-------|------|-------|
| **M0** | CURRENT | Legacy available; canonical V2 REST behind REST_SHADOW; runtime handoffs not yet implemented |
| **M1** | V2 CORE IMPLEMENTATION | PKG-01 per D1/D2; **no** legacy removal; **no** REST_SHADOW removal; **no** HANDOFF flag |
| **M2** | V2 PUBLICATION CHAIN | PKG-02 after D4/D5; exercise REST→Assessment→Publication policy; PUBLICATION OFF where customer effect suppressed; legacy remains fallback |
| **M3** | V2 VALIDATION / SOAK | REST, D1 identity, D2 recovery, reconciliation, concurrency, policy outcomes, publication policy, load, profiles — **no invented PRODUCTION_VALIDATED** |
| **M4** | SINGLE-AUTHORITY CUTOVER | **Separate future runtime authorization** — retire legacy + REST_SHADOW; V2 sole authority; PUBLICATION remains effect gate |

**D3 documentation does NOT authorize M4.**

## CUTOVER_PRECONDITIONS

Final removal of Legacy + REST_SHADOW must **not** occur merely because D3 is merged.

Minimum preconditions:

- PKG-01 implemented  
- PKG-02 implemented  
- D1 contract implemented  
- D2 contract implemented  
- D4 assessment-track publication authority resolved  
- D5 `publicationVersion` authority resolved  
- Graph/runtime tests PASS  
- Appropriate controlled runtime validation completed  
- **Explicit cutover authorization received**

## ROLLBACK

### PRE-CUTOVER (M0–M3)

Legacy remains available as migration fallback.

Current safe rollback principles apply while legacy exists (e.g. disable PUBLICATION first to restore legacy capture when REST_SHADOW ON).

### POST-CUTOVER (after M4 physical removal)

Rollback **no longer** means toggling legacy via runtime env flags.

Rollback authority becomes:

- deploy previous known-good release containing prior compatibility architecture, or  
- another explicitly designed release rollback mechanism

Do **not** retain legacy indefinitely solely for hypothetical runtime rollback.

## REJECTED

| Option | Why rejected |
|--------|--------------|
| **A — Permanent REST_SHADOW gate** | Misleading name; falsely distinguishes “shadow REST” from normal V2 REST; canonical REST is the normal ingestion mechanism |
| **B — `BATTERY_V2_LV_HANDOFF_ENABLED` steady-state gate** | REST→Assessment is V2 core; allowing handoff OFF creates incomplete pipeline and unnecessary combinatorics; D1/D2 already define identity and recovery |
| **C — Permanent dual Legacy + V2 authority** | Incompatible with single Battery truth; indefinite split-brain |
| **D — Immediate legacy removal** | Unsafe before PKG-01/02 implemented and validated |

## WHY

- Single authoritative Battery pipeline reduces split-brain and configuration traps  
- Handoff is core V2 behavior, not an optional feature flag  
- Publication is fundamentally an effect boundary — correctly independent  
- REST_SHADOW and legacy are migration scaffolds, not final architecture  
- Clear M0–M4 sequence separates spec closure from cutover authorization

## EXPECTED_EFFECT

- PKG-01 promoted to `IMPLEMENTATION_READY` (not activation/cutover ready)  
- PKG-02 configuration invariant resolved; remains `IMPLEMENTATION_SPEC_REQUIRED` (D4 + D5 only)  
- Runtime agents implement V2 core without introducing HANDOFF flag  
- Cutover/removal deferred to explicit M4 authorization

## NON_EFFECTS

- No runtime implementation  
- No legacy code removed  
- No REST_SHADOW env removed  
- No HANDOFF env introduced  
- No publication behavior changed  
- No DB migration  
- No production mutation  
- No backfill  
- No deploy  
- **No cutover authorized**  
- Runtime gaps remain open

## RISKS

| Risk | Mitigation |
|------|------------|
| Premature M4 cutover before handoffs validated | Explicit preconditions + separate authorization |
| Confusing current dual-authority with target | CURRENT_VS_TARGET documented separately |
| HANDOFF flag re-proposed during PKG-01 impl | D3 REJECTED — documented in implementation-packages |

## STATUS

`decision_status: VALIDATED` — configuration / cutover architecture authority. **Not** `PRODUCTION_VALIDATED`. **Does not authorize M4 cutover.**
