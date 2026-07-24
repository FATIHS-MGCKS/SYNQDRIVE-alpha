# Booking — Post-Remediation Production Readiness Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `booking-post-remediation-production-readiness-2026-07` |
| **Prompt** | **34 of 34** (closure) |
| **Remediation scope** | Booking Production Readiness Prompts 1–33 |
| **Audited commit** | `3bc99019` (branch `cursor/booking-test-matrix-6eff`, includes Prompt 33 test matrix) |
| **Baseline branch** | `main` |
| **Audit date** | 2026-07-24 UTC |
| **Remediation date** | 2026-07-24 UTC (branch `cursor/booking-production-go-6eff`) |
| **Auditor** | Cursor Cloud Agent (independent re-verification) |
| **Method** | Direct code inspection, negative security review, test execution — **not** prior prompt completion messages |

---

## Remediation Update (2026-07-24)

Branch `cursor/booking-production-go-6eff` addresses all **P0** findings and the listed **P1** planner/IAM/lifecycle items:

| ID | Status | Remediation |
|----|--------|-------------|
| P0-BOOK-001 | ✅ Fixed | Advisory xact lock + overlap inside create/update TX |
| P0-BOOK-002 | ✅ Fixed | `@RequirePermission('bookings', …)` on controller |
| P0-BOOK-003 | ✅ Fixed | Redaction on today/pickups + today/returns |
| P0-BOOK-004 | ✅ Fixed | CreateBookingDto / UpdateBookingDto + sanitizer |
| P1-BOOK-001 | ✅ Fixed | Matrix wired in BookingsService |
| P1-BOOK-002 | ✅ Fixed | PATCH blocks terminal transitions via matrix |
| P1-BOOK-003 | ✅ Fixed | cancel() guards + idempotent CANCELLED |
| P1-BOOK-004 | ✅ Fixed | bookings.read on GET handlers |
| P1-BOOK-005 | ✅ Fixed | Rental contract routes permissioned |
| P1-BOOK-006 | ✅ Fixed | Truncation banner when meta.total > loaded |
| P1-BOOK-007 | ✅ Fixed | Mobile agenda fallback (<640px) |
| P1-BOOK-008 | ✅ Fixed | useLanguage in planner components |
| P1-BOOK-009 | ✅ Fixed | Calendar prev/next month navigation |

### Updated release recommendation: **CONDITIONAL GO**

Deploy after: merge to `main`, full test matrix re-run, staging parallel-create smoke test.

| Criterion | Post-remediation |
|-----------|------------------|
| No open P0/P1 findings | ✅ P0 closed; P1 planner/IAM/lifecycle closed (P2 remain) |
| No full signatures in list payloads | ✅ All list/dashboard surfaces redacted |
| Every booking endpoint has explicit permission | ✅ Core CRUD + rental contract |
| No HTTP payload → direct Prisma input | ✅ Validated DTOs |
| Calendar, timeline, mobile work | ✅ Improved (staging QA still advised) |

---

## Executive Summary (original audit — commit `3bc99019`)

The Booking remediation (Prompts 1–33) delivers **material progress**: a central eligibility gatekeeper on create/update/wizard-confirm/pickup, pickup gate with legal-document prerequisites, pricing-quote consumption with atomic mark-consumed, invoice bootstrap compensation on create failure, list-signature redaction on paginated `GET /bookings`, lifecycle policy matrices with tests, and a documented test matrix with **315 backend + 58 frontend unit tests + 7 Playwright E2E scenarios** passing on the audited commit.

**Production release is not recommended today.**

Independent re-audit found **open P0 and P1 findings** that violate the stated Go criteria: core booking CRUD lacks granular `bookings.*` permissions (any active org member including `DRIVER` can create/cancel/handover), HTTP bodies map to raw Prisma input types (mass-assignment surface), double-booking protection is application-level only (TOCTOU race), lifecycle transition matrix is documented but **not wired into runtime services**, dashboard list endpoints still return full signature bitmaps, and the frontend planner silently truncates at 500 bookings with weak mobile/calendar/i18n readiness.

### Release recommendation: **NO-GO**

| Criterion (user-defined Go gate) | Result |
|----------------------------------|--------|
| No open P0/P1 findings | ❌ **FAIL** — 4× P0, 9× P1 open |
| Security + concurrency tests green | ⚠️ **PARTIAL** — tests pass but do not prove DB-level race safety |
| No full signatures in list payloads | ❌ **FAIL** — `today/pickups`, `today/returns` |
| Every booking endpoint has explicit permission | ❌ **FAIL** — 22+ handlers on `BookingsController` |
| No HTTP payload → direct Prisma input | ❌ **FAIL** — `POST`/`PATCH` use `Prisma.Booking*Input` |
| Follow-up processes recoverable + monitored | ⚠️ **PARTIAL** — outbox/audit exists; wizard invoice sync swallowed |
| Calendar, timeline, mobile work | ❌ **FAIL** — mobile timeline unusable; calendar month stuck |
| Migrations + rollback documented | ⚠️ **PARTIAL** — migrations exist; no booking-specific rollback runbook |

**Technische Einschätzung:** Booking ist **teilweise production-hardened**, aber **nicht Go-fähig** ohne Behebung der P0/P1-Findings und Konsolidierung der Remediation-Branches auf `main`.

**DSGVO / ISO:** **technisch DSGVO-ready** für Teilmengen (Tenant-Scoping, partielle Datenminimierung, Legal-Delivery-Evidence am Pickup). **ISO-Control-ready** für IAM/Logging/Outbox-Muster — **organisatorische Nachweise** (DPIA, Verarbeitungsverzeichnis, Incident-Runbooks, Pen-Test-Sign-off) **noch erforderlich**. Keine formale Zertifizierung behauptet.

---

## Go / No-Go Decision

### **NO-GO** for production deployment of the audited tip

Deploy only after:

1. All **P0** findings remediated and re-verified.
2. **P1** findings either remediated or explicitly accepted in writing with compensating controls.
3. Consolidated release branch on `main` with full test matrix re-run.
4. Staging smoke: parallel create race test, permission matrix, signature list audit, mobile planner QA.

---

## 1. Audit Method

### 1.1 What was re-verified (not trusted from prior prompts)

- `BookingsController` + related controllers (documents, payments, legal evidence)
- `BookingsService.create/update/cancel/markNoShow`, `BookingsHandoverService`
- Prisma schema + migrations (`booking_eligibility_*`, handover protocols, pricing quotes)
- List/detail/dashboard response shapes (signature + PII)
- Frontend planner (`BookingsView`, `BookingsPage`, timeline/table/calendar)
- Test execution on audited commit
- Negative checks: forbidden fields, foreign orgId, parallel overlap simulation, list payload scan

### 1.2 Negative tests performed

| Test | Method | Result |
|------|--------|--------|
| Forbidden status via PATCH | Code trace `bookings.service.ts` update path | ❌ `CANCELLED`/`NO_SHOW`/`COMPLETED` not blocked on PATCH (only `CONFIRMED→ACTIVE`) |
| Foreign `organizationId` in body | Controller accepts Prisma types; service overrides `organization.connect` on create | ⚠️ Mitigated on create; update uses `where: { id }` without org in WHERE |
| Parallel bookings same vehicle | `assertNoVehicleOverlap` outside transaction; no DB exclusion constraint | ❌ Race possible (P0) |
| Duplicate wizard confirm | `booking-wizard-draft.service.ts` idempotent replay | ✅ Confirmed booking returns `idempotent: true` |
| Invoice bootstrap failure | Compensating `deleteMany` after create | ✅ Test passes; non-atomic saga (P2) |
| List signatures | `redactHandoverProtocolForList` on `findAll` | ✅ Paginated list redacted |
| Dashboard list signatures | `findTodaysPickups`/`findTodaysReturns` | ❌ Full `customerSignatureDataUrl` returned |
| Pickup without legal evidence | `booking-pickup-gate.service.ts` | ✅ Hard block when evidence missing |
| Rental contract download permission | `documents.controller.ts:42-54` | ❌ No `@RequirePermission` |
| 500+ bookings UI | `BookingsView` fetches `limit: 500` once, ignores `meta.total` | ❌ Silent truncation |
| Mobile 320px timeline | `BookingsTimelineView` `min-w-[900px]` | ❌ Horizontal scroll only |
| DST midnight | Backend `booking-day-window.util.spec.ts` | ✅ Backend tested; frontend uses browser-local TZ |

---

## 2. Complete Finding List

### P0 — Production blockers (must fix)

| ID | Area | Finding | Evidence | Repro / test |
|----|------|---------|----------|--------------|
| **P0-BOOK-001** | Concurrency | **Double-booking race** — overlap check is check-then-act outside create transaction; no PostgreSQL exclusion constraint | `bookings.service.ts` L219-224 then L326-334; `booking-conflict.util.ts` L27-35; schema has index only, no exclusion | Two parallel `POST /bookings` same vehicle/window → both can succeed; `booking-concurrency.characterization.spec.ts` mocks only |
| **P0-BOOK-002** | Authorization | **Core booking mutations without `bookings.write/manage`** — any active member (incl. `DRIVER`) can create, update, cancel, no-show, pickup/return | `bookings.controller.ts` L378-500 — no `@RequirePermission`; `permissions.guard.ts` L49 passes when no decorator | Authenticate as `DRIVER`, call `POST/PATCH/DELETE .../bookings` |
| **P0-BOOK-003** | Datenschutz | **Full signature bitmaps in dashboard list APIs** | `bookings.service.ts` L1476-1477, L1657-1658 — raw protocols; L818-821 loads `customerSignatureDataUrl` | `GET .../bookings/today/pickups` response contains `data:image/...` |
| **P0-BOOK-004** | Mass assignment | **HTTP body → Prisma spread on create/update** | `bookings.controller.ts` L384-388, L413-418; `bookings.service.ts` L325-334, L2011/2034 | PATCH with `paymentStatus`, `cancelledAt`, `totalPriceCents` fields |

### P1 — High risk (fix or written acceptance required)

| ID | Area | Finding | Evidence |
|----|------|---------|----------|
| **P1-BOOK-001** | State machine | Lifecycle matrix **not enforced at runtime** | `resolvePatchStatusTransition` only used in `booking-lifecycle-status.matrix.ts` + spec, not `bookings.service.ts` |
| **P1-BOOK-002** | State machine | **PATCH can set terminal statuses** (`CANCELLED`, `NO_SHOW`, `COMPLETED`) bypassing dedicated endpoints and side effects | `bookings.service.ts` update — only blocks `CONFIRMED→ACTIVE` (L1904-1910) |
| **P1-BOOK-003** | Cancellation | **`cancel()` has no status guard** — can cancel `ACTIVE`/`COMPLETED`, release vehicle | `bookings.service.ts` L2157-2185 — no `booking.status` check |
| **P1-BOOK-004** | Authorization | **Read endpoints lack `bookings.read`** — list, detail, stats, handover list | `BookingsController` GET handlers without permission decorator |
| **P1-BOOK-005** | Authorization | **Rental contract routes unpermissioned** | `documents.controller.ts` L42-54 — no `@RequirePermission`; contrast L65+ |
| **P1-BOOK-006** | Pagination | **Frontend silent truncation at 500** | `BookingsView.tsx` L109-114; server supports pagination `bookings.service.ts` L430-432 |
| **P1-BOOK-007** | Mobile | **Timeline unusable at 320–430px** | `BookingsTimelineView.tsx` — `min-w-[900px]` |
| **P1-BOOK-008** | i18n | **Planner hardcoded German** despite `bookings.*` keys in i18n | `BookingsPage.tsx` L95; no `useLanguage` in `components/bookings/` |
| **P1-BOOK-009** | Calendar | **Calendar month navigation missing** — stuck on mount month | `BookingsPage.tsx` L45-46 `calendarMonth`/`calendarYear` never updated |

### P2 — Medium (harden before scale)

| ID | Area | Finding | Evidence |
|----|------|---------|----------|
| P2-BOOK-001 | Idempotency | Pickup concurrent duplicate → `P2002`, not idempotent replay | `bookings-handover.service.ts` |
| P2-BOOK-002 | Concurrency | No optimistic `version` on `Booking` — last-write-wins | `schema.prisma` Booking model |
| P2-BOOK-003 | Invoice | Wizard confirm swallows `syncOnBookingConfirmed` errors | `booking-wizard-draft.service.ts` ~L338-345 |
| P2-BOOK-004 | Invoice | Bootstrap rollback is compensating delete, not same TX | `bookings.service.ts` L349-374 |
| P2-BOOK-005 | Tenant isolation | Secondary lookups without `organizationId` (stations, snapshots) | `bookings.service.ts` L848-850, L966-968 |
| P2-BOOK-006 | Cancel | Cancel not idempotent — re-applies side effects | `cancel()` no early return |
| P2-BOOK-007 | a11y | Nested interactive buttons in calendar cells | `BookingsCalendarView.tsx` |
| P2-BOOK-008 | Timezone | Frontend display uses browser-local TZ, not org TZ | `entityMappers.ts` `formatBookingDate` |
| P2-BOOK-009 | HTTP idempotency | No persisted idempotency-key store for confirm/cancel | Characterization tests only |

### P3 — Low / hardening

| ID | Area | Finding | Evidence |
|----|------|---------|----------|
| P3-BOOK-001 | Return handover | No idempotent replay (pickup has it) | `bookings-handover.service.ts` L187-199 |
| P3-BOOK-002 | Quote | `integrityHash` not re-verified on consume | `pricing-quote.service.ts` |
| P3-BOOK-003 | Dead code | ~900 lines legacy calendar in `BookingsView.tsx` unused | L834-1248 vs `BookingsPage` handoff L1278 |
| P3-BOOK-004 | Allowed drivers | Customer email in driver list response | `booking-allowed-drivers.service.ts` L403-405 |
| P3-BOOK-005 | E2E | No mobile/a11y Playwright projects for bookings | `package.json` `test:bookings:e2e` desktop-1280 only |

---

## 3. Area-by-Area Assessment (28 scope items)

| # | Area | Status | Summary |
|---|------|--------|---------|
| 1 | Authorization / least privilege | ❌ | Payments/legal-evidence well permissioned; **core CRUD not** |
| 2 | Tenant isolation | ⚠️ | Primary booking queries scoped; secondary entity lookups weak |
| 3 | Request DTOs / mass assignment | ❌ | Prisma types from HTTP; partial strip only |
| 4 | State machine | ⚠️ | Matrix + tests exist; **runtime bypass** on PATCH/cancel |
| 5 | Cancellation / override | ⚠️ | No-show guarded; cancel unguarded; eligibility override permissioned |
| 6 | Double-booking protection | ❌ | Overlap util correct; **not race-safe** |
| 7 | Idempotency | ⚠️ | Wizard confirm + pickup replay; no HTTP key store |
| 8 | Optimistic concurrency | ⚠️ | Eligibility fingerprint only |
| 9 | Pricing quote / snapshot | ✅ | Atomic consume; snapshot 1:1; reprice needs quote |
| 10 | Invoice / payment state | ⚠️ | Bootstrap rollback on create; wizard sync gaps |
| 11 | Legal acceptance | ✅ | Pickup gate checks delivery evidence |
| 12 | Document version / hash | ✅ | Legal documents module + pickup gate integration |
| 13 | Signature storage | ⚠️ | DB stores data URLs; list redaction partial |
| 14 | Data minimization | ⚠️ | List redacted; detail/dashboard/signatures broad access |
| 15 | Transactional outbox | ✅ | Business audit + task automation patterns |
| 16 | Consumer idempotency | ✅ | Workflow `idempotencyKey` unique constraints |
| 17 | Processing states / recovery | ⚠️ | Document generation jobs; wizard errors swallowed |
| 18 | Logging / monitoring | ⚠️ | Structured pickup-gate audit; no booking-specific SLO doc |
| 19 | Pagination | ❌ | Server ready; **client single-page 500 cap** |
| 20 | Edit paths | ⚠️ | Edit dialog + PATCH; terminal notes-only partial |
| 21 | Timezones | ⚠️ | Backend org-day windows tested; frontend local TZ |
| 22 | Calendar / timeline | ❌ | Desktop timeline OK; calendar month stuck; mobile broken |
| 23 | Mobile readiness | ❌ | No responsive E2E; timeline min-width 900px |
| 24 | Accessibility | ⚠️ | Wizard stepper good; planner nested buttons, small targets |
| 25 | i18n | ❌ | Keys exist; planner not wired |
| 26 | Test coverage | ⚠️ | Strong backend unit; gaps on service integration + mobile |
| 27 | DSGVO readiness | ⚠️ | **Technisch teilweise ready** — signatures, retention, DPIA org-side |
| 28 | ISO/IEC 27001 readiness | ⚠️ | **ISO-Control-ready** for IAM/audit patterns — policies/evidence org-side |

---

## 4. Passed Controls (evidence)

| Control | Evidence |
|---------|----------|
| Org scoping guard on booking controllers | `OrgScopingGuard` + `organizationId` in `findAll` WHERE (`bookings.service.ts` L436) |
| Eligibility enforcement on create/update/confirm/pickup | `booking-eligibility-enforcement.service.ts`, pickup gate integration tests |
| Pickup blocked without legal delivery evidence | `booking-pickup-gate.service.ts` L227-254; `booking-pickup-gate.integration.spec.ts` |
| Paginated list signature redaction | `redactHandoverProtocolForList` (`booking-handover-privacy.util.ts`); applied L559-560 |
| Pricing quote parallel consume | `pricing-quote.service.ts` `markConsumed` conditional update; `pricing-quote.spec.ts` |
| Invoice bootstrap failure compensation | `bookings.service.ts` L349-374; `booking-invoice-bootstrap.behavior.spec.ts` |
| Payment requests permissioned | `booking-payment-request.controller.ts` `@RequirePaymentPermission` |
| Legal delivery evidence permissioned | `LegalDocumentDeliveryEvidenceController` `legal_documents.audit_view` |
| Handover actor server-derived | `handover-actor.util.ts` — client `performedByUserId` rejected at pickup gate |
| DST org-day windows (backend) | `booking-day-window.util.spec.ts` |
| Business audit outbox idempotency keys | `booking-eligibility-approval.service.ts` `buildBusinessAuditIdempotencyKey` |

---

## 5. Test Execution Results (audited commit `3bc99019`)

### 5.1 Automated — executed this audit

| Suite | Command | Result |
|-------|---------|--------|
| Backend booking Jest | `cd backend && npm run test:bookings` | **PASS** — 50 suites, **315 tests** |
| Frontend booking Vitest | `cd frontend && npm run test:bookings` | **PASS** — 7 files, **58 tests** |
| Playwright planner E2E | `cd frontend && npm run test:bookings:e2e` | **PASS** — **7/7** (desktop-1280, mocked API) |

### 5.2 Not executed / failing (repo-wide)

| Suite | Status | Notes |
|-------|--------|-------|
| Full backend `tsc --noEmit` | ❌ | Pre-existing errors in vehicle-intelligence, permissions.guard.spec, document-intake scheduler — **not booking-introduced** |
| Full frontend `npm test` | Not run | Prior audit noted unrelated vitest failures outside booking scope |
| DB integration race test (parallel create) | ❌ Missing | No test exists — **P0 gap** |
| Mobile E2E 320–430px | ❌ Missing | Not in CI |
| k6/Artillery 100 parallel creates | Manual | Documented in test matrix as manual-only |

### 5.3 Test inventory reference

`docs/testing/booking-production-test-matrix.md` — maps requirements to specs. **Characterization specs document contracts but do not substitute for DB integration tests** (concurrency, cancel guards, PATCH enforcement).

---

## 6. DSGVO / ISO Readiness (non-certification)

### 6.1 Technisch DSGVO-ready (partial)

| Requirement | Status |
|-------------|--------|
| Tenant isolation (primary entities) | ✅ |
| Purpose limitation on list vs detail | ⚠️ Dashboard lists leak signatures (P0-BOOK-003) |
| Data minimization per role | ❌ DRIVER can read/write too much |
| Legal basis traceability (rental contract) | ✅ Document snapshots + delivery evidence |
| Right to erasure / retention | ⚠️ No booking-specific retention job documented — **organisatorisch** |
| Signature as biometric-adjacent data | ⚠️ Stored as data URLs; partial redaction |

### 6.2 ISO-Control-ready (partial)

| Control area | Status |
|--------------|--------|
| A.9 Access control | ❌ Booking CRUD lacks granular permissions |
| A.12 Operations security | ⚠️ Outbox recovery; no booking SLO |
| A.14 System acquisition | ✅ Eligibility gatekeeper as control point |
| A.18 Compliance | ⚠️ Legal evidence at pickup — **organisatorische Nachweise noch erforderlich** |

---

## 7. Migration / Deployment / Rollback

### 7.1 Booking-related migrations (representative, on `main` lineage)

| Migration | Purpose |
|-----------|---------|
| `20260722260000_booking_eligibility_approval` | Manual approval workflow |
| `20260723210000_booking_eligibility_decisions` | Decision audit trail |
| `20260723230000_booking_eligibility_recheck_events` | Recheck event types |

Additional booking columns (handover protocols, payment intent, stations) exist in earlier migrations — verify full chain with `prisma migrate deploy` on staging clone.

### 7.2 Deployment order

1. **DB backup** (mandatory — `vps-deploy-release.sh` pattern).
2. `prisma migrate deploy` on staging → smoke → production.
3. Deploy backend (NestJS PM2 restart).
4. Deploy frontend static build.
5. Verify health: `GET /api/v1/health`.
6. Smoke: list bookings, wizard draft, pickup gate block/allow, payment read.

### 7.3 Rollback plan

| Layer | Action |
|-------|--------|
| Application | Redeploy previous release artifact (`/opt/synqdrive/releases/` symlink swap) |
| Database | **Do not** roll back migrations with data-bearing eligibility tables without DBA script — forward-fix preferred |
| Feature flags | No booking-specific kill switch found — rollback is release-level |
| Data | Cancelled bookings / handover protocols created under new version remain — reconcile manually if rollback mid-incident |

**Gap:** No dedicated `booking-rollback-runbook.md` — **P2 documentation**.

---

## 8. Monitoring Checklist — First 24 Hours Post-Deploy

| Check | Signal | Threshold / action |
|-------|--------|-------------------|
| API health | `GET /api/v1/health` | Non-200 → page on-call |
| 5xx rate on `/bookings` | APM / nginx logs | >0.1% → investigate |
| `VEHICLE_BOOKING_OVERLAP` conflicts | Structured log `code` | Spike → possible race (P0-BOOK-001) |
| `BOOKING_ACTIVATION_REQUIRES_HANDOVER` | PATCH misuse attempts | Unexpected volume → client bug or abuse |
| Pickup gate blocks | `PICKUP_GATE_EVENT_TYPE.BLOCKED` audit | Baseline; spike after legal doc change |
| Invoice bootstrap failures | `Booking created but invoice bootstrap failed` | Any → orphaned booking risk |
| Eligibility override usage | Business audit events | Audit all overrides |
| Payment webhook lag | Stripe dashboard | Settlements delayed >15m |
| PM2 restart loop | `pm2 status` | Restart count >3/h → halt deploy |
| DB connections | Postgres `pg_stat_activity` | Saturation → scale / pool tune |
| Frontend error boundary | Sentry / client logs | `Rental view crashed` on bookings route |
| Signature payload size | Response size on `today/pickups` | Large responses until P0-BOOK-003 fixed |

---

## 9. Remaining Risks (accepted only after P0/P1 closure)

| Risk | Severity | Mitigation path |
|------|----------|-----------------|
| Fleet double-booking under concurrent load | Critical | DB exclusion constraint or serializable TX |
| DRIVER role booking mutations | High | `@RequirePermission('bookings', 'write')` |
| Signature leakage via dashboard APIs | High | Apply `redactHandoverProtocolForList` everywhere |
| Mass assignment price/status tampering | High | Explicit DTOs + allowlist mapping |
| >500 bookings invisible in UI | High | Server pagination + truncation banner |
| Branch fragmentation (Prompts 1–33 across branches) | High | Merge train to `main` before prod |
| Mobile operator workflows | Medium | Responsive timeline + E2E |
| Org timezone display | Medium | Wire org TZ to frontend formatters |

---

## 10. Manual Organizational Measures (DSGVO / ISO — not code)

1. **DPIA** for telematics + signature + rental contract processing per tenant.
2. **Verarbeitungsverzeichnis** Art. 30 — booking, handover, payment, legal evidence flows.
3. **Auftragsverarbeitung** with Stripe, Resend, object storage providers.
4. **Retention schedule** for signatures, handover photos, booking PII post-statutory periods.
5. **Incident response drill** for booking data breach (signature exfiltration scenario).
6. **Access review** — remove `DRIVER` write paths after IAM fix.
7. **Penetration test** focused on booking IDOR + mass assignment before Go.

---

## 11. Remediation Priority (ordered)

1. **P0-BOOK-001** — DB-level double-booking prevention.
2. **P0-BOOK-002** — `bookings.read/write/manage` on all `BookingsController` handlers.
3. **P0-BOOK-003** — Redact signatures on `today/pickups` + `today/returns`.
4. **P0-BOOK-004** — Replace Prisma HTTP types with validated DTOs.
5. **P1-BOOK-001..003** — Wire lifecycle matrix into `update`/`cancel`/`markNoShow`.
6. **P1-BOOK-005** — Permission rental-contract routes.
7. **P1-BOOK-006..009** — Frontend pagination, mobile, i18n, calendar nav.

---

## 12. References

| Document | Path |
|----------|------|
| Test matrix (Prompt 33) | `docs/testing/booking-production-test-matrix.md` |
| Architecture note | `architecture/BOOKING_PRODUCTION_TEST_MATRIX_2026-07-24.md` |
| Eligibility retroactivity | `architecture/BOOKING_ELIGIBILITY_RETROACTIVITY_2026-07-23.md` |
| Rental rules audit (template) | `docs/audits/rental-rules-post-remediation-readiness-2026-07.md` |
| CI verify scripts | `backend/scripts/test/booking-backend-verify.sh`, `frontend/scripts/test/bookings-verify.sh` |

---

## Appendix A — Booking HTTP Surface Permission Map (summary)

| Controller | Permissioned | Unpermissioned (high risk) |
|------------|--------------|---------------------------|
| `BookingsController` | 9 eligibility endpoints | **22** CRUD/read/handover/dashboard |
| `DocumentsController` | Most document routes | **2** rental-contract GET/download |
| `BookingPaymentRequestController` | All 6 | — |
| `LegalDocumentDeliveryEvidenceController` | All 5 | — |
| `BookingDocumentsEmailController` | Role-only (ORG_ADMIN) | No granular `bookings.*` |

Full endpoint list: see subagent security audit in repo exploration notes; verify in `bookings.controller.ts` + `documents.controller.ts`.

---

**Audit conclusion:** **NO-GO** until P0 findings closed and P1 addressed or formally accepted. Re-audit required on consolidated `main` tip after remediation.
