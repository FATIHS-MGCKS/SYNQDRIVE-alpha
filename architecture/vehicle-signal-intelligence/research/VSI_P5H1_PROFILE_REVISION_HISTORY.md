# VSI P5-H1 — Immutable profile revision history

| Field | Value |
|-------|-------|
| **Status** | Implementation (draft PR); capture gate **default OFF** |
| **Depends on** | P5B.1 R2 production audit (decision-time evidence gap) |
| **Production baseline** | `41795fd9f1493fa624a73db07b22772034e3af6e` |

## Problem

`vehicle_signal_capability_profiles` is a **mutable current snapshot**. P5B.1 `VERIFIED_DECISION_TIME_SNAPSHOT` requires profile temporal authority at `shadowDecisionAt`. Without immutable history, every in-window APDS decision is classified `CURRENT_PROFILE_REVIEW`.

## Solution (additive)

- Table `vehicle_signal_capability_profile_revisions` — append-only, one row per committed `profileRevision`.
- `recorded_at` — PostgreSQL `clock_timestamp()` default at **insert** (statement-level wall clock). This is a **persistence upper-bound marker** for the immutable row, not a cross-system logical commit proof relative to APDS decision clocks. Never backdated from application code.
- `evaluated_at` — profile evaluation time (source observation / projection semantics).
- **As-of query** — `loadDecisionTimeRevisionEvidence` / `resolveRevisionAsOf` filter `recorded_at <= decisionAt` AND `evaluated_at <= decisionAt` in SQL with exact eligible counts; incomplete scans fail closed (`UNPROVEN_TEMPORAL_AUTHORITY`).
- **Signal temporal provenance** — `OBSERVED` / `OBSERVED_STALE` require valid past timestamps for verified signal evidence; missing timestamps → `MISSING_TEMPORAL_PROVENANCE` (not silently verified).
- Atomic capture in the **same transaction** as mutable profile upsert when `VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED=true`.
- Pure read-only as-of resolver: `selectVsiProfileRevisionAsOf` → `NO_PRIOR_REVISION` | `PRIOR_REVISION_FOUND` | `STALE_AT_DECISION` | `UNPROVEN_TEMPORAL_AUTHORITY`. `VERIFIED_DECISION_TIME_EVIDENCE` is reserved until durable commit-visibility proof exists (not `recorded_at` alone).

## Non-goals (this phase)

- No production backfill of missing pre-activation revisions.
- No P5B.1 replay behavior change (still uses current profile row).
- No new DIMO HTTP / polling / APDS shadow changes.

## Gate

`VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED` — default **false**. When false, zero history rows; materialization behavior unchanged from P2/P3.

## Write amplification

Bounded by **committed profile revisions** (fingerprint change or lifecycle limitation bump), not APDS decision count.
