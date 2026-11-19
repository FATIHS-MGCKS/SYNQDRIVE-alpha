# P6-PR5E — Real internal rental eligibility (disposable PostgreSQL HTTP)

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (harness wiring) / PENDING (disposable Postgres CI 27/27) / NOT_CLAIMED (Production)

## Scope

Isolated wizard HTTP certification with **real** internal eligibility stack on disposable PostgreSQL:

- `BookingEligibilityGatekeeperService.evaluate`
- `BookingEligibilityEnforcementService`
- `BookingRentalEligibilityService.check`
- `CustomerEligibilityService.evaluateForBooking`
- `CustomerVerificationService.getEligibilityStatus` (Didit network **not** invoked)
- `RentalEffectiveRulesService.computeForVehicle` (published `rental_rule_revisions` + `organization_rental_rules`)

P6-PR5C/PR5D harnesses unchanged (stubs preserved).

## External boundaries (mocked only)

| Boundary | Mock |
|----------|------|
| Didit API | Empty `DiditService` provider |
| Stripe checkout | `P6_PR5C_STRIPE_CHECKOUT_MOCK` |
| Rental health deep probe | `P6_PR5C_RENTAL_HEALTH_MOCK` (`reasons: []`) |
| Document bundles / handover / email payment | Jest no-ops (same as PR5C) |

## Certification tiers

| Tier | Claim |
|------|-------|
| **REAL_GATEKEEPER_VERIFIED** | **YES (when CI green)** — gatekeeper executes without `evaluate()` spy |
| **REAL_CUSTOMER_ELIGIBILITY_DATABASE_VERIFIED** | **YES (when CI green)** — `CustomerStatus.BLOCKED` persisted denial |
| **REAL_RENTAL_RULES_DATABASE_VERIFIED** | **YES (when CI green)** — `minimumAgeYears` via published org revision; supersede changes fingerprint |
| **REAL_CUSTOMER_VERIFICATION_DATABASE_VERIFIED** | **PARTIAL** — MANUAL verified docs/checks + canonical `idVerified`/`licenseVerified`; Didit session path not exercised |
| **ELIGIBILITY_DATABASE_E2E_VERIFIED** | **YES (when CI green)** — preview + confirm paths use real services |
| **CONFIRMATION_DATABASE_E2E_VERIFIED** | **YES (when CI green)** — TEST_1 confirm `CONFIRMED` with real enforcement |
| **FULL_RENTAL_LIFECYCLE_DATABASE_E2E_VERIFIED** | **NOT_CLAIMED** — handover/pickup suites remain P6-PR5B |

### Explicit non-claims

- **REAL_DIDIT_VERIFICATION_VERIFIED**
- **REAL_STRIPE_CAPTURE_VERIFIED**
- **PRODUCTION_VALIDATED**

## Fixtures

| Requirement | Seed (`p6-pr5e-wizard-pg.harness.ts`) |
|-------------|--------------------------------------|
| Entitlement | P6-PR5C org product ACTIVE RENTAL |
| Trusted DOB/license | Customer `idVerified` + `licenseVerified`; VERIFIED docs/checks |
| Published org rules | `rental_rule_revisions` ACTIVE v1 + `organization_rental_rules` |
| Rule change | `supersedeP6Pr5eOrgRentalRules` → v2 ACTIVE, v1 RETIRED |
| Blocked customer | `CustomerStatus.BLOCKED` update before confirm |

## F1 independent review (rule-change / fingerprint)

**Enforcement ordering (confirm):** `BookingEligibilityEnforcementService.assertAllowed` runs **before** `assertWizardPreviewFingerprintMatches`. A restrictive rule change that makes the customer ineligible surfaces **`BOOKING_ELIGIBILITY_NOT_ELIGIBLE`** on confirm — not `BOOKING_ELIGIBILITY_RULES_CHANGED`. Restrictive age denial remains **TEST_3**.

**Fingerprint gap (remediated):** Preview fingerprint previously hashed only `status`, `sourceRuleIds`, and `reasonCodes`. Published org rule change **18 → 19** with a 30-year-old customer stays **ELIGIBLE** but must still invalidate the fingerprint. **CHANGE:** `buildEligibilityPreviewFingerprint` now includes a `rentalRulesFingerprint` segment derived from effective rule field values.

**TEST_4:** Supersedes org revision **18 → 19**, expects **`BOOKING_ELIGIBILITY_RULES_CHANGED`** while `eligibilityStatus` remains `ELIGIBLE`.

## HTTP spec

`backend/src/modules/bookings/rental-booking-wizard-eligibility-real.http.postgres.integration.spec.ts` (5 tests)

Harness: `p6-pr5e-bookings-http-nest.harness.ts`

## CI

| Item | Value |
|------|-------|
| Script | `backend/scripts/test/rental-booking-lifecycle-postgres-ci.sh` |
| Pattern | + `rental-booking-wizard-eligibility-real.http.postgres` |
| Expected total | **27** (4 + 7 + 6 + 5 + 5) |

## Schema parity remediation (P6-PR5E CI)

**Root cause:** `OrganizationRentalRules` in `schema.prisma` omitted `@map` for several columns that migrations create as snake_case (e.g. `credit_card_required`). Prisma Client queried camelCase `creditCardRequired`, which does not exist on disposable PostgreSQL after `migrate deploy`.

**Fix (no new SQL migration):** Add `@map` on `creditCardRequired`, policy enums, and `notes` on `OrganizationRentalRules`, plus policy enums on `RentalVehicleCategory` and `VehicleRentalRequirementOverride`, matching `20260620100000_rental_rules_eligibility` / `20260723130000_rental_rule_revisions`.

**Disposable CI guard:** `rental-booking-lifecycle-postgres-ci.sh` — `SELECT … FROM organization_rental_rules` + `rental_rule_revisions` in `verify_prisma_schema_matches_client`; targeted `ADD COLUMN IF NOT EXISTS` parity for org rental rules columns (ephemeral DB only).

## Validation

```bash
cd backend && npm run build
cd backend && npm run test:bookings:p6-pr5b:postgres:ci
bash architecture/bookings/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
git diff --check
```