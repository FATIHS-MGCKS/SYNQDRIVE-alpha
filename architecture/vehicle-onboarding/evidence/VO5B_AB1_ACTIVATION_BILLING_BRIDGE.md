# VO5B-AB1 — Activation lifecycle → Billing quantity bridge

| Field | Value |
|-------|-------|
| **Slice** | VO5B-AB1 (not VO5C) |
| **Date** | 2026-10-07 |
| **Authority** | Vehicle Onboarding `AUDIT_IN_PROGRESS` (unchanged) |
| **Parent** | VO-5B registry lifecycle outbox (`VO5B_REGISTRY_BILLING_BRIDGE.md`) |
| **Merge anchor** | VO-5B PR #1883 @ `56e6d99e742b8e1c3113583fe939548439a00436` |

## Objective

Close the documented gap: durable `VEHICLE_ACTIVATED` (`VehicleRegistryLifecycleOutbox`) → internal billing quantity provision (`VEHICLE_CONNECTED`) at activation time, without Stripe inside the activation transaction or lifecycle consumer.

## Delivery (implemented)

| Key | Value |
|-----|-------|
| `VEHICLE_ACTIVATED_BILLING_BRIDGE` | `IMPLEMENTED` |
| `REGISTRY_OUTBOX_ACTIVATION_BILLING_CONSUMER` | `VehicleRegistryLifecycleOutboxProcessor` |
| `BILLING_INTERNAL_AUTHORITY` | `BillingQuantityEvent` (append-only quantity ledger) |
| `BILLING_EVENT_TYPE_CREATED` | `VEHICLE_CONNECTED` |
| `TEMPORAL_START_SOURCE` | `VehicleRegistryLifecycleOutbox.occurredAt` (= payload `activatedAt`) |
| `WORKER_PROCESSING_TIME_USED_AS_BILLING_START` | `NO` |
| `BILLING_IDEMPOTENCY_KEY_FORMAT` | `vehicle-registry:<registryEventId>:billing-activate:v1` |
| `BILLING_IDEMPOTENCY_DB_GUARD` | `BillingQuantityEvent.idempotencyKey` `@unique` |
| `STRIPE_MUTATION_IN_REGISTRY_CONSUMER` | `NO` |
| `NEW_EVENT_INFRASTRUCTURE` | `NO` (reuse existing outbox worker) |

Handler flow:

1. Activation TX commits → `VEHICLE_ACTIVATED` outbox row (`PENDING`).
2. Existing registry lifecycle worker claims row.
3. `validateVehicleActivatedRegistryEvent` (fail-closed tenant/payload checks).
4. `assertVehicleTenantForActivation` (vehicle exists in org, registry `ACTIVE`).
5. `BillingQuantityVehicleIntegration.onVehicleProvisioned` with `retroactiveAuthorized: true`.
6. Outbox `PUBLISHED` only after billing succeeds or idempotently converges.

## Legacy provisioning (unchanged)

`VehiclesService.create` / `registerFromDimo` still fire-and-forget `onVehicleProvisioned` without registry event idempotency. Canonical `VehicleOnboardingActivationService.activateVehicle` does **not** invoke those hooks; paths are **disjoint** today. Legacy cutover remains VO5C / later scope.

## Non-scope

- Re-onboarding (`RE_ONBOARD_ENABLED=NO`)
- Org transfer (`ORG_TRANSFER_NOT_SUPPORTED`)
- Removal of legacy provision hooks
- Master-Admin offboard / legacy deregister cutover (VO5C)

## Tests

| Suite | Gate |
|-------|------|
| `validate-vehicle-activated-registry-event.spec.ts` | unit |
| `vehicle-registry-lifecycle-outbox.processor.spec.ts` | unit |
| `vo5b-ab1-registry-billing-activate.postgres.integration.spec.ts` | `VO5B_AB1_REGISTRY_BILLING_PG=1` |
| `vo5b-registry-billing-bridge.postgres.integration.spec.ts` | offboard regression + AB1 smoke |

CI: `backend/scripts/test/vo5b-vehicle-onboarding-postgres-ci.sh` runs VO5B + VO5B-AB1 PostgreSQL suites.
