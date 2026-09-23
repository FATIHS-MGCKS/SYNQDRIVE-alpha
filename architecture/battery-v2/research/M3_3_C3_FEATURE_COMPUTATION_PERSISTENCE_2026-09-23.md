# M3.3C C3 — Deterministic rest-session feature computation & append-only persistence

**Date:** 2026-09-23  
**Status:** Engineering validated (shadow flag OFF by default; no live hooks; no production deploy)

## Version tuple

| Constant | Value |
|----------|--------|
| `FEATURE_MODEL_VERSION` | `M3_3C_C3_V1` |
| `RETENTION_POLICY_VERSION` | `M3_3C_C1_V1` |
| `CHARGE_OPPORTUNITY_POLICY_VERSION` | `M3_3C_C2_V1` |
| `INPUT_CONTRACT_VERSION` | `M3_3C_FEATURE_INPUT_V1` |

Charge semantics are **not** versioned as C1.

## Flag gate (fail-closed)

- Env: `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` (default **false**)
- `RestSessionFeatureComputationService.computeAndPersist` checks the flag **before** any Prisma access.
- Flag OFF → `SKIPPED_FLAG_OFF`, `FLAG_OFF_DB_QUERY_COUNT=0`.

## Live wiring

- `LIVE_C3_CALCULATION_HOOKS=0`
- `C3_SERVICE_LIVE_REGISTERED=NO` — service is **not** registered on Nest modules in C3.
- C4 owns runtime invocation later.

## Input contract — `RestSessionFeatureInputSnapshotV1`

Persisted verbatim in `inputSummary` (hash-verifiable). Excludes `computedAt`, DB ids, `semanticRevision`, `session.updatedAt`.

Fields:

- `inputContractVersion`, tenant ids, version tuple
- `session`: anchor metadata, status, `computationPhase`, `sessionTrust`, lifecycle timestamps (UTC ISO strings)
- `anchor`: canonical ENGINE_OFF anchor snapshot or `null`
- `retentionPoints[]`: **material eligible** ladder points only (sorted by age, provider time null-last, observation id)
- `chargeOpportunityRaw`: exact normalized C2 `ChargeOpportunityRawFeaturesV1` (includes `restSessionId`)

## Canonical ENGINE_OFF anchor

- Same `restSessionId`, `ENGINE_OFF_TRANSITION`, `actualRestAgeMs=0`, plausible LV, `providerTimestampSource=PROVIDER_FIELD_TIMESTAMP`, `voltageObservedAt === session.anchorAt` (exact ms).
- **0** valid → anchor unavailable (no fabricated row).
- **>1** conflicting semantics → unavailable (`AMBIGUOUS`); `shutdownToFirstRestDeltaMv=null`; ladder stats still computed.
- Duplicate-equivalent anchors → lowest `observationId` wins.

## Phase & trust (pure, no wall clock)

| Session status | `computationPhase` |
|----------------|-------------------|
| CANDIDATE, CONFIRMED, RESTING | INCREMENTAL |
| ENDED, INVALIDATED | FINAL |

| Condition | `sessionTrust` |
|-----------|----------------|
| `sessionStatus=INVALIDATED` or `endReason=INVALIDATED` | INVALIDATED |
| otherwise | VALID |

## Digest

- Serializer: `feature-input-canonical.serializer.ts` — recursive lexicographic key sort; array order preserved; rejects `undefined`, `Date`, non-finite numbers.
- `FEATURE_INPUT_DIGEST = SHA-256(canonical UTF-8 JSON)` lowercase hex length 64.
- `computedAt` is **not** in digest input.

## Transaction / lock / retry

- Single Serializable Prisma transaction: `SELECT … FOR UPDATE` on `battery_rest_sessions` (tenant predicates) → read inputs → digest → insert.
- Bounded retry (max **3**) on `P2034` / `P2002` (Postgres serialization / unique race).
- `semanticRevision = max(existing)+1` under lock; same digest → return existing row, no new revision.

## Append-only repository

`RestSessionFeatureRepository`: `createAppendOnlyRow`, `findByInputDigest`, `findMaxSemanticRevision`, `listFeatureRowsForSession`.  
No update/delete/upsert-mutate APIs.

## Retention & charge outputs

- C1 pure policy → typed retention columns.
- C2 raw JSON + `chargeOpportunityClass=UNKNOWN` (no SUFFICIENT/PARTIAL/INSUFFICIENT thresholds in C3).

## Canonical shadow row selection

`selectCanonicalRestSessionFeatureShadowRow` — prefer VALID+INCREMENTAL (active), VALID+FINAL (ended), INVALIDATED+FINAL (invalidated); highest `semanticRevision` within preference; documented phase/trust fallback ordering. Not exposed to authoritative health consumers.

## Tests

- Unit: `rest-session-feature-computation.policy.spec.ts` (A–S + digest vector)
- Postgres: `rest-session-feature-computation.integration.spec.ts` (PG_A–M), script `test:battery:v2:rest-session-feature:computation:postgres`

## Production

- No deploy, migration, or prod flag change in C3.
- `C1_PRODUCTION_MIGRATION_APPLIED=NO` on production baseline remains expected.

## Pending

- **C4** — live hooks / service registration
- **C5** — metrics, UI, debug surfaces
