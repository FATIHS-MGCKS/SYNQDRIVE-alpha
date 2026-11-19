# Bookings — Living Architecture Authority (bootstrap, `AUDIT_IN_PROGRESS`)

Canonical architectural memory for the **Rental Bookings** module: wizard through confirm, eligibility, payments coupling, pickup gate, handover, lifecycle, and tenant isolation.

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-11-19 — P6-PR4 bootstrap) |
| **Authority-native status** | Bootstrap V0.1 · repository audit **SUBSTANTIAL** · Production baseline **partial** |
| **Standard** | [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) |
| **Platform context** | [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../platform-reorientation/SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) |
| **Runtime impact** | None in this workstream (documentation only) |

## Scope

- Backend `backend/src/modules/bookings/` and related booking payment routes
- Rental and operator frontend booking surfaces
- Persistence and async document-generation coupling
- Cross-module dependencies (customers, pricing, rental rules, payments, health, RDA, documents)
- P4 booking resolution port for Driving Intelligence jobs
- P6-PR3 `ProductLicenseGuard` on `BookingsController`

## Non-scope

- Master Admin and platform product assignment APIs
- Core trip FSM, DS4 motion, and full Driving Intelligence pipeline semantics (→ Driving Intelligence authority)
- Stripe Connect webhooks and unauthenticated callbacks
- Physical Core/Rental repository extraction (paused)

## Mandatory entry documents

1. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md)
4. [`KNOWLEDGE_GRAPH.md`](KNOWLEDGE_GRAPH.md)
5. [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md)
6. [`evidence/EVIDENCE_INDEX.md`](evidence/EVIDENCE_INDEX.md) · [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md)
7. [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md) · [`contradictions/OPEN_CONTRADICTIONS.md`](contradictions/OPEN_CONTRADICTIONS.md)

## Supporting architecture memos (evidence — not default authority)

- `architecture/BOOKING_*`, `architecture/END_CUSTOMER_PAYMENTS_BOOKING_*`, `architecture/LEGAL_DOCUMENT_PICKUP_GATE_*`, `architecture/VEHICLE_OPERATIONAL_STATE_BOOKING_CUTOVER_*`
- `architecture/platform-reorientation/evidence/P4_PR1_*`, `P4_BOUNDARY_FINAL_AUDIT_*`
- `architecture/platform-product-catalog/CHANGE_RECORD_P6_PR3_*`

## Validation

```bash
bash architecture/bookings/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Neighboring authorities

| Module | Relationship |
|--------|----------------|
| Customers | Contract holder, allowed drivers, eligibility inputs |
| Pricing / Rental Rules | Quotes, tariffs, effective rules for eligibility |
| Payments | Booking payment requests, connect, wizard checkout |
| Documents | Bundles, pickup gate legal delivery |
| Rental Health | Create/update fail-closed health gate |
| Rental Driving Analysis | Detail stress + recompute triggers |
| Driving Intelligence | Consumes booking resolution port (P4) |
| Products / platform catalog | RENTAL product license policy |
| DSRG | Production release path and SHA reconciliation |

## Promotion

`AUTHORITY_ACTIVE` **not** claimed. Remaining gates: bounded Production data counts, full Documents/ProductLicense surface reconciliation, independent review.