# Bookings — Agent Contract

**Registry coverage status:** `AUDIT_IN_PROGRESS`  
**Authority-native status:** Bootstrap V0.1

## Read-first sequence (substantive Bookings work)

1. [`README.md`](README.md) and this contract
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md) — Production access and drift
4. [`KNOWLEDGE_GRAPH.md`](KNOWLEDGE_GRAPH.md) and `graph/*.yaml`
5. [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md)
6. Central registry Bookings row and section in [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md)
7. Neighboring authorities when touching Customers, Pricing, Rental Rules, Payments, Documents, Rental Health, RDA, Driving Intelligence

## Substantive change definition

Any change to booking lifecycle transitions, eligibility policy, wizard confirm semantics, pickup gate, handover protocol, payment coupling, overlap locking, permission modules, product license application, DI booking port, or booking API/UI contracts.

## Same-workstream duties

- Update this authority (`CURRENT_STATE`, graph, decisions, evidence index, gaps) in the **same PR** when behavior or boundaries change.
- Run validators before merge (see below).
- Report `REGISTRY_REVIEWED` for Bookings and every affected neighbor module.

## Registry synchronization

- Bookings remains `AUDIT_IN_PROGRESS` until promotion gate in `MODULE_AUTHORITY_STANDARD.md` is met.
- Do **not** promote to `AUTHORITY_ACTIVE` without Production baseline completeness and independent review.
- Update central registry overview row when metadata changes; update detailed Bookings section when scope/validation/docs change.

## Ownership boundaries

| Owns | Does not own |
|------|----------------|
| Booking aggregate lifecycle, wizard, eligibility enforcement stack, handover, allowed drivers, booking HTTP API (controller) | Trip segments, DS4 runs, full DI event detection |
| P4 booking resolution **adapter** implementation files under `bookings/` | Core VI orchestration semantics |
| Booking-scoped orchestration calling Payments/Documents/RDA | Stripe webhook semantics, SaaS billing |
| Rental/operator UI **booking surfaces** (functional contracts) | Master Admin product assignment |

Core must not depend on Rental **business services**; Rental consumes Core via ports/DI (see Platform Master Plan).

## Prohibited

- Production mutations during audits
- Silent removal of documented gaps/contradictions
- Treating flat `architecture/BOOKING_*` memos as overriding this authority without reconciliation

## Validation commands

```bash
bash architecture/bookings/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
cd backend && npm test --testPathPatterns=bookings-security-negative
```

## Completion report (bookings-affecting PRs)

Include: authority paths updated, `REGISTRY_REVIEWED` lines, validator results, Production claims (only if evidence-backed).