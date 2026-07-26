# Master Admin Remediation — Phase 2E.3: Database Integrity Review

**Date:** 2026-07-26  
**Status:** Analysis complete — **no schema or migration changes applied**  
**Scope:** Production-relevant PostgreSQL constraints via Prisma schema + 281 migrations  
**Prerequisites:** Phase 2E.2 DIMO vehicle integrity (binding gap on `dimo_vehicle_id`)  
**Constraint:** Recommend **additive, non-destructive** migrations only

---

## Executive summary

| Area | Verdict | Notes |
|------|---------|-------|
| **Schema scale** | Large | 312 models · 134 `@@unique` · 1,001 `@@index` |
| **`organization_id`** | Strong | 232 models; most tenant tables indexed |
| **`vehicle_id`** | Strong | 109 models; FK + indexes on hot paths |
| **`booking_id`** | Good | RESTRICT on core FKs; composite uniques on children |
| **`customer_id`** | Good | Org-scoped; normalized-field indexes; no email unique per org |
| **`dimo_vehicle_id`** | **Weak** | FK only — **no UNIQUE, no INDEX** |
| **Cascade policy** | Consistent | Org delete → Cascade (352 FKs); financial → Restrict (19) |
| **Cross-entity org consistency** | Application-layer | No DB CHECK that `booking.customer ∈ booking.org` |
| **Partial uniques** | Used | Notifications, vehicle warnings — raw SQL migrations |

**Overall:** PostgreSQL integrity is **production-grade** for tenant isolation on `organization_id` and entity FKs. The highest-impact gap is **`vehicles.dimo_vehicle_id`** (1:N binding allowed). Remaining items are index coverage and optional backfills — not structural rewrites.

---

## 1. Schema inventory

| Metric | Count |
|--------|-------|
| Prisma models | 312 |
| Models with `organizationId` | 232 (~74%) |
| Models with `vehicleId` | 109 |
| Models with `bookingId` | 30 |
| Models with `customerId` | 24 |
| Models with `dimoVehicleId` | 1 (`Vehicle` only) |
| `@@unique` constraints | 134 |
| `@@index` declarations | 1,001 |
| Migrations | 281 |
| FK `onDelete: Cascade` | ~352 |
| FK `onDelete: SetNull` | ~143 |
| FK `onDelete: Restrict` | ~19 |
| FK without explicit `onDelete` | 5 (default **Restrict** in PostgreSQL) |

### Migration safety patterns observed

| Pattern | Example | Safe? |
|---------|---------|-------|
| `CREATE INDEX CONCURRENTLY IF NOT EXISTS` | `20260413230000_add_composite_indexes_batch_c` | Yes — online |
| `CREATE UNIQUE INDEX IF NOT EXISTS` | Customer eligibility policies | Yes — if no dupes |
| Partial unique `WHERE … IS NOT NULL` | Vehicle warnings phase 2 | Yes — after duplicate audit |
| `ADD COLUMN` nullable + backfill + NOT NULL | Invoice sequence fields | Yes — phased |
| `DROP COLUMN` / `DROP TABLE` | Rare in recent migrations | Avoid without backup |

---

## 2. Focus field analysis

### 2.1 `dimo_vehicle_id`

**Table:** `vehicles`  
**Prisma:**

```2775:2843:backend/prisma/schema.prisma
  dimoVehicleId                     String?           @map("dimo_vehicle_id")
  // ...
  dimoVehicle                            DimoVehicle?                            @relation(fields: [dimoVehicleId], references: [id], onDelete: SetNull)
```

| Constraint | Present? |
|------------|----------|
| Foreign key → `dimo_vehicles.id` | Yes |
| `ON DELETE SET NULL` | Yes |
| **UNIQUE** (1:1 binding) | **No** |
| **INDEX** on `dimo_vehicle_id` | **No** |
| NOT NULL when linked | No (nullable by design) |

**Provider mirror (`dimo_vehicles`):**

| Column | Constraint |
|--------|------------|
| `external_id` | UNIQUE |
| `token_id` | UNIQUE (nullable) |
| `organization_id` | N/A (global mirror) |

**Integrity risk (P1):** Multiple `vehicles` rows (possibly different `organization_id`) can reference the same `dimo_vehicle_id`. Webhook resolution uses `findFirst({ dimoVehicle: { tokenId } })` — ambiguous under duplication.

**Safe migration recommendation:**

```sql
-- Step 0 (pre-flight, read-only): detect duplicates — see Section 8
-- Step 1 (only if 0 rows from duplicate query):
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "vehicles_dimo_vehicle_id_unique"
  ON "vehicles" ("dimo_vehicle_id")
  WHERE "dimo_vehicle_id" IS NOT NULL;

-- Step 2 (always safe):
CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicles_dimo_vehicle_id_idx"
  ON "vehicles" ("dimo_vehicle_id")
  WHERE "dimo_vehicle_id" IS NOT NULL;
```

**Rollback:** `DROP INDEX CONCURRENTLY` — no data loss.

---

### 2.2 `organization_id`

**Coverage:** 232 models carry `organizationId`; 38 allow null (platform/global or legacy).

| Pattern | Examples | Assessment |
|---------|----------|------------|
| Required + `onDelete: Cascade` from `organizations` | `vehicles`, `customers`, `bookings`, `notifications` | Correct tenant root |
| Required + index | Majority of tenant tables | Good query performance |
| Composite unique with org | `@@unique([vin, organizationId])`, `@@unique([organizationId, dedupeKey])` | Strong dedup |
| Nullable on operational tables | `DrivingEvent.organizationId`, `VehicleDamage.organizationId` | **P2** — backfill candidate |
| Required but **no index** | 14 models (see below) | **P2** — safe index adds |

**Models with required `organizationId` but no `@@index` / `@@unique` on org** (low-traffic config tables):

`TirePositionHistory`, `TireMeasurement`, `TireEvent`, `TireHealthSnapshot`, `BrakeServiceOutbox`, `CustomerEligibilityPolicy`, `OrganizationRentalRules`, `OrganizationLegalDocumentRetentionPolicy`, `OrgWorkflowShadowSettings`, `OrgWorkflowRuntimeRolloutSettings`, `OrgEmailSettings`, `VoiceAssistant`, `VoiceBudgetPolicy`, `TenantInsightPolicy`

**Tenant isolation:** Deleting an `organizations` row cascades to vehicles, customers, bookings, and most child data — correct for SaaS offboarding.

**Gap (P2):** No database-level enforcement that `bookings.organization_id` matches `customers.organization_id` or `vehicles.organization_id`. Cross-org booking rows are **prevented in application code** (`OrgScopingGuard`, service-layer checks) but not via composite FK or CHECK constraint.

**Safe migration (optional, complex):**

- **Not recommended** as immediate FK/CHECK — requires trigger or deferred constraint design.
- Prefer application validation + audit query (Section 8).

---

### 2.3 `vehicle_id`

**Coverage:** 109 models; 16 nullable (optional links, inbox rows, logs).

| Pattern | Assessment |
|---------|------------|
| FK `onDelete: Cascade` on child telemetry/health | Correct — vehicle is aggregate root |
| `VehicleLatestState.vehicleId` `@unique` | 1:1 enforced |
| `VehicleTrip` — `vehicleId` required, **no `organizationId`** | Scoped via `vehicle → organization` join |
| Composite indexes | `[vehicleId, recordedAt]`, `[vehicleId, status, startDate]` on bookings |
| `dimo_segment_id` `@unique` on `VehicleTrip` | Canonical DIMO segment binding |

**Models with `vehicleId` but no dedicated index** (9):  
`VehicleDrivingAssessmentQuality`, `BrakeServiceOutbox`, `VehicleLatestState` (has `@unique`), `VehicleRentalRequirementOverride`, `OrgInvoice`, `WhatsAppConversation`, `PartsSearchRequest`, `VehicleTripDetectionState`, `VehicleLogbookConfig`

**Note:** `VehicleLatestState` uses `@unique` on `vehicleId` — index equivalent present.

**Vehicle composite unique:**

```2933:2934:backend/prisma/schema.prisma
  @@unique([vin, organizationId])
  @@index([organizationId])
```

VIN uniqueness is **per organization** — correct multi-tenant pattern. No global VIN unique (same physical car could exist in different orgs as separate records).

**Safe migration candidates:** Add `CREATE INDEX CONCURRENTLY` on high-traffic tables missing `vehicle_id` index only after `pg_stat_user_tables` / slow-query evidence.

---

### 2.4 `booking_id`

**Core table `bookings`:**

```5613:5687:backend/prisma/schema.prisma
model Booking {
  id                      String                @id @default(uuid())
  organizationId          String                @map("organization_id")
  customerId              String                @map("customer_id")
  vehicleId               String                @map("vehicle_id")
  // ...
  organization            Organization @relation(..., onDelete: Cascade)
  customer                Customer     @relation(..., onDelete: Restrict)  -- implicit in PG
  vehicle                 Vehicle      @relation(..., onDelete: Restrict)
  @@index([organizationId])
  @@index([customerId])
  @@index([vehicleId])
  @@index([vehicleId, status, startDate])
}
```

**Init migration FK behavior:**

```sql
bookings_organization_id → organizations  ON DELETE CASCADE
bookings_customer_id     → customers       ON DELETE RESTRICT
bookings_vehicle_id      → vehicles        ON DELETE RESTRICT
```

| Aspect | Assessment |
|--------|------------|
| Cannot delete customer with active bookings | RESTRICT — good |
| Cannot delete vehicle with active bookings | RESTRICT — good |
| Org delete removes bookings | CASCADE — good |
| Unique per booking+driver | `@@unique([bookingId, customerId])` on `BookingAllowedDriver` | Good |
| Single bundle per booking | `bookingId @unique` on deposits, contracts, document bundles | Good |

**Child tables without `bookingId` index** (5): `BookingPriceSnapshot`, `Fine`, `DrivingEvidence`, `MisuseCaseEvidence`, `VoiceProviderWebhookEvent` — **P3** unless query plans show seq scans.

**No `@@unique` on booking number** — bookings identified by UUID only (acceptable).

---

### 2.5 `customer_id`

```5124:5210:backend/prisma/schema.prisma
model Customer {
  id                        String                     @id @default(uuid())
  organizationId            String                     @map("organization_id")
  email                     String?
  emailNormalized           String?                    @map("email_normalized")
  // ...
  organization              Organization @relation(..., onDelete: Cascade)
  @@index([organizationId])
  @@index([organizationId, emailNormalized])
  @@index([organizationId, phoneNormalized])
  @@index([organizationId, licenseNumberNormalized])
  // NO @@unique([organizationId, emailNormalized])
}
```

| Constraint | Present? |
|------------|----------|
| FK to `organizations` CASCADE | Yes |
| Index on `organization_id` | Yes |
| Composite index `(org, email_normalized)` | Yes — lookup, not uniqueness |
| **Unique email per org** | **No** — duplicate customers allowed |
| Archive support | `archivedAt` indexed |

**Assessment:** Duplicate customers per org are **allowed by schema** — may be intentional (family accounts, data quality). **Do not add unique** without product decision and duplicate merge plan.

**Safe migration:** None required unless product mandates dedup — then phased:

1. Audit duplicates via SQL (Section 8)
2. Merge/dedupe in application
3. `CREATE UNIQUE INDEX … WHERE archived_at IS NULL` (partial — safest)

---

## 3. Foreign keys and cascades

### 3.1 Cascade hierarchy (tenant delete)

```
organizations (root)
    ├── CASCADE → vehicles, customers, bookings, notifications, …
    │
vehicles
    ├── CASCADE → vehicle_latest_states, vehicle_trips, driving_events, …
    │
customers
    ├── RESTRICT ← bookings (cannot delete customer with bookings)
```

### 3.2 Restrict usage (financial / audit integrity)

Explicit `onDelete: Restrict` on sensitive paths:

- `BookingPaymentRequest` → booking, invoice, customer
- `PaymentTransaction` → organization, payment request
- `OrgInvoice` line items
- IAM access review, legal hold, DSAR
- Brake/tire evidence chains

**Assessment:** Correct — prevents accidental deletion of financial/audit records.

### 3.3 FK without explicit `onDelete` (defaults Restrict)

| Model | Relation |
|-------|----------|
| `OrganizationProduct` | → `Product` |
| `OrganizationIntegration` | → `Integration` |
| `Booking` | → `Customer`, `Vehicle` |
| `VehicleDataSourceLink` | → `HighMobilityVehicle` |

All map to PostgreSQL **RESTRICT** — safe default.

### 3.4 SetNull usage

`dimo_vehicle_id`, station FKs, optional user references — `ON DELETE SET NULL` preserves parent rows when reference is removed. **Correct** for deregister flow (vehicle deleted → dimo link cleared on mirror side via vehicle row deletion; mirror row remains).

---

## 4. Unique and composite keys

### 4.1 Tenant-scoped uniques (representative)

| Composite unique | Purpose |
|------------------|---------|
| `[vin, organizationId]` | Vehicle identity per tenant |
| `[organizationId, providerFingerprint]` | Driving event dedup |
| `[organizationId, idempotencyKey]` | Payment / job idempotency |
| `[bookingId, customerId]` | Allowed drivers |
| `[organizationId, systemKey]` | Data authorization |
| `[vehicleId, idempotencyKey]` | Battery/HV session dedup |

### 4.2 Partial uniques (SQL-only)

Prisma cannot express partial indexes; migrations add them:

| Table | Partial unique | Migration pattern |
|-------|----------------|---------------------|
| `notifications` | Active fingerprint per org + generation | Raw SQL in notification migrations |
| `vehicle_findings` | `(organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL` | Phase 2 integrity migration |

**Recommendation:** Continue partial uniques via raw SQL in migrations — proven pattern in this repo.

### 4.3 Global uniques (non-tenant)

| Table | Unique | Notes |
|-------|--------|-------|
| `dimo_vehicles` | `external_id`, `token_id` | Provider identity |
| `high_mobility_vehicles` | `[vin, packageType, sourceMode, isActive]` | HM clearance |
| `users` | `email` | Platform users |

---

## 5. Nullable fields — integrity implications

| Field | Nullable? | Risk | Recommendation |
|-------|-----------|------|----------------|
| `vehicles.dimo_vehicle_id` | Yes | Unlinked fleet vehicles | OK |
| `DrivingEvent.organizationId` | Yes | Legacy rows; unique uses org when set | Backfill from `vehicle.organizationId`, then consider NOT NULL |
| `VehicleDamage.organizationId` | Yes | Tenant scope ambiguity | Backfill + NOT NULL (phased) |
| `VehicleDocumentExtraction.organizationId` | Yes | Archive queries | Backfill in progress per module |
| `HighMobilityVehicle.organizationId` | Yes | Master-admin global HM records | By design |
| `Booking.assignedDriverId` | Yes | Optional secondary driver | OK |
| `Customer.email` | Yes | Walk-in customers | OK |

**Safe backfill pattern (template):**

```sql
-- Phase A: backfill (idempotent)
UPDATE driving_events de
SET organization_id = v.organization_id
FROM vehicles v
WHERE de.vehicle_id = v.id
  AND de.organization_id IS NULL;

-- Phase B: verify zero nulls
-- Phase C: ALTER COLUMN SET NOT NULL (separate migration, deploy lock brief)
```

**Do not** run Phase C without Phase A completion audit.

---

## 6. Index coverage

### 6.1 Well-indexed hot paths

| Query pattern | Index |
|---------------|-------|
| Fleet by org | `vehicles(organization_id)` |
| Bookings by vehicle + status | `bookings(vehicle_id, status, start_date)` |
| Trips by vehicle + time | `vehicle_trips(vehicle_id, start_time)` CONCURRENTLY |
| Driving events timeline | `driving_events(vehicle_id, recorded_at)` |
| Customer search | `(organization_id, email_normalized)` etc. |
| Notifications inbox | `(organization_id, status, …)` |

### 6.2 Confirmed gaps

| Column | Table | Gap | Safe fix |
|--------|-------|-----|----------|
| `dimo_vehicle_id` | `vehicles` | No index | `CREATE INDEX CONCURRENTLY` (partial) |
| `dimo_vehicle_id` | `vehicles` | No unique | Partial unique after duplicate audit |
| `organization_id` | 14 config tables | No index | Low priority `CONCURRENTLY` |
| `booking_id` | 5 child tables | No index | Add if EXPLAIN shows need |

### 6.3 Prisma vs PostgreSQL

Some indexes exist only in migration SQL (partial uniques, CONCURRENTLY-created). **Prisma schema is not exhaustive** — always check `prisma/migrations/` for production truth.

---

## 7. Cross-entity consistency (no DB enforcement)

These invariants are **application-enforced only**:

| Invariant | Enforced by | DB constraint |
|-----------|-------------|---------------|
| `booking.organization_id = customer.organization_id` | Service layer | **None** |
| `booking.organization_id = vehicle.organization_id` | Service layer | **None** |
| `booking_allowed_driver.customer ∈ booking.org` | Service + FK to customer | Partial (customer FK only) |
| One DIMO token → one active vehicle | **None** | **None** |
| `driving_event.organization_id = vehicle.organization_id` | Writers should set both | **None** |

**Safe approach:** Audit queries (Section 8) in CI/ops — not immediate CHECK constraints (high risk on legacy data).

---

## 8. Operator audit queries (read-only)

```sql
-- D1: Duplicate dimo_vehicle_id bindings (blocks partial unique migration)
SELECT dimo_vehicle_id, COUNT(*) AS cnt,
       array_agg(id) AS vehicle_ids,
       array_agg(organization_id) AS org_ids
FROM vehicles
WHERE dimo_vehicle_id IS NOT NULL
GROUP BY dimo_vehicle_id
HAVING COUNT(*) > 1;

-- Cross-org booking integrity
SELECT b.id, b.organization_id AS booking_org,
       c.organization_id AS customer_org,
       v.organization_id AS vehicle_org
FROM bookings b
JOIN customers c ON c.id = b.customer_id
JOIN vehicles v ON v.id = b.vehicle_id
WHERE b.organization_id != c.organization_id
   OR b.organization_id != v.organization_id;

-- Driving events with org mismatch
SELECT de.id, de.organization_id AS event_org, v.organization_id AS vehicle_org
FROM driving_events de
JOIN vehicles v ON v.id = de.vehicle_id
WHERE de.organization_id IS NOT NULL
  AND de.organization_id != v.organization_id;

-- Driving events missing organization_id
SELECT COUNT(*) FROM driving_events WHERE organization_id IS NULL;

-- Duplicate customers per org (same normalized email)
SELECT organization_id, email_normalized, COUNT(*) AS cnt
FROM customers
WHERE email_normalized IS NOT NULL AND archived_at IS NULL
GROUP BY organization_id, email_normalized
HAVING COUNT(*) > 1;

-- Orphan FK check: bookings referencing deleted-scoped entities (should return 0)
SELECT b.id FROM bookings b
LEFT JOIN customers c ON c.id = b.customer_id
WHERE c.id IS NULL;
```

---

## 9. Safe migration recommendations (prioritized)

### P1 — DIMO binding integrity (from 2E.2)

| Step | Migration | Destructive? | Prerequisite |
|------|-----------|--------------|--------------|
| 1 | Audit query D1 | No | — |
| 2 | Resolve duplicates (app/admin) | No* | D1 = 0 rows |
| 3 | `CREATE UNIQUE INDEX CONCURRENTLY … ON vehicles(dimo_vehicle_id) WHERE …` | No | D1 = 0 rows |
| 4 | `CREATE INDEX CONCURRENTLY … ON vehicles(dimo_vehicle_id) WHERE …` | No | Always safe |

\*Resolving duplicates may require deregistering one vehicle — business operation, not DDL.

### P2 — Index additions (online, reversible)

| Target | SQL pattern |
|--------|-------------|
| `vehicles(dimo_vehicle_id)` | Partial btree index |
| Low-traffic `organization_id` on config tables | `CREATE INDEX CONCURRENTLY IF NOT EXISTS` |
| Child `booking_id` columns | Only after query profiling |

### P2 — Data backfills (DML, not DDL)

| Target | Action |
|--------|--------|
| `driving_events.organization_id` | Backfill from `vehicles` |
| `vehicle_damages.organization_id` | Backfill from `vehicles` |
| Then separate migration | `SET NOT NULL` after zero-null verify |

### P3 — Do not migrate without product sign-off

| Proposal | Why deferred |
|----------|--------------|
| `UNIQUE(organization_id, email_normalized)` on customers | Duplicate customers may be valid |
| CHECK constraint on booking org consistency | Complex; legacy rows may violate |
| `DROP` nullable columns | Destructive |
| `MERGE` duplicate dimo rows in `dimo_vehicles` | Provider data loss risk |
| Table rewrites / PK changes | Out of scope |

---

## 10. Migration authoring checklist

For all recommended migrations:

1. **Additive only** — `CREATE INDEX`, `ADD COLUMN NULL`, new constraints with `NOT VALID` + `VALIDATE CONSTRAINT` if needed.
2. **Use `CONCURRENTLY`** for indexes on large tables (`vehicles`, `bookings`, `driving_events`, `vehicle_trips`).
3. **Pre-flight SQL** in ops runbook — block DDL if audit queries return rows.
4. **Rollback script** — `DROP INDEX CONCURRENTLY` only.
5. **Prisma sync** — add `@@index` / `@@unique` to schema after SQL migration lands (map name for partial uniques).
6. **No `infra:up` on prod** — apply via `prisma migrate deploy` on VPS release pipeline.
7. **Backup** — standard `vps-deploy-release.sh` pre-migrate DB backup.

### Example safe migration file structure

```
prisma/migrations/YYYYMMDDHHMMSS_dimo_vehicle_id_integrity/
  migration.sql
```

```sql
-- Safe: index always
CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicles_dimo_vehicle_id_idx"
  ON "vehicles" ("dimo_vehicle_id")
  WHERE "dimo_vehicle_id" IS NOT NULL;

-- Conditional: run only after ops confirms 0 duplicate dimo_vehicle_id
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "vehicles_dimo_vehicle_id_unique"
--   ON "vehicles" ("dimo_vehicle_id")
--   WHERE "dimo_vehicle_id" IS NOT NULL;
```

---

## 11. Risk register

| ID | Severity | Finding | Safe remediation |
|----|----------|---------|------------------|
| **DB1** | **P1** | No UNIQUE on `vehicles.dimo_vehicle_id` | Partial unique index after audit |
| **DB2** | **P1** | No INDEX on `vehicles.dimo_vehicle_id` | `CREATE INDEX CONCURRENTLY` |
| **DB3** | P2 | No DB booking org ↔ customer/vehicle consistency | Audit query; app-layer guard |
| **DB4** | P2 | `DrivingEvent.organizationId` nullable | Backfill + phased NOT NULL |
| **DB5** | P2 | 14 config tables missing `organization_id` index | Optional CONCURRENTLY indexes |
| **DB6** | P2 | No unique customer email per org | Product decision required |
| **DB7** | P3 | 5 child tables missing `booking_id` index | Profile first |
| **DB8** | P3 | `VehicleTrip` has no direct `organization_id` | By design (via vehicle) |

---

## 12. Verdict

| Question | Answer |
|----------|--------|
| Is the schema production-ready? | **Yes** — with known `dimo_vehicle_id` gap |
| Are tenant roots (`organization_id`) sound? | **Yes** — cascade + widespread indexing |
| Are FK cascades safe? | **Yes** — financial paths use Restrict |
| Any destructive migration needed? | **No** — all fixes are additive |
| Top priority safe migration? | Partial UNIQUE + INDEX on `vehicles.dimo_vehicle_id` |

**Phase 2E.3 status:** Analysis complete. Implement migrations in **Phase 2E.4** (or combined DIMO integrity remediation) using Section 9 checklist.

---

## 13. References

| Artifact | Relevance |
|----------|-----------|
| `backend/prisma/schema.prisma` | Source of truth for models |
| `backend/prisma/migrations/` | Production index/constraint truth |
| `20260311224040_init/migration.sql` | Core FK definitions |
| `20260413230000_add_composite_indexes_batch_c` | CONCURRENTLY pattern |
| Phase 2E.2 `dimo-vehicle-integrity.md` | DIMO binding business context |

---

*Generated by Master Admin Remediation Phase 2E.3. No migrations applied.*
