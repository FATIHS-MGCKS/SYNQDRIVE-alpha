# VO-2 — Nullable VIN and org-scoped unique index

## Schema

`@@unique([vin, organizationId])` on `Vehicle` retained.

## PostgreSQL semantics

Under PostgreSQL unique constraints, **multiple rows with `vin IS NULL` in the same organization are allowed** because NULL values are considered distinct from each other in unique comparisons.

Therefore:

- Org-scoped VIN uniqueness applies only when `vin` is **non-null**.
- No global VIN uniqueness is introduced.

## VO-2 migration

- `ALTER COLUMN vin DROP NOT NULL` — existing values preserved.
- Synthetic `DIMO-*` rows classified `LEGACY_SYNTHETIC` (not `VERIFIED`).
- All other existing non-null VINs classified `LEGACY_UNKNOWN` (not `VERIFIED`).
