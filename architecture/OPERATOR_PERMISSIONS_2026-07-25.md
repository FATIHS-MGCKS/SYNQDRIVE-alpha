# Operator App — Permission Model

| Field | Value |
|-------|-------|
| **Date** | 2026-07-25 |
| **Status** | Proposed / registry implemented — endpoint migration pending |
| **Audit** | `docs/audits/operator-app-production-readiness-2026-07.md` §27 |

## Design principles

1. **No parallel permission store** — Operator actions map to existing membership module flags (`bookings`, `tasks`, `fleet-condition`, …).
2. **Single new module** — `operator-app` gates shell access (`operator.app.access`, today, scan). All mutations reuse domain modules.
3. **Granular action registry** — Stable `operator.*` strings for UI, audit, and future `@RequireOperatorPermission` decorators.
4. **Contextual enforcement** — Station scope, assignment, finalized records, and `fieldAgentAccess` are documented per action and enforced in services (not only guards).
5. **No blanket WORKER access** — `employee` gets `operator-app.read` only; handover writes require role templates with domain `write` grants + `fieldAgentAccess`.

## Architecture (reused components)

| Component | Path | Role |
|-----------|------|------|
| Module keys | `backend/src/shared/auth/permission.constants.ts` | `operator-app` added |
| Membership JSON | `OrganizationMembership.permissions` | Storage (unchanged shape) |
| Guard | `PermissionsGuard` + `OrgScopingGuard` | Enforcement |
| Effective access | `effective-access-engine.ts` | Station scope, overrides |
| Station filter | `station-access.service.ts` | Resource station checks |
| Task actions | `task-permission.constants.ts` | Pattern reference |
| Eligibility override | `booking-eligibility-override` module | Handover override |
| Operator registry | `backend/src/modules/operator-app/operator-permission.constants.ts` | Action → module/level |
| Operator evaluator | `operator-permission.util.ts` | `evaluateOperatorPermission()` |
| Decorator (future) | `require-operator-permission.decorator.ts` | `@RequireOperatorPermission` |
| Frontend facade | `frontend/src/operator/lib/operatorPermissions.ts` | UI gates |
| Role templates | `organization-role.defaults.ts` | Default grants |

## Permission matrix (action → module → level)

| Action | Module | Level | Contextual rules |
|--------|--------|-------|------------------|
| `operator.app.access` | `operator-app` | read | — |
| `operator.today.read` | `operator-app` | read | — |
| `operator.scan.use` | `operator-app` | read | — |
| `operator.booking.read` | `bookings` | read | — |
| `operator.booking.create` | `bookings` | write | — |
| `operator.booking.update` | `bookings` | write | — |
| `operator.booking.cancel` | `bookings` | manage | — |
| `operator.vehicle.read` | `fleet` | read | station scope |
| `operator.vehicle.inspect` | `fleet-condition` | read | station scope |
| `operator.handover.read` | `bookings` | read | — |
| `operator.handover.start` | `bookings` | write | field agent + station |
| `operator.handover.update` | `bookings` | write | not finalized |
| `operator.handover.complete` | `bookings` | write | field agent + station |
| `operator.handover.override` | `booking-eligibility-override` | manage | supervisor: `tasks.manage` |
| `operator.return.start` | `bookings` | write | field agent |
| `operator.return.complete` | `bookings` | write | field agent + station |
| `operator.damage.read` | `fleet-condition` | read | station scope |
| `operator.damage.create` | `fleet-condition` | write | station scope |
| `operator.damage.update` | `fleet-condition` | write | not finalized |
| `operator.damage.verify` | `fleet-condition` | manage | supervisor: `tasks.manage` |
| `operator.document.read` | `document-upload` | read | also `bookings.read` |
| `operator.document.upload` | `document-upload` | write | — |
| `operator.document.verify` | `document-upload` | manage | supervisor: `legal-documents.manage` |
| `operator.signature.capture` | `bookings` | write | field agent |
| `operator.task.read` | `tasks` | read | — |
| `operator.task.complete` | `tasks` | write | assignment; supervisor: `tasks.manage` |
| `operator.tire_measurement.create` | `fleet-condition` | write | — |
| `operator.technical_observation.create` | `bookings` | write | field agent |

## Default role mapping

| Template | `operator-app` | Handover / capture | Supervisor paths |
|----------|----------------|-------------------|------------------|
| `org_admin` | manage | all domain manage | all |
| `sub_admin` | manage | via domain perms | partial |
| `disposition` | write | bookings write + override | eligibility override |
| `station_manager` | manage | bookings/fleet/tasks write + `fleet-condition.manage` | damage/document verify |
| `field_agent` | write | bookings/tasks/fleet-condition write + field agent flag | eligibility override |
| `employee` | **read only** | denied writes | denied |
| `service` | read | fleet-condition read/write (no handover) | denied |
| `driver` | — | denied | denied |
| `read_only` | read | read-only | denied |

## Endpoint migration (deferred)

Controllers should adopt `@RequireOperatorPermission('operator.…')` per handler. Until migrated, existing `@RequirePermission` on domain modules remains authoritative. Service layer must add:

- `StationAccessService.assertStationReadable` for station-scoped reads
- `fieldAgentAccess` check for handover/signature actions
- Task assignment check for `operator.task.complete`
- Finalized protocol / applied extraction guards

## Station and assignment scope (V4.9.834 — Prompt 8)

`OperatorResourceScopeService` (`backend/src/modules/operator-app/`) centralizes operator station/assignment enforcement:

1. Scope from `StationAccessService` / `EffectiveAccessEngine` — never from request `stationId`
2. Bookings: pickup/return/actual stations OR vehicle home/current in allowlist
3. Tasks: assignee OR `metadata.stationId` OR linked booking/vehicle in scope
4. Handover: `fieldAgentAccess` + station scope; supervisor `tasks.manage` + `scopeOverrideReason`
5. Override audit: Activity log `OPERATOR_STATION_SCOPE_OVERRIDE`

Audit: `docs/audits/operator-app-production-readiness-2026-07.md` §30.

## Backfill

Existing org memberships need `operator-app` in materialized JSON when roles are re-assigned or via ops backfill script (not included in Prompt 5).
