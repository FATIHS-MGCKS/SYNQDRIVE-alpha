# VO-5B — Registry lifecycle → Billing quantity bridge

| Field | Value |
|-------|-------|
| **Slice** | VO-5B |
| **Date** | 2026-10-01 |
| **Authority** | Vehicle Onboarding `AUDIT_IN_PROGRESS` (unchanged) |
| **Starting main** | `d4a08b241ab5fec1e4979b52896a7fe90b6aa870` (post VO-5A merge) |

## Objective

Post-commit idempotent bridge:

`VEHICLE_OFFBOARDED` (VehicleRegistryLifecycleOutbox) → Billing quantity deprovision (`VEHICLE_DISCONNECTED`, delta `-1`) at `occurredAt`, without Stripe inside the Vehicle transaction.

## Invariants (sealed)

| Key | Value |
|-----|-------|
| `REGISTRY_OFFBOARD_BILLING_BRIDGE` | `IMPLEMENTED` |
| `REGISTRY_OUTBOX_OFFBOARD_BILLING_CONSUMER_BEFORE` | `NO` |
| `BILLABLE_VEHICLE_REQUIRES_REGISTRY_ACTIVE` | `YES` |
| `OFFBOARDED_VEHICLE_BILLABLE` | `NO` |
| `ARCHIVED_VEHICLE_BILLABLE` | `NO` |
| `DISCONNECTED_ACTIVE_VEHICLE_MAY_REMAIN_BILLABLE` | `YES` |
| `POST_OFFBOARD_CURRENT_STATE_USED_AS_PRESTATE_AUTHORITY` | `NO` (registry path uses `wasVehicleBillableAtOffboardBoundary`) |
| `EVENT_TIME_BILLING_PRESTATE_AUTHORITY` | `YES` (`occurredAt` + ACTIVE registry override at boundary) |
| `REGISTRY_LIFECYCLE_EVENT_RETROACTIVE_AUTHORIZED` | `YES` (trusted lifecycle projection only) |
| `BILLING_ASSIGNMENT_AND_QUANTITY_TRANSITION_ATOMIC` | `YES` (single Prisma transaction) |
| `MULTIPLE_EFFECTIVE_BILLING_ASSIGNMENTS_FAIL_CLOSED` | `YES` |
| `REGISTRY_BILLING_CROSS_TENANT_FAIL_CLOSED` | `YES` |
| `STRIPE_CALL_COUNT_FROM_REGISTRY_CONSUMER` | `0` |
| `NON_BILLABLE_OFFBOARD_EVENT_QUANTITY_DELTA` | `0` |
| `LEGACY_IMPLICIT_OFFBOARD_BILLING_POLICY` | Decrement when org has zero explicit assignments and vehicle was billable at boundary (no fabricated assignment rows) |
| `BILLING_IDEMPOTENCY_KEY_SOURCE` | `vehicle-registry:<eventId>:billing-offboard:v1` |
| `REGISTRY_OUTBOX_PUBLICATION_MODEL` | Registry outbox = publication authority; synchronous dispatcher invokes idempotent downstream handlers |
| `REGISTRY_OUTBOX_PUBLISHED_AFTER_REQUIRED_HANDLERS` | `YES` (currently: billing offboard projection) |
| `VEHICLE_ACTIVATED_BILLING_BRIDGE_GAP` | `YES` (follow-up; not in VO-5B scope) |

## Scope exclusions (unchanged)

- `PUBLIC_OFFBOARD_HTTP=NO`
- `LEGACY_DEREGISTER_CHANGED=NO`
- `ORG_TRANSFER_ENABLED=NO`
- `RE_ONBOARD_ENABLED=NO`

## Implementation map

| Area | Path |
|------|------|
| Billable policy registry lifecycle | `backend/src/modules/billing/domain/billable-vehicle-policy.ts` |
| Event-time boundary | `backend/src/modules/billing/domain/billing-vehicle-offboard-boundary.ts` |
| Registry event validation | `backend/src/modules/billing/registry-lifecycle/validate-vehicle-offboarded-registry-event.ts` |
| Billing projection | `backend/src/modules/billing/registry-lifecycle/billing-vehicle-registry-offboard.projection.ts` |
| Outbox processor / worker | `backend/src/modules/vehicle-onboarding/registry-lifecycle/*` |
| PostgreSQL proofs | `backend/src/modules/billing/vo5b-registry-billing-bridge.postgres.integration.spec.ts` (`VO5B_REGISTRY_BILLING_PG=1`) |

## Validation

```bash
cd backend && npm run test:vehicle-onboarding:vo5b:postgres
cd backend && npm test -- billable-vehicle-policy billing-vehicle-offboard-boundary validate-vehicle-offboarded-registry-event billing-quantity-vehicle.integration.registry-offboard
```
