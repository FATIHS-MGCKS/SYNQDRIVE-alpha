# VSI P3A catalog refresh — production observation (read-only)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-26 |
| **Context** | VSI Core Hardening P0 investigation |
| **Epistemic** | `CONFIRMED` (code + production row counts) |

## Observation

Production held **32** `vsi_provider_catalog_axes` rows (8 materialization keys × 4 vehicles) with `checked_at` between **2026-10-19 22:08** and **2026-10-19 22:30** UTC. No newer `checked_at` by **2026-10-26**.

## Root cause (not a writer defect)

1. **P3A writer is invoked only from** `DimoAvailableSignalsPreflightService.runPreflight` after a successful DIMO `availableSignals` GraphQL response (`dimo-available-signals-preflight.service.ts`). There is **no separate P3A poll**.
2. **Automatic preflight is gated** by `DIMO_PREFLIGHT_MIN_INTERVAL_MS` (**7 days**). `runPreflightIfStale` returns `skippedReason: preflight_not_stale` when the last `DIMO_TELEMETRY` driving-capability probe is younger than that interval (`dimo-preflight-classifier.config.ts`).
3. **Production flags** had `VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED=true` and resolver enabled; axes were written when preflight last ran (~Oct 19). Frozen `checked_at` is **consistent with no newer authoritative preflight snapshot**, not with a failed upsert loop.
4. **Profile lifecycle** `DECLARED_CATALOG_ADVANCED` is only relevant when materialization observes `declared.checkedAt` advancing relative to the stored profile; without a new preflight, neither P3A axes nor profile `declaredCatalogCheckedAt` advance.

## Deliberately not implemented in P0

- Periodic catalog refresh scheduling
- Additional DIMO `availableSignals` calls outside the existing 7-day preflight budget
- Forced backfill of catalog axes without new provider evidence

## Owner follow-up (separate decision)

If product requires sub-weekly declared-catalog freshness, define an explicit **capability refresh policy** (trigger surfaces, budget, and whether P2 lifecycle should enqueue `runPreflightIfStale({ force: true })` on link activation only vs fleet-wide). Do not fabricate `checked_at` without a new preflight payload.
