# EXP-021 C1D.7 — DI V0 S3A primary position acquisition + normalization

**Date:** 2026-09-26  
**Base main:** `090c9383fc5fd1d8457d841a07aeb40a3426d872` (C1D.6 S2 merge)  
**Branch:** `cursor/exp021-c1d7-s3a-position-acquisition-7d78`  
**Evidence ID:** DI-EVID-EXP021-C1D7-001 · **Tests:** DI-TEST-V0-POSITION-ACQ-001 · **Decision:** DI-DEC-V0-POSITION-ACQ-001 (`PROPOSED`)

> DORMANT INPUT LIBRARY ONLY · NO RUNTIME CALLER · NO LIVE PROVIDER CALL EXECUTED · NO DB WRITE · NO SHADOW EXECUTION · NO CUSTOMER EFFECT · NO PRODUCTION MIGRATION EXECUTED

## 1. Scope

S3A = primary historical position acquisition + source-family resolution + normalized position evidence for the merged S1 pure core. Path:
`backend/src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/`.

| File | Role |
|------|------|
| `di-v0-position-acquisition.versions.ts` | Adapter / snapshot versions, frozen query specification, structural window bound (12 h default) |
| `di-v0-position-acquisition.types.ts` | Request, result, bucket, counters, failure, transport port |
| `di-v0-position-window.ts` | Strict UTC `Z` second-aligned `[from, to)` validation; expected labels; explicit enclosing-window helper |
| `di-v0-position-query.ts` | `signals(tokenId, from, to, interval:"1s") { timestamp currentLocationCoordinates(agg: AVG) { latitude longitude } }` |
| `di-v0-position-source-family.ts` | Consumes canonical `vehicle-intelligence/telemetry-source-family.ts` (R1 containment owner) |
| `di-v0-position-normalizer.ts` | Provider rows → expected grid → PRESENT / SIGNAL_NULL / ROW_ABSENT; coordinate validation; duplicates |
| `di-v0-position-snapshot.ts` | Canonical serialization + SHA-256 snapshot identity (`inputEvidenceVersion` for S2) |
| `di-v0-position-errors.ts` | Typed failure classes, retry hint, secret redaction |
| `di-v0-position-acquisition.ts` | `acquireDiV0HistoricalPositions` orchestration + `toDiV0S1PositionInput` |
| `dimo-telemetry-di-v0-position.transport.ts` | Adapter onto shared `DimoAuthService.getVehicleJwt` + `DimoTelemetryService.queryGraphQL` (type-only imports; not Nest-registered) |

## 2. Provider path mapping (reuse, no new transport)

| Concern | Owner | S3A usage |
|---------|-------|-----------|
| Vehicle JWT | DIMO Integration (`DimoAuthService.getVehicleJwt`) | Called by adapter; JWT never returned, stored, hashed or logged |
| GraphQL POST, gateway admission, budget, executor retries | DIMO Integration (`DimoTelemetryService.queryGraphQL` → provider gateway → request executor) | Single call per acquisition with `buildDimoProviderRequestContext(tokenId, { vehicleId, organizationId })` |
| Call-site governance | `dimo-provider-call-site-audit.util.ts` | Adapter classified `FULL_CONTEXT_REQUIRED` (asserted in test) |
| Interpretation (grid, availability, validity, identity) | Driving Intelligence | S3A |

No DIMO Integration code changed. S3A never retries (executor already bounds transient retries); `retryable` is a hint for a future S3B worker only.

## 3. Semantics (frozen for `DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1`)

- **Grid:** `[fromUtc, toUtc)`, 1 s buckets, `expectedBucketCount = (to − from) / 1 s`. Requests must be UTC `Z`, whole-second (explicit `.000` accepted), `from < to`, `≤ maxWindowSeconds` (structural bound, not a production policy).
- **Row timestamp = query-bucket label**, never a source/sample timestamp; no field named `sourceTimestamp`. `temporalConfidence` = `BUCKET_BOUNDED` for valid coordinates, `UNKNOWN` otherwise; never `EXACT_PROVEN`.
- **Labels:** strict ISO; offsets normalized exactly; sub-second labels rejected (`LABEL_NOT_SECOND_ALIGNED`) — never rounded, snapped or phase-shifted. Labels `< from` or `≥ to` rejected (`LABEL_OUTSIDE_WINDOW`).
- **Availability:** matched row → `PRESENT` (or `SIGNAL_NULL` when location is `null` or both coordinates null); no row → `ROW_ABSENT` (`derivedFrom` includes `EXPECTED_GRID_ROW_ABSENT`). No interpolation or fill-forward.
- **Coordinates:** order MISSING_LATITUDE / MISSING_LONGITUDE → NON_NUMERIC → NON_FINITE → LATITUDE_OUT_OF_RANGE → LONGITUDE_OUT_OF_RANGE → VALID. `0,0` and ±90/±180 are valid. Malformed rows stay `PRESENT` with coordinates withheld (`INVALID_COORDINATE`).
- **Duplicates:** identical → one observation, `DUPLICATE_BUCKET_IDENTICAL`, `providerRowCount` preserved; conflicting → `PRESENT`, `CONFLICTING_DUPLICATE`, coordinates withheld (never averaged/picked). One observation per bucket label (keeps S2 `(shadow_run_id, interval_start)` uniqueness).
- **Pre-classification only:** no FRESH / FROZEN / RELEASE / motion / stop inference; S1 assigns hold/release.
- **Source family:** from stored DIMO identity via canonical resolver, never `hardwareType`. Deceptive case (routed `LTE_R1`, synthetic identity) → `API_SYNTHETIC`. UNKNOWN is normalized; S1 abstains (`UNSUPPORTED_SOURCE_FAMILY`).
- **Empty:** `signals: []` → all `ROW_ABSENT` + `NO_PROVIDER_ROWS` (not a failure); `signals: null` → same + `PROVIDER_SIGNALS_NULL`; missing / non-array `signals` → `MALFORMED_RESPONSE`.

## 4. Snapshot identity

Newline-delimited JSON arrays (no object keys → key-order independent): snapshot version, adapter version, query spec, subject (`DIMO`, tokenId, vehicleId), window, source family + policy version, `providerSignalsNull`, one line per bucket in grid order (label, availability, coordinate status, canonical lat/lon, providerRowCount, sorted conflict keys), sorted rejected rows. **Excluded:** `acquiredAt`, organizationId, tripId, JWT / authorization. `inputEvidenceVersion = DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1:sha256:<hex>` — verified to change the S2 run idempotency key (`buildDiV0ShadowRunIdempotencyKey`) without invoking persistence.

## 5. Error model

| Condition | Class | Retryable hint |
|-----------|-------|----------------|
| Invalid request (no provider call) / other 4xx | `INVALID_REQUEST` | no |
| 401, JWT unavailable | `AUTHENTICATION` | no |
| 403 | `AUTHORIZATION` — explicit failure, no partial result | no |
| 429 / `DimoRateLimitedError` | `RATE_LIMITED` | yes |
| 408 / axios timeout | `TIMEOUT` | yes |
| network codes | `NETWORK` | yes |
| 5xx / `DimoRetryableHttpError` | `PROVIDER_HTTP_ERROR` | yes |
| budget / admission timeout | `PROVIDER_BUDGET_UNAVAILABLE` | yes |
| GraphQL `errors` (incl. with partial data — fail closed) | `GRAPHQL_ERROR` | no |
| Body shape invalid | `MALFORMED_RESPONSE` | no |
| other | `UNKNOWN` | no |

`safeMessage` strips Bearer tokens, JWT-shaped strings and authorization values; ≤ 300 chars; HTTP failures never echo provider bodies.

## 6. Validation (this workspace, no network)

| Command | Result |
|---------|--------|
| `npx jest src/modules/vehicle-intelligence/driving-intelligence/position-acquisition` | 6 suites / 110 tests PASS |
| `npx jest --testPathPattern='driving-intelligence/(core\|shadow-persistence\|position-acquisition)\|dimo-provider-call-site-audit\|telemetry-source-family' --testPathIgnorePatterns=postgres` | 16 suites / 169 tests PASS (S1 + S2 non-Postgres regression + call-site audit) |
| `npx tsc --noEmit -p tsconfig.json` | PASS |
| `npx nest build` | PASS |
| `npx eslint …/position-acquisition` | 0 errors |

Test matrix coverage: query spec; tenant-scoped transport input; grid reconstruction (00 valid, 01 valid, 02 no row, 03 null, 04 valid → PRESENT, PRESENT, ROW_ABSENT, SIGNAL_NULL, PRESENT); no fill-forward; BUCKET_BOUNDED only; single-sample semantics; no pre-classification leakage; 9 invalid-coordinate cases; 0,0; range edges; FIELD_MISSING / MALFORMED_VALUE; identical / conflicting / valid+null duplicates; out-of-order; outside-window + `to` label; sub-second / missing / unparseable labels; offset normalization; 1 s / 2 s / 60 s windows; enclosing helper; empty + null signals; 12 invalid requests; 16 transport error classes; 403 explicit; no self-retry; GraphQL errors with data; 4 malformed bodies; redaction; source family R1 / deceptive LTE_R1→API_SYNTHETIC / UNKNOWN; snapshot determinism, order independence, exclusions, 5 evidence-change cases, subject/family sensitivity, canonical numbers, no credentials; S2 idempotency coupling + one observation per label; S1 integration (WOB golden L3 parity, ROW_ABSENT / SIGNAL_NULL / invalid / conflicting block L3, hold FROZEN with no speed, 303 m release protection, API_SYNTHETIC control, UNKNOWN abstention, ROW_ABSENT shape parity with S1 `buildRowAbsentObservation`); static boundary (no framework/persistence/queue/env/logging imports, type-only DIMO imports, no caller outside package, call-site audit); mocked adapter (context propagation, JWT not leaked, missing JWT, auth error redaction).

### Scale (synthetic, single run, mixed evidence, reversed row order)

| Buckets | Elapsed | Heap delta |
|---------|---------|------------|
| 1 800 | 17 ms | ~5 MB |
| 3 600 | 36 ms | noise (GC) |
| 28 800 | 328 ms | ~28.7 MB |

Bound asserted: < 5 s. Measurements are indicative (CI host variance), not SLOs.

## 7. Limitations / gaps (recorded, not resolved)

| ID | Gap | Epistemic |
|----|-----|-----------|
| DI-GAP-S3A-AGG-001 | `currentLocationCoordinates(agg: AVG)` may yield a synthetic midpoint if DIMO places > 1 sample in a 1 s bucket. Enum verified against DIMO public schema (`DIMO-Network/telemetry-api` `schema/base.graphqls` @ `294fc2a7`: `LocationAggregation { AVG RAND FIRST LAST }`; `signals(...)` returns nullable `[SignalAggregations!]`; field requires `VEHICLE_ALL_TIME_LOCATION`). DIMO MCP unavailable in this session (discovery error). AVG chosen for consistency with the repo 1 s HF convention (`high-frequency.query.ts`: all floats `agg: AVG`); the only repo production precedent for historical location is `agg: RAND` (`route-enrichment.query.ts`) — rejected (non-deterministic). No committed EXP-021 artifact shows which location aggregation produced the C1C/C1D pilot coordinates. `FIRST`/`LAST` (real samples, deterministic) remain the alternative for S3B calibration. | UNKNOWN (multi-sample bucket frequency) |
| DI-GAP-S3A-REFTIME-001 | S1 canonical `referenceTime` rendering (`densify-grid.ts`) formats label+500 ms with whole-second output, i.e. equal to the label. S3A matches it byte-for-byte for S1 compatibility; S1 not changed. | CONFIRMED |
| DI-GAP-S3A-LIVE-001 | No live provider response validated for this query in S3A (not authorized). Row shape (`timestamp` + `currentLocationCoordinates { latitude longitude }`) grounded in DIMO public schema and the production `route-enrichment.query.ts` selection; `hdop` not selected in V0_1. | INFERRED |
| DI-GAP-S3A-ARTIFACTS-001 | C1C and C1D.2–C1D.4 artifacts referenced by the golden fixture are not committed in the repository (ledger references only). | CONFIRMED |

## 8. Non-effects

No Nest registration, controller, processor, BullMQ, Redis, scheduler, Prisma, migration, DB write, feature flag, `process.env`, logging, customer API/UI, trip/score/event/misuse mutation, R1 OBD adapter, native event adapter, or S3B worker. No DIMO Integration code change. S2 migration remains unapplied to Production.

## 9. Next slice

S3B (not started, not authorized): worker/caller wiring behind flags, persistence via S2, speed/R1 OBD adapters.
