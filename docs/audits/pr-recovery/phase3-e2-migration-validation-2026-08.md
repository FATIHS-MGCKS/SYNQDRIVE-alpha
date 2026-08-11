# Phase 3 E2 — Migration Validation

## Migration identity

- Migration: `backend/prisma/migrations/20260811060000_evaluations_entity_references/migration.sql`
- Type: **additive-only** (new enums + one new table); no existing table, column,
  or type is altered, dropped, or retyped.
- `BACKFILL_REQUIRED = NO` (new table; no legacy rows are migrated in E2).
- `production migration performed = NO`.

## Schema diff summary

New enums:

- `EvaluationsReferenceOwnerType` (`INSIGHT`, `ANALYTICS_GROUP`)
- `EvaluationsEntityType` (`VEHICLE`, `BOOKING`, `CUSTOMER`, `DRIVER`, `USER`,
  `INVOICE`, `PAYMENT`, `TASK`, `SERVICE_CASE`, `DAMAGE`, `DOCUMENT`, `STATION`)
- `EvaluationsRelationType` (`PRIMARY_SUBJECT`, `CONTRIBUTOR`, `RELATED`,
  `SOURCE`, `IMPACTED`)

New table `evaluations_entity_references`:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid supplied by Prisma |
| `organization_id` | TEXT NOT NULL | FK → `organizations(id)` `ON DELETE CASCADE` |
| `station_id` | TEXT NULL | optional station scope |
| `owner_type` | enum NOT NULL | analytical object kind |
| `owner_id` | TEXT NOT NULL | analytical object id |
| `entity_type` | enum NOT NULL | referenced domain |
| `entity_id` | TEXT NOT NULL | referenced id (tenant-scoped) |
| `relation_type` | enum NOT NULL | typed relation |
| `dedupe_key` | TEXT NOT NULL | deterministic, tenant-scoped |
| `created_at` | TIMESTAMP(3) default now | period + sort key |
| `updated_at` | TIMESTAMP(3) | |

Indexes / constraints:

- `evaluations_entity_refs_org_dedupe_key` UNIQUE (`organization_id`, `dedupe_key`)
- `(organization_id)`, `(organization_id, entity_type, entity_id)`,
  `(organization_id, station_id)`, `(organization_id, owner_type, owner_id)`,
  `(organization_id, created_at)`

The hand-authored SQL was aligned byte-for-byte with Prisma's own generated DDL
(`prisma migrate diff --from-empty --to-schema-datamodel --script`), including the
63-char index-name truncation Prisma applies, so `migrate deploy` will not report
drift for this migration.

## Index review

Indexes follow the repository's org-first composite convention and match the
real query patterns: org-scoped count/list, group-by entity type / relation /
station, entity id lookups, station scoping, and `created_at` period range + sort.
No redundant or unbounded index was added.

## Lock-risk assessment

`CREATE TYPE` + `CREATE TABLE` + `CREATE INDEX` on a brand-new empty table take
only short catalog locks and touch no existing table. The single `ALTER TABLE …
ADD CONSTRAINT … FOREIGN KEY` references `organizations` and validates against an
empty child table, so it is effectively instantaneous. Estimated production lock
risk: **negligible**; no table rewrite, no backfill, no data migration.

## Dry run (executed)

A disposable PostgreSQL 16 cluster was initialized locally (no Docker; server
installed for this validation). The migration was applied to a fresh database
seeded only with the reference precondition (`organizations`):

- All three enums, the table, all six indexes, and the FK were created with no
  errors and no identifier-truncation notices (names match Prisma's expected
  names exactly).
- Integrity checks:
  - Same natural `entity_id` (`veh-1`) under `org-a` and `org-b` coexists → 2 rows
    (tenant-scoped uniqueness).
  - Duplicate `(organization_id, dedupe_key)` insert → rejected by the unique
    index.
  - `DELETE FROM organizations WHERE id='org-a'` → org-a references removed
    (0 remaining), org-b references untouched (1 remaining).

`dry run = PASS`.

## Whole-chain migrate deploy note

A greenfield `prisma migrate deploy` of the full migration history fails at the
pre-existing `20260325161142_trip_architecture_refactor` (P3018: `vehicle_trips`
does not exist) — a baseline gap on `origin/main` documented in
`phase3-e1-ab-baseline-validation-2026-08.md`, unrelated to E2. The E2 migration
is later in the chain and additive; it was therefore validated against the
reference precondition and by exact-DDL comparison rather than by a full
greenfield replay. `prisma validate` passes on the complete schema.

## E2.1 — Current-main schema migration validation

Executed on a disposable PostgreSQL 16 cluster (no Docker; server installed
locally for validation). Base: `origin/main` `ab554722a2e6e9ed8e4263310bd2bddf9b62445a`.

### Full current-main migration chain

`prisma migrate deploy` over the 283-migration chain stops at the 4th migration
`20260325161142_trip_architecture_refactor` with `P3018` / `42P01`
(`relation "vehicle_trips" does not exist`). Classification:
**`PRE_EXISTING_MIGRATION_BASELINE`** — identical on `origin/main`, unrelated to
E2 (the repository lacks a `CREATE TABLE vehicle_trips` baseline; documented in
`phase3-e1-ab-baseline-validation-2026-08.md`). Migrations before it commit, so
`organizations` and `stations` (from `20260311224040_init`) exist in the
resulting schema.

### E2 DDL proven against the real current-main schema

The E2 migration was then applied on top of that real partial current-main
schema (not just a synthetic precondition):

- `E2_APPLIED_ON_CURRENT_MAIN_SCHEMA` — all enums, table, indexes, and the FK
  created cleanly.
- The FK `evaluations_entity_references_organization_id_fkey` binds to the real
  `organizations` table.
- Inserting a reference for a real `organizations` row works; deleting that
  organization cascades the reference away (1 → 0).

So the E2 DDL itself is proven valid against the actual current-main object set;
only the unrelated pre-existing `vehicle_trips` baseline blocks a full greenfield
replay.

### Partial-apply / idempotency semantics (corrected)

The earlier phrasing ("idempotent because CREATE TABLE is new") was imprecise.
Accurate behavior:

- Prisma applies each migration in its own transaction and records it in
  `_prisma_migrations`. A migration that fails mid-way is rolled back by
  PostgreSQL (no partial objects) and recorded as failed; Prisma then refuses to
  apply further migrations until the failure is resolved (`migrate resolve`).
- The E2 migration is a single transaction of `CREATE TYPE` / `CREATE TABLE` /
  `CREATE INDEX` / `ADD CONSTRAINT`. If it failed partway, PostgreSQL rolls the
  whole statement batch back — there is no half-created table state to clean up.
- It is **not** arbitrarily re-runnable as raw SQL (`CREATE TYPE` would error on
  a second run). Recovery is via Prisma's normal state machine: fix and re-run
  `migrate deploy` (roll-forward), which is the preferred path. The migration is
  idempotent at the **Prisma-migration-state** level (applied once, tracked), not
  as blindly repeatable DDL.

### Station/organization integrity strategy

Same-tenant integrity for `stationId` is enforced by the single controlled
application write-gate (`EvaluationsEntityReferenceWriteService`): a reference's
`stationId` (and any `STATION`-typed target) must resolve to a station of the
reference's `organizationId`, else the write fails closed. A composite
`(stationId, organizationId)` foreign key was considered but not added in E2.1 to
avoid reshaping the existing station architecture and because `organizationId`
already participates in the organization relation; the write-gate is the mandated
single insert path and is covered by integrity tests. Reads are always
organization-scoped, so a reference can never surface a foreign tenant's data
regardless.

### Gates

- `prisma validate`: PASS. Production migration performed: **NO**.

## Rollback / roll-forward

- Roll-forward repair: re-run `migrate deploy` (idempotent; the migration only
  creates new objects).
- Rollback: drop `evaluations_entity_references` and the three enum types. No
  other object depends on them; no data outside the new table is affected.

## Delete / retention semantics

The reference is a pointer, not a PII store. When a referenced entity is deleted
or anonymized in its owning domain, the reference becomes a canonical
missing/degraded reference at read time (labels are resolved, authorized, from
the owning domain and are never stored here), so entity references cannot
preserve PII beyond the owning domain's retention. Organization deletion cascades
references away.
