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
| `isLvRestShadowModeActive()` publication-coupled shadow semantics | **TEMPORARY COMPATIBILITY BEHAVIOR** — retired/refactored at M4 (see below) |

## PUBLICATION_EFFECT_ONLY_TARGET_INVARIANT

**Target (post-M4):** `BATTERY_V2_PUBLICATION_ENABLED` is an **effect-boundary gate only**.

When PUBLICATION=OFF in target steady state:

- Canonical V2 REST ingestion **remains active**
- Canonical assessment handoff **remains active**
- Canonical assessment **remains active**
- Customer-visible `BatteryPublication` persistence and downstream publication effects **suppressed**

**Post-M4 PUBLICATION must NOT control:**

- whether canonical V2 REST ingestion runs  
- whether canonical measurement is classified as “shadow”  
- measurement quality  
- evidence eligibility (`evidenceEligible`)  
- assessment handoff or assessment eligibility  
- legacy capture selection (legacy no longer exists at M4)

**Post-M4 PUBLICATION may control:**

- publication policy enablement  
- customer-facing `BatteryPublication` persistence  
- downstream publication/customer effects

### Current runtime coupling (compatibility-era — NOT target)

**Current runtime is NOT yet effect-only.**

`isLvRestShadowModeActive()` = `REST_SHADOW_ENABLED && !PUBLICATION_ENABLED`

When active (`lv-rest-shadow.policy.ts`):

- `resolveLvRestShadowEvidenceEligible(...)` → `false`  
- `resolveLvRestShadowPublicationEligible()` → `false`  
- canonical REST measurement context receives `shadowMode: true`  
- comments: shadow measurements do not feed canonical health, readiness, alerts, or tasks

Therefore **current** `PUBLICATION` participates in REST shadow semantics, evidence eligibility, publication eligibility, `shadowMode` context, and legacy-rest cutover via `isBatteryV2LegacyRestCaptureEnabled()`.

This coupling is **compatibility-era behavior** — part of the M4 retirement/refactor surface. **Do not claim current runtime already matches the effect-only target.**

## M4_SHADOW_SEMANTICS_RETIREMENT

**M4 cutover precondition (added):** before `REST_SHADOW` is physically removed, runtime must have an evidence-backed replacement/removal of compatibility shadow semantics such that:

```
PUBLICATION OFF
  → canonical V2 REST remains normal canonical internal evidence
  → canonical assessment handoff remains active
  → canonical assessment remains active
  → only customer publication is suppressed
```

No hidden dependency on `REST_SHADOW` or publication-coupled `isLvRestShadowModeActive()` may remain in the canonical V2 measurement/assessment path.

**M4 is NOT authorized by D3 documentation.**

## MIGRATION_DUAL_COMPUTE

**Temporary M1–M3 consequence** when `REST_SHADOW=ON` and `PUBLICATION=OFF`:

- canonical V2 REST = ON  
- legacy REST capture = ON (`isBatteryV2LegacyRestCaptureEnabled()`)

`BatteryV2SnapshotIngestionService` legacy capture path enqueues `BATTERY_ASSESSMENT_RECOMPUTE` when `restCaptured=true`, using:

```
inputVersion = capture.capturedAt.getTime()
```

After PKG-01 implementation, canonical V2 REST will additionally enqueue assessment per D1:

```
inputVersion = BatteryMeasurement.id
```

**During M1–M3**, a controlled migration deployment may therefore have **legacy assessment trigger + canonical assessment trigger** for overlapping vehicle/evidence periods.

This is **TEMPORARY MIGRATION DUAL-PRODUCER / DUAL-COMPUTE** — **not** accepted permanent dual authority.

- BullMQ does **not** dedupe these jobs — deterministic identities differ  
- Assessment persistence idempotency may converge identical evidence fingerprints — does **not** prove zero duplicate compute or zero extra queue load  
- Different execution timing may produce different evidence fingerprint / assessment input set

**Authority:**

- overlap accepted only during controlled migration/canary  
- must be observed explicitly in M3  
- ends at M4 when legacy REST is retired  
- `IMPLEMENTATION_READY` ≠ `ACTIVATION_READY`  
- production frequency/impact **UNKNOWN** until measured — not a claimed production incident

### M3 validation dimensions (no invented thresholds)

| Dimension | Purpose |
|-----------|---------|
| `LEGACY_ASSESSMENT_TRIGGER_COUNT` | Legacy path assessment enqueue volume |
| `CANONICAL_ASSESSMENT_TRIGGER_COUNT` | D1 canonical handoff enqueue volume |
| `OVERLAP / DUPLICATE_COMPUTE_RATE` | Concurrent legacy + canonical assessment execution overlap |
| `ASSESSMENT_PERSISTENCE_CONVERGENCE` | Whether duplicate triggers converge at persistence layer |
| `QUEUE / CPU LOAD` | Migration duplicate work cost |
| `NO_CUSTOMER_PUBLICATION_WHILE_PUBLICATION_OFF` | Customer publication suppressed while internal V2 runs |

## MIGRATION_ACTIVATION_SEMANTICS

**M0–M3 temporary activation:**

- `REST_SHADOW` remains the historical temporary activation scaffold for canonical V2 REST while it still exists  
- **No** separate assessment-handoff flag (`BATTERY_V2_LV_HANDOFF_ENABLED` rejected)  
- PKG-01 direct handoff follows **eligible** canonical V2 REST measurements per D1/D2  
- Legacy-only captures must **not** be mistaken for D1 canonical `measurement.id` handoffs  
- Reconciliation remains governed by D2 canonical measurement identity  
- D3 does **not** redefine queue drain behavior

## MIGRATION_SEQUENCE

| Phase | Name | Scope |
|-------|------|-------|
| **M0** | CURRENT | Legacy available; canonical V2 REST behind REST_SHADOW; runtime handoffs not yet implemented |
| **M1** | V2 CORE IMPLEMENTATION | PKG-01 per D1/D2; **no** legacy removal; **no** REST_SHADOW removal; **no** HANDOFF flag |
| **M2** | V2 PUBLICATION CHAIN | PKG-02 after D5 (D4 VALIDATED); exercise REST→Assessment→Publication policy; PUBLICATION OFF where customer effect suppressed; legacy remains fallback |
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
- D4 assessment-track publication authority **VALIDATED** (`BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001`)  
- D5 `publicationVersion` authority resolved  
- **M4 shadow-semantics decoupling** — evidence-backed removal/replacement of `isLvRestShadowModeActive()` publication coupling before REST_SHADOW physical removal  
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
- PKG-02 configuration invariant resolved; remains `IMPLEMENTATION_SPEC_REQUIRED` (D5 only)  
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
| Publication-coupled shadow semantics persist post-M4 | M4 precondition requires decoupling before REST_SHADOW removal |
| M1–M3 dual producer/compute overlap | M3 validation dimensions; ends at M4 legacy retirement |

## STATUS

`decision_status: VALIDATED` — configuration / cutover architecture authority. **Not** `PRODUCTION_VALIDATED`. **Does not authorize M4 cutover.**
