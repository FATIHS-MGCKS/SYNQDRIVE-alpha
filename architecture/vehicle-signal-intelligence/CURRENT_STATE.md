# Vehicle Signal Intelligence — Current state

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Product focus** | Per-vehicle, per-provider-source-link **signal capability profiles** (declared vs observed) |
| **Last updated** | 2026-10-19 (P3A safety hardening — catalog completeness, monotone SQL upsert, verified link binding) |
| **Product charter** | [`VSI_PRODUCT_CHARTER.md`](VSI_PRODUCT_CHARTER.md) |
| **Master roadmap** | [`VSI_MASTER_ROADMAP.md`](VSI_MASTER_ROADMAP.md) |
| **P0+P1 on `main`** | Merged PR #2034 @ `eb5f1f2ee` — **not** equivalent to Production deploy ([evidence](evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md)) |

## Ownership boundaries

| Module | Owns |
|--------|------|
| **Vehicle Onboarding** | Vehicle lifecycle, `VehicleDataSourceLink`, `connectionIdentity` / verified modality |
| **VDC** | Physical connectivity, monotonic VLS ingest semantics, device episodes |
| **VSI** | Signal catalog reconciliation, empirical observation status, durable capability profiles |
| **APDS** | Polling optimization (read-only VSI consumption planned P3+) |
| **VSI-03 P2C ledger** | Optional forensic per-poll observations — **not** the product profile |

## Implemented (P0+P1)

- **Declared catalog resolver** — reads cached `vehicle_driving_capabilities` / `vehicle_battery_capabilities` preflight rows only (`vsi-declared-catalog.resolver.ts`). **No DIMO HTTP** on materialization path.
- **Profile evaluator** — merges VSI-03 read-only composer empirical axes with declared catalog (`vsi-profile-evaluator.ts`).
- **Durable store** — `vehicle_signal_capability_profiles` scoped by `(organizationId, vehicleId, providerSourceLinkId)`.
- **Materialization** — non-blocking post-VLS upsert hook in `dimo-snapshot.processor.ts`.
- **Inspection** — `GET api/v1/internal/vsi/signal-profiles/organizations/:organizationId/vehicles/:vehicleId` (`MASTER_ADMIN`).
- **Recovery** — `POST .../materialize?providerSourceLinkId=` re-reads VLS + cached preflight when the snapshot hook logged failure (no DIMO calls).
- **Catalog scope** — Declared `availableSignals` evidence is **vehicle-scoped** from preflight tables (limitation `DECLARED_CATALOG_VEHICLE_SCOPED_NOT_PER_SOURCE_LINK`). When **more than one active** `VehicleDataSourceLink` exists, or the target link `provider !== DIMO`, materialization sets declared axes to **UNKNOWN** with `MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS` or `PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY` (never LISTED/NOT_LISTED per link without provenance). Empirical axes remain link-scoped via VLS `providerBindingId`.

## Implemented (P3 — in PR #2041, not deployed)

- **Profile contract v2** — `vsi-signal-profile-v2` with per-signal fingerprint dimensions (`qualityClassification`, `confidenceLevel`, `contentFingerprint` per signal).
- **Empirical extractors (P3 correctness)** — VLS `rawPayloadJson` readers for `position_coordinates`, `accelerator_pedal_position`, `vehicle_speed`, `odometer`, `fuel_level_relative`, `diagnostic_trouble_code` (`vsi-profile-empirical-extractor.ts`, `vsi-raw-payload-signals.util.ts`). P1 composer keys unchanged.
- **Bundle vs per-signal evidence** — bundle cadence / advance counts apply only to `provider_source_timestamp` (+ `bundleAdvanceFingerprint` on evaluation). Other materialized keys carry `PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT` and null historical metrics.
- **Quality classifier** — current-observation freshness only on physical signals; `UNKNOWN` when attribution blockers; bundle historical helper separate (`classifyBundleHistoricalQuality`). No `OBSERVED_INTERMITTENT` from bundle irregularity alone.
- **Historical loader** — latest 64 bundle rows (`orderBy desc` + chronological window), not oldest 64 (`vsi-profile-historical-evidence.loader.ts`).
- **Registry coverage matrix** — explicit flags: catalog support, mapping, extractor, materialization, historical quality (`vsi-signal-registry-coverage.ts`).
- **Baseline evidence** — [`evidence/VSI_P3_BASELINE_2026-10-15.md`](evidence/VSI_P3_BASELINE_2026-10-15.md).

## Implemented (P2 — in PR #2038, not deployed)

- **Lifecycle outbox** — `vsi_profile_lifecycle_outbox` with `PROCESSING` claim lease + `claimToken` (stale lease reclaim; completion/retry/fail gated on token).
- **Ordering guards** — `vsi-profile-lifecycle-ordering.ts` drops stale activate/deactivate events vs authoritative link `activatedAt` / `deactivatedAt` / `isActive` (historical `signalsSnapshot` preserved).
- **Link-scoped lifecycle init** — lifecycle materialization ignores foreign VLS `providerBindingId` (no cross-link empirical / idempotency bleed); `requireBindingMatch` relaxed only for `SOURCE_LINK_ACTIVATED` / `BACKFILL_RECONCILE`.
- **Onboarding trigger** — `SOURCE_LINK_ACTIVATED` enqueued from DIMO link create/reactivate and HM onboarding link create (same transaction).
- **Deactivation reconciliation** — `SOURCE_LINK_DEACTIVATED` / `SUPERSEDED` append `SOURCE_LINK_*` limitations without deleting historical `signalsSnapshot`.
- **Catalog advancement** — `DECLARED_CATALOG_ADVANCED` enqueued from driving-capability preflight upsert (vehicle-scoped; fan-out per active link in processor).
- **Backfill** — bounded `planActiveVehicleProfileBackfill` + `ACTIVE_VEHICLE_BACKFILL_RECONCILE` with durable `enqueueBackfillContinuation` when `nextCursor` is set (operator/CLI only; not auto-run in production).
- **Signal registry expansion** — design doc only: [`research/VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md`](research/VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md).

## Implemented (P4 — merged #2045 @ `a0ce01f19`, deploy baseline per ops)


- **Capability resolver v1** — deterministic read-only engine (`vsi-capability-resolver.engine.ts`) over persisted capability profiles; recomputes freshness at `evaluationTime`.
- **Consumer requirements registry** — versioned `vsi-consumer-requirements-v1` with domain approval matrix ([`research/VSI_P4_DOMAIN_APPROVAL_MATRIX.md`](research/VSI_P4_DOMAIN_APPROVAL_MATRIX.md)); pending thresholds fail closed.
- **Fallback approval registry** — production chains PROPOSED/REJECTED only; test chains in `vsi-capability-resolver.test-registry.ts`; `isFallbackChainExecutable()` always false in P4 V1.
- **P4 hardening** — strict EMPIRICAL_OBSERVED gate, fail-closed `FRESH_AT_EVALUATION`, invalid/future timestamps rejected; APDS `APPROVED_DESIGN_CONTRACT` is design-only (`REQUIREMENT_RUNTIME_APPROVAL_ABSENT`, not runtime ELIGIBLE).
- **Internal API** — `GET api/v1/internal/vsi/capability-resolver/.../resolve` (MASTER_ADMIN, no DIMO, no profile mutation).
- **Consumer adapter contracts** — DI, Battery V2, Trip/DTC, APDS read-only requirement surfaces (no runtime wiring).
- **Operational note** — internal resolver may be reached via double-prefixed path `/api/v1/api/v1/internal/vsi/capability-resolver/...` (non-blocking; do not change working prod route in read-only PRs).

## Implemented (P5A — merged #2049 @ `f48070508`, P5B runtime OFF)

- **P5A read-only adapter** — `buildVsiApdsReadonlyCapabilityObservation`, demand vector from `VSI_CONSUMER_REQUIREMENTS_V1`, pure `correlateApdsShadowWithVsiCapability`.
- **P5B gate** — `VSI_P5_APDS_CORRELATION_ENABLED` (default false); independent of `WORKER_APD_SHADOW_ENABLED`; **not** wired into `adaptive-polling-shadow`.
- **Production deploy** — attested Production release `c1013265b` (2026-10-16 read-only VPS check) includes P5A code path on disk; P5B/P5B.1 runtime flags absent → correlation remains OFF.
- **Service** — `VsiApdsP5ReadonlyService` (profile + link load only; no VSI write-back, no DIMO).
- **Evidence-time** — `VERIFIED_DECISION_TIME_SNAPSHOT` vs `CURRENT_PROFILE_REVIEW` vs `HISTORICAL_PROFILE_UNAVAILABLE` (no profile history table; fail closed).
- **APDS binding** — validates durable shadow row identity; vehicle-level decisions → `UNKNOWN` when multi-active links.
- **P4 parity** — demand assessments via shared `evaluateVsiConsumerRequirement`.
- **Evidence** — [`research/VSI_P5_APDS_INTEGRATION.md`](research/VSI_P5_APDS_INTEGRATION.md).

## Implemented (P5B.1 — offline observer, in PR)

- **Offline replay** — `VsiApdsP5b1OfflineReplayService` + ops CLI; `dryRun: true` only; bounded pagination over persisted APDS decisions.
- **Evidence store design** — additive `vsi_apds_p5_correlation_evidence` migration; append-only revisions; write gate `VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED` default OFF (hard-blocked on production `NODE_ENV`).
- **Evidence** — [`research/VSI_P5B1_OFFLINE_CORRELATION.md`](research/VSI_P5B1_OFFLINE_CORRELATION.md).

## Implemented (P3A — per-link catalog provenance, draft PR)

- **Normalized store** — `vsi_provider_catalog_axes` keyed by `(organizationId, vehicleId, providerSourceLinkId, providerNativeSignalName)`; one preflight snapshot = one DB transaction (all axes commit or none); axes upserted in deterministic `providerNativeSignalName` order; monotonic `checkedAt` (`ON CONFLICT … WHERE checked_at < EXCLUDED.checked_at`); equal `checkedAt` idempotent when content fingerprint matches, conflicts logged when fingerprints diverge (no silent overwrite).
- **Catalog completeness** — `parseDimoAvailableSignalsCatalogResponse` classifies GraphQL payloads; missing/malformed/partial `availableSignals` → `INCOMPLETE_PROVIDER_RESPONSE` or `PROVIDER_ERROR` (never `COMPLETE_PROVIDER_CATALOG` without proof). Valid empty `[]` only when `data.availableSignals` is a proven empty array.
- **Writer** — `VsiP3aPerLinkCatalogWriterService` invoked from existing `DimoAvailableSignalsPreflightService` after the same `availableSignals` GraphQL response (**no extra DIMO HTTP**). Gate `VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED` default **false**; P3A persist errors are logged and do not fail driving-capability upserts.
- **Verified link binding** — `resolveVerifiedDimoProviderSourceLinkForPreflight` requires v2 `connectionIdentity`, preflight `dimoTokenId` alignment, and legacy mirror evidence (Tesla `API_SYNTHETIC` / Ruptela `RUPTELA_R1` modality separation). Fail-closed without provenance.
- **Classifier** — `classifyVsiP3aCatalogAxes` maps eight materialization catalog keys from **complete** `availableSignals` only; PHEV/Hybrid may classify both fuel and HV axes; segment-detector metadata is **not** used for `speed` / odometer LISTED proof.
- **Resolver** — `VsiDeclaredCatalogResolver.resolveForMaterialization` prefers link-scoped rows when `VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED=true` (default **false**). Legacy vehicle-scoped preflight remains readable with `LEGACY_DECLARED_CATALOG_VEHICLE_SCOPED_NOT_LINK_VERIFIED`; NULL-link historical rows are never promoted to per-link verified LISTED/NOT_LISTED.
- **No backfill** — existing `vehicle_driving_capabilities` / `vehicle_battery_capabilities` rows without link provenance are not migrated.

## Implemented (P5-H1 — immutable revision history, draft PR)

- **History table** — `vehicle_signal_capability_profile_revisions` (append-only; one row per committed `profileRevision`).
- **Atomic capture** — same transaction as mutable profile upsert / lifecycle limitation revision when `VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED=true` (default **false**).
- **As-of contract** — `selectVsiProfileRevisionAsOf` (read-only); does **not** wire P5B.1 replay yet.
- **Evidence** — [`research/VSI_P5H1_PROFILE_REVISION_HISTORY.md`](research/VSI_P5H1_PROFILE_REVISION_HISTORY.md).

## Explicit non-goals (this slice)

- APDS shadow runtime hook / live P5B correlation persistence activation.
- VSI03 capture / strict-advance read flags.
- Fleet UI surfacing.

## Validation

```bash
cd backend && npm test -- --testPathPattern=vehicle-signal-intelligence/vsi-profile
VSI03_READONLY_COMPOSER_PG=1 bash scripts/test/vsi03-p2c-postgres-ci.sh
bash architecture/scripts/validate-module-registry.sh
```
