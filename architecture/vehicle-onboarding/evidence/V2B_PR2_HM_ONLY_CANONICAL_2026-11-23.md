# V2B-PR2 — HM_ONLY canonical registration (implementation)

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR2_HM_ONLY_CANONICAL_REGISTRATION`  
**Status:** IMPLEMENTED / MERGED pending  
**Production flag:** `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` default **false** (unchanged)

## Scope delivered

- `HmOnlyCanonicalRegistrationService` orchestrates `adoptProviderSource` → capture baselines → `evaluateAndSealReadiness` → `activateVehicle` (no inline `vehicle.create` on canonical path).
- `VehicleRegistrationConvergenceService.registerHmOnlyCanonical` delegates to orchestrator when flag routes to convergence port.
- Idempotency key: `hm-only-canonical-register:v1:{organizationId}:{hmVehicleId}` with resume for REGISTERED mirror + completed case.
- Nest wiring: `VehicleOnboardingActivationRailModule` + slim `VehicleRegistrationConvergenceModule` (HM does not import full VO graph).
- **Recovery hardening:** no fabricated HV battery defaults; operator evidence via optional DTO fields only; no raw Prisma identity mutation.
- **PR #2509 mismatch:** GitHub associated V2B title with Organizations P4 branch — use NEW draft PR on `cursor/vehicles-v2b-pr2-hm-only-canonical-44c2`.
- Unit specs: orchestration, idempotent replay, readiness fail-closed, tenant/VIN guards; legacy routing specs unchanged (flag OFF).
- PG-03: `PLACEHOLDER_NOT_E2E_VERIFIED` — real PostgreSQL E2E in V2B-PR3 only (`V2B_HM_ONLY_CANONICAL_PG=1`).

## Explicit non-effects

- No billing hook suppression (`VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` still NOT_ARMABLE).
- No production flag arm; no deploy.
- OWN-1…OWN-6 unchanged (**OWNER_APPROVAL_REQUIRED**).

## Validation (agent)

- Jest: `hm-only-canonical-registration.service.spec.ts`, convergence foundation, HM convergence routing, V2A characterization.
- `npm run build` (backend) PASS.
- `validate-module-registry.sh` PASS; `vehicle-onboarding/scripts/validate-graph.sh` PASS.