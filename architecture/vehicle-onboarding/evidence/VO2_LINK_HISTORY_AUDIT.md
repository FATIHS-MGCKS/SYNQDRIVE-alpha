# VO-2 — VehicleDataSourceLink history constraint audit

**Date:** 2026-09-30  
**Result:** `LINK_HISTORY_CONSTRAINT_COMPLETE=NO`

## Current constraint

```sql
CREATE UNIQUE INDEX "uq_data_source_link_active" ON "vehicle_data_source_links"
  ("vehicle_id", "source_type", "source_subtype", "is_active");
```

(Prisma: `@@unique([vehicleId, sourceType, sourceSubtype, isActive])`)

## PostgreSQL behavior (proven)

1. **Inactive episodes:** For a fixed `(vehicle_id, source_type, source_subtype, is_active=false)`, at most **one** inactive row is allowed. A second deactivation/rebind with `is_active=false` violates the unique index. This **blocks** unlimited historical inactive episodes.

2. **NULL `source_subtype`:** PostgreSQL treats NULLs as distinct in unique indexes. Multiple active rows with `source_subtype IS NULL` and `is_active=true` can coexist — the index does **not** enforce “one active link” when subtype is NULL.

## Runtime dependency audit

- No `vehicleId_sourceType_sourceSubtype_isActive` Prisma unique selector usage in `backend/src` (grep clean).
- `DimoVehicleDataSourceLinkService` uses `findMany` + application logic, not compound unique upsert.

## VO-2 actions taken

- Added `superseded_by_link_id`, `deactivation_reason` columns (non-breaking).
- **Did not** drop `uq_data_source_link_active` (would require VO-3 runtime + migration coordination).

## Target (VO-3+)

- Partial unique index on **active** rows only, NULL-safe subtype semantics.
- Replace compound unique after call-site audit and reactivation flows validated.

## Blocker text

`LINK_HISTORY_BLOCKER=Prisma compound unique uq_data_source_link_active prevents multiple is_active=false episodes; nullable source_subtype weakens single-active guarantee; drop deferred to VO-3 with runtime refactor.`
