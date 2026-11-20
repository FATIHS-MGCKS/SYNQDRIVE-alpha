# Bookings — Change Ledger

| Date | Change | Workstream | Notes |
|------|--------|------------|--------|
| 2026-11-20 | Final boundary readiness independent review | Governance | [`POST_P6_FINAL_BOUNDARY_INDEPENDENT_REVIEW_2026-11-20.md`](../../platform-reorientation/evidence/POST_P6_FINAL_BOUNDARY_INDEPENDENT_REVIEW_2026-11-20.md); Tasks/Documents ownership NFE |
| 2026-11-20 | Final Core/Rental boundary readiness audit | Governance | [`POST_P6_FINAL_CORE_RENTAL_BOUNDARY_READINESS_AUDIT_2026-11-20.md`](../../platform-reorientation/evidence/POST_P6_FINAL_CORE_RENTAL_BOUNDARY_READINESS_AUDIT_2026-11-20.md) @ `2bf9c19c8`; V-P0-01 … V-P1-04 closed |
| 2026-11-20 | Post-P6 Core/Rental boundary re-audit | Governance | [`POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md`](../../platform-reorientation/evidence/POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md); original six violations closed on `main` `3b5773233`; V-P1-03/04 remain |
| 2026-11-20 | Rental adapter for core document bundle view | POST-P6-BOUNDARY-PR8 | `documents/core-booking-document-bundle-view/*` delegates `getBundleView` |
| 2026-11-20 | VI booking driver pool adapter | POST-P6-BOUNDARY-PR6 | `VehicleIntelligenceBookingDriverPoolAdapter` delegates `booking-allowed-drivers.util` |
| 2026-11-19 | AI vehicle booking context read adapter | POST-P6-BOUNDARY-PR4 | `AiVehicleBookingContextReadAdapter` delegates `VehicleBookingContextService` |
| 2026-11-19 | Voice MCP booking read adapter | POST-P6-BOUNDARY-PR3 | `VoiceBookingReadAdapter` + mapper |
| 2026-11-19 | WhatsApp booking operational read adapter | POST-P6-BOUNDARY-PR2 | `WhatsAppBookingOperationalReadAdapter` + mapper |
| 2026-11-19 | Communication booking snapshot read adapter | POST-P6-BOUNDARY-PR1 | `CommunicationBookingSnapshotReadAdapter` → `findDetail` mapping |
| 2026-11-19 | Post-P6 boundary owner Core classification (#2450) | Governance | [`POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](../../platform-reorientation/evidence/POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md); P0=4 platform violations reconciled |
| 2026-11-19 | Post-P6 boundary audit review remediation (#2450) | Governance | F1 ownership epistemics; P0 CONFIRMED=0; narrow communication `findDetail` port scope |
| 2026-11-19 | Post-P6 Core/Rental boundary audit (READ_ONLY) | Governance | [`POST_P6_CORE_RENTAL_BOUNDARY_AUDIT_2026-11-19.md`](../../platform-reorientation/evidence/POST_P6_CORE_RENTAL_BOUNDARY_AUDIT_2026-11-19.md); P4 VI↔RDA intact; platform `BookingsService` direct deps NFE until ownership |
| 2026-11-19 | Post-P6 agent monorepo guardrails (#2449) | Governance | `MONOREPO_AGENT_GUARDRAILS.md`, `projektregel.mdc`, `Architectur-Updates`; `AGENTS.md` deferred (i18n authority label) |
| 2026-11-19 | Post-P6 monorepo governance correction | Governance | Supersedes #2448 CORE-extraction nav; `POST_P6_MONOREPO_GOVERNANCE_CORRECTION`; next `SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT` |
| 2026-11-19 | P6-PR6 independent review F1–F4 doc remediation | P6-PR6 | Progress ledger DRAFT restore; immutable `ORIGIN_MAIN_SHA`; gap single-category; M2M STEP 3 not STEP 1 |
| 2026-11-19 | P6 certification closeout report + gap classification | P6-PR6 | `BKG-EVID-P6-CERTIFICATION-CLOSEOUT-2026-11-19`; main `8b8a6e3d3`; GO for agreed scope; CORE STEP 1 next |
| 2026-11-19 | P6-PR5E rental category/override policy enum @map closeout | P6-PR5E | foreign/additional/young driver policy columns on two models |
| 2026-11-19 | P6-PR5E org rental rules Prisma @map + ephemeral schema preflight | P6-PR5E | CI column credit_card_required; disposable parity SELECT guard |
| 2026-11-19 | P6-PR5E F1 fingerprint includes effective rental rule values | P6-PR5E | TEST_4 18→19 RULES_CHANGED; confirm ordering documented |
| 2026-11-19 | P6-PR5E real internal eligibility Postgres HTTP | P6-PR5E | Isolated harness; published org rental revisions; 5 HTTP tests; CI 27; Didit mocked |
| 2026-11-19 | P6-PR5D payment_link BookingPaymentRequest Postgres HTTP | P6-PR5D | 5 HTTP tests; Connect seeds; real payment services; Stripe checkout mock only; CI 22 |
| 2026-11-19 | P6-PR5C independent review remediation (F1–F3) | P6-PR5C | CI log redaction; fingerprint vs eligibility tests; 17 Jest expects |
| 2026-11-19 | P6-PR5C disposable Postgres wizard HTTP suite | P6-PR5C | `rental-booking-wizard.http.postgres.integration.spec.ts`; `p6-pr5c-bookings-http-nest.harness.ts`; CI script extended to 16 tests |
| 2026-11-19 | P6-PR5 workflow certification harness + return RDA enqueue | P6-PR5 | `rental-booking-workflow-certification.spec.ts`; handover `BOOKING_COMPLETED` trigger parity |
| 2026-11-19 | P6-PR5B disposable Postgres HTTP lifecycle certification | P6-PR5B | `rental-booking-lifecycle.http.postgres.integration.spec.ts`; `p6-pr5b-disposable-postgres-preflight.ts`; CI script `rental-booking-lifecycle-postgres-ci.sh` |
| 2026-11-19 | P6-PR5B independent review remediation (F1–F4) | P6-PR5B | Fail-closed reachability; GHA `p6-pr5b-rental-booking-postgres-ci.yml`; evidence scope/registry correction |
| 2026-11-19 | P6-PR4A booking-document `ProductLicenseGuard` + HTTP matrix | P6-PR4A | Confirmed TRIAL/non-ACTIVE bypass; fix on Documents + legal-delivery-evidence controllers |
| 2026-11-19 | Independent review remediation F1–F3 on PR #2441 | P6-PR4 | F1 document route guard evidence; manifest SHA/validation; no runtime changes |
| 2026-11-19 | Bootstrap authority `architecture/bookings/` (V0.1) | P6-PR4 | NOT_STARTED → AUDIT_IN_PROGRESS; graph + validators |
| _historical_ | Flat memos `architecture/BOOKING_*` | Various | Supporting evidence only; indexed in EVIDENCE_INDEX |
| _historical_ | P4-PR1 booking resolution port | P4 | Adapter under `bookings/` |
| _historical_ | P6-PR3 ProductLicenseGuard on BookingsController | P6-PR3 | On `origin/main` @ `41fd912a` |