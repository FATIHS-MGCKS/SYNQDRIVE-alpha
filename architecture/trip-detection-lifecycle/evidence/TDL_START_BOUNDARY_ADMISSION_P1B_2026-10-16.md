# TDL — Trip Start Boundary Admission P1B (runtime shadow wiring)

| Field | Value |
|-------|-------|
| **Epistemic** | `CONFIRMED` (code + unit tests; shadow default OFF) |
| **Decision status** | `PROPOSED` / `VALIDATED` (shadow only — no cutover) |
| **Predecessor** | P1A offline resolver (PR #2055) |
| **Related trip** | `358d0158-b2a9-47ed-af26-33926c5770b4` (Tesla token `186946`) |

## Decision register

| Phase | Role | Canonical writer |
|-------|------|------------------|
| **P1A** | Offline evidence-backed resolver + unit matrix | N/A (not wired) |
| **P1B** | Runtime shadow at start confirmation | **Legacy** `resolveConfirmedStartBoundary` |
| **P1C / P2** | Admission policy + cutover (future) | TBD — requires explicit governance |

**Invariants (P1B):**

- Legacy remains canonical writer for `confirmedStartAt`, `startBoundaryAdjustedMs`, `createTrip.startTime`, merge/recovery boundaries.
- P1A shadow proposes boundaries only under `shadowStartBoundaryAdmission` observability.
- No `VehicleTrip` mutation from shadow deltas.
- Env gate `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED` default **OFF**.
- Optional shadow-only route fetch: `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED` default **OFF** (no extra provider budget when legacy had segment match).

## Core principle (unchanged from P1A)

Provider segment existence may establish candidate trip context, but physical start-boundary authority requires temporally localized movement corroboration. Shadow comparison does **not** assert physical correctness of proposed start — it surfaces corroboration gaps vs legacy.

## Tesla reference (offline replay via P1B tests)

| Axis | Value |
|------|-------|
| Legacy canonical | `2026-10-16T03:36:00.000Z` |
| Shadow proposed | `2026-10-16T03:38:26.989Z` |
| Delta | `+146989 ms` |
| Decision | `PROVIDER_START_UNCORROBORATED` |

## Integration modality

Resolved read-only from active DIMO `VehicleDataSourceLink` connection-identity metadata (`verifiedModality`). Not inferred from EV/ICE profile or segment detection mechanism. Fail-open → `UNKNOWN`.

## Validation

```bash
cd backend && npx jest trip-start-boundary-admission
```
