# VO-3 — Provider-neutral orchestrator & atomic activation

| Field | Value |
|-------|-------|
| **Slice** | VO-3 runtime foundation |
| **Repository anchor** | `d8632edf8a0ee82d099acc411b5a11b6fc2ed13b` (main post #1851) |
| **Module status** | `AUDIT_IN_PROGRESS` |
| **Public cutover** | **NO** |

## Delivered

- `VehicleOnboardingModule` (`backend/src/modules/vehicle-onboarding/`)
- `OnboardingSourceSnapshotV1` + draft JSON V1 contracts
- DIMO / HM / MANUAL source adapters (mirror-only, no provider network on case open)
- Case open/resume with org-scoped idempotency
- Source attachment (composite-capable)
- Transition policy (no product readiness engine)
- `VehicleOnboardingReadinessAuthority` + test fixture; production fail-closed default
- Atomic activation transaction (vehicle, org assignment, plate, links, consent, mirror, outbox)
- PostgreSQL integration tests (idempotency, VIN conflict, tenant isolation, rollback, concurrency)
- Legacy path characterization tests (synthetic DIMO VIN debt unchanged on legacy path)

## Non-goals (explicit)

- No `registerFromDimo` / HM-only / manual POST cutover
- No VO-4 readiness engine
- No production migration beyond VO-2
- Billing not invoked from canonical activation

## Activation outbox

- Event: `VEHICLE_ACTIVATED`
- Idempotency: `vehicle-onboarding:VEHICLE_ACTIVATED:v1:{onboardingCaseId}`
