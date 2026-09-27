# M3.3F F4.1 — Race-safe bounded D3 reconciliation engineering

**Date:** 2026-09-27  
**Mode:** Engineering only — **no production deploy**, **no D3 activation**, **no `F_D3_T0`**, **no backfill**  
**Base main:** `282188dbb1e7dff8cf3046a3a270ef21a216c61e`

## Rejected naive candidate / freshness rules

| Rule | Verdict |
|------|---------|
| Candidate discovery **VALID-only** C3 filter | **REJECTED** — `INVALIDATED` canonical rows change D1 scientific input; must mark vehicles stale (`INVALIDATED_C3_CAN_TRIGGER_D3_REFRESH=YES`) |
| Freshness = `MAX(C3.created_at) > MAX(D3.materialized_at)` alone | **REJECTED** — lost-update race when C3 row B commits after D1 snapshot but `materialized_at` advances past B timestamps (`LOST_UPDATE_RACE_POSSIBLE_WITH_NAIVE_TIMESTAMP_RULE=YES`) |

## Durable freshness authority (frozen)

| Field | Value |
|-------|-------|
| `D3_FRESHNESS_AUTHORITY` | **`BatteryLongitudinalProfileRevision.sourceEvidenceFingerprint`** — SHA-256 hex of canonical D1 source-evidence payload at materialization time (same C3 version scope + canonical row selection as D1 reader) |
| `D3_FRESHNESS_AUTHORITY_DURABLE` | **YES** — Postgres column on append-only D3 revision rows |
| `D3_FRESHNESS_AUTHORITY_RACE_SAFE` | **YES** — candidate compare uses live recomputed fingerprint vs latest revision fence; concurrent append after snapshot leaves mismatch until reconciled |
| `D3_FRESHNESS_AUTHORITY_INVALIDATION_SAFE` | **YES** — fingerprint includes session lifecycle + canonical row trust/identity |

**Candidate scope**

| Field | Value |
|-------|-------|
| `CANDIDATE_C3_VERSION_SCOPE` | `M3_3C_C3_V1` + `M3_3C_C1_V1` + `M3_3C_C2_V1` (same as D1 batch loader) |
| `CANDIDATE_C3_TRUST_FILTER` | **NO VALID-only filter** — all phase/trust canonical candidates considered via D1-equivalent selection |

## Schema

| Field | Value |
|-------|-------|
| `F4_ENGINEERING_NEW_SCHEMA_REQUIRED` | **YES** (additive column only) |
| `F4_ENGINEERING_PRISMA_MIGRATION_REQUIRED` | **YES** — `20260927120000_battery_longitudinal_profile_source_evidence_fingerprint` |

## Runtime

| Component | Detail |
|-----------|--------|
| Scheduler | `battery_v2_longitudinal_materialization_reconciliation` — leader guard → D3 flag → overlap guard → bounded candidates → per-vehicle gated facade |
| Config | `BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS` default **900000**, min **300000**; batch default **2**, max **5** (strict positive integer parsing) |
| Flag OFF | **0** candidate DB reads / D1 reads / D3 writes (scheduler returns before reconciliation service) |
| C3 hook | **NOT added** (`D3_C3_HOOK_ADDED=NO`) |
| Customer / admin write HTTP | **NONE** |

## D4 read-only ops

| Field | Value |
|-------|-------|
| `D4_READONLY_OPS_IMPLEMENTED` | **YES** — `npm run battery:longitudinal-profile:inspect -- --revision-id=<uuid>` |
| `D4_PRODUCTION_READONLY_GATED` | **YES** — `BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY=true` |

## Mandatory race integration test

Postgres suite `longitudinal-reconciliation.integration.spec.ts` (env `BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTEGRATION=1`):

1. Observe stale vehicle with C3 row A  
2. Materialize from **frozen** D1 inventory (A only) while C3 row B exists  
3. Re-run candidate discovery → vehicle **still stale**  
4. Full materialize → settled (not hot)

**Pass criterion:** `CONCURRENT_C3_APPEND_CAN_BE_LOST=NO`

## Activation stance

| Field | Value |
|-------|-------|
| `D3_FLAG_DEFAULT` | **OFF** |
| `D3_PRODUCTION_ACTIVATED` | **NO** |
| `F_D3_T0_ASSIGNED` | **NO** |
| `BACKFILL_EXECUTED` | **NO** |
| `INITIAL_D3_FROM_EXISTING_NATURAL_C3_IS_BACKFILL` | **NO** (natural post-`F_C3_T0` consumption only after future T0) |

## Validation commands

```bash
cd backend && npm test -- longitudinal-reconciliation
cd backend && npm run test:battery:v2:longitudinal-reconciliation:postgres  # requires Postgres
cd backend && npm run test:battery:v2:longitudinal-profile-materialization:postgres
cd backend && npm run build
bash architecture/scripts/validate-module-registry.sh
bash architecture/scripts/validate-battery-v2-graph.sh  # if present
```
