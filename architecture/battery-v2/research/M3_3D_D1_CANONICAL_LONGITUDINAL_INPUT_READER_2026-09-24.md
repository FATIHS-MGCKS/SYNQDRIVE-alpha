# M3.3D D1 — Canonical longitudinal input reader + inclusion policy (2026-09-24)

**Status:** Engineering implementation (internal only; no API; no D2 profile assembly)  
**Contract:** `M3_3D_D1_LONGITUDINAL_INPUT_V1`  
**Authority:** `M3_3D_D0_LONGITUDINAL_PROFILE_ARCHITECTURE_2026-09-24.md` (D0/D0.1 on main)  
**D1.1 closure:** Draft PR #1737 — contract/test hardening (no Master Admin UI; no D2)

## Purpose

Deterministic **input inventory** for a bounded rest-session window:

- canonical C3 feature row per session (C5A-equivalent selection)
- persisted version provenance from row + `inputSummary`
- inclusion mode: `DEFAULT` | `PROVISIONAL` | `EXCLUDED`
- `perSessionInspectionStatus = NOT_EVALUATED` (D1 integrity scope)

**Not in D1:** profile assembly (`M3_3D_LONGITUDINAL_PROFILE_V1` is D0/D2), trends, health, persistence, customer or Master Admin surfaces.

## Code map

| File | Role |
|------|------|
| `longitudinal/longitudinal-input.constants.ts` | Contract id; `LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS=100` (**DB_SAFETY_BOUND**, not scientific default) |
| `longitudinal/longitudinal-input.types.ts` | Request/result/inventory types |
| `longitudinal/longitudinal-input.repository.ts` | Bounded session page + **single batch** canonical candidates (`ROW_NUMBER` partition) |
| `longitudinal/longitudinal-input.reader.ts` | `RepeatableRead` snapshot + canonical policy + parser + inclusion |
| `longitudinal/longitudinal-input.policy.ts` | Pure inclusion function |
| `longitudinal/longitudinal-input.snapshot-parser.ts` | Strict guard for D1-consumed `inputSummary` fields (no silent coercion) |
| `LongitudinalInputReaderService` | Nest provider (`generalized-evidence.module.ts`); no HTTP route |

**No frontend changes:** D1 authority lives in `architecture/battery-v2/*` and backend internal code/tests only.

## Bounded reads

1. **Sessions:** `batteryRestSession.findMany` tenant-scoped, `orderBy anchorAt desc, id desc`, `take sessionLimit`.
2. **Session limit:** must be a **positive integer** `1…100`. Reject with `INVALID_SESSION_LIMIT` (non-integer, `<1`, `NaN`, `Infinity`) or `SESSION_LIMIT_EXCEEDED` (`>100`).
3. **Features:** one `$queryRaw` batch — ≤ `4 × sessionCount` candidates (phase × trust highest `semanticRevision`).
4. **Forbidden:** `listFeatureRowsForSession()`; per-session candidate loops.

**Ordering (result):** chronological `anchorAt` ASC, tie-break `restSessionId` via **UTF-16 code-unit** `compareUtf16CodeUnitLexicographic` (not `localeCompare`).

**Invariant:** `LONGITUDINAL_CANONICAL_SELECTION_EQUIVALENT_TO_C5A=YES` via shared `selectCanonicalRestSessionFeatureShadowRow()`.

## Version provenance

When a **canonical row exists**:

- `featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion` are **always** copied from that persisted row.
- `inputContractVersion` is resolved separately from parsed `inputSummary` (`M3_3C_FEATURE_INPUT_V1` required for `inputContractResolution=RESOLVED`).
- If snapshot contract fails: `inputContractVersion=null`, `inputContractResolution=UNRESOLVED` — **column versions are not erased**.
- Runtime constants scope the SQL query only — **not** copied as historical authority in output.

## Snapshot parser (D1-consumed fields)

For `M3_3C_FEATURE_INPUT_V1`, malformed consumed fields → **UNRESOLVED** (no silent normalize):

- identity: `organizationId`, `vehicleId`, `restSessionId`
- `inputContractVersion` exact match
- `anchorResolution.status`: `SELECTED` | `UNAVAILABLE` | `AMBIGUOUS`
- `chargeOpportunityRaw.temperatureC`: finite number | `null`
- `chargeOpportunityRaw.temperatureSource`: valid C2 enum (`TRIP_EXTERIOR` | `UNKNOWN`)
- `chargeOpportunityRaw.contextCompleteness`: array of valid `ChargeContextCompletenessReason`

## Inclusion policy (D1)

| Mode | Rule |
|------|------|
| **EXCLUDED** | No canonical row; session/canonical trust invalidated; unresolved input contract **when canonical row exists** |
| **PROVISIONAL** | Active session + valid INCREMENTAL; terminal + unexpected INCREMENTAL |
| **DEFAULT** | Valid contract + canonical VALID + not provisional |

`NO_CANONICAL_ROW` does **not** cascade `INPUT_CONTRACT_VERSION_UNRESOLVED`.

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
| Unit + contract | `npx jest longitudinal-input --testPathIgnorePatterns=integration` |
| Postgres | `npm run test:battery:v2:longitudinal-input:postgres` (`BATTERY_V2_LONGITUDINAL_INPUT_INTEGRATION=1`) |

Evidence includes: batch ≤4 pairs; org+vehicle tenant isolation; same-org wrong vehicle; current-version SQL scope; UTF-16 tie-break; version provenance on contract failure; malformed snapshot negatives; charge class / quality non-gates; anchor resolution matrix; read-only; RR coherence; single batch spy.

## Non-effects

- No schema/migration/flag/deploy/customer UI/**Master Admin UI**
- No D2 profile fields, D3 persistence, M3.3E health logic
- No `BatteryAssessment` / `BatteryPublication` / `BatteryFeatures` writes
