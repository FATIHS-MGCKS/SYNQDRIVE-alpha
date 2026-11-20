# Post-P6 — Core ↔ Rental boundary re-audit (post PR #2451–#2456)

**Date:** 2026-11-20 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT`  
**Mode:** `READ_ONLY_ARCHITECTURE_AUDIT` (documentation only)  
**Audited `origin/main` baseline:** `3b57732334bf9a95b8a5996e56821e8548b41779`  
**Supersedes findings register in:** [`POST_P6_CORE_RENTAL_BOUNDARY_AUDIT_2026-11-19.md`](POST_P6_CORE_RENTAL_BOUNDARY_AUDIT_2026-11-19.md) for **closure status of V-P0-01 … V-P1-02** and **new** post-remediation inventory. Historical 2026-11-19 evidence is **preserved**.

> **Superseded (readiness verdict @ `2bf9c19c8`):** [`POST_P6_FINAL_CORE_RENTAL_BOUNDARY_READINESS_AUDIT_2026-11-20.md`](POST_P6_FINAL_CORE_RENTAL_BOUNDARY_READINESS_AUDIT_2026-11-20.md) — V-P0-01 … V-P1-04 **closed** after PR #2457–#2459; this file retains Phase 2–3 inventory detail at re-audit baseline `3b5773233` / `8b95e5e26`.

**Binding context:** [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md), [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md), [`POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md), [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md), PR evidence #2451–#2456.

---

## Phase 1 — Original six violations (`3b5773233`)

| ID | Finding (2026-11-19) | Port / adapter (merged) | Verification on `main` |
|----|----------------------|-------------------------|-------------------------|
| **V-P0-01** | Communication → `BookingsService` | `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` (#2451) | **CLOSED** — `communication-quick-action.executor.ts` uses port only; no `BookingsService` under `communication/` |
| **V-P0-02** | WhatsApp → `BookingsService` | `WHATSAPP_BOOKING_OPERATIONAL_READ_PORT` (#2452) | **CLOSED** — four consumers on port; no `BookingsService` under `whatsapp/` |
| **V-P0-03** | Voice → `BookingsService` | `VOICE_BOOKING_READ_PORT` (#2453) | **CLOSED** — MCP tools on port; no `BookingsService` under `voice-mcp-gateway/` |
| **V-P0-04** | AI → `VehicleBookingContextService` | `AI_VEHICLE_BOOKING_CONTEXT_READ_PORT` (#2454) | **CLOSED** — `ai-get-vehicle-booking-context.tool.ts` injects port; adapter in `bookings/ai-vehicle-booking-context-read/` |
| **V-P1-01** | VI → `RentalHealthService` | `VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT` (#2455) | **CLOSED** — health tab + vehicle file summary use port; production VI sources have no `RentalHealthService` import (test harnesses excepted) |
| **V-P1-02** | VI → `booking-allowed-drivers.util` | `VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT` (#2456) | **CLOSED** — three consumers on port; util only in Rental adapter |

**Nest wiring:** Core modules import Rental-side adapter modules at composition root (`CommunicationBookingSnapshotReadModule`, etc.) — **ALLOWED_IN_PROCESS_DEPENDENCY** per guardrails.

**P4 VI ↔ `RentalDrivingAnalysisService`:** **Still intact** — no `RentalDrivingAnalysisService` import under `vehicle-intelligence/` on `main`.

---

## Phase 2 — Remaining dependency inventory

### A. Vehicle Intelligence (Core)

| Surface | Classification | Notes |
|---------|----------------|-------|
| `prisma.booking` / `bookingHandoverProtocol` reads | **DEFERRED_OPTIONAL_HARDENING** (carry-forward **NFE-01**) | Attribution, hydration batch, damages, trip assignment, tenant scope — not reopened as automatic service violation; optional future read ports |
| `DrivingIntelligenceBookingResolutionModule` | **ALLOWED_IN_PROCESS_DEPENDENCY** | Existing booking-resolution port path |
| Type-only `BookingDriverPool` on VI port | **ALLOWED_IN_PROCESS_DEPENDENCY** | In-process monorepo type bridge |
| Test harness `RentalHealthService` construction | **ALLOWED_IN_PROCESS_DEPENDENCY** | Non-production test paths only |

### B. Communication Center (Core)

| Surface | Classification | Notes |
|---------|----------------|-------|
| `BookingDocumentBundleService` DI | **CONFIRMED_ARCHITECTURE_VIOLATION** → **V-P1-03** | `communication-quick-action.executor.ts` L18/L53 — injects Rental **booking document bundle** workflow service (`documents/booking-document-bundle.service.ts`); not a whole-module ownership claim |
| `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` | **ALLOWED_IN_PROCESS_DEPENDENCY** | Remediated port slice |

### C. WhatsApp Business (Core)

| Surface | Classification | Notes |
|---------|----------------|-------|
| `BookingDocumentBundleService` DI (3 services) | **CONFIRMED_ARCHITECTURE_VIOLATION** → **V-P1-03** (grouped) | `whatsapp-ai-tools`, `whatsapp-booking-reminder`, `whatsapp-conversation-context` |
| `DamagesService` DI | **ALLOWED_IN_PROCESS_DEPENDENCY** | Provider under Core `vehicle-intelligence/damages` |
| Direct `prisma.booking.findFirst` / matcher reads | **NEEDS_FURTHER_EVIDENCE** | Shared DB tenant-scoped reads; not service injection — classification pending dedicated evidence; **not** counted as confirmed P2 hardening in this audit |

### D. Voice Assistant Platform (Core)

| Surface | Classification | Notes |
|---------|----------------|-------|
| `VOICE_BOOKING_READ_PORT` | **ALLOWED_IN_PROCESS_DEPENDENCY** | Remediated port slice |
| `voice-mcp-entity-resolver.service.ts` `prisma.booking.findMany` | **NEEDS_FURTHER_EVIDENCE** | Entity resolution via shared Prisma — **not** counted as confirmed P2 hardening in this audit |

### E. AI Platform (Core)

| Surface | Classification | Notes |
|---------|----------------|-------|
| `AI_VEHICLE_BOOKING_CONTEXT_READ_PORT` | **ALLOWED_IN_PROCESS_DEPENDENCY** | Remediated port slice |
| `RentalHealthService` in `ai-get-vehicle-health-summary.tool.ts` | **CONFIRMED_ARCHITECTURE_VIOLATION** → **V-P1-04** | `ai.module.ts` imports `RentalHealthModule`; same rule family as remediated V-P1-01 (VI) |
| `DamagesService` in health summary tool | **ALLOWED_IN_PROCESS_DEPENDENCY** | Core VI service |
| Type imports from `rental-health.types` | **ALLOWED_IN_PROCESS_DEPENDENCY** | Type-only |
| `explain-overdue-return` Prisma + `bookings/overdue-return` pure helpers | **ALLOWED_IN_PROCESS_DEPENDENCY** | No Rental business-service injection |

### F. Workers / queues

| Surface | Classification | Notes |
|---------|----------------|-------|
| Spot-check `task-automation-outbox` → `BookingDocumentBundleService` | **NEEDS_FURTHER_EVIDENCE** | Tasks module ownership not authority-promoted; same bundle service pattern — classify in dedicated tasks audit |

### G. Frontend

| Surface | Classification | Notes |
|---------|----------------|-------|
| `master` → `rental` util imports (2 files) | **DEFERRED_OPTIONAL_HARDENING** (P2-01 carry-forward) | `admin-billing.utils.ts`, `support-ops.utils.ts` |

### H. Future application readiness

| Surface | Classification | Notes |
|---------|----------------|-------|
| `core-app-m2m` module, service client registry patterns | **ALLOWED_IN_PROCESS_DEPENDENCY** | **INTERFACE_READINESS** — defaults fail-closed; no external activation claimed |
| Versioned vehicle read APIs (P3 journal) | **NEEDS_FURTHER_EVIDENCE** | Contract surfaces exist on `main`; full external consumer matrix not re-audited in this pass |

---

## Phase 3 — New confirmed violations (detail)

### V-P1-03 — Core platform → `BookingDocumentBundleService` (P1)

| Field | Value |
|-------|-------|
| Consumers | `communication/ops/communication-quick-action.executor.ts`; `whatsapp/whatsapp-ai-tools.service.ts`, `whatsapp-booking-reminder.service.ts`, `whatsapp-conversation-context.service.ts` |
| Consumer domain | **Core** (Communication, WhatsApp — owner 2026-11-19) |
| Provider | `backend/src/modules/documents/booking-document-bundle.service.ts` — **Rental booking document bundle** assembly (contracts, handover-linked generated documents, bundle views); registry **Documents** module remains `NOT_STARTED` — violation scope is **this service/workflow**, not full Documents authority |
| Rule | Guardrails § Core → Rental business-logic services forbidden |
| Risk | Platform channels coupled to Rental bundle generation lifecycle; harder to extract/version |
| Smallest remediation | Core-owned **document bundle read/generation command port(s)** with Rental adapter — scope per channel (likely shared `COMMUNICATION_*` / `WHATSAPP_*` token family) |
| Remediation draft (2026-11-20) | **POST-P6-BOUNDARY-PR8** — `CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT` + Rental adapter; four consumers migrated; see [`POST_P6_BOUNDARY_PR8_CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT_2026-11-20.md`](POST_P6_BOUNDARY_PR8_CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT_2026-11-20.md). **Not merged at re-audit baseline** `8b95e5e26`. Residual direct bundle injections (tasks outbox, bookings, invoices, etc.) unchanged. |

### V-P1-04 — AI Platform → `RentalHealthService` (P1)

| Field | Value |
|-------|-------|
| Source | `ai/tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.tool.ts` (constructor injection) |
| Consumer domain | **Core** (AI Platform) |
| Provider domain | **Rental** (`rental-health`) |
| Rule | Same as remediated V-P1-01 |
| Risk | Duplicated boundary debt; AI tool bypasses port pattern used for booking context |
| Smallest remediation | Reuse **`VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT`** or introduce **`AI_VEHICLE_RENTAL_HEALTH_READ_PORT`** delegating to same Rental adapter — migrate **one tool** first |

---

## Phase 4 — Prioritization summary

**Evidence classification** (Phase 2 tables) is separate from **remediation priority** below.

| Remediation priority | Count | Scope |
|----------------------|-------|--------|
| **P0** | **0** | Original platform `BookingsService` / `VehicleBookingContextService` group **closed** |
| **P1** | **2** | **CONFIRMED_ARCHITECTURE_VIOLATION** only: V-P1-03, V-P1-04 |
| **P2 (optional cleanup)** | **2 tracks** | **DEFERRED_OPTIONAL_HARDENING** only: VI `prisma.booking` / handover reads (NFE-01 carry-forward); frontend master→rental util imports (P2-01) |
| **Unprioritized until classified** | — | Surfaces marked **NEEDS_FURTHER_EVIDENCE** (WhatsApp/Voice Prisma booking reads; tasks outbox bundle; external API matrix) — **not** included in P2 counts |

---

## Phase 5 — Overall verdict

| Question | Answer |
|----------|--------|
| Original six remediations | **VERIFIED CLOSED** on `3b5773233` |
| Logical separation complete? | **NO** — **2** new P1 service-injection findings; Prisma/type **debt** explicitly deferred |
| **CORE_RENTAL_BOUNDARY_VERDICT** | **`BOUNDARY_AUDIT_CONDITIONAL_GO`** — post-P6 port program succeeded for audited scope; **not** full-domain certification |
| **FUTURE_APP_INTERFACE_READINESS** | **`INTERFACE_READINESS_PARTIAL`** — M2M/entitlements foundations present; no external activation |

**Next smallest operation:** `POST-P6-BOUNDARY-PR7_AI_RENTAL_HEALTH_READ_PORT` (single-file consumer, mirror PR5 adapter pattern) **or** narrow document-bundle read port for Communication executor only (smaller blast radius than WhatsApp trio — owner choice).

---

## Phase 6 — Validation (local, this PR)

| Check | Result |
|-------|--------|
| `bash architecture/scripts/validate-module-registry.sh` | Per PR CI |
| `bash architecture/drivingintelligence/scripts/validate-graph.sh` | Per PR CI |
| `git diff --check` | Per PR CI |
| Production | **NOT_CLAIMED** |

## Registry review

| Module | REGISTRY_REVIEWED | Reason |
|--------|-------------------|--------|
| Bookings | **UNCHANGED** | `AUDIT_IN_PROGRESS` |
| Vehicle intelligence / driving intelligence | **UNCHANGED** | Port remediation only on `main` |
| Communication Center | **UNCHANGED** | `AUDIT_IN_PROGRESS` · Production audit **NOT_STARTED** |
| WhatsApp Business | **UNCHANGED** | `AUDIT_IN_PROGRESS` · Production audit **NOT_STARTED** |
| Voice Assistant Platform | **UNCHANGED** | `AUDIT_IN_PROGRESS` · Production audit **NOT_STARTED** |
| AI Platform | **UNCHANGED** | `AUDIT_IN_PROGRESS` · Production audit **NOT_STARTED** |
| Documents | **UNCHANGED** | `NOT_STARTED`; V-P1-03 cites **booking-document-bundle** service only |
| Rental Health | **UNCHANGED** | `AUDIT_IN_PROGRESS` |

**Independent review:** [`POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_INDEPENDENT_REVIEW_2026-11-20.md`](POST_P6_CORE_RENTAL_BOUNDARY_REAUDIT_INDEPENDENT_REVIEW_2026-11-20.md)