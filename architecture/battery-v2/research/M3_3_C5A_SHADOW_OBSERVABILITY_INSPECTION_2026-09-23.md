# M3.3C C5A — Shadow observability + read-only inspection (2026-09-23)

**Package:** C5A engineering only — **no production deploy**, **no migration**, **no shadow flag enable**.  
**Starting main:** `8f7d95e44f7adca29f6934e8eaf54df97faa84d6` (C4 merged).  
**Production baseline (unchanged):** `2b0ef15fc80069676cd44f1b852a362434f7ffb7`.

## Purpose

Answer operationally (without judging battery health):

- Did a C4 trigger occur? Why? Outcome?
- Did C3 create or dedupe a row? Fail-open?
- How long did synchronous C4→C3 work take?
- What feature revisions exist? Which row is canonical?
- Does persisted `inputSummary` still hash to `inputDigest`?
- Is `semanticRevision` lineage internally consistent?

**C5B** (Master Admin inspection UI) is **pending** after C5A contracts stabilize.

## Prometheus metrics (bounded labels)

Recorded **only** in `RestSessionFeatureShadowTriggerService` (`finally` block — single accounting point).

| Metric | Labels | Notes |
|--------|--------|-------|
| `synqdrive_battery_rest_session_feature_trigger_total` | `reason`, `outcome` | Once per C4 trigger call |
| `synqdrive_battery_rest_session_feature_trigger_duration_seconds` | `reason`, `outcome` | Histogram; buckets 0.005–5s |
| `synqdrive_battery_rest_session_feature_row_created_total` | `phase`, `trust` | **Only** on C3 `CREATED` |

**Allowed `reason`:** `VALID_REST_OBSERVATION_LINKED`, `REST_SESSION_TERMINAL`, `LATE_TRIP_ASSOCIATION`.

**Allowed `outcome`:** `SKIPPED_FLAG_OFF`, `CREATED`, `DUPLICATE_EXISTING`, `SESSION_NOT_FOUND`, `FAILED_ISOLATED`.

**Allowed `phase`:** `INCREMENTAL`, `FINAL`. **Allowed `trust`:** `VALID`, `INVALIDATED`.

**Forbidden metric labels:** org/vehicle/session/uuid/digest/error text (logs may retain detail).

**Flag OFF:** `SKIPPED_FLAG_OFF` metric allowed; **C3 invocation count = 0**; **no DB query**.

## Read-only inspection

- **Service:** `RestSessionFeatureShadowInspectionService.inspectSession({ organizationId, vehicleId, restSessionId, includeRaw? })`
- **Contract:** `REST_SESSION_FEATURE_SHADOW_INSPECTION_CONTRACT_VERSION = M3_3C_C5A_V1`
- **Tenant scope:** all three IDs required; `SESSION_NOT_FOUND` on mismatch (no cross-tenant fallback)
- **Digest verification:** reuses `computeFeatureInputDigestFromSnapshot` (C3 serializer) — no second serializer
- **Canonical row:** reuses `selectCanonicalRestSessionFeatureShadowRow()` — no reimplementation
- **Revision limit:** `REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS = 100` with `revisionsTruncated`
- **`includeRaw` default:** `false`; `true` exposes `inputSummary`, `chargeOpportunityRaw`, `pairwiseRestDeltas`

**Overall status (diagnostic only):** `OK` | `NO_FEATURE_ROWS` | `INTEGRITY_WARNING` — not a health score.

Use letter codes **C5B–C5H** aligned with package IDs **M3.3C C5B … M3.3H** (same milestones).

## Roadmap (M3.3C shadow → customer Health UI)

| Phase | Scope |
|-------|--------|
| **M3.3C C5A** | Observability + read-only inspection (metrics, ops CLI) — **engineering in review** PR #1732 |
| **M3.3C C5B** | Master Admin shadow inspection UI |
| **M3.3D** | Longitudinal battery profile across rest sessions |
| **M3.3E** | Health / failure-risk / confidence model |
| **M3.3F** | Production shadow validation |
| **M3.3G** | Authoritative model cutover |
| **M3.3H** | Vehicle Detail → Health **customer UI** cutover — consumes **customer-authorized authoritative outputs only after G**; must **not** expose raw `inputSummary`, `chargeOpportunityRaw`, pairwise deltas, per-revision C3 rows, or internal integrity diagnostics |

Planning-only customer concepts for eventual M3.3H (labels/thresholds finalized after M3.3E/F): battery health state, confidence, charging-system health, retention stability, failure risk, last reliable assessment, evidence freshness.

## Bounded inspection reads (C5A.1)

- **Latest window:** `listLatestFeatureRowsForSession` — `ORDER BY semantic_revision DESC` **`take 100`**, reversed to ASC in response. Example: 125 rows → visible revisions **26..125** (not 1..100).
- **Total rows:** separate **`count`** on version-scoped session filter.
- **Revision lineage:** read-only **`SELECT` aggregate** (no full row load).
- **Canonical row:** at most **four** highest-revision candidates (phase × trust) → existing `selectCanonicalRestSessionFeatureShadowRow()`. Canonical may appear in `canonicalFeature` even when outside the visible 100-revision window.
- **Digest integrity:** only checked rows counted; `digestVerificationScope` **`FULL`** (≤100 rows) or **`BOUNDED_LATEST_WINDOW`**; **`INTEGRITY_PARTIAL`** when older rows unchecked; **`INTEGRITY_WARNING`** when checked mismatch/gap/duplicate/canonical failure.

## Ops CLI

```bash
cd backend
npm run battery:rest-feature:inspect -- \
  --organization-id=<uuid> --vehicle-id=<uuid> --rest-session-id=<uuid> [--include-raw]
```

**Exit codes:** `0` OK, `2` session not found, `3` integrity warning **or** integrity partial (bounded digest coverage), `1` config/execution error.

**Production safety:** recognized production `DATABASE_URL` hosts **denied** unless  
`BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY=true` (explicit read-only ack). C5A tests use ephemeral DB only.

**No writes:** no compute, upsert, recompute, repair, or flag mutation.

## Version tuple (unchanged)

- `FEATURE_MODEL_VERSION=M3_3C_C3_V1`
- `RETENTION_POLICY_VERSION=M3_3C_C1_V1`
- `CHARGE_OPPORTUNITY_POLICY_VERSION=M3_3C_C2_V1`
- `INPUT_CONTRACT_VERSION=M3_3C_FEATURE_INPUT_V1`

## Tests

- Unit: `rest-session-feature.metrics.spec.ts`, `rest-session-feature-shadow-inspection.*.spec.ts`
- Postgres: `npm run test:battery:v2:rest-session-feature:inspection:postgres`

## Non-effects

- No customer HTTP/GraphQL/UI
- No assessment/publication/battery_features consumption or writes from C5A
- C4 fail-open synchronous post-mutation model preserved
