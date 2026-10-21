# VehicleDataSourceLink `source_reference_id` FK Forensic Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-data-source-link-source-reference-fk-forensic-2026-08` |
| **Mode** | Production read-only forensic |
| **Production modified** | **No** |
| **Investigation time (UTC)** | `2026-08-25T17:00Z` |
| **Related** | PR #1281 (`79bb49a0`), failed apply audit (`b192aa68`) |
| **PR #1277** | **HOLD** (unchanged) |

---

## A. Failure summary

Controlled Production backfill (`runId=dimo-link-backfill-prod-2026-08-25-79bb49a`) failed on the **first planned `CREATE`** with:

| Field | Value |
|-------|-------|
| **Error code** | Prisma `P2003` / PostgreSQL `23503` |
| **Constraint** | `vehicle_data_source_links_source_reference_id_fkey` |
| **Table** | `vehicle_data_source_links` |
| **Column** | `source_reference_id` |
| **Referenced table** | `high_mobility_vehicles` |
| **Referenced column** | `id` |
| **Failed value shape** | UUID string (`DimoVehicle.id` / `Vehicle.dimoVehicleId`) |
| **Occurrence** | First row in apply loop (HMÜ C 215 ordering by license plate in backfill plan) |
| **Transaction** | Per-row autocommit; failed `INSERT` rolled back; loop aborted |

Application attempted:

```
sourceReferenceId = DimoVehicle.id  (internal SynqDrive UUID)
```

Database requires:

```
source_reference_id ∈ high_mobility_vehicles.id
```

---

## B. Exact Production DB constraint

From live `pg_constraint` / `information_schema` (2026-08-25):

| Property | Value |
|----------|-------|
| **Constraint name** | `vehicle_data_source_links_source_reference_id_fkey` |
| **Type** | `FOREIGN KEY` |
| **Local table** | `vehicle_data_source_links` |
| **Local column** | `source_reference_id` (`TEXT NOT NULL`) |
| **Referenced schema** | `public` |
| **Referenced table** | `high_mobility_vehicles` |
| **Referenced column** | `id` |
| **ON UPDATE** | `CASCADE` |
| **ON DELETE** | `RESTRICT` |
| **Deferrable** | No |

### All constraints on `vehicle_data_source_links`

| Constraint | Definition |
|------------|------------|
| `vehicle_data_source_links_pkey` | `PRIMARY KEY (id)` |
| `vehicle_data_source_links_vehicle_id_fkey` | `FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE` |
| `vehicle_data_source_links_source_reference_id_fkey` | `FOREIGN KEY (source_reference_id) REFERENCES high_mobility_vehicles(id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| `vehicle_data_source_links_vehicle_id_source_type_source_sub_key` | `UNIQUE (vehicle_id, source_type, source_subtype, is_active)` |

### Indexes (relevant)

- `vehicle_data_source_links_source_reference_id_idx`
- `vdsl_provider_idx`, `vdsl_consent_id_idx`

No CHECK constraints on `provider` vs `source_reference_id` target.

---

## C. Prisma schema vs live database

### Prisma declares the same FK?

**YES** — `backend/prisma/schema.prisma`:

```prisma
model VehicleDataSourceLink {
  sourceReferenceId String @map("source_reference_id")
  hmVehicle HighMobilityVehicle? @relation(fields: [sourceReferenceId], references: [id])
}
```

There is **no** `DimoVehicle` relation on `VehicleDataSourceLink`.

### Schema drift?

**YES — migration SQL vs Prisma model vs generalized comments**

| Layer | `source_reference_id` semantics |
|-------|--------------------------------|
| **Initial migration SQL** (`20260408120000`) | Plain `TEXT NOT NULL` + index only — **no FK in committed SQL** |
| **Prisma model (day 1)** | FK to `high_mobility_vehicles.id` via `hmVehicle` relation |
| **Production DB (live)** | FK to `high_mobility_vehicles.id` **present** |
| **Audit migration** (`20260412040000`) | Adds `provider` column; comment says "canonical provider binding" but **does not add Dimo FK or relax HM FK** |
| **PR #1281 application** | Writes `DimoVehicle.id` into `source_reference_id` |

The HM-only FK exists in Production and Prisma but is **absent from all committed `migration.sql` files** that create or alter `vehicle_data_source_links`. It was likely applied by Prisma migrate from the schema relation without a tracked migration artifact, or via manual DDL — **tracked migrations are incomplete relative to live DB + Prisma**.

---

## D. Migration history timeline

| When | Migration / artifact | Change | Rationale (from comments) |
|------|---------------------|--------|---------------------------|
| 2026-04-08 | `20260408120000_high_mobility_phase1` | Creates `vehicle_data_source_links` with `source_reference_id TEXT NOT NULL`, unique active index, ref index | HM Phase 1 integration |
| 2026-04-08 | Same | **No FK** on `source_reference_id` in SQL | — |
| 2026-04-12 | `20260412030000_platform_hardening_phase1` | Adds `vehicle_id → vehicles(id)` FK | Platform hardening |
| 2026-04-12 | `20260412040000_audit_consent_provenance` | Adds `provider`, `consent_id`, `linked_by_user_id`, `last_verified_at` | "Canonical provider binding structure for all external data sources" |
| Day 1 (git) | `schema.prisma` initial commit | `hmVehicle` relation on `sourceReferenceId` | "Supports HIGH_MOBILITY now, extendable for future sources" |
| 2026-08-25 | PR #1281 | Application writes `DimoVehicle.id` to `source_reference_id` | Internal canonical DIMO identity |
| 2026-08-25 | Production apply | **P2003** — first DIMO insert blocked | — |

---

## E. Original domain semantics

From initial schema comment and HM implementation:

> "Extensible vehicle data source link table. Supports HIGH_MOBILITY now, extendable for future sources."

**Original meaning of `sourceReferenceId`:** **(A) ID of one specific relational source table** — `high_mobility_vehicles.id`.

| Field | Original HM meaning |
|-------|---------------------|
| `sourceType` | `'HIGH_MOBILITY'` |
| `sourceSubtype` | `'HM_HEALTH'` or `'HM_FULL_TELEMETRY'` |
| `sourceReferenceId` | `HighMobilityVehicle.id` (UUID) |

The 2026-04-12 audit migration **generalized the product intent in comments** (`provider` column, "canonical provider binding") but **did not generalize the database referential model**.

---

## F. High Mobility reference implementation

### Write paths

| Path | sourceType | sourceSubtype | sourceReferenceId |
|------|------------|---------------|-------------------|
| `HighMobilityVehicleLinkService.activateHealthLink()` | `HIGH_MOBILITY` | `HM_HEALTH` | `hmVehicleId` |
| `HighMobilityVehicleLinkService.linkFullTelemetry()` | `HIGH_MOBILITY` | `HM_FULL_TELEMETRY` | `hmVehicleId` |
| `HighMobilityRegistrationService` (HM-only vehicle) | `HIGH_MOBILITY` | (package-specific) | `hmVehicleId` |

### Does HM rely on the FK?

**YES** — Prisma creates links with `sourceReferenceId: hmVehicleId` inside `$transaction` with HM record update. The FK guarantees referential integrity to `high_mobility_vehicles`.

### Production HM row (sample)

| provider | sourceType | sourceSubtype | ref resolves to HM |
|----------|------------|---------------|-------------------|
| `UNKNOWN`* | `HIGH_MOBILITY` | `HM_HEALTH` | `hm_resolves` |

\*`provider` column defaulted to `UNKNOWN` for legacy row predating provider column backfill.

---

## G. Provider usage matrix

| Provider | sourceType | sourceSubtype | sourceReferenceId meaning | Referenced entity | FK-compatible today? | Production rows |
|----------|------------|---------------|----------------------------|-------------------|---------------------|-----------------|
| **HIGH_MOBILITY** | `HIGH_MOBILITY` | `HM_HEALTH` / `HM_FULL_TELEMETRY` | `HighMobilityVehicle.id` | `high_mobility_vehicles` | **YES** | 1 active |
| **DIMO** (PR #1281 intent) | `DIMO` | `null` | `DimoVehicle.id` | `dimo_vehicles` | **NO** | 0 |
| **MANUAL** | (varies) | (varies) | Undefined in repo | — | **NO** unless HM id | 0 |

### Runtime reads

`assembleProviderLinkEvidence()` uses `dataSourceLinks` for **`hasActiveMapping`** (active DIMO link count) — it does **not** resolve `sourceReferenceId` to DIMO or HM tables for connectivity. Mapping identity is **row existence**, not FK target.

`ProviderLinkStateBuilder` gates `ACTIVE` on `hasActiveMapping` + consent + token + authorization.

---

## H. Is the table truly polymorphic?

**PARTIALLY**

| Dimension | Polymorphic? | Evidence |
|-----------|--------------|----------|
| `sourceType` / `sourceSubtype` / `provider` | Yes — multiple providers in schema comments and code paths | Audit migration, PR #1281 |
| `source_reference_id` at DB layer | **No** — hard FK to `high_mobility_vehicles` only | Live Production FK |
| Application layer (#1281) | Treats as polymorphic | `DimoVehicle.id` for DIMO |

**Classification: schema-contract contradiction** — polymorphic provider binding intent vs HM-only FK.

---

## I. Production row population (read-only)

| provider | sourceType | sourceSubtype | isActive | count |
|----------|------------|---------------|----------|-------|
| `UNKNOWN` | `HIGH_MOBILITY` | `HM_HEALTH` | true | 1 |

| Metric | Count |
|--------|-------|
| Total DIMO links | 0 |
| Active DIMO links | 0 |
| `metadata.provenance=backfill` | 0 |
| `metadata.runId=dimo-link-backfill-prod-2026-08-25-79bb49a` | 0 |

DIMO vehicles in pilot org: **6** — all without links.

---

## J. Partial write analysis

| Checkpoint | Count |
|------------|-------|
| Before apply baseline | 0 active DIMO links |
| After failed apply | 0 active DIMO links |
| Rows with attempted runId | 0 |
| Partial writes | **0** |

**Classification: `ZERO_WRITES`**

Failed `INSERT` did not commit. No rollback procedure required.

---

## K. Transaction semantics of failed apply

`runBackfill()` loops vehicles **without** wrapping the full run in `$transaction`. Each `ensureDimoVehicleDataSourceLink()` → `vehicleDataSourceLink.create()` uses default Prisma autocommit unless caller passes transaction client.

Backfill apply used root `PrismaService` (not `$transaction`), so:

- Each successful CREATE would commit independently
- First failed CREATE rolled back that statement only
- Loop threw; no subsequent vehicles processed

This is why result is **zero writes**, not partial 1-of-6.

---

## L. #1281 `sourceReferenceId` contract assessment

**Primary classification: `CORRECT_BUT_SCHEMA_BLOCKED`**

| Criterion | Assessment |
|-----------|------------|
| Domain logic | `DimoVehicle.id` is correct internal canonical identity (tenant-scoped via `Vehicle.dimoVehicleId`, stable UUID) |
| Tenant safety | Service validates `vehicle.dimoVehicleId === dimoVehicleId` before write |
| Idempotency | Deterministic upsert key independent of FK |
| DB schema | **Blocked** — FK requires HM id |
| Original table design | Never migrated from HM-only FK to multi-provider FK model |

Using `consentId` as `sourceReferenceId` would be **wrong** — consent is permission authority, not mapping authority (see Section N).

---

## M. Candidate identity alternatives (read-only evaluation)

| Candidate | Uniqueness | Tenant safety | Lifecycle | FK fit | Verdict |
|-----------|------------|---------------|-----------|--------|---------|
| **A: `DimoVehicle.id`** | Strong | Strong (via Vehicle binding) | Stable | Needs `dimo_vehicles` FK | **Best logical identity** |
| **B: External DIMO ID** | Provider-scoped | Weaker (external churn) | Token/external changes | Wrong table | Rejected |
| **C: Consent ID** | Per grant event | N/A | Revocation ≠ unlink | Wrong semantics | **Rejected** |
| **D: Binding/integration ID** | N/A — no such entity | — | — | — | Not available |
| **E: Provider-neutral source entity** | Strong | Strong | Clean | New table + migration | Valid long-term |
| **F: Separate nullable FK columns** | Strong per provider | Strong | Clean | Native PG FKs | **Best schema fit** |

---

## N. Consent vs mapping authority

| Role | Authority | Evidence |
|------|-----------|----------|
| `VehicleProviderConsent` | **Permission** (grant/revoke) | Consent ledger migration, `ProviderLinkStateBuilder` consent dimension |
| `VehicleDataSourceLink` | **Mapping** (which provider record binds to vehicle) | HM link service, PR #1281, `hasActiveMapping` |
| `OrgDataAuthorization` | **Org-level permission** | Separate from per-vehicle mapping |

Consent is **not** mapping authority. `consentId` on link row is provenance/reference only.

---

## O. Recommended architecture

**OPTION C — Provider-specific reference columns (expand-and-contract variant)**

### Why not blind FK drop (OPTION A alone)?

Dropping the HM FK without replacement loses DB-level orphan protection for HM links. Acceptable only with strong service guarantees; HM regression risk rises to MEDIUM.

### Recommended shape

1. **Add** nullable `dimo_vehicle_id UUID REFERENCES dimo_vehicles(id) ON DELETE RESTRICT`
2. **Add** nullable `hm_vehicle_id UUID REFERENCES high_mobility_vehicles(id) ON DELETE RESTRICT` (or rename/migrate from `source_reference_id` for HM rows)
3. **Drop** `vehicle_data_source_links_source_reference_id_fkey` (HM-only polymorphic pretense)
4. **Retain** `source_reference_id` as denormalized logical key during transition (HM: hm id, DIMO: dimo id) OR deprecate after migration
5. **Add** CHECK constraint:

```sql
(provider = 'DIMO' AND dimo_vehicle_id IS NOT NULL AND hm_vehicle_id IS NULL)
OR (provider = 'HIGH_MOBILITY' AND hm_vehicle_id IS NOT NULL AND dimo_vehicle_id IS NULL)
```

6. **Enforce** tenant safety in service (already present) + FK to provider tables

### Why safest

- Preserves HM referential integrity via `hm_vehicle_id` FK
- Enables DIMO referential integrity via `dimo_vehicle_id` FK
- Eliminates polymorphic FK contradiction
- Minimal change to runtime reads (`hasActiveMapping` unchanged)
- Expand-and-contract compatible

**HM regression risk: LOW** (with proper HM column migration)

---

## P. Migration plan (design only — do not execute)

| Phase | Action |
|-------|--------|
| **1 — Additive schema** | Add `dimo_vehicle_id`, `hm_vehicle_id` nullable FKs; no drops |
| **2 — App compatibility** | Dual-write: populate provider-specific columns + keep `source_reference_id` |
| **3 — Backfill data** | `UPDATE` existing HM row: `hm_vehicle_id = source_reference_id`; DIMO backfill uses `dimo_vehicle_id` |
| **4 — Tighten** | Add CHECK constraint; drop `source_reference_id_fkey`; optional NOT NULL per provider |
| **5 — Cleanup** | Deprecate redundant `source_reference_id` if desired (optional) |

Zero-downtime: Phases 1–2 deploy before Phase 3 Production apply.

---

## Q. Rollback plan (design only)

| Scenario | Action |
|----------|--------|
| Schema migration rollback | Reverse migration drops new columns only if no DIMO rows exist |
| Failed DIMO backfill | Deactivate by `metadata.runId` (unchanged from PR #1281) |
| HM rows | Never delete; `hm_vehicle_id` preserves integrity |
| App rollback | Revert #1281 registration hook if schema not yet migrated (restores pre-P0 onboarding) |

---

## R. Current Production risk

| Risk | Severity | Status |
|------|----------|--------|
| Existing 6 DIMO vehicles without links | P1 operational | Unchanged — `providerLinkState UNKNOWN` |
| **New DIMO vehicle registration** | **P0** | **BROKEN since #1281 deploy** — `registerFromDimo()` calls `ensureDimoVehicleDataSourceLinkOrThrow()` inside `$transaction`; FK failure rolls back entire registration |
| HM links | None | 1 row unaffected |
| Telemetry ingestion | None | Independent of link table |
| Backfill | Blocked | Known |

### Blast radius

- **Affected:** Any new `registerFromDimo()` call in Production after `79bb49a0` deploy
- **Unaffected:** Existing vehicles, telemetry, HM path, consent records

---

## S. Temporary operational mitigation (describe only — not executed)

**YES — mitigation needed for new DIMO onboarding**

Options (require explicit approval):

1. **Emergency schema migration** (preferred) — deploy Phase 1 additive columns + drop HM-only FK before further registrations
2. **Temporary app revert** — remove `ensureDimoVehicleDataSourceLinkOrThrow` from registration transaction until schema fixed (restores registration but leaves link gap)
3. **Freeze new DIMO vehicle registrations** operationally until schema migration deployed

---

## T. Reference vehicles — unchanged after failed apply

| Vehicle | Active DIMO link | providerLinkState | operationalAvailability |
|---------|------------------|-------------------|-------------------------|
| HMÜ C 215 | No | UNKNOWN | UNKNOWN |
| WOB L 7503 | No | UNKNOWN | NEEDS_VERIFICATION |
| WOB L 9755 | No | UNKNOWN | NEEDS_VERIFICATION |
| KS MS 661 | No | UNKNOWN | UNKNOWN |

---

## U. Gates (unchanged)

| Gate | Status |
|------|--------|
| PR #1277 | **HOLD** |
| Production Connectivity Processing Gate | **CONDITIONAL** |
| DIMO backfill | **BLOCKED** |

---

## V. Next implementation gate

1. Design + review Prisma migration (OPTION C)
2. Add Postgres integration test: DIMO link INSERT must succeed against real schema
3. Deploy schema migration to Production
4. Re-run Pre-Apply Gate (dry-run + shadow)
5. Re-attempt controlled backfill apply
6. Only then re-evaluate PR #1277 upstream blocker

**Do NOT retry `--apply` until schema migration is deployed.**

---

## W. Schema Fix Implementation Design (2026-08-25)

**Branch:** `fix/dimo-provider-link-provider-specific-fk-2026-08`  
**Status:** Implemented (pending Production migration deploy)

### Final schema shape

| Column | DIMO | HIGH_MOBILITY (canonical) | HIGH_MOBILITY (legacy) |
|--------|------|---------------------------|------------------------|
| `provider` | `DIMO` | `HIGH_MOBILITY` | `UNKNOWN` |
| `source_type` | `DIMO` | `HIGH_MOBILITY` | `HIGH_MOBILITY` |
| `dimo_vehicle_id` | `DimoVehicle.id` (NOT NULL) | `NULL` | `NULL` |
| `source_reference_id` | `NULL` | `HighMobilityVehicle.id` (NOT NULL) | `HighMobilityVehicle.id` (NOT NULL) |

### Hardened CHECK constraint (final)

```sql
CHECK (
  (provider = 'DIMO' AND source_type = 'DIMO'
   AND dimo_vehicle_id IS NOT NULL AND source_reference_id IS NULL)
  OR
  (provider = 'HIGH_MOBILITY' AND source_type = 'HIGH_MOBILITY'
   AND dimo_vehicle_id IS NULL AND source_reference_id IS NOT NULL)
  OR
  (provider = 'UNKNOWN' AND source_type = 'HIGH_MOBILITY'
   AND dimo_vehicle_id IS NULL AND source_reference_id IS NOT NULL)
)
```

**Previous issue:** `provider <> 'DIMO'` branch treated all non-DIMO rows as HM semantics.

**Unsupported/future providers:** Rejected at DB layer — must add explicit CHECK branch + dedicated FK before use.

### HM writer audit (runtime, no Production mutation)

| Writer | `sourceType` | `sourceSubtype` | `provider` set? | `sourceReferenceId` | `dimoVehicleId` |
|--------|--------------|-----------------|-----------------|----------------------|-----------------|
| `HighMobilityVehicleLinkService.activateHealthLink` | `HIGH_MOBILITY` | `HM_HEALTH` | **No** (defaults `UNKNOWN`) | `hmVehicleId` | `null` |
| `HighMobilityVehicleLinkService.linkFullTelemetry` | `HIGH_MOBILITY` | `HM_FULL_TELEMETRY` | **No** | `hmVehicleId` | `null` |
| `HighMobilityRegistrationService` | `HIGH_MOBILITY` | `HM_ONLY` | **No** | `hmVehicleId` | `null` |

New HM writes produce **legacy HM combination** (`UNKNOWN` + `HIGH_MOBILITY`) — accepted by CHECK. Production legacy row unchanged.

Forward canonical HM (`provider=HIGH_MOBILITY`) is supported by CHECK but not yet emitted by writers (deferred).

### Production legacy HM row verification (read-only)

Known Production row: `provider=UNKNOWN`, `sourceType=HIGH_MOBILITY`, `sourceReferenceId≠null`, `dimoVehicleId=null`.

Predicate evaluation: **PASS** (legacy HM branch).

### registerFromDimo coverage

- `vehicles.service.register-from-dimo.spec.ts` — real `VehiclesService.registerFromDimo()` success + transactional rollback
- CHECK matrix C1–C10 — `vehicle-data-source-link-provider-reference.check.spec.ts`

### Future third-provider path

1. Add provider-specific FK column or neutral binding entity
2. Extend CHECK with explicit `(provider, source_type)` branch
3. Add writer + evidence reader support
4. Do **not** rely on catch-all non-DIMO semantics

### FK semantics

| FK | ON DELETE | Rationale |
|----|-----------|-----------|
| `dimo_vehicle_id → dimo_vehicles(id)` | RESTRICT | Prevent orphan active bindings; preserve audit history |
| `source_reference_id → high_mobility_vehicles(id)` | RESTRICT (unchanged) | HM integrity preserved |

### Invariant enforcement

**BOTH** — DB CHECK constraint + service-layer tenant verification (`Vehicle.dimoVehicleId` binding match, cross-tenant active link scan).

### Application path changes

- `DimoVehicleDataSourceLinkService.ensureDimoVehicleDataSourceLink()` — CREATE/NOOP/CONFLICT on `dimoVehicleId`
- `registerFromDimo()` — unchanged call site; link INSERT uses `dimoVehicleId` + `sourceReferenceId: null`
- `assembleProviderLinkEvidence()` — `hasActiveMapping` requires `provider=DIMO` AND `dimoVehicleId != null`
- Backfill/drift planners — `candidateDimoVehicleId` replaces `candidateSourceReferenceId`

### Rollout plan

| Phase | Action |
|-------|--------|
| 1 | Deploy additive migration to Production |
| 2 | Deploy application (#1281 + this fix) |
| 3 | Re-run Pre-Apply Gate dry-run + shadow |
| 4 | Controlled backfill `--apply` |
| 5 | Optional: deprecate `sourceReferenceId` for DIMO documentation cleanup |

### Rollback

- **App rollback:** Old code ignores `dimo_vehicle_id`; DIMO writes would fail again if reverted without schema
- **DB rollback:** Drop `dimo_vehicle_id` column only when zero DIMO link rows depend on it
- **HM rows:** Unaffected — CHECK allows existing HM `source_reference_id` values

### Production migration compatibility (read-only analysis)

| Check | Result |
|-------|--------|
| Existing 1 HM row | Compatible — CHECK passes (`provider != DIMO`) |
| Zero DIMO rows | Compatible — no data rewrite required |
| Column name collision | None — `dimo_vehicle_id` new |
| FK name collision | None — `vehicle_data_source_links_dimo_vehicle_id_fkey` |
| Partial unique index | Safe — no active DIMO rows today |

**Expected migration safety: PASS**

---

## X. Production Schema Deployment Verification (2026-08-25)

**Mode:** Normal VPS deploy + approved additive migration — **no backfill `--apply`**

### A. Deployed SHA

| Field | Value |
|-------|-------|
| `main` SHA | `1636d35286124b5a9b4d7f0b2a31a57372cd859b` |
| PR #1290 merge | **YES** (`fix(dimo): add provider-specific FK for DIMO vehicle links`) |
| PR #1281 included | **YES** (ancestor on `main`) |
| PR #1277 | **NOT included** (HOLD) |
| Commits after #1290 on `main` | **None** (HEAD is #1290 merge) |
| Production release | `20260825182836_v4994` |
| Deploy method | `bash .cursor/scripts/cloud-agent-deploy.sh` → `vps-deploy-release.sh` |

### B. Backup

| Field | Value |
|-------|-------|
| Identifier | `/opt/synqdrive/shared/backups/db-pre-deploy-20260825182836.sql.gz` |
| Timestamp | 2026-08-25 18:28 UTC |
| Status | **SUCCESS** |
| Restore reference | `vps-deploy-release.sh` pre-deploy `pg_dump`; prior release `20260825174150_v4994` available |

### C. Migration result

| Field | Value |
|-------|-------|
| Migration | `20260825180000_dimo_provider_link_dimo_vehicle_fk` |
| Result | **PASS** (applied 2026-08-25 18:29:50 UTC) |
| Prisma migrate deploy | **PASS** (deploy script) |

### D. Real Production DDL (pg_catalog)

| Check | Result |
|-------|--------|
| `source_reference_id` nullable | **YES** |
| HM FK preserved | **YES** → `high_mobility_vehicles(id)` `ON DELETE RESTRICT` `ON UPDATE CASCADE` |
| `dimo_vehicle_id` exists | **YES** (TEXT, nullable) |
| DIMO FK | `dimo_vehicles(id)` `ON DELETE RESTRICT` `ON UPDATE CASCADE` |
| CHECK `vehicle_data_source_links_provider_reference_check` | **PASS** (3 explicit branches) |
| Partial unique `uq_vdsl_active_dimo_vehicle` | **PASS** |

### E–G. Legacy compatibility

| Check | Result |
|-------|--------|
| Legacy HM row unchanged | **YES** — `UNKNOWN` / `HIGH_MOBILITY` / `HM_HEALTH`, `source_reference_id` set, `dimo_vehicle_id` NULL |
| CHECK compat (all rows) | 1 total, 1 compatible, 0 incompatible |
| Failed apply residue | **0** (`provenance=backfill`, failed runId) |

### H–K. Post-migration counts / health

| Check | Result |
|-------|-------|
| DIMO links before migration | **0** |
| DIMO links after migration/deploy | **0** |
| Automatic link creation | **NO** |
| API `/api/v1/health` | **ok** |
| PM2 `synqdrive` | **online** (stable post-restart) |
| Redis | **PONG** |
| BullMQ | queues present; no abnormal backlog observed |
| Boot check / DI graph | **PASS** |

### L–N. Backfill dry-runs (NO `--apply`, org `faa710c9-6d91-4079-a7d5-91fdccdec14a`)

| | Dry-run #1 | Dry-run #2 |
|---|------------|------------|
| scanned | 6 | 6 |
| CREATE | 6 | 6 |
| NOOP | 0 | 0 |
| REACTIVATE | 0 | 0 |
| CONFLICT | 0 | 0 |
| SKIP | 0 | 0 |
| applied | 0 | 0 |

**Deterministic:** **YES** (plan hash `5cd0a4bfc6bf085f65ee357948718383940aadcdccb7f7cf46965c69a1cc9cf1`)

**Mutation plan shape (via `planBackfillForOrganization`):** all 6 CREATE rows use `candidateDimoVehicleId = Vehicle.dimoVehicleId`; `candidateSourceReferenceId` unset (NULL). **No plan places DimoVehicle.id into `sourceReferenceId`.**

**Note:** Built-in `--shadow` enrichment in `backfill-dimo-vehicle-data-source-links.ts` does not yet populate `dimoVehicleId` on simulated shadow links (post-#1290 evidence contract). Corrected shadow analysis (manual, with `dimoVehicleId` on simulated link) used for gate O–Q below.

### O–Q. Reference vehicle shadow (corrected provider-specific simulation)

| Vehicle | providerLinkState | operationalAvailability | overallState |
|---------|-------------------|-------------------------|--------------|
| HMÜ C 215 | UNKNOWN → **ACTIVE** | UNKNOWN → **AVAILABLE** | UNKNOWN → STANDBY |
| WOB L 7503 | UNKNOWN → ACTIVE | NEEDS_VERIFICATION → **NEEDS_VERIFICATION** | OFFLINE → OFFLINE |
| WOB L 9755 | UNKNOWN → ACTIVE | NEEDS_VERIFICATION → **NEEDS_VERIFICATION** | OFFLINE → OFFLINE |
| KS MS 661 | UNKNOWN → **REAUTH_REQUIRED** | UNKNOWN → NEEDS_VERIFICATION | UNKNOWN → AUTHORIZATION_REQUIRED |

KS MS 661: mapping identity ≠ authorization authority preserved (ACTIVE mapping would not be inferred; REAUTH_REQUIRED).

### R. Proposed future backfill runId

`dimo-link-backfill-prod-2026-08-25-1636d35`

**Rollback selector:** `metadata.provenance IN ('backfill','reconciliation') AND metadata.runId = 'dimo-link-backfill-prod-2026-08-25-1636d35'`

### S. Remaining gates

| Gate | Status |
|------|--------|
| DIMO backfill `--apply` | **DO NOT EXECUTE** (await explicit approval) |
| Production Connectivity Processing Gate | **CONDITIONAL** |
| PR #1277 | **HOLD** |
| Post-cutover unplug test | **NOT PERFORMED** |

### T. Final verdict

| Verdict | Result |
|---------|--------|
| #1290 PRODUCTION DEPLOYMENT | **PASS** |
| PRODUCTION SCHEMA MIGRATION | **PASS** |
| HIGH MOBILITY COMPATIBILITY | **PASS** |
| DIMO PROVIDER-SPECIFIC FK | **PASS** |
| DIMO BACKFILL PRE-APPLY GATE | **GO** |

**DIMO BACKFILL `--apply`:** **DO NOT EXECUTE** in this task.

---

## Y. Final Controlled Production Backfill Apply (2026-08-25)

**Mode:** Single controlled `--apply` with approved runId — no schema/deploy changes, no manual row inserts.

### A. Deployed SHA

`1636d35286124b5a9b4d7f0b2a31a57372cd859b` (unchanged since pre-apply GO gate)

### B. Pre-apply backup

| Field | Value |
|-------|-------|
| Identifier | `/opt/synqdrive/shared/backups/db-pre-backfill-apply-20260825185002.sql.gz` |
| Timestamp | 2026-08-25 18:50:12 UTC |
| Status | **SUCCESS** |

### C. runId

`dimo-link-backfill-prod-2026-08-25-1636d35`

### D. Final pre-apply dry-run

| scanned | CREATE | NOOP | REACTIVATE | CONFLICT | SKIP | applied |
|---------|--------|------|------------|----------|------|---------|
| 6 | 6 | 0 | 0 | 0 | 0 | 0 |

### E. Frozen mutation set

| Field | Value |
|-------|-------|
| Count | **6** |
| Hash | `3b9ecc39f061b938cea6b4970e5ef1187ad768e6657b80f4ed2feaa2b24590ca` |

### F. Apply result

| scanned | CREATE | NOOP | REACTIVATE | CONFLICT | SKIP | applied | failed |
|---------|--------|------|------------|----------|------|---------|--------|
| 6 | 6 | 0 | 0 | 0 | 0 | **6** | **0** |

**Outcome:** **FULL_SUCCESS** (not ZERO_WRITES, not PARTIAL_WRITES)

### G. Created rows (6)

All rows: `provider=DIMO`, `sourceType=DIMO`, `dimoVehicleId` populated, `sourceReferenceId=NULL`, `isActive=true`, `metadata.provenance=backfill`, `metadata.runId=dimo-link-backfill-prod-2026-08-25-1636d35`.

| Vehicle ref | Link created |
|-------------|--------------|
| HMÜ C 215 | YES |
| KS FH 660E | YES |
| KS MS 661 | YES |
| KS MX 2024 | YES |
| WOB L 7503 | YES |
| WOB L 9755 | YES |

### H. Integrity verification

| Check | Result |
|-------|--------|
| Expected created | 6 |
| Actual created | 6 |
| Missing | 0 |
| Unexpected | 0 |
| Orphan DIMO FK | 0 |
| Cross-tenant | 0 |
| Duplicate active by dimoVehicleId | 0 |
| Duplicate active by vehicle/source | 0 |
| sourceReferenceId NULL on all DIMO links | **YES** |
| dimoVehicleId valid on all DIMO links | **YES** |

### I. Post-apply idempotency dry-run

| CREATE | NOOP | REACTIVATE | CONFLICT | SKIP | applied |
|--------|------|------------|----------|------|---------|
| 0 | **6** | 0 | 0 | 0 | 0 |

**Idempotency:** **PASS**

### J–L. HMÜ C 215 — live P0.1 / P0.2 / P0.3

| Layer | Key fields |
|-------|------------|
| **P0.1** | `providerLinkState=ACTIVE`, `telemetryState=standby`, `physicalDeviceState=PLUGGED_INFERRED`, `overallState=STANDBY`, `latestTelemetryAt=2026-08-25T16:42:08Z` |
| **P0.2** | `businessState=AVAILABLE`, `operationalAvailability=AVAILABLE`, `primaryReason=LINK_ACTIVE` |
| **P0.3 Fleet** | `operationalAvailability.state=AVAILABLE`, `attention=NONE` |

HMÜ no longer UNKNOWN due to missing provider mapping.

### M. WOB L 7503 — live P0.1/P0.2/P0.3

| Field | Value |
|-------|--------|
| providerLinkState | **ACTIVE** |
| telemetryState | offline |
| physicalDeviceState | **UNKNOWN** |
| overallState | OFFLINE |
| operationalAvailability | **NEEDS_VERIFICATION** |
| Fleet availability | **NEEDS_VERIFICATION** |

Stale/offline telemetry preserved — mapping ACTIVE does not force AVAILABLE.

### N. WOB L 9755 — live P0.1/P0.2/P0.3

Same pattern as WOB L 7503: `providerLinkState=ACTIVE`, `physicalDeviceState=UNKNOWN`, `operationalAvailability=NEEDS_VERIFICATION`. Historical unplug not overriding current offline/unknown semantics (`DEVICE_CHECK_REQUIRED`, `latestTelemetryAt=2026-07-18`).

### O. KS MS 661 — auth separation

| Field | Value |
|-------|--------|
| active DIMO link | YES |
| consent | MISSING |
| auth | ACTIVE |
| providerLinkState | **REAUTH_REQUIRED** (not ACTIVE) |
| overallState | AUTHORIZATION_REQUIRED |
| operationalAvailability | NEEDS_VERIFICATION |
| Fleet availability | NEEDS_VERIFICATION |

Mapping exists; authorization/consent gap correctly prevents ACTIVE provider state and AVAILABLE ops.

### P. All-six Production matrix

| Vehicle | Active link | providerLinkState | telemetry | physical | overall | op.avail |
|---------|-------------|-------------------|-----------|----------|---------|----------|
| HMÜ C 215 | YES | ACTIVE | standby | PLUGGED_INFERRED | STANDBY | **AVAILABLE** |
| KS FH 660E | YES | REAUTH_REQUIRED | standby | PLUGGED_INFERRED | AUTHORIZATION_REQUIRED | NEEDS_VERIFICATION |
| KS MS 661 | YES | REAUTH_REQUIRED | standby | PLUGGED_INFERRED | AUTHORIZATION_REQUIRED | NEEDS_VERIFICATION |
| KS MX 2024 | YES | REAUTH_REQUIRED | standby | PLUGGED_INFERRED | AUTHORIZATION_REQUIRED | NEEDS_VERIFICATION |
| WOB L 7503 | YES | ACTIVE | offline | UNKNOWN | OFFLINE | NEEDS_VERIFICATION |
| WOB L 9755 | YES | ACTIVE | offline | UNKNOWN | OFFLINE | NEEDS_VERIFICATION |

### Q–R. Fleet / Vehicle Detail connectivity

Fleet `getFleetMapData` path returns canonical P0.2/P0.3 DTOs aligned with live runtime (verified via `shadow-fleet-operational-availability-readonly.ts`). Vehicle Detail uses same canonical projection authority.

### S. Cache propagation

No manual Redis/cache mutation performed. Fleet and projection queries reflect new link state immediately post-apply (natural read path, no stale UNKNOWN-from-missing-link observed).

### T. Unrelated mutation check

Only 6 new `vehicle_data_source_links` rows with approved runId. Legacy HM row, vehicles, dimo_vehicles, consent, episodes unchanged.

### U. Rollback decision

**Rollback required:** **NO** — all mappings correct, no cross-tenant/duplicate/malformed rows.

### V. Remaining gates

| Gate | Status |
|------|--------|
| Production Connectivity Processing Gate | **CONDITIONAL** |
| PR #1277 | **HOLD** (not merged) |
| Post-cutover unplug test | **NOT PERFORMED** |

### W. Final verdict

| Verdict | Result |
|---------|--------|
| DIMO PROVIDER-LINK PRODUCTION BACKFILL | **PASS** |
| HMÜ C 215 LIVE ACCEPTANCE | **PASS** |
| WOB OFFLINE SAFETY | **PASS** |
| KS AUTH-SEPARATION | **PASS** |
| P0.3 FLEET ACCEPTANCE | **PASS** |
| DIMO PROVIDER-LINK POPULATION BLOCKER | **CLOSED** |
| PR #1277 upstream blocker | **CLEARED** (ready to re-evaluate separately) |
