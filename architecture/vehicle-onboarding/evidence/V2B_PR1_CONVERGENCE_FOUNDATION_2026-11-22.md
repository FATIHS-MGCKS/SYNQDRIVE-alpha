# V2B-PR1 — Convergence foundation (dark, default OFF)

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR1_CANONICAL_CONVERGENCE_FOUNDATION`  
**Prerequisite:** V2A draft PR #2497 (**not merged at implementation** — branch includes V2A commits for test parity).  
**Mode:** Dark foundation — **no** production behavior change when flags unset.

## Shipped

| Item | Location |
|------|----------|
| Convergence config (default OFF, fail-closed validation) | `backend/src/config/vehicle-registration-convergence.config.ts` |
| Port + stub service (fail-closed when armed) | `backend/src/modules/vehicle-onboarding/convergence/*` |
| HM routing gate (legacy path when OFF) | `HighMobilityRegistrationService` |
| Billing hook suppress gate (inactive when OFF) | `VehiclesService.create` |
| Tests | `*.config.spec.ts`, `*.foundation.spec.ts`, `*.convergence-routing.spec.ts`, `vehicles.service.create-billing-convergence.spec.ts` |

## Flags (default `false`)

- `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED`
- `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` (requires HM canonical — startup throws otherwise)

## Production behavior @ defaults

- HM_ONLY: **legacy** inline transaction unchanged.
- Manual create: **legacy** billing hook unchanged.
- DIMO: **unchanged** (no convergence wiring on Master DIMO path).

## Next

V2B-PR2: implement `registerHmOnlyCanonical` behind HM flag with PG harness.

**NOT DEPLOYED / NOT PRODUCTION_VERIFIED / FLAGS NOT ARMED**