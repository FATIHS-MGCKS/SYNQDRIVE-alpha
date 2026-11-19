# Bookings — Evidence Index

| ID | Type | Title | Location |
|----|------|-------|----------|
| BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19 | CURRENT_CODE | F1 document route guard inspection | [`BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19.md`](BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19.md) |
| BKG-EVID-CODE-MODULE-001 | CURRENT_CODE | Module inspection 2026-11-19 | `backend/src/modules/bookings/`, frontend rental/operator |
| BKG-EVID-PROD-RUNTIME-001 | PRODUCTION_OBSERVATION | VPS presence + health | [`PRODUCTION_BASELINE.md`](PRODUCTION_BASELINE.md) |
| BKG-EVID-ARCH-PAYMENT-INTENT-001 | ARCHITECTURE_DOCUMENT | Payment intent vs paid | `architecture/BOOKING_PAYMENT_INTENT_VS_PAID_2026-07-14.md` |
| BKG-EVID-ARCH-RETROACTIVITY-001 | ARCHITECTURE_DOCUMENT | Eligibility retroactivity | `architecture/BOOKING_ELIGIBILITY_RETROACTIVITY_2026-07-23.md` |
| BKG-EVID-ARCH-PICKUP-GATE-001 | ARCHITECTURE_DOCUMENT | Legal pickup gate | `architecture/LEGAL_DOCUMENT_PICKUP_GATE_2026-07-22.md` |
| BKG-EVID-ARCH-DOC-LIFECYCLE-001 | ARCHITECTURE_DOCUMENT | Document lifecycle | `architecture/BOOKING_DOCUMENT_LIFECYCLE_2026-06-13.md` |
| BKG-EVID-AUDIT-P4-001 | AUDIT_DOCUMENT | P4 Core/Rental boundary | `architecture/platform-reorientation/evidence/P4_*` |
| BKG-TEST-GUARD-STACK-001 | CURRENT_TEST | Guards + product license | `bookings-security-negative.spec.ts`, `rental-product-license.controllers.spec.ts` |
| BKG-TEST-WIZARD-001 | CURRENT_TEST | Wizard + invoice bootstrap | `booking-wizard-*.spec.ts` |
| BKG-TEST-ELIGIBILITY-001 | CURRENT_TEST | Eligibility stack | `booking-eligibility-gatekeeper/*.spec.ts` |
| BKG-TEST-PORT-DI-001 | CURRENT_TEST | DI booking port | `driving-intelligence-booking-resolution/*.spec.ts` |