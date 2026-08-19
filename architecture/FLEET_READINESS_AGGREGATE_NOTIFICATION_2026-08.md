# Fleet Readiness Aggregate Notification (P2.3)

**Date:** 2026-08-19  
**Depends on:** P2.2B (`architecture/VEHICLE_ALERTS_NOTIFICATION_V2_2026-08.md`)

## 1. Canonical source

```
Cause notifications (module/cause level)
        ↓
Canonical RentalHealth snapshot (already computed)
        ↓
VehicleHealth.rental_readiness
        ↓
projectVehicleReadinessAggregate()
        ↓
VEHICLE_NOT_READY (ONE aggregate per vehicle)
```

The aggregate producer consumes **only** `RentalHealthService.getVehicleHealth()` — no second RentalHealth call, no blocking-reason recompute, no cause severity rollup.

## 2. Why only VEHICLE_NOT_READY

Three registry events existed for overlapping aggregate semantics:

| Event | P2.3 role |
|-------|-----------|
| `VEHICLE_NOT_READY` | **Live canonical aggregate** |
| `BLOCKED_VEHICLE` | **Legacy / compatibility only** — no new producer |
| `MAINTENANCE_REQUIRED` | **Legacy / compatibility only** — no new producer |

## 3. rental_blocked ↔ rental_readiness

When `availability === 'ready'`:

- `rental_blocked === true` ⇔ `rental_readiness === 'not_ready'`
- `rental_blocked === false` ⇔ `rental_readiness === 'ready'`

When `availability !== 'ready'`:

- `rental_blocked === null`
- `rental_readiness === 'unevaluable'`

Therefore `BLOCKED_VEHICLE` and `VEHICLE_NOT_READY` would be redundant as live aggregates.

## 4. Cause vs aggregate

| Layer | Answers |
|-------|---------|
| Cause notifications (`TIRE_CRITICAL`, `SERVICE_OVERDUE`, `LIMP_MODE_ACTIVE`, …) | **Why not?** |
| `VEHICLE_NOT_READY` | **Is the vehicle as a whole currently rentable?** |

Example: `TIRE_CRITICAL` + `SERVICE_OVERDUE` + `LIMP_MODE_ACTIVE` + `VEHICLE_NOT_READY` — four separate lifecycles, not `BLOCKED_VEHICLE` / `MAINTENANCE_REQUIRED`.

## 5–6. Why BLOCKED_VEHICLE / MAINTENANCE_REQUIRED are not produced

- **BLOCKED_VEHICLE:** redundant with `rental_readiness=not_ready` under the canonical contract.
- **MAINTENANCE_REQUIRED:** maintenance grouping is UI taxonomy; causes (`SERVICE_OVERDUE`, `TUV_OVERDUE`, …) remain authoritative.

Registry definitions are retained for historical/persisted row lookup — not deleted.

## 7. NOT_READY / READY / UNEVALUABLE state machine

| Condition | Action |
|-----------|--------|
| `rental_readiness === 'not_ready'` | OPEN / REOPEN `VEHICLE_NOT_READY` (WARNING) |
| `rental_readiness === 'ready'` | RESOLVE if active fingerprint exists; else no-op |
| `rental_readiness === 'unevaluable'` | No OPEN, no RESOLVE — preserve existing OPEN |

UNEVALUABLE aggregate notification is **P2.4** — not implemented in P2.3.

## 8. Fail-safe UNEVALUABLE preservation

Stale/partial pipeline must not clear an existing not-ready aggregate. Only confirmed `ready` resolves.

## 9. Legacy reconciliation (vehicle-scoped fail-safe)

Paginated resolve of active `BLOCKED_VEHICLE` or `MAINTENANCE_REQUIRED` rows **per vehicle** when reconciliation is safe:

| Condition | Legacy rows for that vehicle |
|-----------|------------------------------|
| NOT_READY + canonical ingest **success** | Resolve |
| NOT_READY + canonical ingest **failure** | **Preserve** |
| READY (confirmed recovery) | Resolve |
| UNEVALUABLE (no source emitted) | **Preserve** |
| RentalHealth failed / no snapshot | **Preserve** |

No org-wide blind retire. `ingestVehicleReadinessSources()` returns per-vehicle ingest outcomes for cutover tracking.

Manual/test/backfill only for legacy rows — no historical live producer. No DB delete; uses `resolveNotificationByFingerprint`.

## 10. Aggregate event usage audit (repo-derived)

| eventType | Registry | Live producer / adapter | Legacy / backfill | Tests / fixtures | Possible persisted V2 rows | Independent canonical state? | Final role |
|-----------|----------|----------------------|-------------------|------------------|---------------------------|------------------------------|------------|
| `VEHICLE_NOT_READY` | `notification-event-registry.definitions.ts` | `RentalHealthService` → `VehicleHealthNotificationSyncService` → `projectVehicleReadinessAggregate()` → `VehicleReadinessNotificationAdapter` → `syncVehicleReadinessAggregate()` | None | `vehicle-readiness-notification.{spec,projector.spec}.ts`, registry golden fingerprint | Yes — live ingest from P2.3 | **Yes** — `rental_readiness=not_ready` | **Live canonical aggregate** |
| `BLOCKED_VEHICLE` | same | **None** — no adapter, no projector emit | `reconcileLegacyAggregateNotifications()` resolve-only | Registry spec, legacy reconcile tests, `notification-mandatory.policy.ts` | Yes — historical/manual rows only | **No** — redundant with `VEHICLE_NOT_READY` under canonical contract | **Legacy / compatibility only** |
| `MAINTENANCE_REQUIRED` | same | **None** — no adapter, no projector emit | same reconcile path | same | Yes — historical/manual rows only | **No** — maintenance grouping is UI taxonomy; causes (`SERVICE_OVERDUE`, …) are authoritative | **Legacy / compatibility only** |

**Proof:** Repo grep shows no `ingestFromAdapter` / projector / sync path emitting `BLOCKED_VEHICLE` or `MAINTENANCE_REQUIRED`. Only `VEHICLE_NOT_READY` is materialized from `rental_readiness`.

## 11. Registry `producerModule` contract

| Field | `VEHICLE_NOT_READY` | Notes |
|-------|---------------------|-------|
| `producerModule` | `operations` | **Unchanged** — denotes `NotificationDomain.OPERATIONS` registry taxonomy, not NestJS module path |
| Live evaluation owner | `RentalHealthService.getVehicleHealth()` | Documented live path above |
| `sourceType` | `OPERATIONAL_ISSUE` | Unchanged — fingerprint contract |
| Fingerprint | `…\|vehicle_not_ready\|v1` | Unchanged — verified in registry tests |

Same pattern as pre-P2.3: domain classification in registry metadata; live sync path documented separately (cf. `SERVICE_OVERDUE` with `sourceType: DASHBOARD_INSIGHT`).

## 12. UI future (no UI in P2.3)

```
BMW 320d — NOT READY
Causes:
• Reifendruck kritisch
• Service überfällig
```

Not: parallel parent rows for Blocked + Maintenance Required + Not Ready.

## 13. P2.4

Separate unevaluable/data-availability aggregate notification — out of scope for P2.3.

## Sync integration

`VehicleHealthNotificationSyncService` reuses the per-vehicle `rentalHealth` snapshot already loaded for cause projection. Fifth sync stage: `syncVehicleReadinessAggregate()` — failure-isolated from health/compliance/alerts stages.

Healthy CLEARED uses active-fingerprint pre-check (same pattern as P2.2B vehicle alerts).

## Registry counts

**No new event types.** Counts unchanged from P2.2B baseline (code-derived).
