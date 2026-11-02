# VSI Universal Discovery — Existing-Architecture Handoff for Fable

| Field | Value |
|-------|-------|
| **Operation** | `VSI_EXISTING_ARCHITECTURE_HANDOFF` |
| **Mode** | `READ_ONLY_ANALYSIS` — no implementation, no new engine, no merge, no deploy, no production writes |
| **Prepared** | 2026-11-02 (Europe/Berlin) |
| **Repository SHA (workspace HEAD)** | `c94250d63b7590179856977b60819f0b4aa0bf5d` (branch `cursor/ds4-motion-p1-p2-hardening-192d`) |
| **Repository SHA (`origin/main`)** | `a27ca9059b9fa9e8aa88696e811107fb427cb369` |
| **Production SHA (last verified read-only)** | `85d9795097fe453fcbed1353245bd95ca456476c` (release `20261101220921_v4994`) |
| **Basis** | `VSI_ORIGINAL_ARCHITECTURE_RECONSTRUCTION_2026-11-02.md` (gaps G1–G9), charter, roadmap, `CURRENT_STATE.md`, code trace, production Prisma read-only evidence |
| **Audience** | Fable (architecture reviewer) — to assess and design the **completion of the existing VSI engine**, not a replacement |

> Reading rule for this document: every statement is tagged implicitly by section. "CONFIRMED" means verified in code and/or production read-only evidence. Anything marked **NOT_VERIFIED** is an open fact Fable must treat as unknown, never as assumption.

---

## 1. Original VSI mandate (Ursprünglicher VSI-Auftrag)

Source: `architecture/vehicle-signal-intelligence/VSI_PRODUCT_CHARTER.md`, `VSI_MASTER_ROADMAP.md`, `research/VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md`.

VSI (Vehicle Signal Intelligence) is the **system of record for signal capability truth per provider source link** for any onboarded vehicle in any tenant. Its charter defines three independent evidence families that must never be conflated:

| Evidence family | Meaning | Charter rule |
|-----------------|---------|--------------|
| **Declared** (provider catalog) | The provider claims the signal exists for this vehicle/link (preflight `availableSignals`, catalog axes) | Declared ≠ measured |
| **Snapshot / empirical** | A real value for the signal was observed in a link-scoped latest-state payload (VLS) | Fetch success ≠ measurement; source time ≠ fetch time |
| **Historical / cadence** | Time-series evidence (HF points, battery measurements) describing *how* a signal was delivered over time | HF history ≠ live snapshot proof; **observation ≠ cadence proof; sample count ≠ 1 Hz claim** |

Charter outcomes the engine must deliver:

1. Discover signals per link (declared + empirical + historical) for **all onboarded vehicles**, independent of make/model/provider.
2. Persist a durable, revision-safe, fingerprinted profile keyed `(organizationId, vehicleId, providerSourceLinkId)`.
3. Reconcile continuously via lifecycle events (link activation/deactivation/supersede, catalog advance, backfill).
4. Expose read-only capability answers to consumers (APDS, RPM/LV modules, EXP021, DTC, Master Admin) through typed contracts — **never as live telemetry**.
5. Encode negative knowledge honestly: `UNKNOWN ≠ UNSUPPORTED`, `NEVER_OBSERVED ≠ NOT_APPLICABLE ≠ NOT_EVALUATED`.

The registry expansion plan explicitly **deferred** families beyond the current 12-key allowlist (coolant/ECT, brake, torque, environment) to later promotion batches. That deferral is the design-level origin of the discovery gap described in §10.

---

## 2. Current implementation state (Aktueller Implementierungsstand)

This section is the complete component inventory requested as "§1 Bestandsaufnahme". For every component: purpose, inputs, outputs, data model, call paths, safety guarantees, known limitations. Paths are relative to `backend/src/modules/vehicle-intelligence/vehicle-signal-intelligence/` unless stated otherwise.

### 2.1 VSI lifecycle / outbox

| Aspect | Detail |
|--------|--------|
| **Purpose** | Guarantee that every source-link lifecycle transition causes an idempotent, ordered profile (re)materialization. |
| **Files** | `vsi-profile-lifecycle-enqueue.service.ts` (`VsiProfileLifecycleEnqueueService.enqueueSourceLinkActivated/…`), `vsi-profile-lifecycle.processor.ts` (`VsiProfileLifecycleOutboxProcessor.processPendingBatch → claimPendingBatch → processRow`), scheduler registry entry `vsi_profile_lifecycle_outbox` |
| **Callers** | `dimo/dimo-vehicle-data-source-link.service.ts`, `vehicle-onboarding-activation.service.ts`, `vehicle-offboarding.service.ts`, `driving-capability/vehicle-driving-capability.repository.ts` (→ `DECLARED_CATALOG_ADVANCED`) |
| **Inputs** | `{organizationId, vehicleId, providerSourceLinkId?, eventType, occurredAt, payload}` |
| **Outputs** | Row in `vsi_profile_lifecycle_outbox`; processor invokes `VsiSignalProfileMaterializationService.materializeFromPersistedEvidence` with `lifecycleMode` |
| **Data model** | `VsiProfileLifecycleOutbox` (Prisma): `eventType` enum {SOURCE_LINK_ACTIVATED, SOURCE_LINK_DEACTIVATED, SOURCE_LINK_SUPERSEDED, DECLARED_CATALOG_ADVANCED, ACTIVE_VEHICLE_BACKFILL_RECONCILE}, `status` {PENDING, PROCESSING, COMPLETED, FAILED}, `idempotencyKey` unique (`vsi-p2:SOURCE_LINK_ACTIVATED:${linkId}:${occurredAt}`), `claimToken`, `claimExpiresAt`, `attempts`, `availableAt` |
| **Safety** | Idempotency key; claim lease + token; ordering guards (out-of-order source skip in materializer); failed rows retained with `lastError`; scheduler leader-only |
| **Limitations** | Event vocabulary is fixed (enum → migration to add events, see §5.4); `ACTIVE_VEHICLE_BACKFILL_RECONCILE` is operator-planned (`planActiveVehicleProfileBackfill`), not automatic in production; no event for "new native signal discovered" |

### 2.2 Snapshot discovery / VLS extraction

| Aspect | Detail |
|--------|--------|
| **Purpose** | Turn the link-scoped latest-state payload (`vehicleLatestState.rawPayloadJson`) into per-canonical-key empirical observations. |
| **Files** | `vsi-profile-evaluator.ts` (`evaluateVsiSignalProfile(input, catalogResolver)`, ~L168; allowlist iteration `VSI_PROFILE_MATERIALIZATION_KEYS.map(…)` ~L220), `vsi-profile-empirical-extractor.ts` (`extractProfileSignalEmpirical`, `isProfileEmpiricalExtractorImplemented`), VSI-03 readonly composer (`vsi-readonly-composer*`), `vsi-profile-signal-applicability*.ts` (`applyVsiProfileSignalPowertrainApplicability`) |
| **Inputs** | `vehicleLatestState` row (providerBindingId, rawPayloadJson, sourceTimestamp, fetchedAt), `vehicleDtcSourceHead`, `dimoPollLog` (bounded `DEFAULT_POLL_LOG_LIMIT`), vehicle `fuelType`, active link ref, declared catalog resolver |
| **Outputs** | `VsiProfileEvaluationResult` with `signals: VsiProfileSignalFingerprintV1[]` (exactly one row per allowlisted key), `profileLimitations: string[]`, header timestamps |
| **Data model** | `VsiProfileSignalFingerprintV1` (see §5.2) |
| **Call paths** | `materializeFromPersistedEvidence` (lifecycle, VLS hook in `dimo-snapshot.processor.ts`, manual MASTER_ADMIN POST `…/materialize`, trip-triggered RPM refresh) |
| **Safety** | Link-scoped filtering (binding match; relaxed only for `SOURCE_LINK_ACTIVATED` / `BACKFILL_RECONCILE` with limitation `LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK`); explicit per-key extractor — no fuzzy key matching; alias policy from registry (`prohibitedAutoAliases`); powertrain applicability (`iceOnly`/`evOnly` → `NOT_APPLICABLE`) |
| **Limitations** | **Allowlist-bound**: keys outside the 12 are never inspected; raw VLS keys without an extractor are silently ignored; extractors implemented for 7 keys (vehicle_speed, engine_rpm, odometer, fuel_level_relative, accelerator_pedal_position, position_coordinates, diagnostic_trouble_code) + special handling for lv_voltage, hv_battery_soc, device_connectivity, provider_source_timestamp, provider_last_successful_fetch |

### 2.3 Canonical registry

| Aspect | Detail |
|--------|--------|
| **Files** | `canonical-signal-keys.ts` (`VSI_CANONICAL_SIGNAL_DEFINITIONS`, 21 keys, contract `vsi-canonical-signal-v1`; `VsiCanonicalSignalDefinition { key, primaryDimoSignalName, prohibitedAutoAliases, iceOnly?, evOnly?, … }`; `evaluateCanonicalProviderNativeAlias` → `EXPLICIT_PRIMARY_ALIAS | ALIAS_CONFLICT_UNRESOLVED | UNKNOWN_SIGNAL`; `isVsiCanonicalSignalKey`), `vsi-profile.types.ts` (`VSI_PROFILE_MATERIALIZATION_KEYS`, 12 keys, L15), `vsi-signal-registry-coverage.ts` (`buildVsiSignalRegistryCoverageMatrix()` → statuses SUPPORTED_IN_CANONICAL_REGISTRY / MATERIALIZED_IN_PROFILE / CATALOG_ONLY / OBSERVED_BUT_NOT_MAPPED / UNMAPPED_PROVIDER_SIGNAL) |
| **Purpose** | Single vocabulary for canonical keys and their explicit provider-native primary alias; forbids automatic aliasing across semantically different native names (VSI-02). |
| **Safety** | Compile-time literal union; `prohibitedAutoAliases` list; coverage matrix exposes "registry but not materialized" keys |
| **Limitations** | 21 ≠ 12 (9 registry-only keys: catalog/plan vocabulary without materialization); **no coolant/ECT key**, no torque/engine-load/brake/environment keys; no "unknown native key" container concept in the registry |

### 2.4 Native-to-canonical mapping

| Aspect | Detail |
|--------|--------|
| **Where** | `primaryDimoSignalName` in registry definitions; `vsi-declared-catalog.resolver.ts` (iterates `VSI_PROFILE_MATERIALIZATION_KEYS`, L156/L268/L319) maps preflight rows (`vehicle_driving_capabilities.signalName`, `vehicle_battery_capabilities.signalKey`) → declared status per canonical key; P3A `vsi_provider_catalog_axes` stores `(providerNativeSignalName, canonicalSignalKey?)` per link |
| **Reverse direction** | Only the preflight classifier knows native names outside VSI: `driving-capability/dimo-preflight-classifier.config.ts` (e.g. L37 `{ key: 'coolant', dimoSignalName: 'powertrainCombustionEngineECT', iceOnly: true }`) — **not** consumed by VSI materialization |
| **Safety** | Explicit; multi-active-link → declared `UNKNOWN` + limitation `MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS`; provider identity mismatch → limitation |
| **Limitations** | Mapping is only computed **for allowlisted canonical keys**; native names that exist in preflight but have no canonical key are invisible to the profile (G3) |

### 2.5 HF ClickHouse loader

| Aspect | Detail |
|--------|--------|
| **Files** | `backend/src/modules/clickhouse/clickhouse-hf.service.ts` (`HF_POINTS_TABLE = 'telemetry_hf_points'`), `clickhouse-hf.types.ts`, `vsi-rpm-hf-link-scoped-cadence-evidence.util.ts` (`loadLinkScopedRpmHfCadencePointsV1`, `clipTripWindowsToLinkBounds`), `vsi-profile-cadence-evidence.loader.ts` |
| **Generic methods (reusable)** | `getSignalFrequencySummary(vehicleId, from, to)` — `GROUP BY signal_name`, `point_count`, first/last seen, `avg_interval_ms`, `max_execution_time 10`; `getBoundedSignalValuePoints({vehicleId, signalName, from, to, limit})` — `value_float`, `ORDER BY recorded_at DESC LIMIT`, `max_execution_time 15`; `getTripRpmHfPoints({orgId, vehicleId, tripId, tripStart, tripEnd, signalName?, limit?, offset?})` — strict `org_id + vehicle_id + trip_id` filter, `signalName` defaults to RPM but is parameterised |
| **Safety** | All queries parameterised; bounded `LIMIT` and `max_execution_time`; graceful degradation (`UNAVAILABLE`/`QUERY_FAILED`/`EMPTY`); `getTripRpmHfPoints` is tenant-scoped |
| **Limitations (important)** | `getSignalFrequencySummary` and `getBoundedSignalValuePoints` filter by `vehicle_id` **only — no `org_id` predicate** in SQL (callers must enforce tenant scoping; for universal discovery Fable must require an org-scoped variant). Neither is link-scoped; link scoping is applied downstream in `clipTripWindowsToLinkBounds` (P1-f) |

### 2.6 RPM / LV cadence analyzer

| Aspect | Detail |
|--------|--------|
| **Files** | `vsi-profile-cadence-evidence.loader.ts` (`VsiProfileCadenceEvidenceLoader` port: `loadRpmEvidence`, `loadLvEvidence`, `loadLvStandbyTransmissionEvidence`; constants `RPM_HISTORY_DAYS=14`, `MAX_FINALIZED_TRIPS=20`, `MAX_RPM_POINTS=12000`, `MAX_LV_ROWS=256`, `ENGINE_RPM_SIGNAL='powertrainCombustionEngineSpeed'`), `vsi-profile-cadence.types.ts` (`VsiSignalCadenceIntelligenceV2`, `VsiActiveRpmProfileResolutionV1` {RPM_1HZ, RPM_STANDARD, UNKNOWN}, `VsiRpmCadenceTierResolutionV1`, `VsiCadenceObservedDensityLabel` {UNKNOWN, NOT_APPLICABLE, IRREGULAR, SUB_ONE_HZ, ONE_SECOND_BUCKETS_UNPROVEN}, `VsiHfCadenceReadStatus`), `vsi-profile-cadence.enricher.ts` (`enrichVsiProfileWithCadenceIntelligence`, `normalizeAttachedCadenceProvenance`, `extractPriorCadenceByKey`), `vsi-lv-standby-transmission-evidence.loader.ts`, `vsi-profile-rpm-cadence-post-trip.ts` (`refreshVsiRpmCadenceAfterTrip`, `resolvePostTripRpmCadenceHfEvidenceReady`, `resolveDimoProviderSourceLinkIdForVehicle`) |
| **Inputs** | RPM: finalized trips (≤20, 14 days) clipped to link interval → per-trip CH points (≤12000); LV: PostgreSQL `battery_measurements` (≤256 rows) |
| **Outputs** | `cadenceIntelligence` attached to `engine_rpm` and `lv_voltage` fingerprint rows (contract `vsi-signal-cadence-v2`), with provenance, density label, tier resolution, `cadenceSemanticFingerprint` |
| **Safety** | Density label `ONE_SECOND_BUCKETS_UNPROVEN` encodes exactly the rule "sample count ≠ 1 Hz proof"; cadence operational refresh via CAS (`vsi-profile-operational-refresh.util.ts`) does not bump semantic revision unless `cadenceSemanticFingerprint` changes; P1-g carry-forward of prior cadence when HF read unavailable |
| **Limitations** | Hard-wired to two signals; RPM applicability via `resolveIceRpmApplicability`; no generic "historical observation" axis for other keys |

### 2.7 Evaluator + materializer

| Aspect | Detail |
|--------|--------|
| **Files** | `vsi-profile-materialization.service.ts` — `VsiSignalProfileMaterializationService.materializeFromPersistedEvidence(input)` (~L104), `getProfileForLink`, `listProfilesForVehicle`, `rematerializeForCertification`, `listActiveProviderLinksForVehicle`, `listActiveLinksMissingProfiles`, `appendLifecycleLimitations`, private `resolveDtcConfirmedCompleteEvidence`; mode type `VsiProfileLifecycleMaterializationMode`; `vsi-profile-fingerprint.util.ts` (`projectVsiSignalSemanticFingerprintFields`, `buildVsiProfileSemanticFingerprintPayload`, `areVsiProfileSemanticEvaluationsEquivalent`, `fingerprintVsiProfileEvaluation`); `vsi-profile-operational-refresh.util.ts` |
| **Flow** | load vehicle(fuelType) → active link → `vehicleLatestState` (+ binding match) → DTC head → poll log → `evaluateVsiSignalProfile` → cadence enricher → semantic-equivalence check vs existing profile → upsert `vehicle_signal_capability_profiles` (revision++ only on semantic change) → optional P5-H1 revision row (gate `VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED`, default OFF) |
| **Safety** | Idempotent (same evidence → same fingerprint → no revision bump); out-of-order source timestamps skipped; semantic fingerprint excludes `OPERATIONAL_SIGNAL_FIELDS` and fetch bookkeeping for `provider_source_timestamp` / `provider_last_successful_fetch`; `lastValidObservationAt` excluded for fetch-bookkeeping keys; signals sorted by key before hashing |
| **Limitations** | `evaluateVsiSignalProfile` returns exactly the 12 rows; any new key automatically changes the fingerprint of every existing profile on first materialization (revision bump fleet-wide — expected but must be planned) |

### 2.8 Prisma profile / revision models

See §5.1. Both `signalsSnapshot` and `profileLimitations` are schema-free `Json` columns. Profile identity is a unique triple; revision identity is unique quadruple with `profileRevision`.

### 2.9 Master Admin read DTOs

| Aspect | Detail |
|--------|--------|
| **Files** | `vsi-master-intelligence-read.mapper.ts` (`parseSignalsSnapshot` L25 — casts array to `VsiProfileSignalFingerprintV1[]` without filtering by allowlist; `mapProfileRowToSummary`, `mapProfileRowToDetail` with `engine_rpm` special branch), `vsi-master-intelligence-read.service.ts` (`getFleetOverview`, `assertVehicleScope`, `assertSourceLinkScope`), `vsi-master-intelligence-read.types.ts` (`MasterVsiFleetOverviewDto`) |
| **Safety** | Org/vehicle/link scope assertions; dual-lane presentation (snapshot lane vs cadence lane, P1-d) |
| **Limitations** | Summary counters assume canonical-key vocabulary; a non-canonical signal row would be forwarded raw but the frontend ledger label/i18n lookups assume known keys (frontend impact to be assessed by Fable) |

### 2.10 APDS P5A / P5B consumer

| Aspect | Detail |
|--------|--------|
| **Files** | `vsi-apds-p5.service.ts` (`VsiApdsP5ReadonlyService.buildObservation`), `vsi-capability-resolver.repository.ts` (`loadLinkContext`, `loadProfileContextWithTemporal`, `countActiveSourceLinks`, `listVehicleSourceLinksForHistoricalAttribution`, `loadPersistedApdsShadowDecision`), `vsi-capability-resolver.engine.ts` (`MATERIALIZED = new Set(VSI_PROFILE_MATERIALIZATION_KEYS)` L41, `ATTRIBUTION_LIMITATIONS`), `correlateApdsShadowWithVsiCapability`, `resolveHistoricalActiveSourceLinkUniqueness`, P5B1/P5B2 offline replay + evidence writer + manifest replay, `vsi-profile-revision-as-of.resolver.ts`, `vsi-profile-revision-to-capability-context.mapper.ts` |
| **Contract** | Read-only observation; `APPROVED_DESIGN_CONTRACT ≠ runtime ELIGIBLE`; live correlation gate `VSI_P5_APDS_CORRELATION_ENABLED` default OFF; as-of replay requires revision rows (P5-H1 gate) |
| **Safety** | Fail-closed when profile missing / tenant mismatch / link inactive / attribution limitation present; resolver only evaluates requirement keys that are in `MATERIALIZED` |
| **Limitations** | Any new canonical key is `NOT_MATERIALIZED` to the resolver until added to the allowlist — this is a safety feature, but means discovery output does not leak into APDS by accident |

### 2.11 RPM / LV consumer contracts

| Aspect | Detail |
|--------|--------|
| **Files** | `vsi-consumer-requirements.registry.ts` (featureIds: `lv_measurement_gate`, `hv_soc_readiness`, `exp021_trip_speed_qc`, `exp021_position_context`, `behavior_accelerator_evidence`, `behavior_brake_evidence`, `trip_boundary_support_signals`, `dtc_snapshot_readiness`, `shadow_demand_profile_read`, `ds4_rpm_hf_v1a`), `vsi-capability-resolver.types.ts`, DS4 consumers `driving-intelligence/rpm-hf-v1a/*`, `rpm-hf-v1b/*`, Battery V2 `battery_measurements` |
| **Contract** | Requirement specs are versioned design contracts; consumers read persisted profile fields (`qualityClassification`, `cadenceIntelligence.activeRpmProfile`, …) at evaluation time — never live telemetry |
| **Safety** | Registry-driven; fallback chains explicit; resolver fail-closed |
| **Limitations** | Requirements reference canonical keys only; no requirement can target an "unknown native signal" |

---

## 3. Architecture diagram (Architekturdiagramm)

```
                          ┌──────────────────────────────────────────────────────────────┐
                          │                      EVIDENCE SOURCES (read-only)             │
                          │                                                              │
  DIMO / HM preflight ──► │ vehicle_driving_capabilities (signalName, capabilityStatus)  │
  (vehicle-scoped)        │ vehicle_battery_capabilities (signalKey, status)             │ ── DECLARED axis
  P3A (gate OFF) ───────► │ vsi_provider_catalog_axes (per link, native name)             │
                          │                                                              │
  DIMO snapshot poll ───► │ vehicle_latest_state.rawPayloadJson (+providerBindingId,     │ ── SNAPSHOT axis
                          │   sourceTimestamp, fetchedAt), vehicle_dtc_source_head,      │
                          │   dimo_poll_log                                              │
                          │                                                              │
  Trip finalization ────► │ ClickHouse telemetry_hf_points  (6 mirrored signals + 2)     │ ── HISTORICAL /
  (HfMirrorService,       │ PostgreSQL battery_measurements (LV)                         │    CADENCE axis
   HF_MIRROR_ENABLED)     └──────────────┬───────────────────────────────────────────────┘
                                         │
      lifecycle events                   ▼
 ┌─────────────────────┐    ┌───────────────────────────────────────────────┐
 │ vsi_profile_        │    │ VsiSignalProfileMaterializationService        │
 │ lifecycle_outbox    │───►│  materializeFromPersistedEvidence()           │
 │ (5 event types,     │    │   ├─ link + binding match (P1-f semantics)    │
 │  idempotency key,   │    │   ├─ evaluateVsiSignalProfile()  ◄── 12-key   │
 │  claim lease)       │    │   │    ├─ declared catalog resolver   allowlist│
 └─────────────────────┘    │   │    ├─ VLS composer + extractors           │
   ▲ enqueue from:          │   │    └─ powertrain applicability            │
   link activate/deactivate │   ├─ cadence enricher (engine_rpm, lv_voltage)│
   supersede, catalog adv., │   │    ├─ RPM: per-trip CH points, link-clip │
   backfill plan (operator) │   │    └─ LV: battery_measurements           │
                            │   ├─ semantic fingerprint (excl. fetch/ops)   │
   VLS hook                 │   └─ upsert profile (+ P5-H1 revision, gate)  │
   (dimo-snapshot.processor)└───────────────────┬───────────────────────────┘
   Trip → RPM cadence refresh                   │
   Manual MASTER_ADMIN POST                     ▼
                            ┌───────────────────────────────────────────────┐
                            │ vehicle_signal_capability_profiles            │
                            │  (org, vehicle, link) unique                  │
                            │  signalsSnapshot: Json[]  (12 rows)           │
                            │  profileLimitations: Json[]                   │
                            │  contentFingerprint, profileRevision          │
                            │ vehicle_signal_capability_profile_revisions   │
                            │  (append-only, gate OFF)                      │
                            └───────────────────┬───────────────────────────┘
                                                │ read-only
            ┌───────────────────┬───────────────┼─────────────────────┬────────────────────┐
            ▼                   ▼               ▼                     ▼                    ▼
   Master Admin read     Capability resolver  APDS P5A adapter   DS4 RPM-HF v1a/v1b   P0-a integrity
   DTO mapper (ledger,   (requirements        (P5B correlation   / LV gate consumers  matrix (ops audit)
   dual lane)            registry, fail-closed) gate OFF)        (design contracts)
```

Boundaries: everything above the materializer is **evidence** (owned by other modules); VSI never calls provider APIs during materialization; everything below the profile store is **read-only consumption**.

---

## 4. Relevant files and functions (Relevante Dateien und Funktionen)

| Area | File | Key symbols |
|------|------|-------------|
| Registry | `canonical-signal-keys.ts` | `VSI_CANONICAL_SIGNAL_DEFINITIONS`, `VsiCanonicalSignalDefinition`, `evaluateCanonicalProviderNativeAlias`, `isVsiCanonicalSignalKey` |
| Profile contract | `vsi-profile.types.ts` | `VSI_PROFILE_MATERIALIZATION_KEYS` (L15), `VsiProfileMaterializationKey` (L30), `VsiProfileSignalSnapshotV1` (`canonicalSignalKey: VsiProfileMaterializationKey` L38), `VsiProfileSignalFingerprintV1`, contract constants `vsi-signal-profile-v2`, `vsi-signal-fingerprint-v1` |
| Evidence contract | `vehicle-signal-evidence.contract.ts` | `VsiEmpiricalObservationStatus` {NEVER_OBSERVED, OBSERVED, OBSERVED_STALE, NOT_OBSERVED_IN_WINDOW, NOT_APPLICABLE}, `VsiProviderCatalogStatus`, `VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID`, `VsiProviderSourceLinkRef` |
| Coverage | `vsi-signal-registry-coverage.ts` | `buildVsiSignalRegistryCoverageMatrix` |
| Evaluator | `vsi-profile-evaluator.ts` | `evaluateVsiSignalProfile` (~L168), allowlist map (~L220) |
| Extractors | `vsi-profile-empirical-extractor.ts` | `isProfileEmpiricalExtractorImplemented` (L33), `extractProfileSignalEmpirical` (L39) |
| Declared | `vsi-declared-catalog.resolver.ts` | allowlist loops L156 / L268 / L319 |
| Materializer | `vsi-profile-materialization.service.ts` | `materializeFromPersistedEvidence` (~L104), upserts L477 / L568 / L609, `extractPriorCadenceByKey` use L379 |
| Fingerprint | `vsi-profile-fingerprint.util.ts` | `projectVsiSignalSemanticFingerprintFields` (L52), `buildVsiProfileSemanticFingerprintPayload` (L82), `areVsiProfileSemanticEvaluationsEquivalent` (L190), `fingerprintVsiProfileEvaluation` (L253) |
| Operational refresh | `vsi-profile-operational-refresh.util.ts` | CAS merge of persisted signals (L284–L319) |
| Cadence | `vsi-profile-cadence-evidence.loader.ts`, `vsi-profile-cadence.types.ts`, `vsi-profile-cadence.enricher.ts`, `vsi-rpm-hf-link-scoped-cadence-evidence.util.ts`, `vsi-lv-standby-transmission-evidence.loader.ts`, `vsi-profile-rpm-cadence-post-trip.ts` | see §2.6 |
| Lifecycle | `vsi-profile-lifecycle-enqueue.service.ts`, `vsi-profile-lifecycle.processor.ts` | see §2.1 |
| Revisions | `vsi-profile-revision-history.writer.ts`, `.repository.ts`, `.types.ts`, `vsi-profile-revision-signals-snapshot.ts` (`isVsiProfileRevisionSignalsSnapshotWellFormed` — array of objects only, **no key-vocabulary check**), `vsi-profile-revision-as-of.resolver.ts`, `vsi-profile-revision-to-capability-context.mapper.ts` | |
| Consumers | `vsi-capability-resolver.engine.ts`, `.repository.ts`, `.types.ts`, `vsi-consumer-requirements.registry.ts`, `vsi-apds-p5.service.ts` | |
| Master read | `vsi-master-intelligence-read.mapper.ts`, `.service.ts`, `.types.ts` | |
| Audit | `vsi-p0a-signal-integrity-audit.engine.ts`, `.loader.ts`, `vsi-p0a-audit-cohort.v1.ts`, `backend/scripts/ops/vsi-p0a-signal-integrity-matrix-audit.ts` | |
| HF store | `backend/src/modules/clickhouse/clickhouse-hf.service.ts`, `clickhouse-hf.types.ts`, `migrations/003_high_frequency_telemetry.sql` | `getSignalFrequencySummary` (L564), `getBoundedSignalValuePoints` (L649), `getTripRpmHfPoints` (L726) |
| HF ingestion | `vehicle-intelligence/trips/hf-mirror.service.ts` (`mirrorTripHf`, `toHfPoints` L153–L205), `trips/trip-behavior-enrichment.service.ts` (L218–L233), `dimo/dimo-segments.service.ts` (`fetchHighFrequency` L955, `HighFrequencyReading` L236) | |
| Preflight classifier | `driving-capability/dimo-preflight-classifier.config.ts` | `coolant → powertrainCombustionEngineECT` (L37) |
| Prisma | `backend/prisma/schema.prisma` | `VehicleSignalCapabilityProfile` (L4681), `VehicleSignalCapabilityProfileRevision` (L4712), `VsiProviderCatalogAxis` (L4762), `VsiProfileLifecycleOutbox` (L4806), `VehicleDrivingCapability` (L12142), `VehicleBatteryCapability` (L9772) |

---

## 5. Current Prisma / JSON data model (Aktuelles Datenmodell)

### 5.1 Prisma

| Model | Table | Identity | Payload columns | Notes |
|-------|-------|----------|-----------------|-------|
| `VehicleSignalCapabilityProfile` | `vehicle_signal_capability_profiles` | `@@unique(organizationId, vehicleId, providerSourceLinkId)` | `signalsSnapshot Json`, `profileLimitations Json default []`, `profileContractVersion String`, `profileRevision Int`, `contentFingerprint String`, `evaluatedAt`, `declaredCatalogCheckedAt?`, `lastMaterializedSourceTimestamp?`, `lastMaterializedProviderFetchAt?`, `lastProvenStrictSourceAdvanceAt?`, `providerIdentity`, `verifiedModality?`, `telemetrySourceFamily?` | Mutable head row |
| `VehicleSignalCapabilityProfileRevision` | `vehicle_signal_capability_profile_revisions` | `@@unique(org, vehicle, link, profileRevision)` | same payload + `materializationTrigger String`, `sourceLinkLifecycleContext Json`, `sourceProvenance Json`, `recordedAt` | Append-only; capture gate OFF |
| `VsiProviderCatalogAxis` | `vsi_provider_catalog_axes` | `@@unique(org, vehicle, link, providerNativeSignalName)` | `canonicalSignalKey String?`, `declaredCatalogStatus` enum {LISTED, NOT_LISTED, UNKNOWN}, `catalogSnapshotCompleteness` enum, `provenance` enum, `contractVersion`, `checkedAt`, `metadataJson Json` | **Already keyed by native name, canonical key nullable** — designed container for declared-but-unmapped native signals (gates OFF) |
| `VsiProfileLifecycleOutbox` | `vsi_profile_lifecycle_outbox` | `idempotencyKey @unique` | `eventType` **enum**, `status` enum, `payload Json`, `payloadVersion Int` | Enum = migration to extend |
| `VehicleDrivingCapability` | `vehicle_driving_capabilities` | `capabilityKey` (signalName or detectorName) per vehicle | `signalName?`, `capabilityStatus`, `lastSeenAt`, `checkedAt`, `effectiveCadenceMs`, `p95CadenceMs`, `coverage`, `metadata Json` | Vehicle-scoped (not link-scoped); **no `availableSignals` column** |
| `VehicleBatteryCapability` | `vehicle_battery_capabilities` | `(vehicleId, signalKey)` | `status`, `measurementType?`, `lastSeenAt`, `sourceTimestamp`, `lastValue`, `metadata` | Vehicle-scoped |

### 5.2 JSON `signalsSnapshot` shape (per element, `VsiProfileSignalFingerprintV1`)

```
canonicalSignalKey            : VsiProfileMaterializationKey   ← TYPE-LEVEL allowlist (L38); JSON column itself is free
providerNativeSignalName      : string | null
declaredSupport               : VsiProviderCatalogStatus
empiricalObservation          : VsiEmpiricalObservationStatus
lastValidObservationAt        : ISO | null
lastSourceTimestamp           : ISO | null
lastProviderFetchAt           : ISO | null      (operational, excluded from semantic fingerprint)
lastProvenStrictSourceAdvanceAt: ISO | null
strictSourceAdvanced          : boolean
freshnessClassification       : …
evidenceProvenance            : string[]        (sorted in fingerprint)
limitations                   : string[]        (sorted in fingerprint)
powertrainApplicability?      : …
qualityClassification         : OBSERVED_FRESH | OBSERVED_STALE | OBSERVED_INTERMITTENT | NEVER_OBSERVED | NOT_APPLICABLE | INSUFFICIENT_HISTORY | UNKNOWN
confidenceLevel               : …
observedSamples, provenSourceAdvances, cadence stats
cadenceIntelligence?          : VsiSignalCadenceIntelligenceV2 (engine_rpm, lv_voltage only)
contentFingerprint            : string
```

Production observation (2026-11-02, read-only): every profile of the four cohort vehicles holds exactly 12 elements; `signalsSnapshot` is a JSON **array**, not an object keyed by signal.

### 5.3 Answers to the data-model questions (§3 of the request)

| Question | Answer | Evidence |
|----------|--------|----------|
| Can the JSON/Prisma profile store arbitrary signals? | **Storage: yes** (`Json` column, no DB constraint). **Contract: no** — `canonicalSignalKey` is typed as the 12-key union; `evaluateVsiSignalProfile` emits exactly 12 rows; resolver `MATERIALIZED` set and declared resolver loops iterate the same constant | `vsi-profile.types.ts` L15/L38; evaluator L220; resolver engine L41 |
| Which limits are fixed by enum/registry? | Postgres enums: outbox `eventType`/`status`, P3A `declaredCatalogStatus`/`completeness`/`provenance`. Everything about signal vocabulary is **TypeScript literal unions + constants**, not DB enums | `schema.prisma` L4745–L4802 |
| Migration-free extensions | Adding canonical keys to the allowlist; adding new fields to `VsiProfileSignalFingerprintV1`; adding a new evidence-axis object inside each signal element; adding a sibling array inside `signalsSnapshot` elements or a new top-level JSON member **if** readers tolerate it; storing native-key discovery results in `vsi_provider_catalog_axes.metadataJson` or `canonicalSignalKey = null` rows | Json columns; `isVsiProfileRevisionSignalsSnapshotWellFormed` only checks "array of objects" |
| Unavoidable migration | New outbox event type (enum); any new table (e.g. a dedicated native-signal observation ledger); new indexed columns (e.g. `discoveryContractVersion` if indexed); changing `signalsSnapshot` from array to object is **not** a migration but **is** a reader-breaking contract change — forbidden without version bump | — |
| Are old profiles still readable after extension? | Yes for additive element fields and extra elements, provided: (a) readers keep `Array.isArray` + per-element guards, (b) frontend ledger tolerates unknown `canonicalSignalKey`, (c) `profileContractVersion` is bumped (`vsi-signal-profile-v3`) so as-of replay and fingerprint equality compare like with like. Fingerprint of **every** profile changes once (revision bump fleet-wide) — must be scheduled through outbox `ACTIVE_VEHICLE_BACKFILL_RECONCILE`, not ad hoc | `parseSignalsSnapshot` L25; `persistedProfileToSemanticFingerprintInput` L143 |
| How can unknown native keys be uniquely identified? | Only by the tuple **(providerIdentity, providerNativeSignalName, providerSourceLinkId)** — never by canonical key. `vsi_provider_catalog_axes` already uses exactly this unique key for the declared axis; `telemetry_hf_points.signal_name` is the native DIMO name; VLS payload keys are native names. A canonical key for an unknown signal must **not** be synthesised automatically (`UNKNOWN_SIGNAL` outcome of `evaluateCanonicalProviderNativeAlias` must stay terminal) | `canonical-signal-keys.ts`; `schema.prisma` L4785 |
| Where can provenance and observation time be stored? | Per element: `evidenceProvenance[]`, `lastValidObservationAt`, `lastSourceTimestamp`, `lastProviderFetchAt`; per profile: header timestamps + `profileLimitations`; per revision: `sourceProvenance Json`, `materializationTrigger`. For a new historical-observation axis: a nested object analogous to `cadenceIntelligence` (own contract version, own semantic fingerprint, own `readStatus`) is the pattern already proven | `vsi-profile-cadence.types.ts`, fingerprint util L75 |
| How to distinguish NOT_OBSERVED vs NOT_EVALUATED? | Today only partially: `NEVER_OBSERVED` (evaluated, nothing seen), `NOT_OBSERVED_IN_WINDOW`, `NOT_APPLICABLE`; `INSUFFICIENT_HISTORY`/`UNKNOWN` quality; cadence `VsiHfCadenceReadStatus` carries UNAVAILABLE vs EMPTY. **There is no explicit `NOT_EVALUATED` empirical status**; signals outside the allowlist are simply absent (absence ≠ negative knowledge). Fable must introduce an explicit tri-state per axis (`EVALUATED_OBSERVED`, `EVALUATED_NOT_OBSERVED`, `NOT_EVALUATED[reason]`) without redefining the existing enum members | `vehicle-signal-evidence.contract.ts` |

---

## 6. Snapshot data flow (Snapshot-Datenfluss)

```
DIMO poll → vehicle_latest_state (rawPayloadJson, providerBindingId, sourceTimestamp, fetchedAt)
        → dimo-snapshot.processor post-VLS hook (non-blocking) → materializeFromPersistedEvidence
            → binding match: latestState.providerBindingId ↔ active link binding
                 (mismatch ⇒ skip or limitation LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK)
            → out-of-order guard (sourceTimestamp older than lastMaterializedSourceTimestamp ⇒ skip)
            → evaluateVsiSignalProfile
                 for key in VSI_PROFILE_MATERIALIZATION_KEYS (12):
                    declared  = catalogResolver(key)                ← vehicle_driving/battery_capabilities, P3A
                    empirical = extractProfileSignalEmpirical(key)  ← composer/extractor on rawPayloadJson
                    applicability(fuelType, iceOnly/evOnly)
                    freshness / quality / strictSourceAdvanced
            → cadence enricher (engine_rpm, lv_voltage; prior cadence carried when HF unavailable)
            → semantic fingerprint compare → upsert / revision
```

Facts relevant to universal discovery:

- `rawPayloadJson` **is** the complete link-scoped latest state; it already contains keys VSI ignores (production: Audi `powertrainCombustionEngineECT` present).
- Provider-fetch metadata and source timestamp are separated and must stay so for any new key.
- Extractors are per-key functions; there is no generic "value present and finite at path X" extractor. The composer (VSI-03) is read-only and could expose a generic key walk, but the generic walk does **not** exist today.
- Declared catalog is vehicle-scoped (preflight) unless P3A gates are ON; discovery per link must therefore either use P3A axes or carry the `MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS` limitation.

---

## 7. HF data flow (HF-Datenfluss)

```
Trip finalized (TripBehaviorEnrichmentService)
  → DimoSegmentsService.fetchHighFrequency(tokenId, from, to)     ← provider GraphQL (1 call per trip window)
  → HighFrequencyReading[] {timestamp, speedKmh, rpm, engineCoolantTempC, throttlePosition, engineLoad,
                            tractionBatteryPowerKw, (engineRuntimeSec, torque, exteriorAirTemp…)}
  → HfMirrorService.mirrorTripHf (fire-and-forget, HF_MIRROR_ENABLED, alreadyMirrored idempotency)
      toHfPoints writes signal_name ∈ { speed, powertrainCombustionEngineSpeed, powertrainCombustionEngineECT,
                                        obdThrottlePosition, obdEngineLoad, powertrainTractionBatteryCurrentPower }
      (+ clickhouse-telemetry.service.ts writes 'ignition', 'motion')
  → ClickHouse synqdrive.telemetry_hf_points
      ORDER BY (org_id, vehicle_id, signal_name, recorded_at), PARTITION toYYYYMM, TTL 90 days
      columns: org_id, vehicle_id, token_id, source, signal_name, signal_group, recorded_at, ingested_at,
               value_float/int/bool/string, unit, quality, request_id, trip_id, booking_id
  → VSI (RPM only): refreshVsiRpmCadenceAfterTrip → loadRpmEvidence
      finalized trips (≤20, 14 d) → clipTripWindowsToLinkBounds → getTripRpmHfPoints(org, vehicle, trip, RPM)
      → cadence stats → ONE_SECOND_BUCKETS_UNPROVEN unless active-profile rules satisfied
```

### 7.1 Answers to the HF questions (§4 of the request)

| Question | Answer | Status |
|----------|--------|--------|
| Which native signal types are actually in `telemetry_hf_points`? | **By code (ingestion contract):** exactly the 6 names written by `toHfPoints` plus `ignition`/`motion`. `signal_name` is a free `LowCardinality(String)` — the table is generic, the **writer** is the allowlist. Engine-torque / runtime / exterior-temp fields exist on `HighFrequencyReading` but are **not** mirrored. | CONFIRMED (code) |
| Live `signal_name` inventory on production | Not read: manual `curl` against production ClickHouse failed authentication in this session (backend client auth works — P0-a matrix read RPM points via backend). Must be confirmed with the backend's configured client before Fable assumes anything beyond RPM presence. | **NOT_VERIFIED** |
| How is RPM loaded and evaluated? | Per finalized trip, link-clipped, bounded to 12000 points, `signalName = powertrainCombustionEngineSpeed`; evaluated to cadence stats + tier; density label never asserts 1 Hz from counts | CONFIRMED |
| Which loaders are generic and reusable? | `getSignalFrequencySummary` (vehicle/time → per-signal counts + avg interval), `getBoundedSignalValuePoints` (vehicle/signal/time/limit), `getTripRpmHfPoints` (org/vehicle/trip, `signalName` param). The first two are **not org-scoped in SQL** and not link-scoped — reuse requires an org-scoped wrapper or variant | CONFIRMED |
| What would change to evaluate arbitrary signals? | (1) an org+vehicle+time-window **inventory** call (frequency summary) executed inside link bounds; (2) per-signal bounded point reads only for keys the registry (or an explicit discovery contract) approves; (3) a new evidence axis "historical observation" with `pointCount`, `firstSeenAt`, `lastSeenAt`, `tripCoverage`, `readStatus` — **separate from cadence**; (4) no cadence/1 Hz derivation for non-RPM keys unless an explicit per-signal cadence rule set exists | ANALYSIS |
| Provider / ingestion / retention limits | HF content is a **mirror of trip-window provider fetches**, not a continuous stream: nothing between trips, nothing before mirroring was enabled, nothing older than **90 days (TTL)**, nothing for signals outside the 6 mirrored names; `HF_MIRROR_ENABLED` must be `true` (production state inferred ON from RPM points, env value not read) | CONFIRMED (code) / production env NOT_VERIFIED |
| Bounding expensive queries | Existing pattern: `max_execution_time` 10–15 s, `LIMIT`, trip-window predicates on the sort key `(org_id, vehicle_id, signal_name, recorded_at)`, ≤20 trips, ≤12000 points, graceful `UNAVAILABLE`. Inventory via `GROUP BY signal_name` over a bounded window is cheap on the sort key; **never** scan a vehicle's full 90 days without window + org predicate | CONFIRMED |

**Rule carried into every proposal:** historical observation (points exist in a window) is a weaker claim than cadence proof; `ONE_SECOND_BUCKETS_UNPROVEN` and tier resolution remain RPM-specific unless a signal-specific cadence contract is written and validated.

---

## 8. Onboarding / reconciliation lifecycle (Onboarding- und Reconciliation-Lifecycle)

| Trigger | Path | Materialization mode | Discovery today |
|---------|------|----------------------|-----------------|
| Link activated (DIMO / VO / HM) | enqueue → outbox → processor | `SOURCE_LINK_ACTIVATED` (relaxed binding) | declared + empirical for 12 keys; cadence null |
| First/next VLS advance | `dimo-snapshot.processor` hook | VLS | same 12 keys; strict binding |
| Preflight catalog advance | repository → `DECLARED_CATALOG_ADVANCED` | lifecycle | declared axis refresh |
| Trip finalized (ICE) | `refreshVsiRpmCadenceAfterTrip` | `TRIP_FINALIZED_RPM_CADENCE` | RPM cadence only |
| Link deactivated / superseded | outbox | lifecycle | limitations appended; profile retained |
| Operator backfill | `planActiveVehicleProfileBackfill` → `ACTIVE_VEHICLE_BACKFILL_RECONCILE` | lifecycle | full re-evaluation |
| Manual recovery | MASTER_ADMIN POST `…/materialize` | manual | full re-evaluation |

Guarantees: outbox idempotency; claim lease; ordering guard on source timestamp; profile exists even without telemetry (declared UNKNOWN / `NEVER_OBSERVED`); failures leave `FAILED` rows with `lastError`; no provider calls.

Gaps for discovery: no trigger "new native key appeared in VLS" (VLS hook would re-run the 12-key evaluation only); no trigger "new HF signal observed" (post-trip hook is RPM-bound); progressive discovery would reuse the existing post-trip hook and outbox rather than adding a scheduler.

---

## 9. APDS / RPM / LV consumer contracts (Consumer-Verträge)

| Consumer | Reads | Through | Fail-closed on | Discovery impact |
|----------|-------|---------|----------------|------------------|
| APDS P5A/P5B | profile head (or as-of revision when P5-H1 data exists) | `VsiApdsP5ReadonlyService` → `VsiCapabilityResolverRepository` | missing profile, tenant mismatch, inactive link, attribution limitations, non-materialized key | None unless a requirement spec is changed; resolver's `MATERIALIZED` set governs |
| Capability resolver (P4) | `qualityClassification`, freshness, limitations per canonical key | `vsi-capability-resolver.engine.ts` + requirements registry | same | New keys invisible until added to allowlist **and** to a requirement spec |
| DS4 RPM-HF v1a/v1b | `engine_rpm.cadenceIntelligence` (active profile, tier) | design contract `ds4_rpm_hf_v1a` | cadence missing / UNKNOWN | Must not change: RPM semantics (`vsi-signal-cadence-v2`) frozen |
| LV gate / Battery V2 | `lv_voltage` quality + cadence from `battery_measurements` | `lv_measurement_gate` | — | Must not change |
| Master Admin | all rows + limitations, dual lane | read mapper/service | scope assertions | Ledger must tolerate additional rows / new axis |

Contract-safety statement: adding discovery output as **new rows/axes** that are not referenced by any requirement spec is contract-neutral for APDS and DS4/LV — the resolver ignores non-materialized keys, and semantic equality for existing keys is unchanged as long as their field set is untouched. The single unavoidable side effect is a **one-time fingerprint/revision bump** of every profile when the evaluator output shape changes; P5B must remain OFF during that reconcile and P5-H1 capture should be ON beforehand if as-of integrity matters.

---

## 10. Confirmed gaps (Bestätigte Lücken)

From `VSI_ORIGINAL_ARCHITECTURE_RECONSTRUCTION_2026-11-02.md` §10, refined with this handoff's findings:

| ID | Class | Statement | New precision from this handoff |
|----|-------|-----------|--------------------------------|
| G1 | DESIGN_GAP | Charter "discover all signals" vs 12-key allowlist | Allowlist is enforced at **four** code points: types L38, evaluator L220, declared resolver L156/268/319, resolver engine L41 (+ coverage matrix) |
| G2 | IMPLEMENTATION_GAP | No arbitrary HF enumeration | Generic inventory query exists (`getSignalFrequencySummary`) but is vehicle-only scoped and unused by VSI; HF content itself is limited to 6 mirrored names |
| G3 | IMPLEMENTATION_GAP | ECT in VLS + preflight SUPPORTED + HF mirror, absent from profile | ECT is the **only** signal present on all three evidence axes and still invisible to VSI — ideal first validation case |
| G4 | INTEGRATION_GAP | P3A per-link catalog gates OFF | P3A table is the only existing native-name-keyed, link-scoped store; relevant for extension point C |
| G5 | INTEGRATION_GAP | P5-H1 revision capture OFF | Required before fleet-wide revision bump if as-of replay matters |
| G6 | INTEGRATION_GAP | P5B correlation OFF | Must stay OFF through discovery rollout |
| G7 | DOCUMENTATION_DRIFT | Roadmap vs CURRENT_STATE | Unchanged |
| G8 | DATA_GAP | Snapshot NEVER_OBSERVED + HF present for RPM (Tiguan) | Exactly the semantic that a separate "historical observation" axis would make explicit |
| G9 | EXPECTED_BEHAVIOR | Fetch refresh without semantic bump | Keep |
| **G10** (new) | SAFETY_GAP | Generic CH loaders lack `org_id` predicate | Any discovery reuse must add tenant scoping in SQL, not only in callers |
| **G11** (new) | CONTRACT_GAP | No explicit `NOT_EVALUATED` state; absent key = silent | Discovery must make "not evaluated" a stored, provenance-bearing fact |
| **G12** (new) | EVIDENCE_GAP | Production HF `signal_name` inventory not verified in this session | Must be read via backend ClickHouse client before design relies on it |

---

## 11. Extension points inside VSI (Erweiterungspunkte) — no new engine

Each point names the exact seam, what stays, what changes, and the safety condition.

### A. Dynamic full snapshot discovery

| | |
|-|-|
| **Seam** | `evaluateVsiSignalProfile` after the 12-key map (evaluator ~L220); VSI-03 readonly composer for a generic key walk over `rawPayloadJson` |
| **Keep** | The 12 canonical rows and their extractors untouched; declared/empirical semantics per key unchanged |
| **Add** | A read-only **native key inventory** of the link-scoped payload: `{providerNativeSignalName, valueKind, hasFiniteValue, sourceTimestamp}`; classify via `evaluateCanonicalProviderNativeAlias` → `EXPLICIT_PRIMARY_ALIAS` (already covered), `ALIAS_CONFLICT_UNRESOLVED`, `UNKNOWN_SIGNAL` |
| **Output location** | Candidate (decision for Fable, §13 D1): (i) extra elements in `signalsSnapshot` with a new `signalClass: 'NATIVE_UNMAPPED'` and `canonicalSignalKey: null`, or (ii) sibling member `nativeSignalInventory` inside the profile JSON, or (iii) P3A `vsi_provider_catalog_axes` rows with `provenance = SNAPSHOT_OBSERVED` |
| **Safety** | Binding match identical to today; same out-of-order guard; no value persistence (presence + time only); bounded key count (cap + limitation `NATIVE_INVENTORY_TRUNCATED`) |

### B. Independent historical discovery beyond RPM

| | |
|-|-|
| **Seam** | `VsiProfileCadenceEvidenceLoader` port (`vsi-profile-cadence-evidence.loader.ts`) + `enrichVsiProfileWithCadenceIntelligence`; CH `getSignalFrequencySummary` / `getTripRpmHfPoints(signalName)` |
| **Keep** | RPM and LV cadence code paths and contracts unchanged (`vsi-signal-cadence-v2`) |
| **Add** | A new loader method `loadHistoricalObservationInventory({orgId, vehicleId, linkBounds, tripWindows})` returning per `signal_name`: `pointCount`, `firstSeenAt`, `lastSeenAt`, `tripsWithPoints`, `readStatus` — computed via an **org-scoped** frequency-summary variant over link-clipped trip windows |
| **Safety** | No cadence tier, no density label other than `UNKNOWN` for non-RPM; `max_execution_time`; ≤20 trips / 14 days reuse; result carried forward (P1-g pattern) when CH unavailable; explicit "mirror-bounded" limitation |

### C. Persistence of unknown native signals

| | |
|-|-|
| **Seam** | `vsi_provider_catalog_axes` (native-name unique key, `canonicalSignalKey` nullable, `metadataJson`) **or** profile JSON (see A) |
| **Keep** | Canonical registry unchanged; no synthetic canonical keys |
| **Identity** | `(organizationId, vehicleId, providerSourceLinkId, providerIdentity, providerNativeSignalName)` |
| **Content** | Per axis (declared / snapshot-observed / historically-observed): status, firstSeenAt, lastSeenAt, provenance, contractVersion; never raw values |
| **Safety** | Revision-neutral option: store unknown-signal inventory **outside** the semantic fingerprint (operational field) until a promotion decision; or revision-bearing option: inside fingerprint so APDS as-of replay sees it. Fable decides (§13 D2) |

### D. Separate evidence axes (snapshot / historical observation / cadence)

| | |
|-|-|
| **Seam** | `VsiProfileSignalFingerprintV1` element shape; precedent `cadenceIntelligence?` nested object with own contract and semantic fingerprint |
| **Add** | `historicalObservation?: { contractVersion, readStatus, pointCount, firstSeenAt, lastSeenAt, tripCoverage, provenance, semanticFingerprint }` on each element; keep `empiricalObservation` = snapshot axis, `cadenceIntelligence` = cadence axis |
| **Tri-state** | Each axis carries `EVALUATED_OBSERVED | EVALUATED_NOT_OBSERVED | NOT_EVALUATED{reason}` explicitly (G11) |
| **Safety** | Projection in `projectVsiSignalSemanticFingerprintFields` must decide per field whether it is semantic (axis status, first/last seen bucketed) or operational (exact counts); `OPERATIONAL_SIGNAL_FIELDS` is the existing mechanism |

### E. Progressive discovery after trips

| | |
|-|-|
| **Seam** | `refreshVsiRpmCadenceAfterTrip` (`vsi-profile-rpm-cadence-post-trip.ts`) and `resolvePostTripRpmCadenceHfEvidenceReady` |
| **Keep** | RPM decision logging and skip reasons |
| **Add** | Extend the same post-trip hook to refresh the historical-observation inventory (B) for the link that owned the trip; reuse `resolveDimoProviderSourceLinkIdForVehicle` and link clipping; no new scheduler, no new worker |
| **Safety** | Only after `HF_MIRROR_ENABLED` mirror success (`pointsInserted > 0` or `points_already_mirrored`); fire-and-forget, never blocks enrichment |

### F. Source-link-safe revisions

| | |
|-|-|
| **Seam** | `materializeFromPersistedEvidence` binding match + `appendLifecycleLimitations`; `clipTripWindowsToLinkBounds`; revision writer `sourceProvenance` |
| **Rule** | Every discovery observation must carry the link it was attributed to and the attribution basis (`providerBindingId` match for snapshot; link interval clip for HF). Observations that cannot be attributed get `LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK` / HF attribution limitation and must be **excluded from positive claims** |
| **Safety** | No cross-link merge; superseded links keep their profile; `resolveHistoricalActiveSourceLinkUniqueness` reused for as-of |

### G. APDS contracts without policy changes

| | |
|-|-|
| **Seam** | `vsi-consumer-requirements.registry.ts` + resolver `MATERIALIZED` set |
| **Rule** | Discovery output is **not** added to any requirement spec in the discovery phase; resolver continues to ignore non-materialized keys; `VSI_P5_APDS_CORRELATION_ENABLED` stays OFF; only Master Admin read surfaces the new axis |
| **Safety** | Contract tests asserting resolver results for existing featureIds are byte-identical before/after discovery rows exist |

---

## 12. Technical risks (Technische Risiken)

| Risk | Mechanism | Mitigation inside VSI |
|------|-----------|-----------------------|
| Tenant leak via generic CH loaders | `getSignalFrequencySummary` / `getBoundedSignalValuePoints` have no `org_id` predicate | Org-scoped variants mandatory; test asserting SQL contains org predicate |
| Fleet-wide revision storm | Evaluator shape change ⇒ fingerprint change on every profile at next materialization | Contract version bump + planned `ACTIVE_VEHICLE_BACKFILL_RECONCILE`; P5-H1 ON first if as-of replay matters; P5B OFF |
| Snapshot/HF conflation | New axis rendered as "observed" in ledger | Distinct field names, distinct i18n labels, P1-d dual-lane pattern |
| False 1 Hz / cadence claims | Point counts interpreted as frequency | Non-RPM axis has no density label other than `UNKNOWN`; cadence contract stays RPM/LV |
| Profile bloat | Unbounded native key inventory | Cap + `NATIVE_INVENTORY_TRUNCATED` limitation; presence-only, no values |
| Reader breakage | Frontend / mapper assume canonical keys | `parseSignalsSnapshot` already lenient; frontend ledger must be audited for unknown keys before persisting them in `signalsSnapshot` |
| Alias drift | Auto-mapping native names to canonical keys | `UNKNOWN_SIGNAL` terminal; promotion only via registry PR with `prohibitedAutoAliases` review |
| Mirror-bounded HF truth | TTL 90 d, 6 signals, trips only, mirror flag | Limitation strings `HF_MIRROR_BOUNDED_WINDOW`, `HF_SIGNAL_NOT_MIRRORED`; never infer "unsupported" from HF absence |
| Provider cost | Temptation to call DIMO for discovery | Materialization stays provider-call-free; discovery reads persisted evidence only |
| Outbox growth | New triggers enqueue more events | Reuse existing events/modes; no new event type unless Fable decides migration is justified (§13 D5) |

---

## 13. Open architecture decisions for Fable (Offene Architekturentscheidungen)

| ID | Decision | Options | Constraints |
|----|----------|---------|-------------|
| D1 | Where does unknown-native-signal inventory live? | (i) extra elements in `signalsSnapshot` (`canonicalSignalKey: null`, `signalClass`), (ii) sibling JSON member, (iii) `vsi_provider_catalog_axes` rows with new provenance | (i)/(ii) migration-free but touch fingerprint/readers; (iii) reuses link-scoped native key, needs P3A gates ON and an enum extension (migration) for provenance |
| D2 | Is discovery inventory semantic (fingerprint/revision-bearing) or operational? | Semantic ⇒ APDS as-of integrity, more revisions; operational ⇒ CAS refresh, no revision churn | Must not change semantics of the 12 existing keys either way |
| D3 | Contract versioning | `vsi-signal-profile-v3` for element-shape change vs keep v2 + optional fields | As-of replay (`vsi-profile-revision-as-of.resolver.ts`) compares contract versions |
| D4 | Tri-state evidence vocabulary | Extend `VsiEmpiricalObservationStatus` vs new per-axis `evaluationState` field | Existing enum members are consumed by resolver/APDS — additive only |
| D5 | Trigger model | Reuse VLS hook + post-trip hook + backfill (no migration) vs new outbox event `NATIVE_SIGNAL_DISCOVERED` (enum migration) | Idempotency key scheme must cover the new trigger |
| D6 | HF inventory scope | Per finalized trip windows (link-clipped, reuse ≤20/14 d) vs rolling window per vehicle | Rolling window weakens link attribution; trip windows match P1-f |
| D7 | Promotion path to canonical | Discovery → registry PR (manual) vs discovery-driven suggestion list in Master Admin | Never automatic; `prohibitedAutoAliases` review stays human |
| D8 | Frontend tolerance | Audit ledger for `canonicalSignalKey: null` rows before or after backend change | i18n keys for 9 locales needed for any new label |
| D9 | Generic CH loader hardening | Add org predicate to existing methods vs new org-scoped methods | Only non-VSI-internal caller today is the P0-a audit loader (`vsi-p0a-signal-integrity-audit.loader.ts`); `getSignalFrequencySummary` / `getBoundedSignalValuePoints` have no other production callers in `backend/src` — hardening in place is low-blast-radius |
| D10 | Production evidence prerequisite | Require verified `signal_name` inventory (G12) before Phase 1 design freeze | Read-only via backend ClickHouse client on VPS |

---

## 14. Immutable requirements (Unveränderliche Anforderungen)

Any proposal Fable produces must preserve all of the following, verbatim:

1. **Tenant isolation** — every read and write carries `organizationId`; CH SQL must include `org_id`.
2. **Source-link isolation** — observations are attributed to exactly one `providerSourceLinkId` or marked unattributed and excluded from positive claims (P1-f).
3. **No snapshot/HF mixing** — snapshot `empiricalObservation`, historical observation, and cadence are distinct axes with distinct fields, labels, and fingerprints.
4. **No false availability claims** — absence of evidence ≠ `UNSUPPORTED`; HF absence ≠ unsupported; `UNKNOWN_SIGNAL` is terminal; `NOT_EVALUATED` is explicit.
5. **No uncontrolled provider queries** — materialization and discovery read persisted evidence only; no DIMO/HM calls.
6. **No APDS live activation** — `VSI_P5_APDS_CORRELATION_ENABLED` stays OFF; no requirement-spec changes in discovery phases.
7. **No change to existing RPM/LV semantics** — `vsi-signal-cadence-v2`, `ONE_SECOND_BUCKETS_UNPROVEN`, tier resolution, LV loaders unchanged; no 1 Hz claim from sample counts for any signal.
8. **Idempotent materialization** — same evidence ⇒ same fingerprint ⇒ no revision; new shape ⇒ exactly one planned bump.
9. **Revision-safe profiles** — append-only revisions; as-of readers tolerate both contract versions.
10. **Backward compatibility** — all existing readers (`parseSignalsSnapshot`, resolver repository, revision mapper, P0-a loader, frontend ledger) keep working on v2 profiles and on extended profiles.

---

## 15. Fable prompt (standalone)

The following prompt is self-contained and may be handed to Fable together with this file.

```
ROLE
You are Fable, senior architecture reviewer for SynqDrive's Vehicle Signal Intelligence (VSI) module.
You are asked to assess and design the COMPLETION of the existing VSI engine so that it can discover
signal capabilities universally (all onboarded vehicles, all providers, all tenants) across three
independent evidence axes: provider-declared, snapshot-observed, historically-observed (+ cadence
where a validated cadence contract exists). You must NOT design a new engine, a parallel store,
a second registry, or a second lifecycle.

INPUT
- architecture/vehicle-signal-intelligence/evidence/VSI_UNIVERSAL_DISCOVERY_FABLE_HANDOFF.md (this file)
- architecture/vehicle-signal-intelligence/evidence/VSI_ORIGINAL_ARCHITECTURE_RECONSTRUCTION_2026-11-02.md
- architecture/vehicle-signal-intelligence/VSI_PRODUCT_CHARTER.md, VSI_MASTER_ROADMAP.md, CURRENT_STATE.md,
  research/VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md
- Code under backend/src/modules/vehicle-intelligence/vehicle-signal-intelligence/,
  backend/src/modules/clickhouse/clickhouse-hf.service.ts, backend/prisma/schema.prisma (VSI models)

WHAT IS TRUE TODAY (do not re-derive, verify only if you doubt it)
- Profile = (organizationId, vehicleId, providerSourceLinkId) → JSON array of exactly 12 canonical
  signal rows (VSI_PROFILE_MATERIALIZATION_KEYS), contract vsi-signal-profile-v2, semantic fingerprint
  excludes fetch/operational fields, append-only revisions behind gate VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED (OFF).
- Allowlist is enforced at: vsi-profile.types.ts (type), vsi-profile-evaluator.ts (map), vsi-declared-catalog.resolver.ts
  (3 loops), vsi-capability-resolver.engine.ts (MATERIALIZED set).
- Snapshot evidence = link-scoped vehicle_latest_state.rawPayloadJson with per-key extractors; raw payload contains
  keys VSI ignores (e.g. powertrainCombustionEngineECT on Audi A4, also SUPPORTED in preflight, also mirrored to HF).
- Historical evidence = ClickHouse telemetry_hf_points, a trip-window mirror (HfMirrorService, HF_MIRROR_ENABLED) of
  6 native names {speed, powertrainCombustionEngineSpeed, powertrainCombustionEngineECT, obdThrottlePosition,
  obdEngineLoad, powertrainTractionBatteryCurrentPower} + ignition/motion; TTL 90 days; sort key
  (org_id, vehicle_id, signal_name, recorded_at). VSI reads it only for RPM cadence (per trip, link-clipped,
  ≤20 trips / 14 d / 12000 points). LV cadence comes from PostgreSQL battery_measurements.
- Generic CH loaders exist (getSignalFrequencySummary, getBoundedSignalValuePoints) but filter by vehicle_id ONLY
  (no org_id predicate); getTripRpmHfPoints is org+vehicle+trip scoped and accepts signalName.
- Lifecycle: outbox with 5 enum event types, idempotency key, claim lease; VLS hook; post-trip RPM refresh;
  operator backfill; manual MASTER_ADMIN materialize. Materialization never calls providers.
- Consumers (APDS P5A/P5B, capability resolver, DS4 RPM-HF, LV gate) read persisted profile fields via a
  requirements registry; non-materialized keys are ignored (fail-closed). P5B live correlation gate OFF.
- vsi_provider_catalog_axes (P3A, gates OFF) is the only existing link-scoped store keyed by provider-native
  signal name with nullable canonical key.
- No explicit NOT_EVALUATED state exists; keys outside the allowlist are simply absent.
- Production HF signal_name inventory was NOT verified in the handoff session (treat as unknown).

YOUR TASKS
1. Critically evaluate the handoff: identify any claim you consider unproven and state what evidence would prove it.
2. Design a minimal-invasive extension of the EXISTING VSI engine that delivers:
   a. dynamic link-scoped native-key inventory from the snapshot payload (presence + time, no values),
   b. link-scoped historical-observation inventory from telemetry_hf_points for all mirrored signals,
      explicitly separated from cadence (no density label, no tier, no 1 Hz claims outside the RPM/LV contracts),
   c. persistence of unknown native signals with identity (org, vehicle, link, providerIdentity, nativeName),
   d. per-axis tri-state evaluation (EVALUATED_OBSERVED / EVALUATED_NOT_OBSERVED / NOT_EVALUATED{reason}),
   e. progressive refresh after trips and VLS advances using existing hooks and the existing outbox,
   f. source-link-safe attribution identical in strength to P1-f,
   g. zero change to APDS/RPM/LV contracts and zero change to the semantics of the 12 existing keys.
3. Define the data model precisely: which JSON fields are added where, what the contract version becomes,
   what is semantic vs operational for fingerprinting, which (if any) Prisma migration is unavoidable and why,
   and how v2 profiles remain readable by every existing reader.
4. Define the discovery contracts: inputs, outputs, bounds (time window, trip count, point/key caps,
   max_execution_time), tenant and link predicates in SQL, read-status and limitation vocabulary.
5. Recommend safe phases with explicit go/no-go gates, each phase shippable behind a flag defaulting OFF,
   each validated with: unit tests, disposable PostgreSQL + ClickHouse run, production read-only matrix
   (P0-a tooling), and a fleet-wide planned reconcile for the one-time fingerprint bump.
6. Resolve or explicitly defer the open decisions D1–D10 in §13 with rationale.
7. Produce the list of files/functions to change and, for each, the invariant that must hold afterwards.

HARD CONSTRAINTS
- No new engine, store, registry, worker, or scheduler. Extend VsiSignalProfileMaterializationService,
  evaluateVsiSignalProfile, VsiProfileCadenceEvidenceLoader (new method), ClickHouseHfService (org-scoped variant),
  VsiProfileSignalFingerprintV1 (additive), outbox/hook reuse.
- Tenant isolation in SQL and in code. Source-link isolation everywhere. No snapshot/HF conflation.
- Never derive cadence or 1 Hz from counts. Historical observation ≠ cadence proof.
- Never auto-map native names to canonical keys; UNKNOWN_SIGNAL stays terminal; promotion is a registry PR.
- No provider calls in materialization or discovery. No APDS activation. No requirement-spec changes.
- Idempotent materialization, revision-safe profiles, backward-compatible readers, 9-locale i18n for any new UI label.

OUTPUT FORMAT
A single architecture proposal document with: Assessment, Target Model (data + contracts), Change Map
(file → change → invariant), Phases with gates, Decision Log (D1–D10), Risks & Mitigations, Validation Plan,
Explicit Non-Goals. State uncertainty explicitly; do not fabricate production facts.
```

---

## Appendix — Evidence provenance

| Claim group | Evidence type |
|-------------|---------------|
| Code structure, constants, allowlist enforcement points | Repository read at workspace HEAD `c94250d63…` |
| HF ingestion signal set, TTL, sort key | `hf-mirror.service.ts`, `migrations/003_high_frequency_telemetry.sql` |
| Profile shape (12-element array), Audi ECT in VLS + preflight SUPPORTED, no ECT row | Production Prisma read-only (2026-11-02, SHA `85d9795097…`) |
| 0 CONFIRMED_BUG on cohort, RPM HF points present for ICE vehicles | P0-a live matrix on production DB (2026-11-02) |
| Production `signal_name` inventory, `HF_MIRROR_ENABLED` env value | **NOT_VERIFIED** in this session |

No implementation, commit, merge, deploy, or production write was performed for this handoff.
