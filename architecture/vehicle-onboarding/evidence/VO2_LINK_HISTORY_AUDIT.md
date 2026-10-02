# VO-2 — VehicleDataSourceLink history constraint audit

**Date:** 2026-09-30 (updated VO-2.1)  
**Result:** `LINK_HISTORY_CONSTRAINT_COMPLETE=YES` (VO-2.1 migration `20260930140000_vehicle_onboarding_vo2_1_integrity`)

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
- Initially retained `uq_data_source_link_active` pending runtime audit.

## VO-2.1 actions taken

- Re-audit: **0** Prisma compound-selector call sites in `backend/src`.
- Dropped `uq_data_source_link_active`; added DB-only partial unique `uq_vehicle_data_source_link_active_scope`.
- Removed Prisma `@@unique` on `VehicleDataSourceLink.is_active` — documented in schema comment.

## Blocker text (resolved)

`LINK_HISTORY_BLOCKER=` (none — VO-2.1 completed correction in persistence layer; VO-3 may add runtime supersession flows without changing this index shape).
