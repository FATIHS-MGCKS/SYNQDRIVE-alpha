# P6 — Rental booking certification closeout (repository reconciliation)

**Date:** 2026-11-19 (Europe/Berlin)  
**Repository baseline:** `origin/main` @ `8b8a6e3d3706301be8eff538ed3d2b493ee857b4` (merge of PR #2447)  
**Epistemic:** CONFIRMED from merged code, evidence artifacts, and CI on `main` / PR heads — **NOT_CLAIMED** for Production workflow validation.

## Executive verdict

| Verdict | Result |
|---------|--------|
| **P6_CERTIFICATION_VERDICT** | **GO** — agreed P6 disposable-Postgres modular HTTP certification + P6-PR5 unit/workflow harness + bookings authority bootstrap (`AUDIT_IN_PROGRESS`) are **complete for declared scope**. |
| **FULL uninterrupted lifecycle DB E2E** | **NOT_CLAIMED** — certification is **composable suites**, not one HTTP spec from wizard through return. |
| **BINDING_MONOREPO_ALIGNMENT** | **CONFIRMED** — Alpha is the permanent platform repo; Core/Rental are **logical** domains in one runtime/deployment ([`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../../platform-reorientation/SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md)). Physical repo extraction **PAUSED**. |
| **BOOKINGS_REGISTRY_STATUS** | `AUDIT_IN_PROGRESS` — no `AUTHORITY_ACTIVE` promotion. |

## Merged workstream map (evidence, not titles)

| PR | Merge SHA | Primary deliverable |
|----|-----------|-------------------|
| [#2441](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2441) | `a159c80e7` | `architecture/bookings/` authority bootstrap; registry `NOT_STARTED` → `AUDIT_IN_PROGRESS` |
| [#2442](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2442) | `7850c589d` | `ProductLicenseGuard` on booking-document HTTP routes |
| [#2443](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2443) | `d403806f7` | Workflow certification harness; return-handover `BOOKING_COMPLETED` RDA enqueue parity |
| [#2444](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2444) | `2103bc896` | Disposable Postgres **handover** HTTP (7) + preflight (4); CI workflow |
| [#2445](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2445) | `c40ad9768` | Wizard HTTP with **stubbed** eligibility (`pay_on_pickup`); invoice unpaid |
| [#2446](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2446) | `d292cf86ac` | `payment_link` + real `BookingPaymentRequest` persistence (inherits PR5C eligibility stubs) |
| [#2447](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2447) | `8b8a6e3d3` | **Real internal eligibility** HTTP suite (5); CI **27/27** on disposable Postgres |

**CI anchor:** GitHub Actions run success on `8b8a6e3d3` (PR #2447 merge); disposable Postgres script `backend/scripts/test/rental-booking-lifecycle-postgres-ci.sh` expects **27** Jest tests.

## Certified capability matrix

Legend — **EVIDENCE_LEVEL:** `CI_POSTGRES` = disposable Postgres + opt-in env; `UNIT` = Jest without disposable DB; `HTTP_MATRIX` = license HTTP tests; `AUTHORITY` = documentation audit only.

| # | Capability | VERIFIED_BEHAVIOR | EVIDENCE_PATH | EVIDENCE_LEVEL | REAL_COMPONENTS | MOCKED_BOUNDARIES | CI_VERIFICATION | REMAINING_LIMITATION |
|---|------------|-------------------|---------------|----------------|-----------------|-------------------|-----------------|----------------------|
| 1 | Product licensing & tenant isolation | 403 without ACTIVE `RENTAL`; cross-org booking 404 | `rental-product-license.*`, `rental-booking-lifecycle.http.postgres`, wizard specs | CI_POSTGRES + UNIT | `ProductLicenseGuard`, org scoping | Auth via test header | PR5B/C/D/E suites | Master Admin bypass in harness |
| 2 | Wizard draft & quote persistence | Wizard draft `PENDING`; quote consumed | `rental-booking-wizard.http.postgres.integration.spec.ts` | CI_POSTGRES | `BookingWizardDraftService`, `PricingQuoteService`, Prisma | Bundles, some side-effect queues | PR5C suite (6) | Not combined with handover in one spec |
| 3 | Customer eligibility & verification | **PR5E:** real `CustomerEligibilityService` + verification read path + BLOCKED deny. **PR5C/D:** stubbed customer/verification | `rental-booking-wizard-eligibility-real.http.postgres.integration.spec.ts`, `BKG-EVID-P6-PR5E-REAL-ELIGIBILITY-DATABASE-2026-11-19`; PR5C evidence for stub path | CI_POSTGRES (PR5E) | Gatekeeper, enforcement, rental eligibility (PR5E) | Didit network; rental health mock; PR5C stubs on other suites | PR5E (5 tests) | Live Didit KYC **not** verified |
| 4 | Published rental rules & fingerprint | Published org revisions; 18→19 supersede → `RULES_CHANGED`; age rule deny | PR5E spec + `booking-wizard-eligibility.util` unit | CI_POSTGRES + UNIT | `RentalEffectiveRulesService`, fingerprint segment | PR5C uses rules stub | PR5E TEST_3/4 | Category/vehicle revision stacks lightly exercised |
| 5 | Booking confirmation | HTTP confirm `CONFIRMED`; idempotent replay; enforcement on confirm | PR5C/E/D specs | CI_POSTGRES | `BookingEligibilityEnforcementService` (PR5E real); PR5C bounded | Stripe, email | Combined 27-test job | Production confirm under live rules **not** claimed |
| 6 | Payment intent & payment_link persistence | `BookingPaymentRequest` row; Connect gates; Stripe session failure surfaces | `rental-booking-wizard-payment-link.http.postgres.integration.spec.ts` | CI_POSTGRES | Payment request repo/service, wizard payment flow | Stripe checkout API, payment email | PR5D (5 tests) | Webhooks/settlement **not** verified |
| 7 | Invoice unpaid invariant | `OrgInvoice` not `PAID` after wizard confirm (`pay_on_pickup`, `payment_link`) | PR5C/D specs | CI_POSTGRES | Invoice lifecycle on confirm | — | PR5C/D | Paid settlement paths **not** certified |
| 8 | Document prerequisites & pickup gate | Pickup blocked without bundle; gate HTTP | `rental-booking-lifecycle.http.postgres`, pickup gate specs | CI_POSTGRES + UNIT | Pickup gate services | Bundle generation in some paths | PR5B | Async document worker **not** verified |
| 9 | Pickup/return handover FSM | CONFIRMED→ACTIVE→COMPLETED; vehicle status; idempotent pickup | `rental-booking-lifecycle.http.postgres.integration.spec.ts` | CI_POSTGRES | `BookingsHandoverService` HTTP | RDA enqueue mocked in PR5B | PR5B (7 HTTP) | Wizard-created bookings **not** in same spec |
| 10 | Vehicle status & DB persistence | RENTED on pickup; AVAILABLE on return | PR5B HTTP assertions | CI_POSTGRES | Prisma `vehicles` | — | PR5B | — |
| 11 | RDA `BOOKING_COMPLETED` trigger | `enqueueForBooking` on RETURN handover (service + HTTP mock path) | PR5 workflow evidence; PR5B mock; handover spec | UNIT + CI_POSTGRES | Trigger service call site | Job worker, Redis durability | PR5B partial | Worker completion **NOT_CLAIMED** |
| 12 | Async processing & external services | N/A as end-to-end | P6-PR5 non-claims | — | — | Stripe, Didit, Bull, email, real rental health | — | See gap list below |

## Gap classification

| Gap | Category | Rationale |
|-----|----------|-----------|
| Single-spec wizard→return Postgres E2E | **D** | Useful hardening; P6 scope explicitly modular (PR5B vs PR5C/E/D). |
| Live Didit verification sessions | **C** | Rental production launch / KYC; PR5E covers DB+manual path only. |
| Stripe capture, webhooks, settlement | **C** | Production payments; PR5D covers persistence + mocked checkout. |
| Redis/Bull queue durability in certification harness | **D** | Test harness mocks queues; durable worker behavior not part of P6 Postgres scope. |
| Document generation/delivery workers (Production) | **C** | Rental launch — async bundle generation not verified in disposable CI. |
| Outbound transactional email delivery | **C** | Payment email mocked in PR5C/D/E harness. |
| Real `RentalHealthService` deep dependencies | **D** | Mocked open in Postgres HTTP harnesses; production health separate. |
| Production deployed SHA workflow validation | **C** | Repo/CI certified; Production drift documented in `AUDIT_MANIFEST.md`. |
| `AUTHORITY_ACTIVE` promotion (bookings module) | **D** | Separate governance audit / promotion gate — **not** a P6 disposable-Postgres certification blocker. |
| Post-P6 logical Core↔Rental boundary review (inside Alpha) | **D** | Follow-on READ_ONLY audit; P4 baseline [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](../../platform-reorientation/evidence/P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md) — not physical extraction. |
| Rental rules module authority (`NOT_STARTED` registry row) | **D** | Documentation inventory only; orthogonal to P6 Postgres certification. |
| M2M activation for **separately deployed** non-Rental product backends | **C** | External product integration gate — **not** required for co-located Rental in Alpha. |

### Remaining P6 certification blockers (category A)

**None** for the **declared** P6 disposable-Postgres + workflow harness scope. Category **D** governance items and explicit non-goals (full lifecycle single spec, Production) do **not** reopen P6.

## Architectural navigation (binding monorepo — current)

Per owner decision **2026-11-16** (paused extraction) and monorepo documentation **2026-11-18**:

- **SYNQDRIVE-alpha** remains the **central active platform repository** (one NestJS app, one deployment, shared DB).
- **SYNQDRIVE-CORE** is a **paused reference fork** — do **not** restart physical repository extraction.
- Co-located Rental uses **in-process** Core platform services and **user JWT** — **external M2M is not required** for Rental.
- P6 Postgres certification does **not** imply a separate deployable Rental or Core backend.

**Determination:** Certification mock boundaries (Didit/Stripe/email) are **not** monorepo architecture violations.

## Smallest next executable operation (current)

**`SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT`** — READ_ONLY_FIRST review of remaining **logical** Core→Rental dependencies inside Alpha, starting from P4 boundary evidence. Scope and classification vocabulary: [`POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md`](../../platform-reorientation/evidence/POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md).

Optional Rental follow-ups (category D, not blocking): compose wizard→handover in one disposable spec; Production read-only workflow sample; rental-rules module audit.

## Historical navigation (SUPERSEDED — #2448 as merged)

The following text was published in PR #2448 before monorepo governance correction; **do not use** for current architecture decisions:

- Recommended **`SYNQDRIVE-CORE_P3+_EXTRACTION_CONTINUATION`**
- STEP 1/2/3 physical repository extraction and separate Core/Rental deployables as the active path
- `CORE_SEPARATION_READY` framing tied to SYNQDRIVE-CORE independence

**Superseded by:** this amendment + [`POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md`](../../platform-reorientation/evidence/POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md).

## Validation (closeout commit)

```bash
bash architecture/bookings/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
git diff --check
```

## Registry review

| Module | REGISTRY_REVIEWED | Status |
|--------|-------------------|--------|
| Bookings | **UNCHANGED** | `AUDIT_IN_PROGRESS` — closeout evidence only |