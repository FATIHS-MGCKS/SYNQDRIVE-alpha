# M3.3D D1 — Canonical longitudinal input reader + inclusion policy (2026-09-24)

**Status:** Engineering implementation (internal only; no API; no D2 profile assembly)  
**Contract:** `M3_3D_D1_LONGITUDINAL_INPUT_V1`  
**Authority:** `M3_3D_D0_LONGITUDINAL_PROFILE_ARCHITECTURE_2026-09-24.md` (D0/D0.1 on main)

## Purpose

Deterministic **input inventory** for a bounded rest-session window:

- canonical C3 feature row per session (C5A-equivalent selection)
- persisted version provenance from row + `inputSummary`
- inclusion mode: `DEFAULT` | `PROVISIONAL` | `EXCLUDED`
- `perSessionInspectionStatus = NOT_EVALUATED` (D1 integrity scope)

**Not in D1:** profile assembly, trends, health, persistence, customer surfaces.

## Code map

| File | Role |
|------|------|
| `longitudinal/longitudinal-input.constants.ts` | Contract id; `LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS=100` (**DB_SAFETY_BOUND**, not scientific default) |
| `longitudinal/longitudinal-input.types.ts` | Request/result/inventory types |
| `longitudinal/longitudinal-input.repository.ts` | Bounded session page + **single batch** canonical candidates (`ROW_NUMBER` partition) |
| `longitudinal/longitudinal-input.reader.ts` | `RepeatableRead` snapshot + canonical policy + parser + inclusion |
| `longitudinal/longitudinal-input.policy.ts` | Pure inclusion function |
| `longitudinal/longitudinal-input.snapshot-parser.ts` | Safe `inputSummary` guard (no unchecked cast) |
| `LongitudinalInputReaderService` | Nest provider (`generalized-evidence.module.ts`); no HTTP route |

## Bounded reads

1. **Sessions:** `batteryRestSession.findMany` tenant-scoped, `orderBy anchorAt desc, id desc`, `take sessionLimit` (reject if `> 100`).
2. **Features:** one `$queryRaw` batch — ≤ `4 × sessionCount` candidates (phase × trust highest `semanticRevision`).
3. **Forbidden:** `listFeatureRowsForSession()`; per-session candidate loops.

**Invariant:** `LONGITUDINAL_CANONICAL_SELECTION_EQUIVALENT_TO_C5A=YES` via shared `selectCanonicalRestSessionFeatureShadowRow()`.

## Version provenance

- Column tuple from **selected row** (`featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`).
- `inputContractVersion` from parsed `inputSummary` (`M3_3C_FEATURE_INPUT_V1` required for resolved contract).
- Runtime constants scope the query only — **not** copied as historical authority.

## Inclusion policy (D1)

| Mode | Rule |
|------|------|
| **EXCLUDED** | No canonical row; session/canonical trust invalidated; unresolved input contract |
| **PROVISIONAL** | Active session + valid INCREMENTAL; terminal + unexpected INCREMENTAL |
| **DEFAULT** | Valid contract + canonical VALID + not provisional |

No scientific thresholds (points, span, charge class, voltage) in D1.

## Integrity boundary

**D1:** `CANONICAL_SELECTION_INTEGRITY` only — no digest/revision/C5A overall status.  
**D4+:** digest / lineage / coverage integration (bounded batch, not N× `inspectSession()`).

## Coherent snapshot

`Prisma.$transaction` isolation **`RepeatableRead`**: session page → optional test barrier → batch feature candidates.

Integration: `PG_D1_RR` concurrent append during open snapshot does not change selected canonical revision.

## Tests

| Layer | Command |
|-------|---------|
| Unit | `npx jest longitudinal-input --testPathIgnorePatterns=integration` |
| Postgres | `npm run test:battery:v2:longitudinal-input:postgres` (`BATTERY_V2_LONGITUDINAL_INPUT_INTEGRATION=1`) |

Evidence: batch ≤4 pairs; tenant isolation; RR coherence; single batch spy in unit test.

## Non-effects

- No schema/migration/flag/deploy/customer UI/Master Admin changes
- No D2 profile fields, D3 persistence, M3.3E health logic
- No `BatteryAssessment` / `BatteryPublication` / `BatteryFeatures` writes
