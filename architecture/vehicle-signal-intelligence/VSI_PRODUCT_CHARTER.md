# Vehicle Signal Intelligence — Product Charter

| Field | Value |
|-------|-------|
| **Status** | CANONICAL product vision (documentation) |
| **Registry module** | Vehicle Signal Intelligence (VSI) |
| **Established** | 2026-10-15 |
| **P0+P1 code baseline** | Merged PR #2034 @ `eb5f1f2ee238d2d52ce587c9e920fd1548e19901` on `main` |
| **Epistemic** | CONFIRMED (repository) · Production deploy of P0+P1 profile store **not asserted here** |

---

## Mission

VSI automatically **discovers**, **evaluates**, **persists**, and **continuously maintains** the actual signal capabilities of every onboarded vehicle and every active **provider-source connection** (`VehicleDataSourceLink`).

VSI is the system of record for **what signals a connection can declare**, **what has been empirically observed**, **how fresh and reliable observations are**, and **how that picture changes over time** — stratified by connection identity (modality, telemetry family, provider binding).

VSI exists to prevent product and engineering drift: consumers must not infer capability from ad-hoc snapshot keys, poll success, or vehicle-level preflight without explicit provenance.

---

## Product outcomes (mandatory capabilities)

### 1. Provider-declared signal discovery (DIMO `availableSignals`)

- Persist and reuse **provider-declared** catalog evidence from DIMO preflight (`vehicle_driving_capabilities`, `vehicle_battery_capabilities`, and future normalized catalog stores).
- Declared discovery may require **bounded DIMO HTTP** during onboarding or scheduled refresh — owned jointly with **Vehicle Onboarding** and **DIMO Integration**; VSI owns the **semantic contract** of declared axes on profiles.
- **Never** treat generic `UNSUPPORTED` or absent rows as `NOT_LISTED` without explicit `availableSignals` negative proof (see P0+P1 resolver rules).

### 2. Empirical verification (telemetry-grounded)

- Derive observation status from **persisted** telemetry paths: primarily `VehicleLatestState` (+ bounded poll-log context), scoped by `providerBindingId` and connection identity.
- Empirical axes are **link-scoped**; vehicle-level VLS without binding match does not attribute to a specific link.

### 3. Per-vehicle and per-provider-link capability profiles

- Durable profiles keyed by `(organizationId, vehicleId, providerSourceLinkId)` with contract version, revision, fingerprint, and limitation ledger.
- Profiles are the **product artifact**; VSI-03 P2C per-poll observation ledger is optional forensic infrastructure, not the product loop.

### 4. Signal freshness, cadence, reliability, and quality

- Separate **provider source time** (`sourceTimestamp`), **reception time** (`providerFetchedAt`), **persistence time** (`updatedAt`), and **projection time** (`projectionAsOf`).
- Classify freshness and connectivity using VDC-aligned thresholds where applicable; quality dimensions expand in roadmap P3+.

### 5. Signal fingerprints and changing availability

- Content fingerprints detect when declared + empirical snapshot changes without requiring blind re-fetch.
- Track catalog advancement vs telemetry advancement for idempotent materialization and drift triggers (P7).

### 6. Consumer-specific signal requirements

- Domains (Driving Intelligence EXP021, Battery V2 LV/HV, trips, health modules) declare **required canonical signals** and minimum evidence classes.
- VSI does not embed domain scoring algorithms; it supplies **capability truth** those algorithms consume.

### 7. Domain-approved alternative signals and fallback algorithms

- Fallback and substitution semantics are **owned by domain modules** (e.g. Battery V2 method profiles, DI speed QC policies).
- VSI may expose **resolver hints** (P4) but does not silently substitute signals for product outcomes.

### 8. APDS demand-aware polling optimization

- APDS optimizes **when and what** to poll given demand, profiles, and safety gates.
- VSI supplies **read-only capability truth** to APDS (P5+); APDS owns scheduling, cohorts, shadow epochs, and provider request shaping.

### 9. Continuous profile reconciliation and drift detection

- Lifecycle hooks (onboarding, link activation/deactivation, device swap, catalog refresh, VLS advance) re-materialize profiles.
- Drift between declared, observed, and consumer expectations is explicit, measurable, and actionable (P7).

---

## Semantic distinctions (non-negotiable)

| Concept | Meaning | Typical evidence |
|---------|---------|------------------|
| **Provider catalog presence** | Signal listed or explicitly not listed in provider `availableSignals` / preflight metadata | Cached preflight rows, future per-link catalog snapshots |
| **Actual observation** | Canonical payload contained a usable value for the signal in the link-scoped VLS window | VLS `rawPayloadJson`, composer empirical axes |
| **Freshness** | Age of provider source time vs policy thresholds | `sourceTimestamp`, freshness classifiers |
| **Physical transmission** | Device/network path delivered bytes (distinct from API poll scheduling) | VDC episodes, webhook vs snapshot provenance |
| **Provider polling** | Worker/API poll attempt occurred | `dimo_poll_logs` — **does not** prove catalog or strict source advance alone |
| **Source timestamp advancement** | Strict monotonic provider observation instant advanced | VDC/VSI strict-advance rules; poll SUCCESS ≠ advance |

### UNKNOWN vs UNSUPPORTED

- **`UNKNOWN`** — insufficient or ambiguous provenance; **does not** deny future support.
- **`UNSUPPORTED` / `NOT_LISTED`** — only with **positive** provider catalog or domain-gated proof.
- **Rule:** `UNKNOWN` must **never** automatically mean `UNSUPPORTED` or suppress consumer retries.

---

## Architecture boundaries

| Owner | Responsibility |
|-------|----------------|
| **Vehicle Onboarding (VO)** | Vehicle registry, consents, `VehicleDataSourceLink` lifecycle, `connectionIdentity`, activation of provider bindings |
| **VO-SIG** | Connection identity assurance, reconciliation audits feeding VSI scope keys |
| **Vehicle & Device Connectivity (VDC)** | Connectivity runtime, monotonic VLS ingest, physical episodes, poll vs advance semantics |
| **DIMO Integration** | Auth, telemetry API, segments, triggers; gateway for provider HTTP |
| **VSI** | Capability profiles, declared vs observed reconciliation, fingerprints, availability intelligence |
| **Driving Intelligence** | Trip-bound behavior, EXP021 pipelines, domain speed/QC policies |
| **Battery V2** | LV/HV health models, capability preflight writers, measurement gates |
| **APDS (R5 shadow)** | Adaptive polling decisions, shadow epochs, demand — **consumer** of VSI truth (future) |

---

## Implementation lineage (reconnaissance map)

| Track | Role today | Authority / code |
|-------|------------|------------------|
| **VSI-02** | Canonical signal key contracts, alias safety | `canonical-signal-keys.ts`, evidence contracts |
| **VSI-03 P1** | Read-only composer (four canonical signals) | `VSI03_P1_READONLY_COMPOSER.md`, `VsiReadonlySignalComposerService` |
| **VSI-03 P2C** | Optional forensic per-poll ledger (default OFF) | `VSI03_P2C_SOURCE_OBSERVATIONS.md` |
| **P0+P1 profiles** | Declared + observed evaluator, durable Postgres profiles | PR #2034, `CURRENT_STATE.md` |
| **Preflight** | DIMO `availableSignals` cache | Driving capability + battery capability preflight services |
| **VLS** | Empirical carrier + binding | `vehicle_latest_states`, snapshot processor |

---

## Explicit non-goals (charter-level)

- Replacing DIMO Segments or Trip Detection trip boundaries.
- Owning APDS shadow activation, epoch pins, or production polling policy (until P5/P6 governance).
- Auto-enabling VSI03 capture or strict-advance read flags without separate authorization.
- Using GraphQL field omission as proof that provider HTTP was skipped (see cross-workstream contracts).

---

## Related documents

- [`VSI_MASTER_ROADMAP.md`](VSI_MASTER_ROADMAP.md)
- [`VSI_CROSS_WORKSTREAM_CONTRACTS.md`](VSI_CROSS_WORKSTREAM_CONTRACTS.md)
- [`VSI_PRODUCT_GOVERNANCE.md`](VSI_PRODUCT_GOVERNANCE.md)
- [`CURRENT_STATE.md`](CURRENT_STATE.md)
- [`evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md`](evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md)
