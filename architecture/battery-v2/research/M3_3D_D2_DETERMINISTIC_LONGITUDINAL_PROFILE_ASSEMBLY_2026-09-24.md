# M3.3D D2 — Deterministic Longitudinal Profile Assembly

**Date:** 2026-09-24  
**Status:** Engineering — **DRAFT PR** (not on `main`)  
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

Reject reasons: `UNSUPPORTED_D1_CONTRACT`, `IDENTITY_MISMATCH`, `DUPLICATE_REST_SESSION`, `INVALID_WINDOW_METADATA`, `INCONSISTENT_DEFAULT_ITEM`, `INCONSISTENT_PROVISIONAL_ITEM`.

DEFAULT and PROVISIONAL items must have resolved canonical payload; EXCLUDED items allow legitimate null shapes.

## derived

D2 V1: `derived = null`. No cross-session slopes, SOH proxies, or health scores.

## Boundaries

| Slice | D2 relationship |
|-------|-----------------|
| **D3** | Materialization, idempotency fingerprint — **deferred** |
| **D4** | Digest/revision integrity batch — **not evaluated** |
| **M3.3E+** | Health, risk, customer conclusions — **out of scope** |

## Test evidence

Unit/golden matrix **A–T** in `longitudinal-profile.assembler.spec.ts` (25 tests). Existing D1 suites unchanged.

## Non-effects

`DB_QUERIES_ADDED=NO`, `DB_WRITES_ADDED=NO`, `SCHEMA_CHANGE=NO`, `NEST_PROVIDER_ADDED=NO`, `API_CHANGED=NO`, production deploy/flags unchanged.
