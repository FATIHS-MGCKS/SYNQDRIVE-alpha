# P4 — Core ↔ Rental boundary final audit (in-process Alpha)

**Date:** 2026-11-18 (Europe/Berlin)

**Audited `origin/main`:** `539d7705e18eb9e13303599497f6d39e4c425ed8` (P4-PR4 merged #2426)

**Binding context:** [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) — co-located Rental uses in-process ports; M2M not required for Rental.

## P4 merge baseline

| Slice | PR | Merge SHA |
|-------|-----|-----------|
| P4-PR1 booking resolution port | #2423 | `0ef353f5f9434c3b44e3b5ca001190b46ff0455d` |
| P4-PR2 reconciliation port | #2424 | `acb87a29f164bbb935afa55fb60de3fa4cd9d614` |
| P4-PR3 recompute job handler port | #2425 | `f3368419f2db2c86ac157831d418aaf484587653` |
| P4-PR4 recompute trigger port | #2426 | `539d7705e18eb9e13303599497f6d39e4c425ed8` |

## Audit question

Do **vehicle-intelligence (Core intelligence)** modules still hold **impermissible direct dependencies on Rental business-logic services** after P4-PR1–PR4?

**Scope:** Service/type/module graph for driving intelligence ↔ rental driving analysis. Not a full extraction of every `prisma.booking` read in VI (orthogonal persistence coupling; P4-PR1 addressed DI job repository only).

## Findings

### Direct Core → Rental *service* injection

**None on `main`.** Grep of `backend/src/modules/vehicle-intelligence` shows **no** imports or constructor injection of `RentalDrivingAnalysisService`, `RentalDrivingAnalysisRecomputeTriggerService`, or `RentalDrivingAnalysisRecomputeJobHandler`.

VI consumers use port tokens only:

- `DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT` (P4-PR1; adapter in `bookings/`)
- `RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT` (P4-PR2)
- `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT` (P4-PR3)
- `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT` (P4-PR4)

### `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef`

| Direction | Why the module import exists | Classification |
|-----------|------------------------------|----------------|
| VI → Rental module | Nest must import the module that **exports** port providers (`useExisting` on rental services) so `@Inject(RENTAL_*_PORT)` resolves in VI providers | **COMPOSITION_ROOT_WIRING** |
| Rental → VI module | Rental trigger/adapter/handler inject **Core** `DrivingAnalysisInitService`, `DrivingIntelligenceJobDispatcherService`, driving-metric helpers; reconciliation adapter implements VI-defined port interface | **COMPOSITION_ROOT_WIRING** + **ALLOWED_IN_PROCESS_PLATFORM** (Rental consumes Core platform intelligence services) |

Removing either `forwardRef` without replacing the composition root would break DI; **not** a P4 service-boundary violation.

### Shared types (non-service)

VI imports `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS` / `RentalDrivingAnalysisRecomputeReason` from `rental-driving-analysis.recompute.types` for correlation/idempotency parity. **ALLOWED_IN_PROCESS_PLATFORM** — contract constants, not rental workflow services.

### Rental-internal (explicitly in scope as allowed)

- `BookingsModule` → `RentalDrivingAnalysisModule`
- `BookingsService` → `RentalDrivingAnalysisService` + `RentalDrivingAnalysisRecomputeTriggerService`

**ALLOWED_INTRA_RENTAL** per audit charter (not removed solely due to direct injection).

### Out of P4 violation scope (documented, no fix in this audit)

Several VI trip/attribution/damage services still call `prisma.booking` / `bookingHandoverProtocol` directly. P4-PR1 removed booking reads from `DrivingIntelligenceJobRepository` via port; broader booking persistence decoupling was **not** in P4 acceptance. Classify as **NEEDS_FURTHER_EVIDENCE** for a future slice — **not** `CORE_TO_RENTAL_VIOLATION` for P4 completion.

## Validation (local, 2026-11-18 UTC)

| Check | Result |
|-------|--------|
| `bash architecture/scripts/validate-module-registry.sh` | PASS |
| `bash architecture/dsrg/scripts/validate-graph.sh` | PASS |
| `git diff --check` | PASS (clean tree) |
| P4-related Jest (ports, adapters, consumer parity, scoped DI) | 10 suites / 32 tests PASS |
| `npm run build` (backend) | PASS |

**Production validation:** **NOT_CLAIMED**

## Verdict

**P4 contract decoupling complete** on `539d7705e`: no remaining Core-intelligence → Rental-business-service violations identified. Residual `forwardRef` module cycle is composition-root wiring required by Nest port binding.

**Recommended next phase:** **P5** — Full MA architecture/security audit (per master plan roadmap).