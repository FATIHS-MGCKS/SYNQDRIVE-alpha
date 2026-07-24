# Booking — Production Test Matrix (Prompt 33/34)

Audit date: 2026-07-24

## Summary

This matrix maps booking production-readiness requirements to automated tests, CI commands, and manual-only checks. It closes critical gaps across security, lifecycle, concurrency, idempotency, failure injection, privacy, and frontend surfaces.

---

## CI / local verification

| Layer | Script | Command |
|-------|--------|---------|
| Backend unit + security + integration | `backend/scripts/test/booking-backend-verify.sh` | `cd backend && npm run test:bookings:verify` |
| Backend unit only | same | `cd backend && npm run test:bookings:verify:unit` |
| Frontend vitest + e2e + build | `frontend/scripts/test/bookings-verify.sh` | `cd frontend && npm run test:bookings:verify` |
| Backend booking Jest subset | `backend/package.json` | `cd backend && npm run test:bookings` |
| Frontend booking Vitest subset | `frontend/package.json` | `cd frontend && npm run test:bookings` |
| Booking Playwright E2E | `frontend/e2e/bookings-planner.spec.ts` | `cd frontend && npm run test:bookings:e2e` |

### Full gate (typecheck + lint + tests)

```bash
# Backend
cd backend && npx tsc --noEmit && npm run lint:all && npm run test:bookings:verify

# Frontend
cd frontend && npx tsc -b && npm run lint:all && npm run test:bookings:verify
```

---

## Matrix

Legend: **A** = automated (CI), **P** = partial / characterization, **M** = manual-only

### SECURITY

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| Every permission | P | `booking-controller-permissions.characterization.spec.ts`, `booking-eligibility.permissions.*.spec.ts` | A |
| Every role (driver read / admin manage) | A | `bookings-security-negative.spec.ts`, `booking-allowed-drivers.policy` | A |
| Active member without permission | A | `bookings-security-negative.spec.ts` (null/undefined role) | A |
| Foreign organization | P | `bookings-security-negative.spec.ts` (where-clause invariant), legal-documents pickup gate foreign tenant | A |
| Foreign relation IDs | P | `booking-allowed-drivers.service.spec.ts` (customer not in org) | A |
| Manipulated organizationId | P | Security negative + OrgScopingGuard on controller | A |
| Mass assignment | P | `bookings-security-negative.spec.ts` (strip quote/eligibility fields) | A |
| Nested Prisma payload | P | Security negative documents `organization.connect` rejection pattern | A |
| Sensitive response fields | A | `booking-handover-privacy.util.spec.ts` + list redaction in `bookings.service.ts` | A |
| Signature access (detail vs list) | A | List redacts signatures; detail/handover endpoints retain full protocol | A |
| Finance access | M | Invoice/payment endpoints scoped by org — see payments module tests | P |

### STATE MACHINE

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| Allowed PATCH transitions | A | `booking-lifecycle-status.matrix.spec.ts` | A |
| Forbidden PATCH transitions (ACTIVE/COMPLETED) | A | lifecycle matrix + `bookings.service.ts` handover gate | A |
| Terminal states (notes-only) | A | `booking-lifecycle-status.matrix.spec.ts` | A |
| Admin override (eligibility) | A | `booking-eligibility-approval.service.spec.ts` | A |
| Cancel | A | `resolveCancelTransition` + `bookings.service.cancel` | A |
| No-show | A | `resolveNoShowTransition` + `markNoShow` guardrails | A |
| Pickup | A | `booking-pickup-gate.integration.spec.ts`, handover service | A |
| Return | A | `booking-pickup-gate.integration.spec.ts`, handover RETURN status gate | A |
| Eligibility sub-machine | A | `booking-eligibility-status-transition.matrix.spec.ts` | A |

### CONCURRENCY

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| 100 parallel creates | P | `booking-concurrency.characterization.spec.ts` (overlap gate race) | A |
| Parallel quote usage | P | `bookings.service.overlap.spec.ts`, pricing quote consume | P |
| Parallel updates | M | DB unique constraints + overlap — full PG race: manual/staging | M |
| Cancel vs pickup | P | `booking-concurrency.characterization.spec.ts` | A |
| Return vs edit | P | `booking-concurrency.characterization.spec.ts` (terminal immutability) | A |
| Version conflict | P | Wizard `eligibilityPreviewFingerprint` in `booking-wizard-draft.service.spec.ts` | A |

### IDEMPOTENCY

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| Client timeout + retry | P | `booking-idempotency.characterization.spec.ts` | A |
| Same key + same body | A | `booking-wizard-draft.service.spec.ts`, `booking-wizard-eligibility-e2e-flow.spec.ts` | A |
| Same key + different body | P | Idempotency characterization (documented contract) | A |
| Parallel same keys | M | Requires Redis/queue integration — staging | M |
| Duplicate events | P | `booking-pickup-gate.integration.spec.ts` (pickup replay) | A |
| Duplicate consumer execution | M | Outbox worker dedup — business-audit module | M |

### FAILURE INJECTION

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| Invoice service down | A | `booking-invoice-bootstrap.behavior.spec.ts` | A |
| Document service down | P | `booking-failure-injection.characterization.spec.ts` | A |
| E-mail service down | M | Resend integration — staging | M |
| Queue/Redis down | P | Failure injection (fire-and-forget cancel tasks) | A |
| Worker crash | M | PM2 restart + outbox replay — ops manual | M |
| DB timeout | M | Staging chaos | M |
| Error after booking insert | A | Invoice bootstrap rollback test | A |
| Error after outbox insert | M | Business audit outbox — separate module | M |
| Object storage down | M | Document storage integration — staging | M |
| Signature migration interrupted | M | Ops migration scripts — manual | M |
| Pickup gate fail-closed | A | `booking-eligibility-fail-closed.spec.ts`, pickup gate integration | A |

### DATENSCHUTZ

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| No signatures in lists | A | `booking-handover-privacy.util.ts` + spec | A |
| Data minimization per role | P | Driver policy + permissions guards | P |
| Legal acceptance version | A | Legal documents + pickup gate integration | A |
| Document hash | A | Legal documents integrity tests | A |
| Retention | M | Ops retention policies — not booking-specific | M |
| Log redaction | P | `booking-failure-injection.characterization.spec.ts` | A |

### FRONTEND

| Requirement | Coverage | Test / artifact | Status |
|-------------|----------|-----------------|--------|
| Pagination | P | List loads `limit: 500` client-side; server pagination via `findAll` | P |
| Filter | A | `bookingUtils.test.ts`, `bookings-planner.spec.ts` | A |
| Calendar navigation | A | `bookings-planner.spec.ts` view switch | A |
| Timeline | A | `bookings-planner.spec.ts` default view | A |
| Mobile touch | M | Responsive manual QA (320px) — follow-up e2e project | M |
| Keyboard | M | a11y manual / future axe gate | M |
| Error vs empty state | A | `bookings-planner.spec.ts` scenarios 5–6 | A |
| Version conflict UI | P | `booking-wizard-eligibility.test.ts` (rules_changed) | A |
| DE / EN | A | `bookings-planner.spec.ts` scenario 7 | A |

---

## Key test files (backend)

| File | Domain |
|------|--------|
| `booking-lifecycle-status.matrix.ts` | Canonical status transition rules |
| `booking-handover-privacy.util.ts` | List signature redaction |
| `bookings-security-negative.spec.ts` | Tenant + RBAC + mass assignment |
| `booking-concurrency.characterization.spec.ts` | Overlap race + terminal races |
| `booking-idempotency.characterization.spec.ts` | Retry / replay contracts |
| `booking-failure-injection.characterization.spec.ts` | Compensating actions |
| `booking-controller-permissions.characterization.spec.ts` | Endpoint permission map |
| `booking-eligibility-status-transition.matrix.spec.ts` | Eligibility gate machine |
| `booking-pickup-gate.integration.spec.ts` | Pickup gate + handover idempotency |
| `booking-wizard-draft.service.spec.ts` | Wizard confirm + idempotent replay |
| `bookings.service.overlap.spec.ts` | Vehicle overlap conflict |

## Key test files (frontend)

| File | Domain |
|------|--------|
| `bookingUtils.test.ts` | Filter / search / terminal hide |
| `booking-wizard-eligibility.test.ts` | Checkout gate + error mapping |
| `booking-production-test-matrix.test.ts` | Static audit of matrix completeness |
| `e2e/bookings-planner.spec.ts` | Planner UI flows (mocked API) |
| `e2e/bookings-planner-fixtures.ts` | Stateful booking list mocks |

---

## Manual-only checks

These require staging credentials, hardware, or human judgment and are **not** CI gates:

1. **Finance role isolation** — verify invoice/refund endpoints reject users without `invoices.read` across org boundary.
2. **100 concurrent real creates** — k6/Artillery against staging Postgres with unique vehicles; expect exactly one winner per window.
3. **Parallel quote consumption** — two wizard confirms on same `quoteId`; second must 409.
4. **E-mail / Resend outage** — confirm booking still completes; document email queued or surfaced as retryable warning.
5. **Redis/BullMQ outage** — confirm API remains available; tasks catch up after recovery.
6. **Mobile touch targets** — physical device QA on handover signature pad (min 44px).
7. **Keyboard-only planner** — tab through toolbar, filters, and booking drawer without mouse.
8. **Signature migration resume** — ops script interrupt + resume on copy bucket.
9. **Retention purge** — verify cancelled booking PII ages out per org policy (ops).

---

## Tenant-safe test data

- All automated tests use synthetic org IDs (`org-1`, `org-booking-e2e`, harness orgs).
- No production org/vehicle/customer IDs.
- E2E mocks are in-memory route handlers — no external services.
- Integration harnesses scope `organizationId` in every Prisma `where` clause.

---

## Flaky test policy

- No `setTimeout` sleeps in booking tests.
- E2E uses `serial` mode for booking planner to avoid mock state races.
- Concurrency characterization uses deterministic single-threaded mock (not real PG race).

---

## Related documentation

- `docs/testing/legal-documents-ci-e2e-coverage.md` — template for CI gate structure
- `architecture/BOOKING_ELIGIBILITY_RETROACTIVITY_2026-07-23.md` — eligibility architecture

---

## Changelog

- **2026-07-24** — Initial booking production test matrix (Prompt 33): lifecycle matrix, privacy redaction, security negatives, verify scripts, planner E2E.
