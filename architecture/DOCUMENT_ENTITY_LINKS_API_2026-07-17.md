# Document Entity Links API (V4.9.633)

**Date:** 2026-07-17  
**Prompt:** 58/84 — Confirm, change, and remove `DocumentEntityLinks`

## Scope

Authorized API + service for managing confirmed entity links on document extractions:

- Vehicle
- Booking
- Customer
- Driver
- Vendor

A document may link multiple different entity types. General correspondence may remain without a vehicle link.

## Routes

| Scope | Method | Path |
|-------|--------|------|
| Vehicle | `PATCH` | `/vehicles/:vehicleId/document-extractions/:extractionId/entity-links` |
| Organization | `PATCH` | `/organizations/:orgId/document-extractions/:extractionId/entity-links` |

Permission: `document-upload:write` (+ `VehicleOwnershipGuard` / `OrgScopingGuard`).

### Request body

```json
{
  "operations": [
    { "operation": "confirm", "entityType": "customer", "entityId": "…", "label": "…" },
    { "operation": "change", "entityType": "booking", "entityId": "…", "previousEntityId": "…" },
    { "operation": "remove", "entityType": "driver" }
  ]
}
```

Operations: `confirm` | `change` | `remove`.

## Storage

| Location | Content |
|----------|---------|
| `confirmedData.acceptedEntityLinks` | Active links (`entityType`, `entityId`, `label?`) |
| `plausibility._pipeline.supersededEntityLinks` | Historical superseded links with `supersededAt`, `supersededReason`, `replacedByEntityId` |
| `plausibility._pipeline.actionAudit` | `update_entity_links` audit entries |

One active link per entity type.

## Rules

1. **Authorized users only** — write permission + tenant/vehicle guards.
2. **Full audit trail** — every mutation appends `update_entity_links` to `actionAudit`.
3. **Plan invalidation** — when links change and an action plan exists, `invalidateDocumentActionPlan(..., CONFIRMED_DATA_CHANGED)`.
4. **Supersede, don't delete downstream** — removed/changed links move to `supersededEntityLinks`; no Customer/Booking/Vendor/Fine deletion.
5. **Separate entity types** — vehicle, booking, customer, driver, vendor validated independently (org-scoped Prisma lookups).
6. **No action execution on link-only changes** — service updates `confirmedData` + pipeline only; no orchestrator/executor calls.
7. **General document without vehicle** — org route allows customer/vendor/etc. without vehicle; vehicle link optional; removing vehicle link clears `vehicleId` on org extractions.
8. **Editable statuses** — `READY_FOR_REVIEW`, `CONFIRMED`; blocked during `APPLYING` (`assertActionPlanEditable`).

## Validation

`DocumentEntityLinkValidationService`:

- `vehicle` — org membership; vehicle-scoped route requires link matches route `vehicleId`
- `booking` — org + effective vehicle context
- `customer` / `driver` — org-scoped `Customer`
- `vendor` — org-scoped `Vendor`

## Module

- `DocumentEntityLinkService`
- `document-entity-link.util.ts` — apply operations + supersede helpers
- `document-entity-link.validation.ts`
- `dto/update-document-entity-links.dto.ts`

## Tests

- Permission metadata on vehicle/org controllers
- Supersede history on change/remove
- Action plan invalidation on link change
- No downstream entity deletion
- Org general document without vehicle
