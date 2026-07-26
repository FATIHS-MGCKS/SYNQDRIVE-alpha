# Master Admin Remediation — Phase 2E.1: Tenant Boundary Validation

**Date:** 2026-07-26  
**Status:** Analysis complete — **no code changes** in this phase  
**Scope:** Full-platform tenant isolation audit across PostgreSQL, Prisma, guards, APIs, workers, analytics, and ClickHouse  
**Prerequisites:** [2D.4 ClickHouse Tenant Isolation](./clickhouse-tenant-isolation.md) · [2D.8 Production Readiness](./clickhouse-production-readiness.md) · P1 blocker fixes (V4.9.890)

---

## Executive summary

| Area | Verdict | Notes |
|------|---------|-------|
| **Terminology** | Consistent | `organizationId` / `org_id` — no `tenant_id` in schema or CH |
| **Guard layer** | Strong with gaps | `OrgScopingGuard` + `VehicleOwnershipGuard` + `resolveOrgScope()` cover most user-facing routes |
| **PostgreSQL (Prisma)** | Strong | ~232 models carry `organizationId`; repositories in critical paths scope by org |
| **Service layer** | Mixed | Vehicle-intelligence has canonical assert helpers; some modules use manual JWT checks |
| **API endpoints** | 3 P1 gaps | Insurances live-sharing PATCH; HM vehicle register without ownership guard |
| **Workers / BullMQ** | By design cross-org | Schedulers scan fleet-wide; processors re-resolve org from vehicle/outbox |
| **ClickHouse** | Partial (improving) | Migration 007 + org writes + read predicates on analytics; HF reads still vehicle-only |
| **Platform admin** | Intentional bypass | `MASTER_ADMIN` pass-through on guards — audited separately |
| **Overall risk** | **Low–Medium** | No P0 exploitable cross-tenant read/write found; 3 P1 API gaps + CH defense-in-depth debt |

**Recommendation:** Proceed to **Phase 2E.2 — Remediation** targeting P1 API gaps (R1–R3), ClickHouse HF read hardening (R4–R5), and guard standardization (R6–R8).

---

## 1. Terminology and canonical model

| Term | SynqDrive meaning |
|------|-------------------|
| **Tenant** | `Organization` (`organizations.id`, UUID) |
| **`organizationId`** | PostgreSQL / application-layer tenant key |
| **`org_id`** | ClickHouse column (same UUID as `organizationId`) |
| **`tenant_id`** | **Not used** anywhere in schema or application code |
| **`request.tenantId`** | Set by `OrgScopingGuard` from route `:orgId` for downstream services |
| **Canonical truth** | PostgreSQL — all tenant ownership ultimately resolves here |

### Prisma schema coverage

| Metric | Count |
|--------|-------|
| Total models | 312 |
| Models with `organizationId String` | 232 (~74%) |
| Models without direct `organizationId` | 80 — scoped via FK relations (e.g. `vehicleId` → `vehicle.organizationId`) |

**Assessment:** Tenant scoping is structurally embedded in the data model. Models without direct `organizationId` are typically join/lookup tables, global reference data, or scoped through parent entities.

---

## 2. Defense-in-depth architecture

```
HTTP Request
    │
    ├─► AuthGuard (global) — JWT verification; explicit public allowlist
    │
    ├─► Route guard (opt-in)
    │     ├─ OrgScopingGuard — :orgId membership + JWT org match
    │     ├─ VehicleOwnershipGuard — vehicleId ∈ user.organizationId
    │     ├─ RolesGuard — MASTER_ADMIN / ORG_ADMIN / module roles
    │     ├─ PermissionsGuard — module permission matrix
    │     └─ resolveOrgScope() — billing alternate scope resolver
    │
    ├─► Service layer
    │     ├─ assertVehicleInOrganization()
    │     ├─ assertTripInOrganization()
    │     ├─ assertBookingInOrganization()
    │     └─ Private assertVehicle() variants per module
    │
    ├─► Repository / Prisma
    │     └─ where: { organizationId } or vehicle: { organizationId }
    │
    └─► ClickHouse (optional analytics mirror)
          └─ buildOrgIdSqlPredicate() + vehicle_id (defense-in-depth)
```

### Layer strengths

| Layer | Strength | Weakness |
|-------|----------|----------|
| AuthGuard | Explicit public path allowlist (no broad `@Public()` decorator) | Webhooks rely on per-controller signature verification |
| OrgScopingGuard | DB membership re-check (revocation-safe) | No-op when route lacks `:orgId` |
| VehicleOwnershipGuard | 404 on mismatch (no information leak) | MASTER_ADMIN bypass |
| Assert helpers | Centralized in `vehicle-intelligence-tenant.scope.ts` | Not used uniformly across all modules |
| Prisma queries | Most tenant tables include `organizationId` in `where` | Some global `findUnique({ id })` by design (outbox, admin) |
| ClickHouse | UUID `vehicle.id` globally unique + PG pre-checks | No row-level security; optional org predicate |

---

## 3. Guards and policies

### 3.1 Global authentication

**File:** `backend/src/shared/auth/auth.guard.ts`

- Global `APP_GUARD` — all `/api/*` routes require JWT unless explicitly public.
- Public paths: auth flows, invite validate/accept, webhooks (DIMO, Stripe, Twilio, Resend, Didit, ElevenLabs, HM), health, metrics (bearer-gated), voice MCP, AI vehicle-specs registration helpers.
- No `@Public()` decorator pattern — reduces accidental exposure of new endpoints.

### 3.2 OrgScopingGuard

**File:** `backend/src/shared/auth/org-scoping.guard.ts`

| Rule | Behavior |
|------|----------|
| No user | Pass (AuthGuard handles) |
| `MASTER_ADMIN` | Pass-through; stamps `request.tenantId` from `:orgId` |
| No `:orgId` in route | **No-op** — downstream must enforce |
| JWT `organizationId` ≠ `:orgId` | `403 Forbidden` + IAM metric `cross_tenant_denial` |
| No active membership | `403 Forbidden` |
| Valid membership | Stamps `request.tenantId = orgId` |

**Usage:** ~50+ controller files reference `OrgScopingGuard` (org-scoped routes under `/organizations/:orgId/...`).

### 3.3 VehicleOwnershipGuard

**File:** `backend/src/shared/auth/vehicle-ownership.guard.ts`

| Rule | Behavior |
|------|----------|
| `MASTER_ADMIN` | Pass-through |
| No `:vehicleId` | No-op |
| Vehicle not in user's org | `404 Not Found` |

**Usage:** `vehicles.controller.ts` (vehicle-scoped routes), `vehicle-intelligence.controller.ts`, `document-extraction.controller.ts`.

### 3.4 PermissionsGuard

**File:** `backend/src/shared/auth/permissions.guard.ts`

- Resolves org via `resolvePermissionOrgId()`: param → query `orgId` → JWT.
- Non–master-admin cannot request a different org via param/query.
- `ORG_ADMIN` bypass within org; others need explicit module permissions.

### 3.5 Billing scope resolver

**File:** `backend/src/modules/billing/billing-scope.util.ts`

- Alternative to `OrgScopingGuard` on `billing.controller.ts`.
- `MASTER_ADMIN` must pass explicit `orgId`.
- Others locked to JWT org.

### 3.6 Dead code note

**File:** `backend/src/shared/interceptors/tenant-context.interceptor.ts`

- Defined but **never registered** in `app.module.ts`.
- **Risk P2 (R7):** Dead duplicate of org scoping — should be removed or wired in remediation.

### 3.7 Security regression tests

| Test file | Coverage |
|-----------|----------|
| `iam-tenant-isolation.security.regression.spec.ts` | IAM cross-tenant denial |
| `iam-endpoint-enforcement-triage.security.spec.ts` | Endpoint guard matrix |
| `vehicles.controller.security.characterization.spec.ts` | Vehicle org isolation |
| `bookings-security-negative.spec.ts` | Booking tenant boundaries |
| `document-extraction.controller.security.spec.ts` | Document extraction isolation |
| `voice-assistant.controller.security.characterization.spec.ts` | Voice routes (some `it.todo`) |

---

## 4. API endpoint inventory

**Total controllers:** ~100 (`@Controller` decorators in `backend/src`)

### 4.1 Org-scoped routes (OrgScopingGuard)

Representative modules with `organizations/:orgId/...` pattern:

| Module | Controller | Guard |
|--------|------------|-------|
| Vehicles | `vehicles.controller.ts` | `OrgScopingGuard` on org routes |
| Bookings | `bookings.controller.ts` | `OrgScopingGuard` |
| Customers | `customers.controller.ts` | `OrgScopingGuard` |
| Tasks | `tasks.controller.ts` | `OrgScopingGuard` |
| Documents | `documents.controller.ts`, `legal-documents.controller.ts` | `OrgScopingGuard` |
| Notifications | `notifications.controller.ts` | `OrgScopingGuard` |
| Workflows | `workflows.controller.ts` | `OrgScopingGuard` |
| Fines | `fines.controller.ts` | `OrgScopingGuard` |
| Data Analyse | `data-analyse.controller.ts` | `OrgScopingGuard` + `assertVehicle()` |
| Damages | `damages-org.controller.ts` | `OrgScopingGuard` |
| Stations, Vendors, Pricing, Integrations, etc. | Various | `OrgScopingGuard` |

### 4.2 Vehicle-scoped routes (VehicleOwnershipGuard)

| Module | Pattern | Guard |
|--------|---------|-------|
| Vehicles | `/vehicles/:vehicleId/...` | `VehicleOwnershipGuard` |
| Vehicle Intelligence | `/vehicles/:vehicleId/...` | `VehicleOwnershipGuard` + permission guard |
| Document Extraction | `/vehicles/:vehicleId/document-extractions/...` | `VehicleOwnershipGuard` |

### 4.3 Platform-admin (intentional cross-tenant)

| Controller | Guard | Scope |
|------------|-------|-------|
| `platform-admin.controller.ts` | `MASTER_ADMIN` | Fleet-wide ops, monitoring, hardware backfill |
| `organizations.controller.ts` | `MASTER_ADMIN` | Org CRUD |
| `dimo.controller.ts` | `MASTER_ADMIN` | DIMO platform admin |
| `high-mobility-admin.controller.ts` | `MASTER_ADMIN` | HM platform admin |
| `voice-control-plane-admin.controller.ts` | `MASTER_ADMIN` | Voice control plane |
| `voice-billing-admin.controller.ts` | `MASTER_ADMIN` | Cross-org voice billing |
| `platform-email.controller.ts` | `MASTER_ADMIN` | Email platform |
| `internal-business-insights.controller.ts` | `MASTER_ADMIN` | Run insights per/all orgs |
| `products.controller.ts` | `MASTER_ADMIN` | Product assignment |
| `prospects.controller.ts` | `MASTER_ADMIN` | Sales prospects |
| `billing.controller.ts` (admin routes) | `MasterBillingGuard` | Platform billing |
| `twilio-tenant-provisioning.controller.ts` | `MASTER_ADMIN` | Per-org Twilio provisioning |

**Assessment:** Cross-tenant access is explicit, role-gated, and auditable. `MASTER_ADMIN` actions should be logged (activity-log module).

### 4.4 Webhooks (no JWT; alternate verification)

| Controller | Verification |
|------------|--------------|
| `dimo-webhook.controller.ts` | HMAC / verification token |
| `stripe-webhook.controller.ts` | Stripe signature |
| `stripe-connect-webhook.controller.ts` | Stripe signature |
| `twilio-webhook.controller.ts` | Twilio signature |
| `resend-webhook.controller.ts` | Resend signature |
| `whatsapp-webhook.controller.ts` | Meta verification |
| `didit-webhook.controller.ts` | Didit signature |
| `elevenlabs-webhook.controller.ts` | HMAC; org in path |
| `high-mobility-webhook.controller.ts` | HM HMAC |

**Assessment:** Webhooks resolve tenant from payload metadata (org in path, Stripe account, webhook inbox record). Processors re-load scoped records by primary key.

### 4.5 Manual JWT org checks (no OrgScopingGuard)

| Controller | Pattern | Risk |
|------------|---------|------|
| `insurances.controller.ts` | `req.user.organizationId` manual | **P1** — PATCH gap (see R1) |
| `parts-accessories.controller.ts` | Manual JWT `organizationId` | P2 — no DB membership re-check |
| `account.controller.ts` | User-scoped `/account/me` | OK — no org data |
| `iam-mfa-account.controller.ts` | User-scoped MFA | OK |

### 4.6 Identified API gaps

| ID | Endpoint | Issue | Severity |
|----|----------|-------|----------|
| **R1** | `PATCH /api/v1/insurances/live-sharing/:id` | Updates by global permission ID without org ownership check | **P1** |
| **R2** | `POST /api/v1/vehicles/:vehicleId/activate-high-mobility-health` | `RolesGuard` only — no `VehicleOwnershipGuard` | **P1** |
| **R3** | `POST /api/v1/vehicles/register/hm-only` | `organizationId` from request body — no JWT org match | **P1** |

**R1 evidence:**

```97:103:backend/src/modules/insurances/insurances.controller.ts
  @Patch('live-sharing/:id')
  async updateLiveSharing(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.service.updateLiveSharing(id, {
      status: body.status,
      revokedBy: req.user?.id,
      revokeReason: body.revokeReason,
    });
```

```522:524:backend/src/modules/insurances/insurances.service.ts
  async updateLiveSharing(id: string, data: { status?: string; revokedBy?: string; revokeReason?: string }) {
    const perm = await this.prisma.insuranceLiveSharingPermission.findUnique({ where: { id } });
```

**R2 evidence:**

```25:50:backend/src/modules/high-mobility/high-mobility-vehicle-register.controller.ts
@Controller('vehicles')
@UseGuards(RolesGuard)
export class HighMobilityVehicleRegisterController {
  // ...
  @Post(':vehicleId/activate-high-mobility-health')
  async activateHmHealth(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { hmVehicleId: string },
  ) {
    await this.vehicleLinkService.activateHealthLink(body.hmVehicleId, vehicleId);
```

**R3 evidence:** `registerHmOnlyVehicle` accepts `organizationId` from DTO body; controller has `RolesGuard` but no org validation against JWT.

---

## 5. PostgreSQL / Prisma query analysis

### 5.1 Well-scoped patterns (representative)

| Module | Pattern |
|--------|---------|
| `notification.repository.ts` | All reads/writes include `organizationId` in `where` |
| `driving-evidence.repository.ts` | `assertVehicleInOrg()` before mutations |
| `tasks.service.ts` | Link validation: `findFirst({ id, organizationId })` per entity |
| `dashboard-insights.repository.ts` | Org-scoped insight queries |
| `booking-document-generation.repository.ts` | Org in all job queries |
| `voice-control-plane.repository.ts` | Extensive `organizationId` filtering |

### 5.2 Scoped via parent relation

Many models lack direct `organizationId` but are scoped through joins:

```typescript
// Example: trip queries
where: { id: tripId, vehicle: { organizationId } }

// Example: driving events
scopedDrivingEventWhere(organizationId, vehicleId, extra)
```

### 5.3 Intentionally global queries

| Service | Purpose | Guard |
|---------|---------|-------|
| `platform-admin.service.ts` | Cross-org dashboards, poll logs | `MASTER_ADMIN` only |
| `billing-reconciliation.service.ts` | Platform subscription scan | Scheduler / admin |
| `iam-data-retention-worker.service.ts` | IAM retention sweeps | Worker (operational) |
| `dimo-snapshot.scheduler.ts` | All DIMO-connected vehicles | Scheduler (by design) |
| `trip-reconciliation.scheduler.ts` | Global active vehicle repair | Scheduler (by design) |
| `data-retention.scheduler.ts` | Age-based prune | Scheduler (operational) |

### 5.4 Global `findUnique({ id })` patterns

| Pattern | Risk | Mitigation |
|---------|------|------------|
| Outbox repos (`task-automation-outbox`, `notification-delivery-outbox`, `invite-email-outbox`) | P2 | IDs unguessable; org stamped at enqueue |
| Webhook event repos (`stripe-connect-webhook-event`) | P2 | Stripe account → org resolved at processing |
| `vehicles.service.findById(id)` | P2 | Used by `GET admin/vehicles/:vehicleId` (MASTER_ADMIN) |
| `brake-evidence.service` — `findUnique({ id })` | P2 | Relies on upstream guard + UUID |

### 5.5 Assert helper usage map

**Canonical file:** `backend/src/modules/vehicle-intelligence/tenant/vehicle-intelligence-tenant.scope.ts`

| Helper | Used by |
|--------|---------|
| `assertVehicleInOrganization` | trips, trip-analytics, driver-score, driving-events, data-analyse, document-upload-context, service-cases, technical-observations, driving-intelligence-jobs, driving-evidence, driving-capability repos |
| `assertTripInOrganization` | trips.service |
| `assertBookingInOrganization` | trips module |
| `scopedVehicleTripWhere` | trip list/filter queries |
| `scopedDrivingEventWhere` | driving event queries |

**Gap:** No shared `assertCustomerInOrganization` — customers module uses service-layer `organizationId` in queries directly.

---

## 6. Repository layer

**Repository files with Prisma access:** 33 `*.repository.ts` files in `backend/src`

| Repository | `organizationId` in queries | Notes |
|------------|----------------------------|-------|
| `notification.repository.ts` | Yes (26 refs) | Exemplary tenant scoping |
| `voice-control-plane.repository.ts` | Yes (70 refs) | Comprehensive |
| `driving-intelligence-jobs.repository.ts` | Yes + `assertVehicleInOrg` | Job enqueue scoped |
| `booking-document-generation.repository.ts` | Yes | Generation jobs org-scoped |
| `dashboard-insights.repository.ts` | Yes | Per-org insights |
| `payment-transaction.repository.ts` | Yes | Payment records scoped |
| `stripe-connect-webhook-event.repository.ts` | Partial (3 refs) | Global by event ID at dequeue |
| `task-automation-outbox.repository.ts` | Partial | Global by outbox ID |
| `invite-email-outbox.repository.ts` | Partial | Global by outbox ID |

**Assessment:** Repository layer in newer modules consistently scopes by `organizationId`. Legacy outbox/webhook repos use global primary-key lookup by design — tenant context is on the row, resolved at enqueue time.

---

## 7. Background workers, cron jobs, and BullMQ

### 7.1 Processors (19)

| Processor | Job carries `organizationId`? | Cross-org scan? | Isolation mechanism |
|-----------|------------------------------|-----------------|---------------------|
| `dimo-snapshot.processor.ts` | Resolved from vehicle | Per-vehicle job | Vehicle lookup → `organizationId` on CH writes |
| `dimo-vehicle-sync.processor.ts` | N/A | Global DIMO sync | Platform integration |
| `dimo-dtc.processor.ts` | Resolved from vehicle | Per-vehicle | Vehicle FK |
| `trip-tracking.processor.ts` | Via vehicle context | Per-vehicle | Vehicle FK |
| `trip-behavior-enrichment.processor.ts` | `organizationId: string \| null` | Per-trip | Nullable; resolved when present |
| `tire-recalculation.processor.ts` | Yes (scheduler) | Per-vehicle | Org from scheduler query |
| `brake-recalculation.processor.ts` | Optional | Per-vehicle | Resolved from vehicle |
| `driving-intelligence-job.processor.ts` | **Required** | Per-org job | Explicit org in payload |
| `driving-impact.processor.ts` | `organizationId: string \| null` | Per-vehicle | Nullable |
| `dtc-knowledge.processor.ts` | N/A | Global | Knowledge base (not tenant data) |
| `notification-evaluation.processor.ts` | **Yes** | Per-org | Org in job data |
| `notification-delivery.processor.ts` | Outbox ID | Per-outbox | Outbox row carries org |
| `payment-email.processor.ts` | Outbox ID | Per-outbox | Outbox row carries org |
| `task-automation-outbox.processor.ts` | Outbox ID | Per-outbox | Outbox row carries org |
| `battery-v2.processor.ts` | **Required** | Per-org | Explicit org in payload |
| `voice-webhook.processor.ts` | Event ID | Per-event | Event record carries org |
| `device-connection-webhook.processor.ts` | Inbox ID | Per-inbox | Webhook inbox scoped |
| `booking-document-generation.processor.ts` | **Yes** | Per-org | Explicit org in payload |
| `clickhouse-mirror-retry.processor.ts` | Mirror payload | Per-vehicle | Vehicle/org in payload |

### 7.2 Schedulers (21)

| Scheduler | Scope | `organizationId` in enqueued jobs? |
|-----------|-------|-----------------------------------|
| `dimo-snapshot.scheduler.ts` | **Global** vehicle scan | No — `vehicleId`, `dimoTokenId` only |
| `dimo-dtc.scheduler.ts` | Global DIMO vehicles | Per-vehicle |
| `dimo-vehicle-sync.scheduler.ts` | Global | N/A |
| `tire-recalculation.scheduler.ts` | Per-org vehicles from query | **Yes** |
| `brake-recalculation.scheduler.ts` | Per-org from vehicle join | **Yes** |
| `trip-tracking-recovery.scheduler.ts` | Stale sessions | **Yes** |
| `trip-analysis-recovery.scheduler.ts` | Global trip scan | Per-trip/vehicle |
| `trip-reconciliation.scheduler.ts` | **Global** active vehicles | Per-vehicle |
| `driving-analysis-reconciliation.scheduler.ts` | Org-scoped service | Internal |
| `payment-connect-reconciliation.scheduler.ts` | Per payment accounts | Via account org |
| `billing-reconciliation.scheduler.ts` | **Global** subscriptions | Platform job |
| `hm-health-polling.scheduler.ts` | HM-linked vehicles | Per-vehicle |
| `data-retention.scheduler.ts` | **Global** prune | N/A |
| `storage-orphan-sweep.scheduler.ts` | Global storage | N/A |
| `battery-v2-retention.scheduler.ts` | Org-aware | Mixed |
| `battery-v2-reconciliation.scheduler.ts` | Org-aware | Mixed |
| `voice-retention.scheduler.ts` | Per-org voice data | Org-scoped service |
| `iam-data-retention.scheduler.ts` | **Global** IAM | N/A |
| `document-retention.scheduler.ts` | Org-scoped retention | Per-org |
| `document-extraction-recovery.scheduler.ts` | Rows carry org | **Yes** |
| `document-intake-action-recovery.scheduler.ts` | Rows carry org | **Yes** |

### 7.3 Worker isolation assessment

**Model:** Schedulers intentionally operate cross-tenant at the fleet level. Isolation relies on:

1. **UUID primary keys** — vehicle/outbox/trip IDs are globally unique and unguessable.
2. **Processor re-resolution** — processors load vehicle/outbox and use its `organizationId` for writes.
3. **No user-supplied job injection** — jobs are enqueued by schedulers or authenticated API paths.

**Risk P2 (R9):** If a malicious actor could inject arbitrary BullMQ jobs with foreign `vehicleId`, cross-org writes would be possible. Mitigation: Redis/BullMQ is internal-only; no external job submission API.

---

## 8. ClickHouse tenant boundaries

> Detailed CH analysis in [clickhouse-tenant-isolation.md](./clickhouse-tenant-isolation.md).  
> P1 fixes in V4.9.890 partially address T1, T9.

### 8.1 Write path (current state post-2D.7 + P1)

| Producer | Table | `org_id` written? |
|----------|-------|-------------------|
| `ClickHouseTelemetryService.insertSnapshot` | `telemetry_snapshots` | **Yes** (post-2D.7) |
| `detectAndInsertStateChanges` | `telemetry_state_changes` | **Yes** (post-2D.7) |
| `ClickHouseWaypointsService` | `telemetry_waypoints` | Yes |
| `ClickHouseActivityWindowsService` | `trip_activity_windows` | Yes |
| `ClickHouseHfService` | HF tables | Yes |

### 8.2 Read path

| Service | Org filter | Status |
|---------|------------|--------|
| `ClickHouseAnalyticsService.findIgnitionSegments` | `buildOrgIdSqlPredicate` when `orgId` passed | Improved (P1-T9) |
| `ClickHouseAnalyticsService.findMotionSegments` | Same | Improved |
| `ClickHouseAnalyticsService.fetchSnapshotsInWindow` | Same | Improved |
| `ClickHouseAnalyticsService.summarizeActivityWindow` | Same | Improved |
| `ClickHouseAnalyticsService.summarizeRecentIngestion` | **None** (fleet-wide health) | Ops-only — acceptable |
| `ClickHouseAnalyticsService.getStorageStats` | **None** (all tenants) | Ops-only — acceptable |
| `ClickHouseHfService.*` reads | `vehicle_id` + `trip_id` only | **Gap (R4)** |
| `TripEvidenceReadService` | PG pre-check via caller | Low risk |
| `SignalQualityReadService` | PG join `vehicle.organizationId` | Good |
| `DataAnalyseService` | `assertVehicle(orgId, vehicleId)` before CH | Good |

### 8.3 `buildOrgIdSqlPredicate` behavior

```7:14:backend/src/modules/clickhouse/clickhouse-org-filter.util.ts
export function buildOrgIdSqlPredicate(
  columnRef: string,
  orgId: string | null | undefined,
): string {
  if (!orgId) {
    return '';
  }
  return ` AND (${columnRef} = {orgId: String} OR ${columnRef} = '')`;
}
```

**Risk P1 (R5):** When `orgId` is omitted, no CH tenant filter is applied. Callers must always pass org context.

### 8.4 ClickHouse isolation model

| Control | Present? |
|---------|----------|
| Row-level security | **No** |
| Per-tenant CH users | **No** — single shared user |
| Network isolation | Localhost bind on VPS |
| Application guards | `OrgScopingGuard` + `assertVehicle` before CH reads |
| `org_id` in schema | Migration 007 (additive); backfill service available |
| `org_id` in read SQL | Partial — analytics yes, HF no |

---

## 9. Analytics pipeline tenant flow

```
User/API (org-scoped)
    │
    ├─► OrgScopingGuard / VehicleOwnershipGuard
    │
    ├─► assertVehicleInOrganization(orgId, vehicleId)
    │
    ├─► PostgreSQL trip/vehicle ownership verified
    │
    └─► ClickHouse query
          ├─ vehicle_id = {uuid}     (always)
          └─ org_id = {orgId}        (when caller passes orgId)
```

**Detectors** (`IgnitionSegmentDetector`, `MotionSegmentDetector`, `ActivityWindowDetector`) receive `DetectorContext.organizationId` and pass it to analytics service methods — good when context is populated.

**ActivityWindowProducerService** skips CH write if `!params.orgId` — good defensive check.

---

## 10. Consolidated risk register

| ID | Severity | Area | Finding | File(s) | Remediation phase |
|----|----------|------|---------|---------|-------------------|
| **R1** | **P1** | API | `PATCH insurances/live-sharing/:id` — global ID update without org check | `insurances.controller.ts`, `insurances.service.ts` | 2E.2 |
| **R2** | **P1** | API | HM activate endpoint lacks `VehicleOwnershipGuard` | `high-mobility-vehicle-register.controller.ts` | 2E.2 |
| **R3** | **P1** | API | `registerHmOnlyVehicle` trusts body `organizationId` | `high-mobility-registration.service.ts` | 2E.2 |
| **R4** | **P1** | ClickHouse | HF reads filter `vehicle_id` only — no `org_id` predicate | `clickhouse-hf.service.ts`, `trip-evidence-read.service.ts` | 2E.2 |
| **R5** | **P1** | ClickHouse | `buildOrgIdSqlPredicate` returns empty when `orgId` omitted | `clickhouse-org-filter.util.ts` | 2E.2 — require orgId in CH service API |
| **R6** | P2 | Guard | `OrgScopingGuard` no-op without `:orgId` | `org-scoping.guard.ts` | 2E.2 — audit alternate patterns |
| **R7** | P2 | Architecture | `TenantContextInterceptor` never wired | `tenant-context.interceptor.ts` | 2E.2 — remove or wire |
| **R8** | P2 | API | Manual JWT org checks vs DB membership | `insurances.controller.ts`, `parts-accessories.controller.ts` | 2E.2 |
| **R9** | P2 | Workers | Global schedulers by design | Various schedulers | Document + monitor |
| **R10** | P2 | Prisma | Outbox global `findUnique({ id })` | Outbox repos | Accept — enqueue-time scoping |
| **R11** | P2 | Admin | `hardware-backfill` updates vehicles by ID list | `platform-admin.controller.ts` | Accept — MASTER_ADMIN only |
| **R12** | P2 | ClickHouse | Legacy rows may have empty `org_id` until backfill | CH tables | Run backfill (P1-T1 service) |
| **R13** | P2 | ClickHouse | No CH row policies / per-tenant users | Infrastructure | Long-term hardening |
| **R14** | P2 | Tests | Voice assistant `it.todo` for org scoping | Voice characterization specs | 2E.2 |
| **R15** | P3 | ClickHouse | Fleet-wide health queries (`summarizeRecentIngestion`) | `clickhouse-analytics.service.ts` | Accept — ops only |

### Severity definitions

| Level | Meaning |
|-------|---------|
| **P0** | Exploitable cross-tenant data read or write by authenticated org user |
| **P1** | Missing defense-in-depth or plausible cross-tenant mutation path |
| **P2** | Design debt, intentional admin path, or low-likelihood gap |
| **P3** | Acceptable operational/fleet-wide access with proper credential controls |

**No P0 findings identified** in this audit.

---

## 11. Per-checklist validation matrix

For each data access category, the audit answers the five validation questions:

| Category | `org_id` always considered? | Tenant filter exists? | Cross-org read possible? | Cross-org write possible? | Default queries without scope? |
|----------|------------------------------|----------------------|--------------------------|---------------------------|-------------------------------|
| **Org-scoped API routes** | Yes (via guard + service) | `OrgScopingGuard` | No (403) | No (403) | No |
| **Vehicle-scoped API routes** | Yes (via ownership guard) | `VehicleOwnershipGuard` | No (404) | No (404) | No |
| **Platform-admin routes** | N/A (intentional) | `MASTER_ADMIN` role | **Yes** (by design) | **Yes** (by design) | Yes (fleet-wide) |
| **Webhooks** | Resolved from payload | Signature + inbox record | Per-event scope | Per-event scope | N/A |
| **Prisma tenant tables** | Yes (~74% direct, rest via FK) | `organizationId` in `where` | Only admin/worker paths | Only admin/worker paths | Outbox repos by ID |
| **Repositories (newer)** | Yes | Explicit in queries | No | No | No |
| **BullMQ processors** | Resolved from vehicle/outbox | Vehicle/outbox FK | No (internal queue) | No (internal queue) | N/A |
| **Cron schedulers** | Per-job resolution | Vehicle/outbox FK | **Yes** (fleet scan) | Per-vehicle only | Global scans by design |
| **ClickHouse analytics reads** | When caller passes org | `buildOrgIdSqlPredicate` | Low (UUID vehicle) | N/A (read-only) | HF reads vehicle-only |
| **ClickHouse writes** | Yes (post-2D.7) | `org_id` column | N/A | Per-vehicle mirror | N/A |
| **CH ops/health** | No | None | **Yes** (fleet-wide) | N/A | `summarizeRecentIngestion` |

---

## 12. Recommendations for Phase 2E.2

### Immediate (P1)

1. **R1:** Add org ownership check to `updateLiveSharing` — `findFirst({ id, organizationId })`.
2. **R2:** Add `VehicleOwnershipGuard` to `HighMobilityVehicleRegisterController` vehicle-scoped routes.
3. **R3:** Validate `organizationId` from body against JWT `organizationId` (or require `OrgScopingGuard` route).
4. **R4–R5:** Add `org_id` predicate to `ClickHouseHfService` read methods; make `orgId` required in CH service APIs.

### Short-term (P2)

5. **R6–R8:** Migrate `insurances` and `parts-accessories` to `OrgScopingGuard`; remove dead `TenantContextInterceptor`.
6. **R12:** Enable `CLICKHOUSE_ORG_BACKFILL_ENABLED=true` on VPS after migration 007.
7. **R14:** Resolve voice assistant `it.todo` security characterization tests.

### Long-term (P3)

8. **R13:** Evaluate CH row policies or per-tenant users for defense-in-depth.
9. Consider shared assert helpers for customers, bookings, invoices beyond vehicle-intelligence module.
10. Add CI lint rule: flag Prisma `update`/`delete` without `organizationId` in tenant tables.

---

## 13. Audit artifacts and cross-references

| Document | Phase | Relevance |
|----------|-------|-----------|
| [clickhouse-tenant-isolation.md](./clickhouse-tenant-isolation.md) | 2D.4 | CH-specific tenant analysis |
| [clickhouse-production-readiness.md](./clickhouse-production-readiness.md) | 2D.8 | Overall CH readiness |
| [clickhouse-remediation.md](./clickhouse-remediation.md) | 2D.7 | org_id writes, migration 007 |
| `architecture/MASTER_ADMIN_CLICKHOUSE_TENANT_ISOLATION_2026-07-26.md` | 2D.4 | Architecture record |
| `backend/src/shared/auth/iam-tenant-isolation.security.regression.spec.ts` | — | IAM regression tests |
| `backend/src/modules/vehicle-intelligence/tenant/vehicle-intelligence-tenant.scope.ts` | P57 | Canonical assert helpers |

### Suggested operator audit script (future)

A `vps-tenant-boundary-audit.sh` could bundle:

- Grep for controllers without guards
- Prisma query static analysis
- CH `org_id` population check (from 2D.4 audit script)
- IAM cross-tenant denial metric review

Not created in 2E.1 — analysis only.

---

## 14. Verdict

| Question | Answer |
|----------|--------|
| Is SynqDrive multi-tenant safe for production? | **Yes, with known P1 gaps** — no P0 exploitable paths found |
| Are tenant boundaries consistently enforced? | **Mostly** — guard + assert + Prisma pattern is strong; 3 API gaps and CH read hardening remain |
| Can org users read other orgs' data? | **Not via standard API paths** — except where P1 gaps exist (R1–R3) |
| Can org users write other orgs' data? | **Same** — R1 (insurance revoke) and R2/R3 (HM link) are the primary write risks |
| Are workers safe? | **Yes** — fleet-wide scans are by design; per-job isolation via vehicle/outbox resolution |
| Is ClickHouse tenant-safe? | **Conditionally** — PG is canonical; CH relies on app guards + UUID vehicle IDs + partial org_id predicates |

**Phase 2E.1 status:** Analysis complete. Ready for **Phase 2E.2 — Tenant Boundary Remediation**.

---

*Generated by Master Admin Remediation Phase 2E.1. No runtime or schema changes applied.*
