# POST-P6-PR9 — Domain ownership finalization (owner decision)

**Date:** 2026-11-20 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_PR9_DOMAIN_OWNERSHIP_FINALIZATION`  
**Mode:** `READ_ONLY_FIRST` + **documentation only**  
**Owner decision:** **EXPLICITLY_GRANTED** (binding; not `AUTHORITY_ACTIVE` promotion)  
**Repository baseline:** `origin/main` @ `a5a8a06dd82900fa2a10d36ab0d6f00dbc4a5f9c`  
**Supersedes (classification only):** unresolved Tasks/Documents/Invoices **ownership** questions in [`POST_P6_FINAL_BOUNDARY_INDEPENDENT_REVIEW_2026-11-20.md`](POST_P6_FINAL_BOUNDARY_INDEPENDENT_REVIEW_2026-11-20.md) — **does not** change frozen PR #2460 eight-violation closure facts.

**Binding shape unchanged:** one Alpha repo, one NestJS runtime, one deployment, shared DB; `SYNQDRIVE-CORE` reference fork paused; no M2M mandate for co-located Rental.

---

## Owner-approved logical ownership

### 1. Tasks & Work Orders

| Domain | Capabilities (logical) |
|--------|----------------------|
| **Core** | Generic task management; product-neutral work-order substrate (`TasksService`, permissions, task domain V2 buckets, manual/bulk APIs — `tasks.controller.ts`, `tasks.service.ts`). |
| **Rental** | Booking lifecycle tasks; pickup/return/preparation timing; booking-document-package task sync; booking-scoped vehicle cleaning tasks; rental invoice payment-check tasks; **booking automation outbox orchestration** (`task-automation*.ts`, `outbox/task-automation-outbox-executor.service.ts`). |

**Physical module:** `backend/src/modules/tasks` remains **one** Nest module tree — **not** physically split.

**Outbox evidence:** `TaskAutomationOutboxExecutorService` routes `ENSURE_BOOKING_LIFECYCLE`, `SYNC_BOOKING_*`, `ON_*_HANDOVER_*`, `SYNC_DOCUMENT_PACKAGES` → `BookingDocumentBundleService.resyncBookingDocumentTasks`, `SYNC_INVOICE_PAYMENT_CHECK`, booking vehicle cleaning — **Rental orchestration** surface.

### 2. Documents

| Domain | Capabilities (logical) |
|--------|----------------------|
| **Core** | Generic document storage (`storage/document-storage.interface.ts`, S3/local adapters); metadata/integrity/retention **infrastructure** where product-neutral (shared storage port consumed by Communication attachments). |
| **Rental** | Booking document bundles (`booking-document-bundle.service.ts`); rental contract generation; booking PDF templates; **Rental HTTP document API** (`documents.controller.ts` — `@RequireProduct(ProductSlug.RENTAL)` + `ProductLicenseGuard` preserved); booking document generation queue (`booking-document-generation/*`); rental legal document administration under `documents/` rental workflows. |

**Physical module:** `backend/src/modules/documents` remains **mixed**; Core platform consumes **storage port** only; bundle service is Rental workflow.

**Port (existing):** `CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT` adapter under `documents/core-booking-document-bundle-view/` — composition-root Rental adapter for Core channels (#2459).

### 3. Invoices

| Domain | Capabilities (logical) |
|--------|----------------------|
| **Rental** | Booking invoices, `InvoicesService` / `InvoicesController`, `invoice-documents.service.ts` (bundle coupling), payment tasks, rental AR-style flows in `backend/src/modules/invoices/*`. |
| **Core** | **Future** shared platform subscription/product billing — **not claimed as implemented service**; Master Admin billing UI (`frontend/src/master/.../billing`) is separate product catalog/billing control plane (see P2/P3 ledger). |

**Evidence:** `invoices.controller.ts` — org-scoped rental invoice routes; **no** standalone Core subscription invoice engine asserted in backend `invoices` module at audit time.

---

## Capability → path map (compact)

| Capability | Owner | Representative paths |
|------------|-------|----------------------|
| Task CRUD / permissions | Core | `tasks/tasks.service.ts`, `tasks/tasks.controller.ts`, `task-permission.service.ts` |
| Booking task automation + outbox | Rental | `task-automation.service.ts`, `outbox/task-automation-outbox-executor.service.ts` |
| Document storage port | Core infra | `documents/storage/document-storage.interface.ts` |
| Booking bundle + Rental doc HTTP | Rental | `booking-document-bundle.service.ts`, `documents.controller.ts` |
| Bundle view port adapter | Rental adapter | `documents/core-booking-document-bundle-view/*` |
| Rental booking invoices | Rental | `invoices/invoices.service.ts`, `invoice-documents.service.ts` |

---

## Phase C — Dependency reclassification (no runtime changes)

| Surface | Classification | Notes |
|---------|----------------|-------|
| Task outbox → `BookingDocumentBundleService` | **ALLOWED_DEPENDENCY** | Rental orchestration → Rental bundle workflow per owner split |
| Bookings/wizard → bundle | **ALLOWED_DEPENDENCY** | Rental aggregate |
| `invoice-documents` → bundle | **ALLOWED_DEPENDENCY** | Rental invoice documents |
| `documents.controller` → bundle | **ALLOWED_DEPENDENCY** | Rental product guard preserved |
| Core Communication → storage port | **ALLOWED_DEPENDENCY** | Product-neutral storage |
| Core channels → `CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT` | **ALLOWED_IN_PROCESS_DEPENDENCY** | #2459 |
| Eight original P0/P1 injections | **Closed** | Unchanged from PR #2460 / main @ `2bf9c19c8` merge ancestry |
| VI/WhatsApp/Voice Prisma, DTC cache, frontend P2-01 | **unchanged** | **DEFERRED_OPTIONAL_HARDENING** / **NEEDS_FURTHER_EVIDENCE** — not reopened |

**CONFIRMED_VIOLATION count after owner assignment:** **0** (no new runtime PR in PR9).

**Smallest subsequent runtime operation:** **NONE** mandatory. Optional future: physical module split / additional ports only if new violations emerge or owner scopes extraction hardening.

---

## Registry status (unchanged)

Tasks & Work Orders, Documents, Invoices: **`NOT_STARTED`** — owner decision is **governance only**, not authority promotion.

---

## Validation

- `validate-module-registry.sh` — run on PR branch
- Documentation-only diff — no runtime/schema/migration files