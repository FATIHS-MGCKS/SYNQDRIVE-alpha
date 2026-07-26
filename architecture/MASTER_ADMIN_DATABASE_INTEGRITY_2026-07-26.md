# Master Admin — Database Integrity Review (Phase 2E.3)

**Date:** 2026-07-26  
**Version:** V4.9.893  
**Status:** Analysis complete — no migrations applied

## Summary

Production constraint audit across 312 Prisma models and 281 migrations.

## Key findings

- **organization_id:** 232 models; cascade from org root; 14 config tables lack org index (P2).
- **vehicle_id:** 109 models; strong FK + hot-path indexes; VehicleTrip scoped via vehicle FK.
- **booking_id:** RESTRICT on customer/vehicle; CASCADE from org; child uniques on bundles/drivers.
- **customer_id:** Org-scoped; no unique email per org (by design).
- **dimo_vehicle_id:** FK only — **no UNIQUE, no INDEX** (P1, aligns with 2E.2).

## Safe migrations recommended

1. `CREATE INDEX CONCURRENTLY` on `vehicles(dimo_vehicle_id)` WHERE NOT NULL
2. Partial UNIQUE on `vehicles(dimo_vehicle_id)` after duplicate audit = 0
3. Phased backfill for nullable `organization_id` on `driving_events` etc.

**No destructive DDL recommended.**

## Artifacts

- `docs/remediation/database-integrity-review.md` — risk register DB1–DB8 + operator SQL
