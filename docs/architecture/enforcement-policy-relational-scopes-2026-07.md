# Enforcement Policy Relational Scopes (Prompt 9)

**Date:** 2026-07-23  
**Version:** V4.9.792  
**Migration:** `20260724000000_enforcement_policy_relational_scopes`

## Overview

Replaces unstructured JSON / single-column scope references with relational junction tables for enforcement policies. All scope assignments are tenant-validated server-side, transactional, and versioned when policies are active.

## Relation Tables

| Table | FK | Unique constraint |
|-------|-----|-------------------|
| `enforcement_policy_vehicles` | `organization_id`, `enforcement_policy_id`, `vehicle_id` | `(enforcement_policy_id, vehicle_id)` |
| `enforcement_policy_customers` | `organization_id`, `enforcement_policy_id`, `customer_id` | `(enforcement_policy_id, customer_id)` |
| `enforcement_policy_bookings` | `organization_id`, `enforcement_policy_id`, `booking_id` | `(enforcement_policy_id, booking_id)` |
| `enforcement_policy_stations` | `organization_id`, `enforcement_policy_id`, `station_id` | `(enforcement_policy_id, station_id)` |

`EnforcementPolicy` also gains versioning:
- `policy_family_id` — stable family identifier
- `version_number` — monotonic per family
- `is_current_version` — only one current row per family

## Tenant Protection

1. Every junction row carries `organizationId` matching the policy.
2. `EnforcementPolicyScopeValidationService` resolves resources with `WHERE organizationId = :orgId`.
3. Cross-tenant or missing resources return generic errors — no foreign IDs in API messages.
4. Invalid legacy references stored as `enforcement_policy_scope_migration_findings` with SHA-256 fingerprint only (`reference_fingerprint`).

## Scope Change Rules

| Policy status | Scope change path |
|---------------|-------------------|
| `DRAFT` | `PUT .../scopes` — full transactional replace |
| `ACTIVE` | `POST .../scopes/new-version` — creates DRAFT vN+1, marks prior `isCurrentVersion=false` |
| `DISABLED` | Not directly editable |

Bulk replace is atomic: delete all junction rows + insert new set in one transaction. No partial updates.

## Backfill

### Migration SQL
- Adds tables + versioning columns
- Backfills single legacy columns (`scope_vehicle_id`, etc.) into junction tables
- Drops legacy single-scope columns

### Ops script
```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-enforcement-policy-scopes.ts --dry-run
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-enforcement-policy-scopes.ts
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-enforcement-policy-scopes.ts --org-id=<uuid>
```

Backfills `OrgDataAuthorization` JSON arrays (`vehicle_ids`, `customer_ids`, `booking_ids`) via `legacy_org_data_authorization_id` link.

### Backfill result shape
```json
{
  "dryRun": false,
  "policiesProcessed": 12,
  "vehiclesLinked": 45,
  "customersLinked": 3,
  "bookingsLinked": 0,
  "stationsLinked": 0,
  "findingsRecorded": 2,
  "skippedPolicies": 5
}
```

## Unclear Legacy Data

Recorded in `enforcement_policy_scope_migration_findings`:

| Code | Meaning |
|------|---------|
| `RESOURCE_NOT_FOUND` | ID not found in tenant |
| `CROSS_TENANT` | Resource belongs to another org |
| `INVALID_REFERENCE` | Malformed reference |
| `DUPLICATE_SKIPPED` | Duplicate in source array |

Sources: `LEGACY_POLICY_COLUMN`, `LEGACY_ORG_DATA_AUTHORIZATION_JSON`

## API Routes

| Method | Path | Permission |
|--------|------|------------|
| GET | `.../enforcement-policies/:policyId/scopes` | read |
| PUT | `.../enforcement-policies/:policyId/scopes` | write (DRAFT only) |
| POST | `.../enforcement-policies/:policyId/scopes/new-version` | manage (from ACTIVE) |

## Code Locations

- Prisma: `backend/prisma/schema.prisma`
- Migration: `backend/prisma/migrations/20260724000000_enforcement_policy_relational_scopes/`
- Validation: `enforcement-policy-scope-validation.service.ts`
- Service: `enforcement-policy-scope.service.ts`
- Backfill: `enforcement-policy-scope-backfill.util.ts`, `scripts/ops/backfill-enforcement-policy-scopes.ts`

## Test Results

```bash
cd backend && npm test -- --testPathPattern='enforcement-policy-scope|privacy-domain.invariants'
```

**25 tests PASS** covering:
- Tenant-negative lookups
- Mixed valid/invalid ID batches (generic error, no ID leak)
- Duplicate deduplication
- Parallel update re-check inside transaction
- Active policy → new version flow
- Dry-run backfill without writes
- Migration finding fingerprints
