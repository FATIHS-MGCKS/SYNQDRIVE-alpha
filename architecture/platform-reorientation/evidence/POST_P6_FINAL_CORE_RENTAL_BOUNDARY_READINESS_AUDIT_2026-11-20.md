# POST-P6 — Final Core/Rental boundary readiness audit

**Date:** 2026-11-20 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_FINAL_CORE_RENTAL_BOUNDARY_READINESS_AUDIT`  
**Mode:** `READ_ONLY_ARCHITECTURE_AUDIT` · **documentation only**  
**Repository baseline:** `origin/main` @ `2bf9c19c8bbe3a246694751235aa46d4af0e746d`  
**Supersedes (active status):** [`POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md`](POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md) for closure of **V-P0-01 … V-P1-04** and post-PR8 readiness verdicts. Historical 2026-11-19/20 evidence **preserved**.

**Binding:** [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md), [`POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md), port evidence #2451–#2459.

---

## Phase 1 — Eight confirmed violations (verified closed on main)

| ID | Finding | Remediation | PR | Verification @ `2bf9c19c8` |
|----|---------|-------------|-----|---------------------------|
| **V-P0-01** | Communication → `BookingsService` | `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` | #2451 | No `BookingsService` / bookings.service import under `communication/` (production). Executor injects port. |
| **V-P0-02** | WhatsApp → `BookingsService` | `WHATSAPP_BOOKING_OPERATIONAL_READ_PORT` | #2452 | No `BookingsService` under `whatsapp/`; four consumers on port. |
| **V-P0-03** | Voice → `BookingsService` | `VOICE_BOOKING_READ_PORT` | #2453 | No `BookingsService` under `voice-mcp-gateway/`; MCP tools on port. |
| **V-P0-04** | AI → `VehicleBookingContextService` | `AI_VEHICLE_BOOKING_CONTEXT_READ_PORT` | #2454 | Tool injects port only; adapter under `bookings/ai-vehicle-booking-context-read/`. |
| **V-P1-01** | VI → `RentalHealthService` | `VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT` | #2455 | Production VI consumers use port; no `RentalHealthService` import in health tab / vehicle file summary sources. |
| **V-P1-02** | VI → `booking-allowed-drivers.util` | `VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT` | #2456 | Three consumers on port; util only in Rental adapter. |
| **V-P1-03** | Core platform → `BookingDocumentBundleService` (4 consumers) | `CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT` | #2459 | No `BookingDocumentBundleService` under `communication/` or `whatsapp/`; `core-booking-document-bundle-view.consumers.spec.ts` guard. |
| **V-P1-04** | AI → `RentalHealthService` | Reuse `VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT` | #2458 | `ai-get-vehicle-health-summary.tool.ts` injects port; type-only `rental-health.types` imports remain. |

**Regression check:** Subsequent merges through `2bf9c19c8` did not reintroduce direct forbidden injections in the eight audited consumer sites.

---

## Phase 2 — Residual `BookingDocumentBundleService` injections

**Rule applied:** Only **Core → Rental business-service** injection is a confirmed architecture violation per owner guardrails. **Rental → Rental** (or Documents workflow → bundle service) is not automatically a Core/Rental breach.

| Consumer | Path | Consumer domain (evidence) | Crosses Core/Rental? | Classification |
|----------|------|----------------------------|----------------------|----------------|
| Bookings orchestration | `bookings/bookings.service.ts` | Bookings **AUDIT_IN_PROGRESS** — registry owns booking aggregate (`architecture/bookings/` scope) | **No** (same rental workflow island) | **ALLOWED_IN_PROCESS_DEPENDENCY** |
| Wizard draft | `bookings/booking-wizard-draft.service.ts` | Under `bookings/` module tree | **No** | **ALLOWED_IN_PROCESS_DEPENDENCY** (inherits Bookings scope) |
| Invoices pipeline | `invoices/invoice-documents.service.ts` | Invoices registry **NOT_STARTED** — no authority ownership row | **UNKNOWN** | **NEEDS_FURTHER_EVIDENCE** — bundle use is booking-invoice coupling; **not** certified intra-Rental without Invoices authority |
| HTTP API | `documents/documents.controller.ts` | Documents registry **NOT_STARTED** — platform legal/storage vs rental bundle not authority-split | **UNKNOWN** | **NEEDS_FURTHER_EVIDENCE** — do **not** assume entire Documents module is Rental-owned |
| Generation worker | `documents/booking-document-generation/booking-document-generation.processor.service.ts` | Documents **NOT_STARTED**; path is booking-document generation | **UNKNOWN** | **NEEDS_FURTHER_EVIDENCE** — workflow appears rental-coupled; ownership uncertified |
| Task automation outbox | `tasks/outbox/task-automation-outbox-executor.service.ts` | Tasks & Work Orders **NOT_STARTED**; `SYNC_DOCUMENT_PACKAGES` → `resyncBookingDocumentTasks` | **UNKNOWN** | **NEEDS_FURTHER_EVIDENCE** — **not** certified intra-Rental; **not** a Core violation without Tasks owner classification |
| Rental adapter | `documents/core-booking-document-bundle-view/*` | Composition-root Rental adapter | **No** (intended port boundary) | **ALLOWED_IN_PROCESS_DEPENDENCY** |

**Tasks owner decision question (binding, unresolved):** Should **Tasks & Work Orders** (including `task-automation-outbox`) be classified as **Core platform operations**, **Rental workflow automation**, or **hybrid** for Core→Rental injection rules? No owner decision on record.

**RESIDUAL_DOCUMENT_BUNDLE_VERDICT:** **No confirmed Core→Rental `BookingDocumentBundleService` injections** after PR #2459. Residual injections require **module ownership evidence** before ALLOWED certification (except Bookings/wizard tree and Core adapter).

---

## Phase 3 — Deferred Prisma / shared-DB surfaces

| Surface | Representative sources | Tenant scoping | Classification |
|---------|------------------------|----------------|----------------|
| VI booking / handover reads | `driver-attribution.service.ts`, `trip-attribution.service.ts`, `trip-canonical-hydration.batch.ts`, `damages.service.ts` — `prisma.booking` / `bookingHandoverProtocol` | `organizationId` in `where` clauses (spot-checked) | **DEFERRED_OPTIONAL_HARDENING** (NFE-01 carry-forward) — not equivalent to forbidden `BookingsService` injection |
| WhatsApp active booking lookup | `whatsapp-ai-context.service.ts`, `whatsapp-conversation-context.service.ts`, `whatsapp-conversation-matcher.service.ts`, `whatsapp-quick-actions.service.ts` | org-scoped `findFirst` | **NEEDS_FURTHER_EVIDENCE** — resolution vs Rental booking authority; optional future read port |
| Voice entity resolver | `voice-mcp-entity-resolver.service.ts` `prisma.booking.findMany` | org filter present | **NEEDS_FURTHER_EVIDENCE** |
| WhatsApp reminder status read | `whatsapp-booking-reminder.service.ts` `prisma.booking.findFirst` | org-scoped | **NEEDS_FURTHER_EVIDENCE** |

**Distinction:** Direct Prisma on shared schema ≠ confirmed Rental **business-service** violation; optional ports for extraction hardening only.

---

## Phase 4 — Other residual boundaries

| Area | Finding | Classification |
|------|---------|----------------|
| Frontend master → rental utils | `master/components/billing/admin-billing.utils.ts`, `master/components/support-ops/support-ops.utils.ts` re-export rental helpers | **DEFERRED_OPTIONAL_HARDENING** (P2-01) |
| VI DTC cache | `vehicle-intelligence/dtc/dtc.service.ts` → `@Optional() RentalHealthSummaryCacheService.invalidate` after DTC ingest (`invalidateRentalHealthCache`) | **DEFERRED_OPTIONAL_HARDENING** — Redis summary cache invalidation only (not `RentalHealthService`); VI subject to P4 service-boundary rules; owner has not classified cache helper vs business-logic service |
| Workers / queues | Task outbox bundle call (see Phase 2) | **NEEDS_FURTHER_EVIDENCE** (Tasks authority) |
| Rental → Core | Bookings eligibility → `RentalHealthService` (intra-rental intelligence) | **ALLOWED_IN_PROCESS_DEPENDENCY** |
| Type-only imports | AI/VI → `rental-health.types`, recompute reason types | **ALLOWED_IN_PROCESS_DEPENDENCY** |

**Worker boundary:** No new Core worker → Rental service injection found beyond documented Tasks outbox bundle delegation.

---

## Phase 5 — Future application readiness (classification only)

| Capability | Evidence on `main` | Readiness |
|------------|-------------------|-----------|
| Service client registry / Core admin | P3 artifacts; `core-app-m2m` module | **PARTIAL** — implemented; M2M default **OFF** |
| Product entitlements / vehicle read APIs | P2/P3 progress ledger; integration certification doc | **PARTIAL** |
| Fail-closed M2M / Redis gate | `core-app-m2m.config.spec.ts`, certification matrix | **PARTIAL** — not production-activated |
| Master Admin ownership | Master Plan + registry | **PARTIAL** — remains in Core monorepo |
| External app (VYMOD etc.) | Not in scope | **BLOCKED** — no activation performed |

**FUTURE_EXTERNAL_APP_INTERFACE_READINESS:** **PARTIAL** (foundations present; activation and full consumer matrix **NOT_VERIFIED**).

---

## Phase 6 — New confirmed violations (this pass)

**CONFIRMED_ARCHITECTURE_VIOLATION count: 0** — no additional Core→Rental business-service injections identified beyond the historical eight (now closed).

Notable **non-violation** follow-ups: Tasks outbox bundle (ownership), VI/Channel Prisma booking reads (optional), VI DTC cache service, frontend util re-exports.

---

## Phase 7 — Final architecture verdict

| Question | Verdict | Rationale |
|----------|---------|-----------|
| **A. CORE_RENTAL_BOUNDARY_COMPLETE** | **NOT_VERIFIABLE** | Confirmed **P0/P1 Core→Rental business-service injections (eight)** **closed** on `main` @ `2bf9c19c8`; **full-domain certification** blocked by **unresolved Tasks/Documents/Invoices ownership** (no new confirmed violation counted) |
| **B. CORE_PLATFORM_RUNTIME_READINESS** | **PARTIAL** | Single NestJS app with ports/adapters for platform channels; co-located Rental operational |
| **C. FUTURE_EXTERNAL_APP_INTERFACE_READINESS** | **PARTIAL** | M2M/entitlements scaffolding; default fail-closed; no external activation |
| **D. MANDATORY_RUNTIME_REFACTORING_REQUIRED** | **NO** | No open **CONFIRMED_ARCHITECTURE_VIOLATION** from this audit |
| **D2. OPTIONAL_ARCHITECTURAL_HARDENING** | **YES** (tracks) | Prisma read ports, frontend util split, DTC cache port, Tasks/Documents authority — **not** mandatory for co-located monorepo |
| **E. NEXT_SMALLEST_REQUIRED_OPERATION** | **NONE** (mandatory boundary) | **Optional / owner:** Tasks & Work Orders ownership decision; module authority for Documents/Invoices; or prioritized Prisma read ports |

**Production launch:** **NOT** inferred from this audit.

---

## Phase 8 — Governance

| Module | Registry status | Review |
|--------|-----------------|--------|
| Communication Center | `AUDIT_IN_PROGRESS` | **UNCHANGED** |
| WhatsApp Business | `AUDIT_IN_PROGRESS` | **UNCHANGED** |
| Bookings | `AUDIT_IN_PROGRESS` | **UNCHANGED** |
| Documents | `NOT_STARTED` | **UNCHANGED** |
| Tasks & Work Orders | `NOT_STARTED` | **UNCHANGED** |

No `AUTHORITY_ACTIVE` promotion.

---

## Phase 9 — Validation (audit branch)

- `bash architecture/scripts/validate-module-registry.sh` — **PASS**
- `bash architecture/dsrg/scripts/validate-graph.sh` — **PASS** (via registry validator chain)
- `git diff --check` — **PASS** (documentation-only diff)
- **GitHub CI @ `5ff9bd13e` (PR #2460):** **9/9 success** — docs-only governance gates

---

## Evidence index (PR #2451–#2459)

| PR | Evidence |
|----|----------|
| #2451 | `POST_P6_BOUNDARY_PR1_COMMUNICATION_BOOKING_SNAPSHOT_PORT_2026-11-19.md` |
| #2452 | `POST_P6_BOUNDARY_PR2_WHATSAPP_BOOKING_OPERATIONAL_PORT_2026-11-19.md` |
| #2453 | `POST_P6_BOUNDARY_PR3_VOICE_BOOKING_READ_PORT_2026-11-19.md` |
| #2454 | `POST_P6_BOUNDARY_PR4_AI_VEHICLE_BOOKING_CONTEXT_PORT_2026-11-19.md` |
| #2455 | `POST_P6_BOUNDARY_PR5_VI_RENTAL_HEALTH_READ_PORT_2026-11-20.md` |
| #2456 | `POST_P6_BOUNDARY_PR6_VI_BOOKING_DRIVER_POOL_PORT_2026-11-20.md` |
| #2457 | `POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md` |
| #2458 | `POST_P6_BOUNDARY_PR7_AI_RENTAL_HEALTH_PORT_REUSE_2026-11-20.md` |
| #2459 | `POST_P6_BOUNDARY_PR8_CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT_2026-11-20.md` |

**Independent review:** [`POST_P6_FINAL_BOUNDARY_INDEPENDENT_REVIEW_2026-11-20.md`](POST_P6_FINAL_BOUNDARY_INDEPENDENT_REVIEW_2026-11-20.md)