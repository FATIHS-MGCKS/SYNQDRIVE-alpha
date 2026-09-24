# ERD E2 — Native recharge normalization hardening (2026-09-24)

**Status:** IMPLEMENTED (repository); HV session flags remain OFF.

## Live DIMO recharge contract (verified in repo)

Query: `segments(mechanism: recharge)` via `buildDimoRechargeSegmentsQuery`.

| Field | Live support |
|-------|----------------|
| Segment `id` | **NO** (422 if requested) |
| Signals `agg` in response | **NO** (`name` + `value` only) |
| Pagination `limit` / `after` | **NO** |

Signal requests use MIN/MAX in the GraphQL **request**; response values are an unordered set per signal name.

## E2 corrections

- Timestamp canonicalization + structural reject (invalid start/end, end before start, equal boundaries for completed).
- Duration provenance (`PROVIDER_DURATION` / `DERIVED_BOUNDARY_DURATION`); no silent `duration=0` default for unknown completed episodes.
- Numeric extrema via min/max of all values per signal name (order-independent, no `agg`).
- Boolean evidence via `anyTrue` / `allTrue` (not temporal start/end from MIN/MAX).
- SOC/energy fields documented as `SEGMENT_EXTREMA` proxy; quality capped at PARTIAL when extrema proxy applies.
- Ingest identity: `segmentFingerprint` = `dimo-recharge-{tokenId}-{startEpochMs}`; `segmentId` always fingerprint.
- Multi-window dedupe keyed by fingerprint with deterministic richness merge.

## Legacy VEE

`mapRechargeSegmentToEnergyEvent` unchanged in ownership; still uses min/max as LEGACY_EXTREMA_PROXY for product fields.

## Tests

- Unit: `dimo-recharge-segments.normalizer.spec.ts`, updated client/persist/quality specs.
- Postgres gate: `hv-charge-session-native.postgres.integration.spec.ts` (scenarios A–F).
  - Local opt-in: `ERD_E2_POSTGRES_INTEGRATION=1` + `DATABASE_URL`.
- CI: Vehicle Detail `backend-boundary-postgres` job via `npm run test:boundary-repair:postgres` (step 4).
- E2.1: deterministic dedupe total order; tie-break = lexicographic `stableDedupeTieBreakKey` (higher key wins).
