# Booking Production Test Matrix — Architecture Note

Date: 2026-07-24  
Prompt: Booking Production Readiness 33/34

## Test architecture

Booking production readiness tests are organized in layers:

1. **Pure policy matrices** (`booking-lifecycle-status.matrix.ts`, `booking-eligibility-status-transition.matrix.ts`) — deterministic state rules without I/O.
2. **Characterization specs** (security, concurrency, idempotency, failure injection) — document invariants and compensating actions.
3. **Integration harnesses** (`booking-pickup-gate.integration.spec.ts`, wizard eligibility e2e-flow) — in-memory service wiring.
4. **Frontend unit tests** (filter utils, wizard eligibility, static matrix audit).
5. **Playwright E2E** (`bookings-planner.spec.ts`) — mocked API, no external credentials.

## Privacy boundary

`GET /organizations/:orgId/bookings` list rows use `redactHandoverProtocolForList()`:

- Strips `customerSignatureDataUrl`, `staffSignatureDataUrl`, `customerSignatureName`, `staffSignatureName`.
- Exposes `hasCustomerSignature` / `hasStaffSignature` booleans for UI badges.
- Detail and handover endpoints retain full protocol payloads for authorized pickup/return flows.

## CI entry points

| Command | Scope |
|---------|--------|
| `npm run test:bookings:verify` (backend) | Jest booking suite + security + integration + tsc |
| `npm run test:bookings:verify` (frontend) | Vitest + Playwright planner + build |

See `docs/testing/booking-production-test-matrix.md` for the full requirement mapping.
