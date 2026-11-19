# Post-P6 — Core ↔ Rental boundary audit (logical Alpha)

**Date:** 2026-11-19 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT`  
**Mode:** `READ_ONLY_FIRST` (documentation only; no runtime/schema/deploy)  
**Audited `origin/main` baseline:** `65a76e63b200b5d9110324a32620e2096bfac77f` (post #2449 monorepo governance)

**Binding context:** [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md), [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md), [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md), [`POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md`](POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md).

## Evidence vocabulary (do not conflate)

| Layer | Meaning |
|-------|---------|
| **CONFIRMED direct dependency** | Constructor/type import of a rental-module class or util — **code evidence only** |
| **CONFIRMED owning domain** | Registry **AUTHORITY_ACTIVE** or binding master-plan/domain authority states ownership **CONFIRMED** |
| **CONFIRMED architecture violation** | **Both**: forbidden dependency direction per guardrails **and** consumer + provider domains **CONFIRMED** — not inferred from module naming alone |
| **NEEDS_FURTHER_EVIDENCE** | Direct dependency **CONFIRMED**, but consumer and/or provider domain ownership unresolved for rule application |

Registry: Communication Center, WhatsApp Business, Voice Assistant Platform, AI Platform → **`NOT_STARTED`** (inventory only). **Rental Health** → **`AUDIT_IN_PROGRESS`** (partial authority; **Rental** domain). **Vehicle intelligence** → **Core** (master plan + P4 scope).

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
| B. NestJS DI across domains | **CONFIRMED** direct `BookingsService` (7 sites, 3 modules); **CONFIRMED** VI → `RentalHealthService` where domains evidenced |
| C. Core VI → booking persistence | **NFE** — Prisma reads retained; job repo uses booking resolution port |
| D–H | Unchanged from initial audit (workers spot-check, composition root, frontend P2, dashboard/evaluations allowed) |

---

## Phase 3 — Findings register

### CONFIRMED direct dependency — `BookingsService` (ownership of consumers **NOT_STARTED**)

Binding rule (*Core/platform → rental business services forbidden*) applies only when the **consumer** is **CONFIRMED Core/platform**. Do **not** classify these as `CONFIRMED_ARCHITECTURE_VIOLATION` until registry/owner classifies Communication, WhatsApp, or Voice Assistant Platform.

| ID | Consumer module | Registry | Injection sites | Runtime API surface (grep `65a76e63`) |
|----|-----------------|----------|-----------------|----------------------------------------|
| D-01 | `communication` | NOT_STARTED | `communication-quick-action.executor.ts` | **`findDetail(orgId, bookingId)` only** — L98, L132 (`detail.core.bookingNumber`, `detail.finance.*`) |
| D-02 | `whatsapp` | NOT_STARTED | 4 services | **`findDetail(orgId, bookingId)`** (6 call sites across AI context/tools, reminder, conversation context) |
| D-03 | `voice-mcp-gateway` | NOT_STARTED | 2 services | **`findAll`**, **`findById`** (read tools + write-tool precondition reads); broader than D-01 |

| Field | Value |
|-------|-------|
| Provider | `bookings` / `BookingsService` (**Rental** — Bookings `AUDIT_IN_PROGRESS`) |
| Direction | Unresolved consumer → Rental business service |
| Classification | **CONFIRMED direct dependency** + **NEEDS_FURTHER_EVIDENCE** (binding-rule violation) |
| Priority (pending ownership) | **P0-candidate** — material if consumers are Core/platform; **intra-rental channel** if consumers are reclassified Rental |

### CONFIRMED architecture violation (domains evidenced)

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

### CONFIRMED direct dependency — unresolved rule (AI Platform)

#### NFE-AI-01 — AI Platform → `VehicleBookingContextService`

| Field | Value |
|-------|-------|
| Source | `ai/tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.tool.ts` |
| Consumer registry | AI Platform **`NOT_STARTED`** |
| Provider | `bookings/vehicle-booking-context` (**Rental**) |
| Evidence | `ai.module.ts` → `BookingsModule`; tool injects `VehicleBookingContextService` |
| Classification | **CONFIRMED direct dependency** + **NEEDS_FURTHER_EVIDENCE** (violation if AI confirmed Core/platform) |
| Priority | **P1-candidate** |

### ALLOWED_IN_PROCESS_DEPENDENCY

Unchanged — see prior audit rows A-01 … A-08 (P4 ports, composition `forwardRef`, intra-rental Bookings→RDA, Rental→VI rental-health import direction, etc.).

### NEEDS_FURTHER_EVIDENCE (other)

| ID | Surface | Notes |
|----|---------|-------|
| NFE-01 | VI `prisma.booking` / `bookingHandoverProtocol` | Persisted from P4 — not automatic violation |
| NFE-02 | **D-01 / D-02 / D-03** consumer domain classification | Owner must assign Communication / WhatsApp / Voice to Core platform vs Rental operational channel |
| NFE-03 | Worker queue domain map | Spot-check only |
| NFE-AI-01 | AI → booking context | See above |

### P2 — Optional hardening

Frontend master → rental util imports — unchanged (P2-01, P2-02).

---

## Phase 4 — Prioritization (honest counts)

| Category | Count |
|----------|-------|
| **CONFIRMED_ARCHITECTURE_VIOLATION** | **2** (V-P1-01, V-P1-02) |
| **CONFIRMED direct dependency** (rule pending) | **3 module groups**, **7** `BookingsService` DI sites + **1** `VehicleBookingContextService` |
| **NEEDS_FURTHER_EVIDENCE** (binding rule) | **4** findings (D-01, D-02, D-03, NFE-AI-01) |
| **P0 (CONFIRMED)** | **0** |
| **P1 (CONFIRMED)** | **2** |
| **P0/P1-candidate** (post ownership) | Up to **3** platform channel groups + AI |

---

## Phase 5 — Verdict

**P4 VI ↔ rental-driving-analysis service boundary:** **CERTIFIED INTACT** on `65a76e63`.

**Post-P6 overall:** **`BOUNDARY_AUDIT_NOT_GO`** for **documented Core→Rental service violations** (V-P1-01, V-P1-02). Platform `BookingsService` couplings are **recorded** and **P0-candidate** but **not** counted as confirmed violations until consumer ownership is resolved.

**Review remediation (2026-11-19):** F1 ownership epistemics applied on top of initial audit; P4 and historical findings preserved.

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

**Out of scope for PR1:** WhatsApp / Voice (wider `findDetail` or `findAll`/`findById` surfaces) — classify consumer domain first or follow with separate narrow ports.

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
| Communication / WhatsApp / Voice / AI | **UNCHANGED** | `NOT_STARTED` — no promotion |
| Rental Health | **UNCHANGED** | `AUDIT_IN_PROGRESS` |