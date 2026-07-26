# End-to-End Data Consistency — Phase 2E.6

**Date:** 2026-07-26  
**Scope:** Full pipeline audit — DIMO → Backend → PostgreSQL → Worker → ClickHouse → Dashboard → AI → Notifications → Workflow Automation  
**Status:** Analysis complete (documentation only)

---

## Executive summary

SynqDrive uses a **single canonical truth in PostgreSQL** with **best-effort analytics mirrors in ClickHouse** and **event-driven downstream consumers** (notifications, workflows, AI). Identity and organization scoping are **strong at the tenant vehicle layer** but **weaker at the global DIMO mirror layer** and **in early ClickHouse tables**.

| Station | ID consistency | Org consistency | Timestamp consistency | Duplicate truth | Lost events | Deterministic sync |
|---------|---------------|-----------------|---------------------|-----------------|-------------|-------------------|
| DIMO ingest | Strong (tokenId ↔ externalId) | N/A (global mirror) | Provider timestamps preserved | Low | Low (inbox retry) | Upsert + dedup buckets |
| Backend API | Strong | Strong (guards + service scope) | Server-owned fields protected | Low | N/A | Request idempotency where wired |
| PostgreSQL | Strong (uniques + FKs) | Strong (with known gaps) | Monotonic VLS merge | Low | Low (outbox retry) | Transactions + advisory locks |
| Worker | Strong (vehicleId job keys) | Via vehicle lookup | `sourceTimestamp` monotonic | Medium (poll logs append) | Medium (CH fire-and-forget) | BullMQ jobId dedup |
| ClickHouse | vehicle_id aligned | **Partial** (no org on snapshots) | `recorded_at` from provider | Medium (append snapshots) | **High** if CH down | No replay queue |
| Dashboard | Reads PG primary | Org-scoped APIs | UI from PG timestamps | Low | Degrades gracefully | Cache TTL bounded |
| AI | PG-only tools | Execution context bound | N/A | Low | N/A | Tool registry deterministic |
| Notifications | fingerprint + entityId | Strict orgId | `occurredAt` on candidate | V1/V2 parallel | Lock contention defer | Fingerprint dedupe |
| Workflows | idempotencyKey | orgId required | `occurredAt` on event | Low | scheduleEmit no outbox | Run idempotency keys |

**Top risks (P1–P2):** CH snapshots without `org_id`; PG vs CH telemetry divergence; notification V1/V2 dual truth; workflow health emitter in-memory cache; no CH replay after outage.

---

## Pipeline overview

```
┌──────────┐    webhooks/poll     ┌─────────────┐    Prisma writes    ┌──────────────┐
│   DIMO   │ ──────────────────► │   Backend   │ ──────────────────► │  PostgreSQL  │
│ Identity │    JWT telemetry    │  NestJS API │    workers inline   │  (canonical) │
│ Segments │                     │  + modules  │                     └──────┬───────┘
└──────────┘                     └──────┬──────┘                            │
                                        │                                   │
                          BullMQ queues │                                   │
                                        ▼                                   │
                               ┌────────────────┐                         │
                               │    Workers     │◄────────────────────────┘
                               │ snapshot, DTC, │   read vehicle/org context
                               │ trip FSM,      │
                               │ enrichment,    │
                               │ notifications  │
                               └───────┬────────┘
                                       │ best-effort mirror
                                       ▼
                               ┌────────────────┐
                               │  ClickHouse    │  analytics / evidence only
                               │  (optional)    │
                               └───────┬────────┘
                                       │ read (debug/analytics)
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
             ┌───────────┐     ┌─────────────┐    ┌──────────────┐
             │ Dashboard │     │ Data Analyse│    │ Trip evidence│
             │ Fleet UI  │     │ (internal)  │    │ block (CH)   │
             └───────────┘     └─────────────┘    └──────────────┘

PostgreSQL ──► Notification producers ──► NotificationCore (fingerprint)
                    │
                    └──► WorkflowEventService ──► WorkflowEngine
                    
PostgreSQL ──► AI tools (fleet chat) — no ClickHouse in tool path
```

**Canonical rule:** PostgreSQL is the system of record. ClickHouse never defines trip boundaries, booking state, or notification lifecycle alone.

---

## Station 1: DIMO

### Data flow

| Path | Trigger | Write target | Key files |
|------|---------|--------------|-----------|
| Identity mirror | 24h scheduler + manual | `dimo_vehicles` | `dimo-api-sync.service.ts`, `dimo-vehicle-sync.service.ts` |
| Telemetry snapshot | 30s per connected vehicle | `vehicle_latest_states` | `dimo-snapshot.processor.ts` |
| Webhooks | Push (DTC, OBD plug/unplug, RPM) | inbox → domain events / VLS patch | `dimo-webhook.controller.ts` |
| DTC poll | 3h fan-out | `vehicle_dtc_events`, VLS | `dimo-dtc.processor.ts` |
| Segments / trips | FSM + reconciliation | `vehicle_trips.dimo_segment_id` | `trip-reconciliation.service.ts`, `dimo-segments.service.ts` |
| Energy | Segment intake | `vehicle_energy_events` | `energy-events.service.ts` |

### ID mapping chain

```
DIMO tokenId (int)
  → dimo_vehicles.external_id = String(tokenId)  [UNIQUE]
  → dimo_vehicles.token_id      = tokenId         [UNIQUE]
  → dimo_vehicles.id            = UUID (internal PK)
  → vehicles.dimo_vehicle_id    → FK (tenant binding, partial UNIQUE)
  → vehicle_latest_states.dimo_token_id (denormalized)
  → webhooks: resolve Vehicle via dimoVehicle.tokenId
```

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ Strong | `external_id` always stringified `tokenId`; segment id on trips via `dimo_segment_id` UNIQUE |
| Identical organization | ⚠️ N/A at mirror | `dimo_vehicles` is **global**; org appears only after `registerFromDimo` |
| Identical timestamps | ✅ Strong | `lastSeen` → VLS `source_timestamp`; monotonic merge rejects stale |
| No duplicate truth | ✅ Strong | Upsert on `externalId`; energy/trips unique on `dimo_segment_id` |
| No lost events | ✅ Good | Device webhook inbox with retry buckets; unknown token → dropped (by design) |
| Deterministic sync | ✅ Good | `jobId = snapshot-{vehicleId}`; DTC `dtc-poll:{vehicleId}:{bucket}` |

### Gaps (DIMO)

| ID | Gap | Severity |
|----|-----|----------|
| D1 | `definition.id` (Identity UUID) not used as `external_id` — only in `raw_json` | P3 |
| D2 | Pre-registration webhooks for unknown `tokenId` discarded | P2 (expected) |
| D3 | Speed/ignition webhooks logged but not persisted to VLS | P3 |
| D4 | Webhook vehicle lookup by `tokenId` without explicit `organizationId` filter | P2 (mitigated by partial UNIQUE on `dimo_vehicle_id`) |
| D5 | No `VehicleDataSourceLink` created on DIMO register (unlike HM) | P3 |

---

## Station 2: Backend (API layer)

### Role

- Validates tenant via `OrgScopingGuard` + `PermissionsGuard`
- Translates HTTP DTOs → service calls with `organizationId` from JWT/path
- Never trusts client-supplied `organizationId` on create (sanitized — see bookings)

### Consistency checks

| Check | Status | Mechanism |
|-------|--------|-----------|
| Identical IDs | ✅ | Route params (`vehicleId`, `bookingId`) passed to org-scoped services |
| Identical organization | ✅ | Guards reject JWT/path mismatch before DB |
| Identical timestamps | ✅ | Server-owned fields stripped on booking/customer create |
| No duplicate truth | ✅ | Idempotency on billing commands, payment requests, Stripe webhooks |
| No lost events | N/A | Synchronous request path |
| Deterministic sync | ✅ | Advisory locks on critical writes (2E.4) |

### Key files

- `org-scoping.guard.ts`, `permissions.guard.ts`
- `bookings.service.ts` (advisory lock + overlap)
- `vehicles.service.ts` (`registerFromDimo` transaction)
- `subscription-lifecycle.service.ts` (`lockVersion`)

---

## Station 3: PostgreSQL

### Canonical tables by domain

| Domain | Primary table(s) | Org column | ID anchors |
|--------|-------------------|------------|------------|
| Fleet | `vehicles`, `vehicle_latest_states` | `vehicles.organization_id` | `vehicle.id`, `dimo_vehicle_id` FK |
| Trips | `vehicle_trips`, `vehicle_trip_waypoints` | via `vehicle_id` join | `dimo_segment_id` UNIQUE |
| Bookings | `bookings` | `organization_id` | `booking.id` |
| Customers | `customers` | `organization_id` | `customer.id` |
| Health | tire/brake/battery modules | `organization_id` on most | `vehicle_id` |
| Notifications | `notifications` | `organization_id` | `fingerprint` + `lifecycle_generation` |
| Workflows | `org_workflows`, `org_workflow_runs` | `organization_id` | run `idempotency_key` |
| DIMO mirror | `dimo_vehicles` | **none** | `external_id`, `token_id` |

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ Strong | 134 uniques, FK cascades (see 2E.3) |
| Identical organization | ⚠️ Mostly strong | `vehicle_trips` lacks `organization_id` — must join `vehicles`; `driving_events.organization_id` nullable |
| Identical timestamps | ✅ Strong | VLS monotonic `source_timestamp`; trip `start_time`/`end_time` from DIMO segments |
| No duplicate truth | ✅ Strong | Uniques on segment, energy, device dedup buckets, notification fingerprints |
| No lost events | ✅ Good | Outbox tables for episode resolution, billing, task automation |
| Deterministic sync | ✅ Improved | 2E.4 advisory locks + partial UNIQUE on `dimo_vehicle_id` |

### Schema risks (from 2E.3)

- `vehicles.dimo_vehicle_id` — now has partial UNIQUE (2E.4 migration)
- Booking FKs on customer/vehicle — RESTRICT (no orphan bookings)
- No DB-level cross-org booking CHECK

---

## Station 4: Workers (BullMQ)

### Job inventory (DIMO / telemetry / trips)

| Queue | Scheduler | Job ID pattern | PG writes | CH mirror |
|-------|-----------|----------------|-----------|-----------|
| `dimo.snapshot.poll` | 30s | `snapshot-{vehicleId}` | VLS upsert | snapshots + state_changes |
| `dimo.dtc.poll` | 3h fan-out | `dtc-poll:{vehicleId}:{bucket}` | DTC events, VLS | none |
| `dimo.vehicle.sync` | 24h | per-run | `dimo_vehicles` upsert | none |
| `dimo.trip-tracking` | per snapshot | vehicle-scoped | trip FSM state | read-only assist |
| `trip.behavior.enrichment` | post-trip | trip-scoped | PG enrichment | HF/waypoints/windows |
| `trip-reconciliation` | 15m/4h/daily | org/vehicle batches | trip repair | evidence read |
| `notification.evaluation` | scheduled | org-scoped lock | insight → notification | none |
| `notification.delivery` | on ingest | outbox retry | delivery state | none |

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ | Jobs keyed by `vehicleId` / `tripId` / org evaluation lock |
| Identical organization | ✅ | Processors load `vehicle.organizationId`; throw if missing on snapshot |
| Identical timestamps | ✅ | Stale snapshot skip via `vls-monotonic-merge.util.ts` |
| No duplicate truth | ⚠️ Medium | `dimo_poll_logs` append-only (audit, not truth); CH snapshots append without dedup |
| No lost events | ⚠️ Medium | CH mirror fire-and-forget; host suspend triggers reconciliation backfill |
| Deterministic sync | ✅ | BullMQ `jobId` prevents duplicate concurrent snapshot jobs per vehicle |

### Worker gaps

| ID | Gap | Severity |
|----|-----|----------|
| W1 | ClickHouse insert failures not replayed | P1 |
| W2 | HF/waypoint/activity mirrors default **off** (`HF_MIRROR_ENABLED=false`) | P2 ops |
| W3 | Skip mirror when `orgId` missing → silent analytics gap | P2 |
| W4 | Notification eval lock Redis unavailable → run skipped | P2 |

---

## Station 5: ClickHouse

### Architecture boundary

Per `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`:

- **Optional** — app starts without `CLICKHOUSE_URL`
- **Append-only analytics mirror** — not system of record
- Trip boundaries: **never** defined by CH alone

### Tables and org attribution

| Table | `org_id` column | Producer | Dedup |
|-------|-----------------|----------|-------|
| `telemetry_snapshots` | ❌ No | `dimo-snapshot.processor` | None (append) |
| `telemetry_state_changes` | ❌ No | same | None (append) |
| `telemetry_hf_points` | ✅ Yes | `hf-mirror.service` | skip if trip mirrored |
| `telemetry_hf_events` | ✅ Yes | same | ReplacingMergeTree |
| `telemetry_hf_windows` | ✅ Yes | same | ReplacingMergeTree |
| `telemetry_waypoints` | ✅ Yes (migration 004) | `waypoint-mirror.service` | skip per trip |
| `trip_activity_windows` | ✅ Yes | `activity-window-producer` | ReplacingMergeTree |

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ | `vehicle_id`, `trip_id`, `token_id` aligned with PG |
| Identical organization | ⚠️ **Partial** | Snapshots/state_changes lack `org_id`; pre-004 rows empty org |
| Identical timestamps | ✅ | `recorded_at` from provider `lastSeenAt` |
| No duplicate truth | ⚠️ Medium | PG VLS vs CH snapshots can diverge; CH not authoritative |
| No lost events | ❌ **Weak** | No replay queue; outage = permanent gap in CH only |
| Deterministic sync | ⚠️ Partial | Inline mirror only; no batch reconciliation job |

### ClickHouse gaps

| ID | Gap | Severity | Safe remediation |
|----|-----|----------|------------------|
| CH1 | `telemetry_snapshots` without `org_id` | P1 | Add column via migration; backfill from PG vehicle join |
| CH2 | No CH→PG reconciliation / replay | P1 | Ops script or worker replay from `dimo_poll_logs` + PG VLS |
| CH3 | Pre-migration empty `org_id` on waypoints | P2 | Backfill script (exists in remediation ops — verify prod run) |
| CH4 | Registry doc partially stale vs code | P3 | Update `clickhouse-table-registry.ts` as source of truth |

---

## Station 6: Dashboard (Fleet UI / Master / Operator)

### Read paths

| Surface | API | Primary store | Org enforcement |
|---------|-----|---------------|-------------------|
| Fleet map / vehicle detail | `/organizations/:orgId/vehicles/*` | PG VLS + vehicle | OrgScopingGuard |
| Trips tab | vehicle intelligence APIs | PG `vehicle_trips` | Service `organizationId` |
| Fleet connectivity | `/fleet-connectivity` | PG VLS + episodes | Org-scoped |
| Data Analyse (debug) | `/data-analyse/*` | PG + CH | `assertVehicle(orgId, vehicleId)` before CH |
| Trip CH evidence block | trip detail payload | CH via `TripEvidenceReadService` | PG trip guard first |
| Platform health | `/health` | PG + CH ping | Master admin |

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ | UI uses IDs from org-scoped list APIs |
| Identical organization | ✅ | All rental routes under `/organizations/:orgId` |
| Identical timestamps | ✅ | Display from PG; CH evidence labeled debug |
| No duplicate truth | ✅ | UI does not prefer CH over PG for operational state |
| No lost events | ⚠️ | CH evidence block empty when mirror off/down — UI should degrade |
| Deterministic sync | ✅ | React Query / API cache; fleet map cache keyed by org |

---

## Station 7: AI (Fleet Chat / WhatsApp / Voice)

### Data sources

**All fleet chat domain tools read PostgreSQL only** — no ClickHouse in tool execution path.

| Tool | Source | Org binding |
|------|--------|-------------|
| `get_vehicle_location` | PG VLS + vehicle | `resolveAiVehicleAccess` |
| `get_vehicle_telemetry_status` | PG VLS + connectivity | execution context |
| `get_vehicle_health_summary` | RentalHealth + PG | org-scoped services |
| `get_vehicle_booking_context` | PG bookings | vehicle scope resolver |
| `explain_overdue_return` | PG bookings | org in context |

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ | Tool args validated against org-bound vehicle resolver |
| Identical organization | ✅ | `organizationId` from JWT context; tool arg override → `permission_denied` |
| Identical timestamps | ✅ | Freshness from PG `source_timestamp` / VLS |
| No duplicate truth | ✅ | AI does not read CH; summaries grounded in PG |
| No lost events | N/A | Query-time only |
| Deterministic sync | ✅ | Structured tool registry; CT-AI-01/02 acceptance tests |

### AI gaps

| ID | Gap | Severity |
|----|-----|----------|
| AI1 | CH data invisible to AI — correct by design but ops may expect parity | P3 |
| AI2 | Hallucination guard for foreign UUIDs in user message (detector exists) | P3 |

---

## Station 8: Notifications

### Ingest pipeline

```
Domain producers (business-insights, dimo, vehicle-intelligence, bookings, billing)
  → NotificationProducerIngestService
  → NotificationCoreService.ingestCandidate
  → fingerprint = orgId | eventType | entityType | entityId | conditionCode | v{scope}
  → PG notifications (lifecycle_generation)
  → NotificationLifecycleWorkflowEmitter → WorkflowEventService
```

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ | `entityId` = domain PK (vehicleId, bookingId, …) |
| Identical organization | ✅ | Strict `organizationId` on all operations |
| Identical timestamps | ✅ | `occurredAt` on candidate; lifecycle events ordered |
| No duplicate truth | ⚠️ Medium | V1 `DashboardInsight` parallel to V2 until allowlist rollout |
| No lost events | ⚠️ Medium | Eval lock contention → `markFollowUp`; Redis down → skip |
| Deterministic sync | ✅ | Fingerprint dedupe; `lifecycleGeneration` on reopen |

### Notification gaps

| ID | Gap | Severity |
|----|-----|----------|
| N1 | V1/V2 dual producers per org during pilot | P2 |
| N2 | `occurrence_count` drift (reconcile script exists) | P2 ops |
| N3 | Org allowlist gating (`NOTIFICATIONS_V2_ORG_ALLOWLIST`) | P2 ops |

---

## Station 9: Workflow Automation

### Event sources

| Event type | Emitter | Source data |
|------------|---------|-------------|
| `booking.returned` / `booking.completed` | `bookings-handover.service.ts` | PG booking |
| `vehicle.health.warning/critical` | `vehicle-health-workflow.emitter.ts` | Rental health band |
| `notification.*` | `notification-lifecycle-workflow.emitter.ts` | PG notification lifecycle |
| `task.automation.materialize` | task automation outbox | PG tasks |
| `invoice.overdue`, `vehicle.dtc.critical` | **Catalog only** — no emitters wired | — |

### Idempotency

```
Workflow run key (notification-triggered):
  notification-run:{orgId}:{workflowId}:{triggerEventId}
where triggerEventId = {lifecycleEvent}:{notificationId}:gen:{lifecycleGeneration}
```

### Consistency checks

| Check | Status | Notes |
|-------|--------|-------|
| Identical IDs | ✅ | `entityId` in workflow payload from source event |
| Identical organization | ✅ | `organizationId` required on workflow run |
| Identical timestamps | ✅ | `occurredAt` on domain event |
| No duplicate truth | ⚠️ Medium | Health emitter in-memory `lastBandByVehicle` — restart resets |
| No lost events | ⚠️ Medium | `scheduleEmit` failure logged only — no outbox |
| Deterministic sync | ✅ | Run idempotency keys; dry-run cross-tenant validation (CT-WF-01) |

### Workflow gaps

| ID | Gap | Severity |
|----|-----|----------|
| WF1 | `invoice.overdue` workflow event defined but not emitted | P2 |
| WF2 | Health band cache process-local — duplicate events after deploy | P2 |
| WF3 | `scheduleEmit` no durable outbox | P2 |

---

## Cross-station ID propagation matrix

| ID type | DIMO | PG vehicles | PG VLS | CH | Notifications | Workflows | AI |
|---------|------|-------------|--------|----|--------------:|----------:|-----|
| `tokenId` | ✅ | via dimoVehicle | dimo_token_id | token_id | — | — | — |
| `dimo_vehicle_id` (UUID) | dimo_vehicles.id | FK | — | — | — | — | — |
| `vehicle.id` | after register | PK | vehicle_id | vehicle_id | entityId | payload | tool arg |
| `dimo_segment_id` | segment API | vehicle_trips | — | trip assist | — | — | — |
| `organization_id` | after register | vehicles.* | via join | partial | notifications.* | org_workflows.* | context |

---

## Cross-station timestamp semantics

| Field | Meaning | Canonical store | Consumers |
|-------|---------|-----------------|-----------|
| `signalsLatest.lastSeen` | Provider observation time | DIMO API | → VLS `source_timestamp` |
| `provider_fetched_at` | Worker fetch wall clock | PG VLS | freshness UI |
| `updated_at` | DB mutation time | PG all tables | audit only |
| `recorded_at` (CH) | Mirror of provider time | CH | analytics queries |
| `occurredAt` | Business event time | notifications | workflow trigger |
| `start_time` / `end_time` | Trip boundaries | PG trips | DIMO segments authoritative |

**Rule:** Operational freshness gates use `source_timestamp` monotonic merge, not `updated_at`.

---

## Duplicate truth register

| Pair | Which wins | Risk |
|------|------------|------|
| PG VLS vs CH snapshots | **PG** | Medium — ops may compare CH debug view |
| PG trips vs CH trip assist | **PG** (+ DIMO segments) | Low |
| Notification V1 vs V2 | V2 when allowlisted | Medium during migration |
| `dimo_vehicles` vs `vehicles` | `vehicles` for tenant ops | Low — mirror is pre-registration |
| Dashboard insight vs notification | Converging to notification V2 | Medium |

---

## Lost event register

| Scenario | Affected station | Data lost | Recovery |
|----------|------------------|-----------|----------|
| CH unavailable during poll | CH | snapshot rows | None automatic — PG intact |
| Webhook unknown tokenId | DIMO → PG | event | None until vehicle registered |
| Host suspend >3 min | Worker → trips | poll gaps | `TripReconciliationService` backfill |
| Notification Redis lock fail | Notifications | eval run | retry on next schedule |
| Workflow scheduleEmit error | Workflows | run | manual re-trigger |
| Device inbox max retries | DIMO connectivity | plug/unplug | dead letter / ops review |

---

## Deterministic synchronization register

| Mechanism | Location | Guarantees |
|-----------|----------|------------|
| `upsert` on `externalId` | dimo_vehicles | same token → same row |
| `jobId = snapshot-{vehicleId}` | BullMQ | one active snapshot job per vehicle |
| Monotonic VLS merge | snapshot processor | stale provider data rejected |
| Dedup bucket 30s | device webhook inbox | duplicate webhooks collapsed |
| `@@unique(dimo_segment_id)` | vehicle_trips | one trip per segment |
| Fingerprint | notifications | same condition → same row / generation bump |
| `idempotencyKey` | workflow runs | duplicate trigger → same run |
| Advisory locks (2E.4) | registerFromDimo, createDraft, createWithAdmin | no duplicate bindings |
| Partial UNIQUE | vehicles.dimo_vehicle_id | DB-enforced single binding |

---

## Recommended remediation (safe, ordered)

| Priority | Action | Stations |
|----------|--------|----------|
| P1 | Add `org_id` to `telemetry_snapshots` / `telemetry_state_changes` + backfill | CH |
| P1 | Document/run CH org_id backfill for pre-004 waypoint rows | CH |
| P1 | CH outage replay design (from PG VLS or poll logs) | Worker → CH |
| P2 | Wire `invoice.overdue` workflow emitter to billing domain events | Workflows |
| P2 | Durable outbox for `WorkflowEventService.scheduleEmit` | Workflows |
| P2 | Persist health band state (Redis/DB) vs in-memory | Workflows |
| P2 | Complete notification V2 rollout + V1 deprecation per org | Notifications |
| P3 | Add `organization_id` to `vehicle_trips` (nullable + backfill) | PostgreSQL |
| P3 | Create `VehicleDataSourceLink` on DIMO register | DIMO → PG |

---

## Verification commands

```bash
# Tenant isolation acceptance
cd backend && npm run test:cross-tenant:acceptance

# IAM / org scoping
cd backend && npm run test:iam:security

# ClickHouse connectivity (when configured)
cd backend && npm run clickhouse:ping:url

# DIMO / vehicle security
cd backend && npm run test:vehicles:security

# Notification / workflow security
cd backend && npm run test:workflow-automation:security
```

### Operator SQL probes

```sql
-- Duplicate dimo bindings (should be 0 after 2E.4 migration)
SELECT dimo_vehicle_id, COUNT(*) FROM vehicles
WHERE dimo_vehicle_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;

-- Trips without resolvable org (join check)
SELECT vt.id FROM vehicle_trips vt
LEFT JOIN vehicles v ON v.id = vt.vehicle_id
WHERE v.id IS NULL;

-- Notifications with fingerprint collision across orgs (should be 0)
SELECT fingerprint, COUNT(DISTINCT organization_id) FROM notifications
GROUP BY fingerprint HAVING COUNT(DISTINCT organization_id) > 1;
```

---

## Related documents

| Phase | Document |
|-------|----------|
| 2E.1 | `tenant-boundary-validation.md` |
| 2E.2 | `dimo-vehicle-integrity.md` |
| 2E.3 | `database-integrity-review.md` |
| 2E.4 | `concurrency-protection.md` |
| 2E.5 | `cross-tenant-acceptance.md` |
| Architecture | `CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` |
| Architecture | `MASTER_ADMIN_END_TO_END_DATA_CONSISTENCY_2026-07-26.md` |

---

## Changes / Architektur

Updated in V4.9.896 (Changes + Architektur views + architecture record).
