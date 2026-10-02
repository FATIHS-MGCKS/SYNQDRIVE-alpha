# VO-5B — Registry lifecycle → Billing quantity bridge

| Field | Value |
|-------|-------|
| **Slice** | VO-5B |
| **Date** | 2026-10-01 (VO-5B.1: 2026-10-02; VO-5B.2 temporal seal: 2026-10-02) |
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
| `EVENT_TIME_BILLING_PRESTATE_AUTHORITY` | `YES` (`resolveBaseSubscriptionItemAsOf`, `buildEventTimePolicyContext`, quantity-ledger vehicle license state at `occurredAt`) |
| `EVENT_TIME_BASE_ITEM_RESOLUTION` | `PROVEN` |
| `EVENT_TIME_ASSIGNMENT_RESOLUTION` | `PROVEN` (`billing-assignment-event-time`) |
| `VEHICLE_LICENSE_EVENT_TIME_STATE_AUTHORITY` | `BillingQuantityEvent` per-vehicle timeline at `occurredAt` |
| `REGISTRY_LIFECYCLE_EVENT_RETROACTIVE_AUTHORIZED` | `YES` (trusted lifecycle projection only) |
| `BILLING_PRESTATE_DECISION_AND_MUTATION_ATOMIC` | `YES` (single Prisma transaction; FOR UPDATE on base item) |
| `BILLING_ASSIGNMENT_AND_QUANTITY_TRANSITION_ATOMIC` | `YES` (same transaction) |
| `BILLING_IDEMPOTENCY_SEMANTIC_COLLISION_FAIL_CLOSED` | `YES` |
| `UNSUPPORTED_VALID_LIFECYCLE_EVENT_MARKED_FAILED` | `NO` |
| `VEHICLE_ACTIVATED_EVENT_PRESERVED_FOR_FUTURE_HANDLER` | `YES` |
| `REGISTRY_OUTBOX_CLAIM_AUTHORITY` | `updateMany` lease on `nextRetryAt` + CAS publish from `PENDING` only |
| `REGISTRY_OUTBOX_PUBLISHED_STATE_MONOTONIC` | `YES` |
| `CONCURRENT_FAILURE_CANNOT_REGRESS_PUBLISHED` | `YES` |
| `LEGACY_IMPLICIT_OFFBOARD_CANNOT_CREATE_NEGATIVE_QUANTITY` | `YES` (noop without vehicle license provision evidence; aggregate quantity guard) |
| `ALREADY_DEPROVISIONED_BEFORE_OFFBOARD_DELTA` | `0` |
| `VO5B_POSTGRES_REMOTE_CI_PRESENT` | `YES` (`.github/workflows/vehicle-onboarding-vo5b-postgres-ci.yml`) |
| `CURRENT_ORGANIZATION_STATUS_CAN_REWRITE_OFFBOARD_PRESTATE` | `NO` |
| `CURRENT_ORG_STATUS_USED_AS_EVENT_TIME_BILLABILITY_AUTHORITY` | `NO` |
| `ASSIGNMENT_CREATED_AFTER_EVENT_AFFECTS_PRESTATE` | `NO` (`createdAt > occurredAt` excluded) |
| `POST_EVENT_EXCLUSION_CAN_CANCEL_HISTORICAL_OFFBOARD_DELTA` | `NO` |
| `LEGACY_IMPLICIT_MODE_EVENT_TIME_AUTHORITY` | `YES` (assignment count where `createdAt <= occurredAt`) |
| `VEHICLE_LICENSE_QUANTITY_LEDGER_PRIMARY_PRESTATE_AUTHORITY` | `YES` |
| `POST_EVENT_ASSIGNMENT_MUTATED_BY_OFFBOARD_CONSUMER` | `NO` |
| `ASSIGNMENT_HISTORY_LIMITATION_DOCUMENTED` | `YES` (no full bitemporal assignment model; `createdAt` boundary only) |

### Assignment history limitation (VO-5B.2)

`BillingBillableVehicleAssignment` exposes `billableFrom` / `billableUntil` and mutable `status`, but **not** a complete bitemporal history. For registry offboarding, prestate uses:

- `createdAt <= occurredAt` for assignment rows considered as ordinary evidence
- `BillingQuantityEvent.effectiveAt` as **primary** per-vehicle license provision/deprovision authority
- Current `Organization.status` is **not** used to veto a proven historical license transition (no org status history table)
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
