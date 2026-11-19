# Post-P6 — Core ↔ Rental boundary audit (logical Alpha)

**Date:** 2026-11-19 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT`  
**Mode:** `READ_ONLY_FIRST` (documentation only; no runtime/schema/deploy)  
**Audited `origin/main` baseline:** `65a76e63b200b5d9110324a32620e2096bfac77f` (post #2449 monorepo governance)

**Binding context:** [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md), [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md), [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md), [`POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md`](POST_P6_MONOREPO_GOVERNANCE_CORRECTION_2026-11-19.md).

## Phase 1 — P4 baseline reconciliation

| P4 certified slice | Status on `65a76e63` | Evidence |
|--------------------|----------------------|----------|
| VI → `RentalDrivingAnalysisService` / recompute trigger handler direct injection | **Still absent** | `rg RentalDrivingAnalysisService backend/src/modules/vehicle-intelligence` → no matches |
| VI → rental recompute via `RENTAL_DRIVING_ANALYSIS_*_PORT` tokens | **Unchanged (allowed)** | e.g. `driver-attribution.service.ts`, `trip-post-finalize-analysis.producer.ts` |
| `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef` | **Unchanged composition-root wiring** | P4 table preserved |
| `BookingsService` → `RentalDrivingAnalysisService` | **Still intra-rental allowed** | `bookings.service.ts` |
| VI direct `prisma.booking` / `bookingHandoverProtocol` | **Explicitly deferred** — not reopened as P4 violation | See §NEEDS_FURTHER_EVIDENCE |

**No contradictory code** vs P4 vehicle-intelligence ↔ rental-driving-analysis service boundary since `539d7705e`.

## Phase 2 — Inspection surfaces (summary)

| Surface | Result headline |
|---------|-----------------|
| A. Core → Rental direct service imports (VI focus) | **Clean** for rental-driving-analysis business services |
| B. NestJS DI across domains | **P0** platform modules → `BookingsService`; VI → `RentalHealthService` (P1) |
| C. Core VI → booking persistence | **NFE** — Prisma reads retained; job repo uses booking resolution port |
| D. Prisma booking from Core-owned VI | **NFE** — ownership/persistence port slice not in P4 acceptance |
| E. Shared workers / queues | **No new cross-domain service injection** in job handlers beyond P4 rental recompute handler owning `RentalDrivingAnalysisService` |
| F. Composition-root wiring | P4 `forwardRef` + port `useExisting` patterns **unchanged** |
| G. Frontend ownership | **P2** — `frontend/src/master` imports rental billing/support utils |
| H. Rental rules in Core-neutral services | **No new** rental workflow logic moved into VI metric pipelines |

## Phase 3 — Findings register

Classification vocabulary: `CONFIRMED_ARCHITECTURE_VIOLATION` | `ALLOWED_IN_PROCESS_DEPENDENCY` | `NEEDS_FURTHER_EVIDENCE`.

### CONFIRMED_ARCHITECTURE_VIOLATION (P0)

#### F-P0-01 — Platform communication → `BookingsService`

| Field | Value |
|-------|-------|
| Source | `backend/src/modules/communication/ops/communication-quick-action.executor.ts` |
| Consumer | Communication Center (`communication`) |
| Provider | Bookings (`BookingsService`) |
| Direction | Core platform → Rental business service |
| Owning domain (intended) | Core platform (registry: Communication Center **NOT_STARTED**) |
| Runtime purpose | Quick actions resolve booking detail / mutate booking-adjacent ops in omnichannel inbox |
| Evidence | Constructor `private readonly bookings: BookingsService`; `communication.module.ts` imports `BookingsModule` |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** — violates [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md) § Dependency invariants (platform modules must not inject rental workflow services) |
| Smallest remediation | Introduce a **read/command port** in `bookings/` (mirror P4-PR1 pattern) and bind adapter at composition root; migrate this executor only in a first PR |

#### F-P0-02 — WhatsApp platform → `BookingsService` (4 consumers)

| Field | Value |
|-------|-------|
| Sources | `whatsapp-ai-context.service.ts`, `whatsapp-ai-tools.service.ts`, `whatsapp-booking-reminder.service.ts`, `whatsapp-conversation-context.service.ts` |
| Consumer | WhatsApp Business integration |
| Provider | `BookingsService` |
| Direction | Core platform integration → Rental business service |
| Runtime purpose | AI context, tools, reminders, conversation linking to live bookings |
| Evidence | Direct `BookingsService` constructor injection; `whatsapp.module.ts` imports `BookingsModule` |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** (same invariant as F-P0-01) |
| Smallest remediation | Reuse **F-P0-01 port family** (`PLATFORM_BOOKING_CONTEXT_PORT` or split read/write tokens); migrate consumers incrementally (one service per PR after port lands) |

#### F-P0-03 — Voice MCP gateway → `BookingsService` (2 consumers)

| Field | Value |
|-------|-------|
| Sources | `voice-mcp-tools.service.ts`, `voice-mcp-write-tools.service.ts` |
| Consumer | Voice MCP gateway |
| Provider | `BookingsService` |
| Direction | Core platform → Rental business service |
| Runtime purpose | Voice agent read/write booking operations |
| Evidence | Constructor injection; `voice-mcp-gateway.module.ts` imports `BookingsModule` |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** |
| Smallest remediation | Same port family as F-P0-01/F-P0-02; write tools may need a narrow **command port** with explicit method surface |

### CONFIRMED_ARCHITECTURE_VIOLATION (P1) — domain ownership / coupling

#### F-P1-01 — Vehicle intelligence → `RentalHealthService`

| Field | Value |
|-------|-------|
| Sources | `vehicle-health-tab-summary.service.ts`, `vehicle-file-summary.service.ts` |
| Consumer | Vehicle intelligence (Core) |
| Provider | `rental-health` (`RentalHealthService`) |
| Direction | Core intelligence → Rental-named aggregation service |
| Runtime purpose | Read-only rental-blocked / compliance snapshots in VI UI summaries |
| Evidence | `@Inject(forwardRef(() => RentalHealthService))`; `rental-health.module.ts` documents VI ↔ rental-health cycle |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** (P1 — material coupling but not full `BookingsService` workflow); alternatively treat as **ownership debt** until `rental-health` is reclassified or a Core-neutral health read port exists |
| Smallest remediation | Extract **`VEHICLE_OPERATIONAL_HEALTH_READ_PORT`** owned by Core; rental-health implements adapter; break VI → rental service import |

#### F-P1-02 — Vehicle intelligence → bookings driver-pool util

| Field | Value |
|-------|-------|
| Sources | `driver-attribution.service.ts`, `trip-attribution.service.ts`, `trip-canonical-hydration.batch.ts` |
| Consumer | VI trips / attribution |
| Provider | `bookings/booking-allowed-drivers/booking-allowed-drivers.util` |
| Direction | Core intelligence → Rental module path (pure function) |
| Runtime purpose | Resolve allowed driver pool when attributing trips to bookings |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** (P1) — shared rental business rule embedded in util import; prefer neutral contract or port |
| Smallest remediation | Move pool resolution behind existing or new **booking resolution / driver-pool port** in VI `ports/` |

#### F-P1-03 — Platform AI → rental booking context service

| Field | Value |
|-------|-------|
| Source | `ai/tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.tool.ts` |
| Consumer | AI module (platform) |
| Provider | `VehicleBookingContextService` (`bookings/`) |
| Evidence | `ai.module.ts` `forwardRef(() => BookingsModule)` |
| Classification | **CONFIRMED_ARCHITECTURE_VIOLATION** (P1) — narrower than `BookingsService` but still rental-owned workflow context |
| Smallest remediation | Port + adapter; AI depends on token only |

### ALLOWED_IN_PROCESS_DEPENDENCY

| ID | Evidence | Why allowed |
|----|----------|-------------|
| A-01 | VI `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT` (+ related ports) | P4 certified port pattern |
| A-02 | VI imports `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS` types | Shared contract constants |
| A-03 | `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef` | Composition-root wiring (P4) |
| A-04 | `BookingsService` → `RentalDrivingAnalysisService` | Intra-rental orchestration |
| A-05 | `RentalHealthModule` → `VehicleIntelligenceModule` | Rental → Core (allowed direction) |
| A-06 | `rental-rules` → `BookingEligibilityRecheckService` via `BookingsModule` | Intra-rental |
| A-07 | `dashboard-utilization` → `isWizardDraftBooking` util + `prisma.booking` | Core/dashboard analytics over shared DB — product-scoped query, not rental service injection |
| A-08 | `evaluations-analytics` booking **signals** via Prisma aggregates | Analytics domain; no `BookingsService` injection |

### NEEDS_FURTHER_EVIDENCE

| ID | Surface | Notes |
|----|---------|-------|
| NFE-01 | VI `prisma.booking` / `bookingHandoverProtocol` | Files: `driver-attribution.service.ts`, `trip-attribution.service.ts`, `trip-assignment.service.ts`, `trip-canonical-hydration.batch.ts`, `damages.service.ts`, `tire-odometer-anchor-backfill.service.ts`, `vehicle-intelligence-tenant.scope.ts` — **persisted from P4**; classify future slice by ownership + least-privilege read model — **not** automatic P0 |
| NFE-02 | Communication / WhatsApp / Voice **registry ownership** | Modules inventoried **NOT_STARTED**; functional rental channel vs Core platform — invariant applied per binding guardrails until owner classifies modules |
| NFE-03 | Worker queue domain labels | No exhaustive Bull queue map in this audit; spot-check showed rental recompute jobs remain rental-module-owned |

### P2 — Optional hardening

| ID | Finding | Remediation (optional) |
|----|---------|------------------------|
| P2-01 | `frontend/src/master/components/billing/admin-billing.utils.ts` imports `rental/components/billing/billing.utils` | Extract shared neutral util under `frontend/src/` platform path |
| P2-02 | `frontend/src/master/components/support-ops/support-ops.utils.ts` imports rental support utils | Same |

## Phase 4 — Prioritization

| Priority | Count | Material impact |
|----------|-------|-----------------|
| **P0** | **3** module groups (**7** `BookingsService` injection sites) | Blocks clean Core/Rental **service** independence for platform channels (comms, WhatsApp, voice) |
| **P1** | **3** | VI ↔ rental-health cycle; driver-pool util; AI booking context |
| **P2** | **2** | Frontend master/rental util sharing |

## Phase 5 — Verdict

**P4 vehicle-intelligence ↔ rental-driving-analysis service boundary:** **CERTIFIED INTACT** on `65a76e63`.

**Post-P6 overall:** **`BOUNDARY_AUDIT_NOT_GO`** — P0 platform → `BookingsService` dependencies remain and were **out of P4 scope** (P4 audited VI ↔ RDA only).

**Historical findings:** P4 record preserved; this audit **extends** scope to platform modules and VI rental-health coupling without downgrading P4.

## Phase 6 — Next executable operation (single PR)

**Recommended:** `POST-P6-BOUNDARY-PR1_PLATFORM_BOOKING_READ_PORT`

1. Define `PLATFORM_BOOKING_OPERATIONS_PORT` (read + narrowly scoped commands used by communication quick actions today) in `bookings/ports/` with interface owned by **platform** or **bookings** adapter implementer.
2. Register `useExisting` adapter delegating to `BookingsService` in `BookingsModule` exports.
3. Migrate **only** `CommunicationQuickActionExecutorService` off direct `BookingsService` injection (smallest blast radius).
4. Jest: executor spec mocks port token; parity test that adapter forwards to existing service methods.
5. Update bookings authority **evidence** (not registry promotion).

Subsequent PRs: WhatsApp (F-P0-02), Voice MCP (F-P0-03), then P1 VI ports.

## Validation (local, 2026-11-19 UTC)

| Check | Result |
|-------|--------|
| `bash architecture/scripts/validate-module-registry.sh` | Recorded at PR CI |
| `bash architecture/dsrg/scripts/validate-graph.sh` | Recorded at PR CI |
| `git diff --check` | Recorded at PR CI |
| Production | **NOT_CLAIMED** |

## Registry review (this PR)

| Module | REGISTRY_REVIEWED | Reason |
|--------|-------------------|--------|
| Bookings | **UNCHANGED** | `AUDIT_IN_PROGRESS` — evidence-only audit append |
| Vehicle intelligence / rental-driving-analysis | **UNCHANGED** | P4 boundary reaffirmed; no authority promotion |
| Communication / WhatsApp / Voice | **UNCHANGED** | `NOT_STARTED` — findings recorded; no coverage promotion |