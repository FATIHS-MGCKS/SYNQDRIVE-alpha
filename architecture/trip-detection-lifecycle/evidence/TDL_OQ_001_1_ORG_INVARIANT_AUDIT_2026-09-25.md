# TDL-OQ-001.1 — COMPLETED trip organization scope invariant audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ001-1-ORG-001 |
| **Audited at (UTC)** | `2026-09-25` |
| **REPO_CURRENT** | `origin/main` + OQ-001 authority docs (PR #1766 pending merge at audit start) |
| **PRODUCTION_CURRENT** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `20260924235024_v4994` |
| **Verdict (org gap)** | **`STRUCTURALLY_IMPOSSIBLE`** — durable `COMPLETED` trip with missing tenant org + unrecoverable DI handoff |
| **OQ-001 status after** | **`RESOLVED`** — handoff contract + org invariant closed; non-atomic enqueue remains accepted bounded behavior |
| **Runtime changes** | **NONE** |

## Question

Can a **COMPLETED** trip exist under canonical completion paths such that **`TripPostFinalizeAnalysisProducer`** skips DI init for missing **`organizationId`**, with **no** recovery — i.e. a real reachable orphan?

## Phase 1 — Schema authority

### `VehicleTrip.organizationId`

| Layer | Finding |
|-------|---------|
| **Prisma** | **No `organizationId` field** on `VehicleTrip` (`schema.prisma` model ends at `vehicleId` FK + indexes) |
| **PostgreSQL** | **`information_schema`:** no `vehicle_trips.organization_id` column (bootstrap `20260325161141…` creates `vehicle_trips` without org column) |
| **TYPE_LEVEL_REQUIRED** | **N/A** on trip row |
| **DB_REQUIRED (trip)** | **N/A** |
| **APPLICATION_REQUIRED** | Tenant scope is **`Vehicle.organizationId`** via FK `vehicle_trips.vehicle_id → vehicles.id` |

### `Vehicle.organizationId`

| Layer | Finding |
|-------|---------|
| **Prisma** | `organizationId String` (required) |
| **PostgreSQL init** | `vehicles.organization_id TEXT NOT NULL` (`20260311224040_init/migration.sql`) |
| **FK** | `vehicles_organization_id_fkey` → `organizations` |
| **Production** | **`vehicles_null_org = 0`** / **`vehicles_total = 9`** |

### `VehicleTripDetectionState.organizationId`

| Layer | Finding |
|-------|---------|
| **Prisma** | `organizationId String?` (nullable) |
| **Production** | **`vtds_null_org = 0`** |

**Conclusion:** Durable trip tenant scope is **`Vehicle.organizationId`**, not a trip column. Missing org on the **trip row** is not a representable state.

## Phase 2 — Creation paths (production-reachable)

| Writer | `organizationId` on trip row | Source of tenant scope | Can trip exist without vehicle org? | Production reachable |
|--------|------------------------------|-------------------------|-------------------------------------|----------------------|
| **`TripDecisionEngine.createTrip`** | N/A (no column) | `vehicleId` → `vehicles.organization_id` NOT NULL | **NO** (FK + NOT NULL) | **YES** |
| **`TripDecisionEngine.splitTripAtGap`** (segment 2 create) | N/A | Same vehicle FK | **NO** | **YES** |
| Reconciliation / repair | Uses `TripDecisionEngine` only (no direct `vehicleTrip.create` for lifecycle) | Vehicle lookup in repair paths | **NO** | **YES** |
| Tests / battery integration specs | Direct `prisma.vehicleTrip.create` | Test fixtures | Test-only | **NO** (not production path) |

**`CURRENT_RUNTIME_CAN_CREATE_MISSING_ORG_TRIP`:** **NO** — no production lifecycle writer can attach a trip to a vehicle without DB org.

## Phase 3 — Completion paths

| Completion path | Org guaranteed before COMPLETED? | DI producer receives org | Gap reachable? |
|-----------------|-----------------------------------|--------------------------|----------------|
| Live FSM **`finalizeTrip`** | Vehicle DB org always present | **`job.data.organizationId`** (`string \| null`) from tracking queue — snapshot ingress uses **`vehicle.organizationId`** (non-null or snapshot aborts) | **Transient null job org theoretically possible**; **not** missing vehicle org |
| **`finalizeRepairedTrip`** (reconciliation) | Vehicle org required for reconcile entry (`resolveOrganizationId` throws if missing) | **`enqueueRepairEnrichment`** only if org string present; stale-ongoing uses vehicle lookup | Skip only if `vehicle.organizationId` absent — **DB forbids** |
| Mid-gap split (live) | Same as finalize | Job `organizationId` | Same as live FSM |
| Mid-gap / intra-gap repair split | Vehicle org loaded in tx | **`enqueueRepairEnrichment`** when org non-null | **NO** durable missing vehicle org |
| Boundary repair refresh | **`resolveOrganizationIdForVehicle`** throws if vehicle missing org | Required `string` | **NO** |
| Split-at-gap first segment COMPLETED inside engine | No org check on finalize | Producer called by orchestrator/repair with context org | Context-only gap |

**`CURRENT_RUNTIME_CAN_COMPLETE_MISSING_ORG_TRIP`:** **NO** for missing **vehicle** org. **YES** in code for **null producer argument** while vehicle has org (application check only).

## Phase 4 — Producer skip semantics

**File:** `trip-post-finalize-analysis.producer.ts`

| Behavior | Evidence |
|----------|----------|
| **Skip when** | `!input.organizationId` after best-effort event association |
| **Log** | `Skip durable analysis init — missing organizationId for trip ${tripId}` (warn) |
| **`tripAnalysisStatus`** | **Unchanged** by producer |
| **Recovery marker** | **None** written |
| **`DrivingAnalysisRun`** | **Not** created on skip |
| **Reconciliation notify** | **None** — passive; periodic scan picks up gaps separately |

## Phase 5 — DI reconciliation eligibility

**`TRIP_WITHOUT_ANALYSIS_RUN`** (`DrivingAnalysisReconciliationService.scanOrganization`):

```typescript
vehicleTrip.findMany({
  where: {
    vehicle: { organizationId },  // uses Vehicle org, NOT job context org
    tripStatus: COMPLETED,
    endTime: { gte: lookbackFrom },
    drivingAnalysisRuns: { none: { analysisType: 'TRIP_ENRICHMENT' } },
  },
});
```

| Question | Answer |
|----------|--------|
| Can reconciliation find COMPLETED trip when **vehicle has org** but producer skipped on **null job org**? | **YES** — org-scoped scan joins **`vehicle.organizationId`** |
| Can reconciliation find trip when **vehicle.organization_id IS NULL**? | **NO** — trip not in any org scan; **Production: 0 such vehicles** |
| **Global non-org recovery?** | **NO** — scheduler iterates **`organization.findMany(take: 50)`** only |
| **`DI_RECONCILIATION_CAN_RECOVER_MISSING_ORG`** (producer skip + valid vehicle org) | **YES** within **14d** lookback |
| **`DI_RECONCILIATION_CAN_RECOVER`** (vehicle truly without org) | **NO** — but **DB + prod data: impossible** |

## Phase 6 — Production read-only proof

| Metric | Value |
|--------|-------|
| **Production trips (COMPLETED all-time)** | **2261** |
| **COMPLETED last 90d** | **1085** |
| **COMPLETED last 14d without TRIP_ENRICHMENT run** | **0** |
| **Vehicles with `organization_id IS NULL`** | **0** |
| **COMPLETED (90d) with vehicle org NULL** | **0** |
| **COMPLETED (90d) vehicle org NULL and no DI run** | **0** |
| **COMPLETED (90d) without DI run (any cause)** | **30** — all **`end_time` between 2026-06-27 and 2026-07-03** (outside 14d reconciliation window); **not** org-null vehicles |

## Phase 7 — Historical provenance

The **30** ninety-day COMPLETED trips without `TRIP_ENRICHMENT` runs are **pre-window / early DI V2 era** (June–July 2026), all on vehicles with valid org. **Not** explained by producer org skip on current fleet.

## Phase 8 — Failure reachability classification

**Category: `STRUCTURALLY_IMPOSSIBLE`** for the defect class:

> COMPLETED + missing durable tenant org + no DI run + no recovery path

**Reasoning:**

1. Trip has no org column; tenant scope is **`Vehicle.organizationId`**, **NOT NULL** at DB with FK.
2. Production shows **zero** vehicles without org and **zero** COMPLETED trips on such vehicles (all-time).
3. Producer skip on **null context org** does **not** bypass reconciliation when vehicle org exists (**14d** scan uses vehicle join).
4. Current 14d Production window: **0** COMPLETED trips without TRIP_ENRICHMENT run.

**`ORG_GAP_REAL_RUNTIME_DEFECT`:** **NO**

## Phase 9 — OQ-001 closure (org slice)

The OQ-001 bounded gap “missing `organizationId` skips init with no DI reconciliation” is **refined**:

- **Incorrect** for trips whose **vehicle has org** (normal Production case): reconciliation **does** cover `TRIP_WITHOUT_ANALYSIS_RUN`.
- **Theoretically** relevant only for **`vehicles.organization_id IS NULL`**, which is **DB-forbidden** and **observationally absent**.

**TDL-OQ-001:** **`RESOLVED`** for authority purposes (handoff + org invariant). Remaining non-atomic DB vs enqueue is **documented bounded behavior**, not an open org orphan defect.

## Phase 10 — Hardening

**Not required** for org orphan closure.

Optional future polish (out of scope): derive org from **`Vehicle`** in producer when job context org is null (**Strategy B**) — reduces transient skip + log noise only; **not** a production defect today.

## Cross-reference

- Parent handoff audit: [TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md](TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md) (TDL-EVID-OQ001-HANDOFF-001)
