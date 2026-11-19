# Bookings — Change Ledger

| Date | Change | Workstream | Notes |
|------|--------|------------|--------|
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