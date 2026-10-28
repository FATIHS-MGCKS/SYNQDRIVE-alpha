# DS4 Driving Impact V2 Contract

| Field | Value |
|-------|-------|
| **Document ID** | `DI-CONTRACT-DS4-DRIVING-IMPACT-V2` |
| **Status** | `IMPLEMENTED` — score publication **DISABLED** (PR-A) |
| **Table** | `di_v0_ds4_trip_driving_impact_v2` |
| **modelVersion** | `DS4_IMPACT_V2_0` |
| **scoreAuthority** | `DS4` |

## Input boundary

Impact V2 consumes **Assessment L2 output only**. It must not read HF SMART5, native LTE counters, `VehicleTrip.drivingScore`, or legacy `trip_driving_impact`.

## Score publication (PR-A)

| Field | PR-A behaviour |
|-------|----------------|
| `operationalLoadIndex` | Always `null` |
| `scorePublicationStatus` | `DISABLED_MODEL_NOT_CALIBRATED` |
| `publicationReason` | `MODEL_NOT_CALIBRATED` |

Reference distribution interface: `ds4-reference-distribution.v1.ts` (`ds4_reference_distribution_v1`, `calibrated: false`).

## Operational load JSON

Stores raw ordinal value lists and explicit `UNAVAILABLE` dimensions (HF abuse, kickdown, exposure normalization, etc.) without numeric composite score.

## Code

- Engine: `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-driving-impact-v2.engine.ts`
