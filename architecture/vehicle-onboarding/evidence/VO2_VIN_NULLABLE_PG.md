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

## VO-2.1 runtime compatibility (display-only)

- `HmVehicleStatusDto.vin` remains `string | null`; HM status skips provider lookup when VIN is unknown (no `?? ''` identity coercion).
- Fleet connectivity list DTO `vin` is `string | null` — empty string is not used as a second synthetic VIN representation.
