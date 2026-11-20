# Post-P6 — Core ↔ Rental boundary audit (logical Alpha)

**Date:** 2026-11-19 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT`  
**Mode:** `READ_ONLY_FIRST` (documentation only; no runtime/schema/deploy)  
**Audited `origin/main` baseline:** `65a76e63b200b5d9110324a32620e2096bfac77f` (post #2449 monorepo governance)

> **Superseded (findings status only):** [`POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md`](POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_2026-11-20.md) @ `3b5773233` — V-P0-01 … V-P1-02 **closed** on `main` after PR #2451–#2456; new P1 inventory documented there. This file remains historical evidence.

**Binding context:** [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md), [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md), [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md), [`POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md`](POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md), [`POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md).

## Evidence vocabulary (do not conflate)

| Layer | Meaning |
|-------|---------|
| **CONFIRMED direct dependency** | Constructor/type import of a rental-module class or util — **code evidence only** |
| **CONFIRMED owning domain** | Owner decision document, registry description, or **AUTHORITY_ACTIVE** authority |
| **CONFIRMED architecture violation** | Forbidden dependency direction per guardrails **and** consumer + provider domains **CONFIRMED** |
| **NEEDS_FURTHER_EVIDENCE** | Direct dependency **CONFIRMED**, but domain ownership still unresolved for rule application |

**Owner classification (2026-11-19):** Communication Center, WhatsApp Business, Voice Assistant Platform, AI Platform → **Core platform** (`NOT_STARTED` coverage unchanged). **Rental Health** → **Rental** (`AUDIT_IN_PROGRESS`). **Vehicle intelligence** → **Core** (master plan + P4).

---

## Phase 1 — P4 baseline reconciliation

| P4 certified slice | Status on `65a76e63` | Evidence |
|--------------------|----------------------|----------|
| VI → `RentalDrivingAnalysisService` / recompute trigger handler direct injection | **Still absent** | `rg RentalDrivingAnalysisService backend/src/modules/vehicle-intelligence` → no matches |
| VI → rental recompute via `RENTAL_DRIVING_ANALYSIS_*_PORT` tokens | **Unchanged (allowed)** | e.g. `driver-attribution.service.ts`, `trip-post-finalize-analysis.producer.ts` |
| `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef` | **Unchanged composition-root wiring** | P4 table preserved |
| `BookingsService` → `RentalDrivingAnalysisService` | **Still intra-rental allowed** | `bookings.service.ts` |
| VI direct `prisma.booking` / `bookingHandoverProtocol` | **Explicitly deferred** — not reopened as P4 violation | §NFE-01 |

**No contradictory code** vs P4 vehicle-intelligence ↔ rental-driving-analysis **service** boundary since `539d7705e`.

---

## Phase 2 — Inspection surfaces (summary)

| Surface | Result headline |
|---------|-----------------|
| A. Core → Rental direct service imports (VI focus) | **Clean** for rental-driving-analysis business services |
| B. NestJS DI across domains | **CONFIRMED** Core platform → Rental `BookingsService` / `VehicleBookingContextService`; **CONFIRMED** VI → `RentalHealthService` |
| C. Core VI → booking persistence | **NFE** — Prisma reads retained; job repo uses booking resolution port |
| D–H | Unchanged from initial audit (workers spot-check, composition root, frontend P2, dashboard/evaluations allowed) |

---

## Phase 3 — Findings register

### CONFIRMED architecture violation — Core platform → Rental business services (P0)

Owner-confirmed **Core** consumers; provider **Rental** (`BookingsService` / `VehicleBookingContextService`).

#### V-P0-01 — Communication Center → `BookingsService`

| Field | Value |
|-------|-------|
| Source | `communication-quick-action.executor.ts` |
| Consumer domain | **Core** (Communication Center — owner 2026-11-19) |
| Provider | `BookingsService` (**Rental**) |
| Evidence | Constructor injection; `findDetail(orgId, bookingId)` L98, L132 only |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** |
| Priority | **P0** |
| Smallest remediation | `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` (first implementation PR) |

#### V-P0-02 — WhatsApp Business → `BookingsService`

| Field | Value |
|-------|-------|
| Sources | `whatsapp-ai-context.service.ts`, `whatsapp-ai-tools.service.ts`, `whatsapp-booking-reminder.service.ts`, `whatsapp-conversation-context.service.ts` |
| Consumer domain | **Core** (owner 2026-11-19) |
| Evidence | 4× DI; **`findDetail(orgId, bookingId)`** (6 call sites) |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** |
| Priority | **P0** |
| Smallest remediation | Narrow read port(s) after PR1 pattern — not broad booking API |

#### V-P0-03 — Voice Assistant Platform → `BookingsService`

| Field | Value |
|-------|-------|
| Sources | `voice-mcp-tools.service.ts`, `voice-mcp-write-tools.service.ts` |
| Consumer domain | **Core** (owner 2026-11-19) |
| Evidence | **`findAll`**, **`findById`** (read + write-tool preconditions) |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** |
| Priority | **P0** |
| Smallest remediation | Separate narrow read/write command ports — scoped per tool surface |

#### V-P0-04 — AI Platform → `VehicleBookingContextService`

| Field | Value |
|-------|-------|
| Source | `ai/tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.tool.ts` |
| Consumer domain | **Core** (AI Platform — owner 2026-11-19) |
| Provider | `VehicleBookingContextService` in `bookings/vehicle-booking-context` (**Rental** business service — booking operational context assembly) |
| Evidence | `ai.module.ts` imports `BookingsModule`; tool calls `getVehicleBookingOperationalContext(organizationId, vehicleId, …)` |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** (Rental business-logic service, not merely Prisma) |
| Priority | **P0** |
| Smallest remediation | Core-owned neutral read port for vehicle operational snapshot; Rental adapter |

### CONFIRMED architecture violation — Core vehicle intelligence (P1)

#### V-P1-01 — Core vehicle intelligence → Rental Health service

| Field | Value |
|-------|-------|
| Sources | `vehicle-health-tab-summary.service.ts`, `vehicle-file-summary.service.ts` |
| Consumer domain | **Core** (vehicle intelligence; P4 / master plan) |
| Provider domain | **Rental** ([`architecture/rental-health/`](../../rental-health/) — `AUDIT_IN_PROGRESS`, rental gate / fleet aggregation) |
| Evidence | `@Inject(forwardRef(() => RentalHealthService))`; `rental-health.module.ts` ↔ VI cycle |
| Direct dependency | **CONFIRMED** |
| Violation | **CONFIRMED** — Core intelligence injects Rental-owned `RentalHealthService` (not port-token) |
| Priority | **P1** |
| Smallest remediation | Core-owned **read port** + Rental `rental-health` adapter; preserve in-process composition root |

#### V-P1-02 — Core vehicle intelligence → rental driver-pool util

| Field | Value |
|-------|-------|
| Sources | `driver-attribution.service.ts`, `trip-attribution.service.ts`, `trip-canonical-hydration.batch.ts` |
| Consumer domain | **Core** (VI) |
| Provider path | `bookings/booking-allowed-drivers/booking-allowed-drivers.util` (**Rental** module path) |
| Evidence | `import { resolveBookingDriverPool } from '../../bookings/...'` |
| Direct dependency | **CONFIRMED** (compile-time rental business rule import) |
| Violation | **CONFIRMED** — Core attribution imports Rental booking policy util |
| Priority | **P1** |
| Smallest remediation | Extend **booking resolution / driver-pool port** (VI `ports/`) with Rental adapter |

### ALLOWED_IN_PROCESS_DEPENDENCY

Unchanged — see prior audit rows A-01 … A-08 (P4 ports, composition `forwardRef`, intra-rental Bookings→RDA, Rental→VI rental-health import direction, etc.).

### NEEDS_FURTHER_EVIDENCE (other)

| ID | Surface | Notes |
|----|---------|-------|
| NFE-01 | VI `prisma.booking` / `bookingHandoverProtocol` | Persisted from P4 — not automatic violation |
| NFE-03 | Worker queue domain map | Spot-check only |

### P2 — Optional hardening

Frontend master → rental util imports — unchanged (P2-01, P2-02).

---

## Phase 4 — Prioritization (honest counts)

| Category | Count |
|----------|-------|
| **CONFIRMED_ARCHITECTURE_VIOLATION** | **6** findings (**4** P0 module groups + **2** P1 VI) |
| **P0 (CONFIRMED)** | **4** (Communication, WhatsApp, Voice → `BookingsService`; AI → `VehicleBookingContextService`) |
| **P1 (CONFIRMED)** | **2** (VI → `RentalHealthService`; VI → driver-pool util) |
| **Direct `BookingsService` DI sites** | **7** (1 + 4 + 2 services) |

---

## Phase 5 — Verdict

**P4 VI ↔ rental-driving-analysis service boundary:** **CERTIFIED INTACT** on `65a76e63`.

**Post-P6 overall:** **`BOUNDARY_AUDIT_NOT_GO`** — **6** confirmed Core→Rental service/util violations (4× P0 platform + 2× P1 VI).

**Review history:** 2026-11-19 epistemic remediation; **owner Core classification** reconciles P0 platform findings ([`POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md)). P4 historical findings preserved.

---

## Phase 6 — Next executable operation (implementation **not** in #2450)

**Recommended:** `POST-P6-BOUNDARY-PR1_COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT`

**Scope driven by code** (`CommunicationQuickActionExecutorService` @ `65a76e63`):

- **Only** `await this.bookings.findDetail(orgId, bookingId)` (missing-documents + payment-deposit reminder actions).
- Fields used: `detail.core.bookingNumber`, `detail.finance.depositStatus`, `detail.finance.paymentStatus`.

**Minimal port design:**

1. **Consumer-owned**, product-neutral interface in `communication/` (or shared platform ports) — e.g. token `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` with `getSnapshot(organizationId, bookingId): Promise<{ bookingNumber: string; depositStatus?: string; paymentStatus?: string } | null>`.
2. **Rental** implements adapter in `bookings/` delegating to `BookingsService.findDetail` (adapter registration in `BookingsModule` / composition root — in-process `useExisting` pattern per P4).
3. **Consumer** injects port token only — **no** `BookingsService` import on communication side.
4. Migrate **only** `CommunicationQuickActionExecutorService` in first implementation PR.

**Out of scope for PR1:** WhatsApp / Voice / AI (separate narrow ports after PR1; Core ownership confirmed).

---

## Validation (local)

| Check | Result |
|-------|--------|
| `bash architecture/scripts/validate-module-registry.sh` | Per PR CI |
| `bash architecture/dsrg/scripts/validate-graph.sh` | Per PR CI |
| `git diff --check` | Per PR CI |
| Production | **NOT_CLAIMED** |

## Registry review (this PR)

| Module | REGISTRY_REVIEWED | Reason |
|--------|-------------------|--------|
| Bookings | **UNCHANGED** | `AUDIT_IN_PROGRESS` |
| Vehicle intelligence / rental-driving-analysis | **UNCHANGED** | P4 reaffirmed |
| Communication / WhatsApp / Voice / AI | **UPDATED** | `NOT_STARTED` unchanged; **Core domain** mini descriptions + owner record |
| Rental Health | **UNCHANGED** | `AUDIT_IN_PROGRESS` |