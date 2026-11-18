# Monorepo architecture — documentation alignment

**Date:** 2026-11-18 (Europe/Berlin)
**Operation:** `SYNQDRIVE_ALPHA_MONOREPO_ARCHITECTURE_DOCUMENTATION_ALIGNMENT`
**Mode:** `DOCUMENTATION_ONLY` — **no** product logic, schema, or registry row changes
**Owner decision:** **CONFIRMED** — architecture **not** redesigned

## Documents updated

| Document | Change |
|----------|--------|
| [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) | § Binding monorepo architecture; P4 scope clarification; P5 **IN_PROGRESS** |
| [`PROGRESS_LEDGER.md`](../PROGRESS_LEDGER.md) | Appended P5-B2/B3 merge rows + governance alignment row |
| [`AGENTS.md`](../../../AGENTS.md) | Binding monorepo invariants for agents |
| [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../../SYNQDRIVE_RENTAL_ARCHITECTURE.md) | Registry synopsis § (overview rows unchanged) |

## Validated invariants (documented)

1. SYNQDRIVE-alpha = central active platform repository.
2. Core + Rental = logical domains, same runtime/deployment.
3. Core ownership list (Master Admin, IAM/entitlements, vehicles/trips, Trip FSM, DS4/DBI, intelligence, shared infra).
4. Rental ownership list (bookings, customers, payments/contracts, rules/workflows, rental UI/analysis).
5. Core product-neutral — no direct Rental business-service dependencies (P4 reviewed scope).
6. Rental → Core via ports, DI, guards; co-located M2M **not** required.
7. External apps consume versioned Core APIs.
8. External access requires full authZ stack; gates respected.
9. External/M2M APIs not claimed production-ready by default.
10. Physical Core/Rental extraction **PAUSED/SUPERSEDED** — do not restart.

## P4 vs P5 status

- **P4:** Documented as completing **reviewed service-boundary** scope only ([`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md)).
- **P5:** Roadmap status **PLANNED → IN_PROGRESS** with merged evidence (#2428–#2433 on `main` @ `0a20ccb8f`).
- **P6/P7:** Sequencing preserved (P6 blocked on P5; P7 owner priority).

## Validation (this PR)

| Check | Result |
|-------|--------|
| Relative doc links (manual spot-check) | PASS |
| `bash architecture/scripts/validate-module-registry.sh` | PASS |
| `git diff --check` | PASS |
| Application source changes | **NONE** |

**REGISTRY_REVIEWED:** UNCHANGED