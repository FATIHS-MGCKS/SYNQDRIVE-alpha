# P3-PR1 migration evidence (2026-11-17T08:20:22Z UTC)

## Environment
- Host: 127.0.0.1:5433 (disposable localhost)
- Baseline database: synqdrive_product_catalog_p2_pr1
- Branch: cursor/p3-pr1-service-client-registry-7037
- Reviewed baseline main: 01a7ea3ee984518a587c00f0ba37f8a5151ec996
- PR migration: 20261117133000_p3_pr1_core_app_service_client_registry

## Baseline — first migrate deploy
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "synqdrive_product_catalog_p2_pr1", schema "public" at "127.0.0.1:5433"

452 migrations found in prisma/migrations


No pending migrations to apply.
┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 8.0.0-rc.34                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘

## Baseline — second migrate deploy (replay, expect no pending)
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "synqdrive_product_catalog_p2_pr1", schema "public" at "127.0.0.1:5433"

452 migrations found in prisma/migrations


No pending migrations to apply.

## Baseline — migrate status
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "synqdrive_product_catalog_p2_pr1", schema "public" at "127.0.0.1:5433"

452 migrations found in prisma/migrations

Database schema is up to date!

## Fresh database — full chain migrate deploy (greenfield)
- Database: synqdrive_p3_pr1_fresh_evidence_1794903628
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "synqdrive_p3_pr1_fresh_evidence_1794903628", schema "public" at "127.0.0.1:5433"

452 migrations found in prisma/migrations

Applying migration `20260311224040_init`
Applying migration `20260312120232_add_dimo_vehicle_snapshot_fields`
Applying migration `20260315000000_add_rental_driving_analysis`
Applying migration `20260325161141_ci_r3b_bootstrap_trip_schema_baseline`
Applying migration `20260325161142_trip_architecture_refactor`
Applying migration `20260325170000_parts_accessories_module`
Applying migration `20260331000000_v3_hardware_type`
Applying migration `20260331130000_vehicle_complaints`
Applying migration `20260408120000_high_mobility_phase1`
Applying migration `20260408140000_high_mobility_phase2`
Applying migration `20260409120000_hm_signal_group_state`
Applying migration `20260410000000_add_enrichment_status_fields`
Applying migration `20260412013110_hm_dual_app_container_type`
Applying migration `20260412020000_hm_latest_state_tables`
Applying migration `20260412025000_ci_r3b_historical_predecessor_slot1`
Applying migration `20260412030000_platform_hardening_phase1`
Applying migration `20260412040000_audit_consent_provenance`
Applying migration `20260412610000_ci_r3b_historical_predecessor_slot2`
Applying migration `20260413183000_brake_health_canonical_refactor`
Applying migration `20260413201500_ci_r3b_historical_predecessor_slot3`
Applying migration `20260413220000_battery_evidence_unique_dedup`
Applying migration `20260413225000_ci_r3b_historical_predecessor_slot4`
Applying migration `20260413230000_add_composite_indexes_batch_c`
Error: P3018

A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve

Migration name: 20260413230000_add_composite_indexes_batch_c

Database error code: 25001

Database error:
ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block

DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E25001), message: "CREATE INDEX CONCURRENTLY cannot run inside a transaction block", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("xact.c"), line: Some(3497), routine: Some("PreventInTransactionBlock") }

## Verdict summary

| Gate | Result | Notes |
|------|--------|-------|
| Baseline second `migrate deploy` | **PASS** | `synqdrive_product_catalog_p2_pr1` — no pending migrations (452 total) |
| Fresh-DB full chain | **PRE_EXISTING_BLOCKER** | Fails at `20260413230000_add_composite_indexes_batch_c` — **not** P3-PR1 |
| P3-PR1 on baseline | **PASS** | `20261117133000_p3_pr1_core_app_service_client_registry` applied; replay idempotent |

Classification: greenfield `prisma migrate deploy` is blocked by a historical Alpha migration before the P3-PR1 timestamp. Disposable **baseline** DB validates PR1 apply + idempotent replay.
