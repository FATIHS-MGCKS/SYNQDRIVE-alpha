# DS4 Fleet-Wide Eligibility & Production Activation Gates

| Field | Value |
|-------|-------|
| **Document ID** | `DI-DESIGN-DS4-FLEET-WIDE-ELIGIBILITY-V1` |
| **Status** | `IMPLEMENTED` (policy code) · **NOT** globally activated |
| **Owner decision** | DS4 is the single driving-behaviour authority for **all** orgs/vehicles/onboardings when the chain is ready |
| **Calibration cohort** | Four production reference vehicles — validation/replay only (`ds4-assessment-calibration-cohort.v1.ts`) |

## Eligibility policy (assessment L2)

**Module:** `backend/.../ds4-assessment/ds4-assessment-eligibility-policy.v1.ts`

| Rule | Behaviour |
|------|-----------|
| Scope identity | Canonical UUIDs for `organizationId`, `vehicleId`, `tripId` |
| Tenant isolation | When vehicle/trip/motion-run org is loaded, it must match `scope.organizationId` |
| Vehicle allowlist | **None** — fleet-wide by design |
| Provider capability | Assessed from motion payload / contract after `SUCCEEDED` run (not at scope gate) |
| Evidence quality | `RATED` / `UNRATED_COUNTS_ONLY` / `INSUFFICIENT_EVIDENCE` / `FAILED` — not legacy fallback |
| Speed partition | `C4_ONLY` vs `C5_1_PREFERRED` preserved in payload contract |

**Removed:** `evaluateDs4AssessmentFleetAdmissionV1` four-UUID production gate and outbox discovery `vehicle_id = ANY(fleet…)`.

## Readiness gaps (pre–global activation)

| Gap | Owner / module | Notes |
|-----|----------------|-------|
| Motion-core shadow allowlists | `DI_V0_MOTION_CORE_SHADOW_*` + S4 allowlists | Empty allowlist → **no shadow runs** → assessment stays `PENDING`. Fleet-wide assessment requires shadow pipeline enablement per org/vehicle policy, not assessment UUID list |
| Trip DI boundary admission | Trip FSM + `TripDiBoundaryAdmissionService` | Assessment must not bypass boundary release; processor should enforce admission record where wired |
| Legacy driving score | `TripDrivingImpact` / HF paths | Must not backfill non-rated DS4 trips with legacy scores when DS4 is authority |
| Impact V2 numeric publication | `DS4_IMPACT_V2_*` | Scores remain disabled until calibration; ordinal/count paths only |
| Consumer surfaces | Trip UI, DriverScore, rental | No activation until read contracts and Figma/product gates pass |
| Cross-provider evidence matrix | Driving Intelligence authority | Future onboardings need provider-capability registry (R1 vs software integration vs …) distinct from per-trip evidence quality |
| Ordinal trip rating | `ordinalTripRatingApproved` quality policy | Default false — fleet-wide `RATED` requires explicit owner approval |
| Operational observability | DSRG / ops | Fleet-wide roll-out needs shadow+assessment lag, outbox depth, and tenancy violation alerts |

## Required code changes (remaining)

| Priority | Change |
|----------|--------|
| P0 | Motion-core + S4 control plane: replace fixed four-vehicle env allowlists with **tenant-safe rollout policy** (org-scoped enablement, optional staged vehicle lists — not hardcoded UUID table in assessment code) | **Implemented (PR-F):** `DS4_FLEET_MOTION_ADMISSION_POLICY_V1` + `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED` (default OFF) |
| P0 | Assessment processor: load `Vehicle.organizationId` + trip org on `processMotionRun` and pass into scope eligibility (DB-backed tenancy) |
| P1 | Wire trip DI boundary admission check before persist (fail-closed `PENDING` / explicit reason, not legacy HF) |
| P1 | Internal/public read API: expose assessment status + reason codes for non-rated states (no numeric legacy substitute) |
| P2 | Provider capability catalog (evidence index) linked to motion bundle version + speed authority path |
| P2 | Deprecate reason code `VEHICLE_NOT_IN_ASSESSMENT_FLEET` in new rows (historical rows may retain) |

## Test coverage

| Suite | Coverage |
|-------|----------|
| `ds4-assessment-eligibility-policy.v1.spec.ts` | Fleet-wide scope, invalid UUID, cross-tenant motion run org |
| `ds4-assessment-calibration-cohort.v1.spec.ts` | Four calibration vehicles isolated from admission |
| `ds4-trip-assessment-v1.engine.unit.spec.ts` | Onboarded vehicle `PENDING` without motion run; invalid scope `FAILED` |
| `ds4-assessment-worker.postgres.integration.spec.ts` | Discovery for **non-calibration** tenant vehicle |
| Postgres CI | 15 tests (`di-v0-ds4-assessment-postgres-ci.sh`) |
| Future | Motion-core allowlist rollout integration; multi-org postgres tenancy matrix; boundary admission block paths |

## Production activation gates (all required)

1. **Motion-core shadow** runnable for target orgs (worker + non-empty allowlist policy aligned with fleet-wide intent, or successor rollout mechanism).
2. **DS4 assessment worker** flags ON (`DI_V0_DS4_ASSESSMENT_*`) only after owner authorization — separate from shadow flags.
3. **Fable / calibration** sign-off on calibration cohort + reference distributions (Impact V2 weights, ordinal policy).
4. **No legacy score fallback** attestation in CI (legacy isolation + product contract tests).
5. **Critical CI green** including S4A postgres, dormant audit, DB guard, architecture validators.
6. **Consumer cutover plan** documented (Trip UI, APIs, DriverScore) — out of scope for PR-A worker-only path.
7. **Rollback:** assessment flags OFF; shadow allowlists reversible; persisted DS4 rows remain historical truth.

**Explicit non-goals until gates pass:** global flag ON, production deploy for activation, legacy HF enrichment for unrated trips.
