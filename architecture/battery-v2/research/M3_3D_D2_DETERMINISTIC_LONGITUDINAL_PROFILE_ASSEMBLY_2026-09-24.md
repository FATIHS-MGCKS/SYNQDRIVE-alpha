# M3.3D D2 — Deterministic Longitudinal Profile Assembly

**Date:** 2026-09-24  
**Status:** Engineering — **DRAFT PR #1739** (not on `main`)  
**Main anchor (D1 seal):** `9d0dbc7d3db0b5a3137356fc5c50b732bfd7fe3f`  
**Input contract:** `M3_3D_D1_LONGITUDINAL_INPUT_V1` (`LongitudinalInputReadResultV1`)  
**Output contract:** `M3_3D_LONGITUDINAL_PROFILE_V1`  
**Assembly policy:** `M3_3D_PROFILE_POLICY_V1`

## Executive summary

D2 is a **pure, read-only** transformation layer. It consumes a successful D1 inventory and assembles the internal longitudinal profile contract. It does **not** query databases, re-run canonical selection, reclassify inclusion, or assign battery health meaning.

**Pure entrypoint:** `assembleLongitudinalProfileV1({ inventory, profileGeneratedAt })` in  
`backend/.../rest-session-features/longitudinal/longitudinal-profile.assembler.ts`.

No Nest provider, API, worker, scheduler, or UI surface is registered for D2.

## Contract versions

| Symbol | Role |
|--------|------|
| `M3_3D_LONGITUDINAL_PROFILE_V1` | Profile **shape** (schema version) |
| `M3_3D_PROFILE_POLICY_V1` | Profile **assembly semantics** (policy version) |

Do not conflate contract shape with assembly policy.

## Stable / provisional / excluded separation

D2 **does not reclassify** D1 inclusion modes.

| D1 mode | D2 destination | Counted in `includedSessionCount` |
|---------|----------------|-----------------------------------|
| `DEFAULT` | `observations[]` | **Yes** |
| `PROVISIONAL` | `provisionalObservations[]` | **No** (use `provisionalSessionCount`) |
| `EXCLUDED` | `excludedSessions[]` (audit shape) | **No** (use `excludedSessionCount`) |

Provisional evidence is **not** silently merged into the stable longitudinal series.

## Coverage accounting

```
candidateRestSessionCount
  = includedSessionCount (DEFAULT)
  + provisionalSessionCount (PROVISIONAL)
  + excludedSessionCount (EXCLUDED)
```

`excludedByReason` counts **reason occurrences**; one session may contribute multiple reasons, so the sum of reason counts may exceed `excludedSessionCount`.

`validEvidenceSpanMs` uses **DEFAULT observations only**:

- zero DEFAULT → `null`
- one DEFAULT → `0`
- two+ → `lastAnchor - firstAnchor` (ms)

## Version segmentation

Segments are built from **DEFAULT observations only**, in chronological order. A segment is a **contiguous run** of identical full version tuples:

`(featureModelVersion, retentionPolicyVersion, chargeOpportunityPolicyVersion, inputContractVersion)`.

Pattern `A-A-B-B-A` yields **three** segments (not global grouping of all `A`).

## profileStatus (operational, not health)

| Status | Emitted when |
|--------|----------------|
| `OK` | Assembly succeeded and ≥1 DEFAULT observation |
| `NO_ELIGIBLE_SESSIONS` | Zero DEFAULT observations (including provisional-only inventories) |

`INSUFFICIENT_SESSIONS` is **reserved** for future DEC-M3.3D-001 — **not emitted in D2 V1**.

Assembly failures return `{ status: 'REJECTED', reason }` rather than a profile with `FAILED`.

## profileFlags (evidence-based only)

| Flag | Condition |
|------|-----------|
| `VERSION_SEGMENTED` | `versionSegments.length > 1` |
| `PROVISIONAL_SESSIONS_PRESENT` | `provisionalSessionCount > 0` |
| `INPUT_CONTRACT_UNRESOLVED_PRESENT` | any candidate carries `INPUT_CONTRACT_VERSION_UNRESOLVED` |

Not emitted: `INTEGRITY_LIMITED` (D4), `PARTIAL_COVERAGE`, `TRUNCATED_OLDER_SESSIONS` (no authoritative D1 truncation evidence).

## trendReadiness

D2 V1: `trendReadiness = NOT_EVALUATED`, `minimumSessionsForDescriptiveTrend = null`, `meetsMinimum = null`. No invented minimum session threshold.

## Window / truncation

D2 preserves D1 `requestedSessionLimit` / `appliedSessionLimit`. **`sessions.length === limit` does not prove older sessions exist.** No truncation inference in D2.

`profileGeneratedAt` is **envelope metadata** supplied by the caller — not read from `Date.now()` inside assembly.

## D1 input validation

Reject reasons include: `UNSUPPORTED_D1_CONTRACT`, `IDENTITY_MISMATCH`, `DUPLICATE_REST_SESSION`, `INVALID_WINDOW_METADATA`, `INVALID_INCLUSION_MODE`, `INVALID_EXCLUSION_REASON`, `INCONSISTENT_DEFAULT_ITEM`, `INCONSISTENT_PROVISIONAL_ITEM`, `INCONSISTENT_EXCLUDED_ITEM`, `INVALID_TEMPORAL_METADATA`, `INVALID_PROFILE_GENERATED_AT`, `INVALID_SESSION_IDENTITY`, `INVALID_D1_INSPECTION_STATUS`.

DEFAULT and PROVISIONAL items must have resolved canonical payload and **empty** `exclusionReasons`. EXCLUDED items must carry ≥1 recognized D1 exclusion reason. Unknown inclusion modes or exclusion reasons reject — they are never silently omitted from partition accounting.

### D2.1 closure (contract hardening)

| Area | Behavior |
|------|----------|
| **Total partition** | Only `DEFAULT` / `PROVISIONAL` / `EXCLUDED`; unknown mode → `INVALID_INCLUSION_MODE` |
| **Inclusion coherence** | DEFAULT/PROVISIONAL: empty exclusion reasons; EXCLUDED: ≥1 recognized reason |
| **Temporal** | Every `session.anchorAt` and caller `profileGeneratedAt` must satisfy `new Date(v).toISOString() === v` |
| **D1 window** | `dbSafetyMaxSessions === LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS`; `requestedSessionLimit === appliedSessionLimit`; limits within safety max |
| **D1 item identity** | Non-empty `restSessionId`; `perSessionInspectionStatus === NOT_EVALUATED` |
| **Detached output** | Profile copies canonical/features/version/arrays — no aliasing mutable D1 input |
| **Golden test** | Full expected `LongitudinalProfileV1` structure asserted (37 assembler tests) |

Battery V2 broad suite differential @ BASE `9d0dbc7d3`: **7 suites / 11 tests fail** — identical failing suite set on D2.1 HEAD → **`PRE_EXISTING_BASE_AND_HEAD`** (LV handoff / M3.0D closure specs; not D2 longitudinal code).

## derived

D2 V1: `derived = null`. No cross-session slopes, SOH proxies, or health scores.

## Boundaries

| Slice | D2 relationship |
|-------|-----------------|
| **D3** | Materialization, idempotency fingerprint — **deferred** |
| **D4** | Digest/revision integrity batch — **not evaluated** |
| **M3.3E+** | Health, risk, customer conclusions — **out of scope** |

## Test evidence

Unit/golden matrix **A–T** + **D2.1 closure** in `longitudinal-profile.assembler.spec.ts` (**37** tests). Existing D1 suites unchanged.

## Non-effects

`DB_QUERIES_ADDED=NO`, `DB_WRITES_ADDED=NO`, `SCHEMA_CHANGE=NO`, `NEST_PROVIDER_ADDED=NO`, `API_CHANGED=NO`, production deploy/flags unchanged.
