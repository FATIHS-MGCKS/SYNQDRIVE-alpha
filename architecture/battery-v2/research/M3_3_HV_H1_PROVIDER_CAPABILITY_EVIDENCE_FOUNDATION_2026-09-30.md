# M3.3-HV-H1 — Provider capability + evidence quality + freshness + charge-session linkage foundation

**Date:** 2026-09-30  
**Mode:** ENGINEERING + AUTHORITY (pure contracts, read-only report CLI; **no** schema, deploy, HV shadow activation, customer SOH, E3, F6, synthetic GT)  
**Starting main:** `bc17542000d253d4704264f65480c35904769efb`  
**Production (unchanged):** release `20260929224455_v4994` @ `1dd4224037a84417c5d605575bb6d288ac93184e`

---

## Executive result

| Field | Value |
|-------|-------|
| **H1_SCOPE** | HV evidence foundation — capability matrix, freshness semantics, evidence quality, session↔evidence linkage, longitudinal **input candidate** design only |
| **H1_ENGINEERING_STATUS** | **CONTRACTS + READ_ONLY_REPORT IMPLEMENTED** (no Nest runtime wiring) |
| **SCHEMA_CHANGE** | **NO** |
| **H1_RUNTIME_REACHABLE** | **NO** (CLI + unit tests only) |

Contracts (code):

- `M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1` — `hv-h1/m3-3-hv-h1-provider-capability-matrix.*`
- `M3_3_HV_H1_EVIDENCE_QUALITY_V1` — `m3-3-hv-h1-evidence-quality.evaluator.ts`
- `M3_3_HV_H1_SESSION_EVIDENCE_LINKAGE_V1` — `m3-3-hv-h1-session-evidence-linkage.ts`
- `M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1` — types only (no degradation model)
- `M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1` — `m3-3-hv-h1-evidence-readiness-report.service.ts` + `npm run battery:hv-h1:evidence-readiness-report`

Validator: `architecture/battery-v2/scripts/validate-h1-provider-evidence-contracts.sh`

---

## 1. H0 inheritance (unchanged)

H0_SHARED/LV/HV/CROSS_SCOPE_SEAL=PASS. D3/F5/E2/E3 remain **LV_ONLY**. H1 does **not** reuse LV degradation logic.

---

## 2. HV signal universe (code-verified)

| Dimension | Count |
|-----------|-------|
| HV_REGISTRY_KEY_COUNT | **12** (11 `hv.*` + `dimo.segments.recharge`; excludes `lv.voltage`) |
| HV_MAPPER_FIELD_COUNT | **12** (HV float/boolean DIMO fields in `SIGNAL_SPECS` + `BOOLEAN_SIGNAL_SPECS`, excludes LV voltage) |
| HV_DISTINCT_CURRENT_SURFACE_COUNT | **13** (union + mapper-only `powertrainTractionBatteryCurrentVoltage`) |

Authoritative inventory builder: `buildM3_3HvH1SignalInventory()` in `m3-3-hv-h1-signal-inventory.ts`.

**Pack temperature / gross capacity / HV voltage (H1 posture):**

| Signal | H1 role |
|--------|---------|
| **PACK_TEMPERATURE** | **CONTEXT_ONLY** — registry + capability; no default scientific method consumer |
| **GROSS_CAPACITY** | **CONTEXT_ONLY** (`GROSS_CAPACITY_REFERENCE` method) — not usable capacity |
| **HV CURRENT VOLTAGE** | **UNKNOWN_NEEDS_PROVIDER_AUDIT** — mapper-only; not capability-preflighted |

---

## 3. Provider capability matrix V1

**Source authority:** persisted `VehicleBatteryCapability` rows + existing `resolveHvMethodProfile()` (no duplicate capability truth).

Per-vehicle rows expose: `organizationId`, `vehicleId`, `provider`, `signalKey`, `capabilityStatus`, `checkedAt`, `lastSeenAt`, `sourceTimestamp`, `methodEligibility`, `freshnessClass`, `qualityClass`, plus **PROVIDER_LISTED** vs **VEHICLE_AVAILABLE** (`providerListed` / `vehicleAvailable` / `lastProviderValuePresent` / `lastProviderTimestampPresent` / `currentStatus`).

**Capability statuses (Prisma `BatteryCapabilityStatus`):** `AVAILABLE`, `AVAILABLE_STALE`, `AVAILABLE_NULL`, `NOT_LISTED`, `QUERY_ERROR`, `UNSUPPORTED`, `DEGRADED`, `UNAVAILABLE`.

Preflight assessor maps probe states via `mapPreflightStatusToPersistence()` in `battery-capability-preflight.assess.ts`.

---

## 4. Freshness authority (orthogonal clocks)

Documented in `m3-3-hv-h1-freshness.semantics.ts`:

| Semantic | Authority |
|----------|-----------|
| **SOURCE_OBSERVED_AT** | Per-signal DIMO `timestamp` |
| **PROVIDER_RECEIVED_AT** | Poll ingestion `receivedAt` |
| **COLLECTION_LAST_SEEN_AT** | `signalsLatest.lastSeen` |
| **CAPABILITY_CHECKED_AT** | `VehicleBatteryCapability.checkedAt` |
| **SESSION_START_AT / SESSION_END_AT** | `HvChargeSession` boundaries |

**Invariants preserved:**

- Fresh capability preflight **does not** prove fresh scientific measurement.
- Collection `lastSeen` **does not** override stale per-signal provider timestamp (`DEFAULT_CAPABILITY_STALE_THRESHOLD_MS` = 6h in preflight assessor).

Freshness classes in matrix: `FRESH_PROVIDER_TIMESTAMP`, `STALE_PROVIDER_TIMESTAMP`, `CAPABILITY_CHECK_RECENT`, `COLLECTION_LAST_SEEN_ONLY`, `UNKNOWN`.

---

## 5. Evidence quality V1

Pure evaluator `evaluateM3_3HvH1EvidenceQualityV1` — fail-closed **scientificEligible**; distinguishes availability, timestamp, freshness, method eligibility, context-only signals. Reason codes include `FAIL_CLOSED_SCIENTIFIC`, `CONTEXT_ONLY_SIGNAL`, `METHOD_NOT_SUPPORTED`, etc.

Reuses capability quality classes; does **not** introduce a competing Prisma enum.

---

## 6. Provider observation / replay (no regression)

Existing policies unchanged:

- `evaluateBatteryProviderObservation` — `battery-provider-observation.policy.ts`
- `evaluateHvSnapshotObservation` — `hv-snapshot-observation.policy.ts`

HV snapshot persist reasons: `FIRST_OBSERVATION`, `NEW_PROVIDER_TIMESTAMP`, `CHARGING_STATE_CHANGE`, `CABLE_STATE_CHANGE`, `NEW_PROVIDER_SOH`, `VALUE_CHANGE_NEW_TIMESTAMP`.

Skip reasons: `DUPLICATE_OBSERVATION`, `STALE_REPLAY`, `OUT_OF_ORDER`, `INVALID_TIMESTAMP`, `UNCHANGED_POLL`.

H1 does not alter these code paths.

---

## 7. HV snapshot authority

Composite snapshot `anchorObservedAt` is **ANCHOR_ONLY** — not proof all fields observed simultaneously. SOC/energy/SOH evaluated per-signal via provider observation policy.

---

## 8. Charge session ↔ evidence linkage V1

Pure contract `buildM3_3HvH1SessionEvidenceLinkageV1` classifies fields (SOC, energy, added energy, M2/M3 metadata, provider timestamp, GT) as `DIRECT`, `WINDOW_DERIVED`, `SESSION_AGGREGATE`, `PROVIDER_SEGMENT`, `FALLBACK`, `UNLINKED`.

Session quality reason codes verified in `hv-charge-session-quality.status.ts` (full list matches H0 audit).

---

## 9. ERD ↔ HV BI ownership seal

| Field | Result |
|-------|--------|
| **ERD_PHYSICAL_EVENT_AUTHORITY** | **YES** — recharge/refuel segment boundaries & physical episode semantics (KG-EED) |
| **HV_BI_EVIDENCE_AUTHORITY** | **YES** — HV interpretation, `HvChargeSession` persistence, M2/M3 shadows, method profiles |
| **DUPLICATED_EVENT_AUTHORITY** | **NO** — BI consumes segment identity; ERD owns physical event taxonomy |

Code host under `battery-health/hv-charge-session/*` is transitional storage only.

---

## 10. M2 / M3 / provider SOH (audit)

| Method | Status | Scientific role | Output maturity |
|--------|--------|-----------------|-----------------|
| **M2** | Implemented (`hv-capacity-m2.policy.ts`) | Shadow capacity from currentEnergy/(SOC/100) | **METHOD_SHADOW_EVIDENCE** — not customer SOH |
| **M3** | Implemented (`hv-capacity-m3.policy.ts`) | Shadow capacity from addedEnergy/deltaSOC on DIMO segment sessions | **METHOD_SHADOW_EVIDENCE** |
| **Provider SOH** | Distinct provider evidence | **PROVIDER_OBSERVATION** — not SynqDrive-derived SOH | **CUSTOMER_PUBLICATION=NO** (existing publication gates unchanged) |

**METHOD_IDENTITY_REQUIRED=YES**, **CROSS_METHOD_POOLING_DEFAULT=NO**.

---

## 11. Readiness dimensions (separate booleans)

`evaluateM3_3HvH1Readiness`: `capabilityReady`, `freshnessReady`, `sessionEvidenceReady`, `m2EvidenceReady`, `m3EvidenceReady`, `providerSohReady`, `longitudinalInputReady`.

---

## 12. Provider gaps (implemented integrations only)

| Gap | Notes |
|-----|-------|
| Mapper-only pack voltage | Not in capability registry |
| Provider SOH per-VIN | Often `NOT_LISTED` until provider exposes signal |
| Pack temperature / gross capacity | Provider-dependent |
| Recharge segments | Separate probe `dimo.segments.recharge` |
| Per-signal timestamps | Required for scientific eligibility; missing → fail-closed |

**HV_PROVIDER_GAP_COUNT=5** (documented gaps above; no speculative HM/Tesla beyond DIMO code paths).

---

## 13. Ground Truth

Shared store supports `batteryScope=HV`. H1 documents future correlation surfaces only — **GROUND_TRUTH_VALIDATION_PERFORMED=NO**, no G4-HV calibration.

---

## 14. Read-only operator report

```bash
cd backend
BATTERY_HV_H1_ALLOW_PRODUCTION_READONLY=true \
  npm run battery:hv-h1:evidence-readiness-report -- \
  --organization-id=<org> --vehicle-id=<veh> [--as-of=ISO]
```

Read-only Prisma reads; org+vehicle scoped; no writes.

---

## 15. Machine anchor

```
M3_3_HV_H1_RESULT=PASS
H1_RUNTIME_REACHABLE=NO
SCHEMA_CHANGE=NO
CUSTOMER_HV_HEALTH_SCORE_CREATED=NO
RECOMMENDED_NEXT_STAGE=M3.3-HV-H2 (HV longitudinal input engineering — after natural evidence maturation)
```
