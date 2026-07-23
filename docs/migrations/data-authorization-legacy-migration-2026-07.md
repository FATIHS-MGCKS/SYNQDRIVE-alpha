# Data Authorization Legacy Migration

**Date:** 2026-07-23  
**Version:** V4.9.793  
**Prompt:** 10 von 44

## Purpose

Controlled, idempotent migration of legacy `OrgDataAuthorization` and `VehicleProviderConsent` records into the new privacy domain structure — **without deleting legacy data** and **without auto-approving legal compliance**.

## Operating Procedure

### 1. Dry-run (mandatory first step)

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts
```

Optional filters:
```bash
npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts --org-id=<uuid> --batch-size=25
```

### 2. Review report

Inspect `data_authorization_legacy_migration_runs.report_json` and entries with `REVIEW_REQUIRED` status.

### 3. Commit (only after dry-run approval)

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts --commit
```

### 4. Rollback (if needed)

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts --rollback --run-id=<uuid>
```

Rollback deletes **only** domain records created in that run. Legacy `org_data_authorizations` and `vehicle_provider_consents` remain untouched.

## Mapping Rules

| Legacy source | Target domain | Initial status | Legacy FK |
|---------------|---------------|----------------|-----------|
| `OrgDataAuthorization` | `ProcessingActivity` | `DRAFT` | `legacy_org_data_authorization_id` |
| `OrgDataAuthorization` | `EnforcementPolicy` | `DRAFT` + mode `OFF` | `legacy_org_data_authorization_id` |
| `OrgDataAuthorization` (provider-related) | `ProviderAccessGrant` | `PENDING` | `legacy_org_data_authorization_id` |
| `VehicleProviderConsent` | `ProviderAccessGrant` | `PENDING` | `legacy_vehicle_provider_consent_id` |

### Category mapping

Uses `normalizeDataCategories()` from `data-authorization-risk.util.ts`:
- Legacy keys (`telematics_usage`, `trip_data`, …) → canonical `PrivacyProcessingDataCategory`
- Unknown categories → `UNMAPPED_DATA_CATEGORY` review reason

### Purpose mapping

Legacy `purpose` + `purposes[]` → `PrivacyProcessingPurpose` junction rows.

### Activity code

- System key: `LEGACY_<SYSTEM_KEY>`
- Otherwise: `LEGACY_<MODULE_ORIGIN_SLUG>`

## REVIEW_REQUIRED Rules

| Code | Trigger |
|------|---------|
| `SYSTEM_GENERATED_DIMO` | `isSystemGenerated`, `systemKey=DIMO_TELEMETRY`, or `sourceType=DIMO` |
| `ACTIVE_NOT_COMPLIANT` | Legacy status `ACTIVE` — not auto-compliant in new domain |
| `INCOMPLETE_SCOPE` | `CONNECTED_VEHICLES`/`VEHICLE` scope with empty `vehicleIds` |
| `UNMAPPED_DATA_CATEGORY` | Category cannot map to canonical enum |
| `UNMAPPED_PURPOSE` | Purpose string not in allowlist |
| `LEGAL_BASIS_UNCLEAR` | Always flagged — no silent legal basis assumption |
| `CONTRADICTORY_PROVIDER_STATE` | ODA ACTIVE + VPC REVOKED/EXPIRED (or inverse) |
| `PROVIDER_SCOPE_UNKNOWN` | VPC with empty scopes |
| `ALREADY_MIGRATED` | Legacy FK already linked — skipped |

Records with review reasons are still created as **candidates** in COMMIT mode, but remain `DRAFT`/`PENDING`/`OFF`.

## Not Automatically Migrated

| Case | Behavior |
|------|----------|
| Legal basis assessments | Never auto-created as `APPROVED` |
| Data subject consent | Not inferred from legacy ACTIVE |
| Data sharing authorizations | Not inferred from `destination` alone |
| Enforcement activation | Never `ACTIVE`/`ENFORCE` during backfill |
| Legacy record deletion | Never |
| PII in logs | Never — only counts, UUIDs, reason codes |

## Rollback Concept

1. Each COMMIT run stores `target_id` per entry in `data_authorization_legacy_migration_entries`
2. ROLLBACK mode deletes targets in dependency order:
   - Enforcement policy scopes → policy
   - Provider grant scopes → grant
   - Processing activity categories/purposes → activity
3. Entries marked `ROLLED_BACK`
4. Legacy sources remain for re-migration

## Validation Queries

```sql
-- REVIEW_REQUIRED count per org
SELECT organization_id, COUNT(*)
FROM data_authorization_legacy_migration_entries
WHERE status = 'REVIEW_REQUIRED'
GROUP BY organization_id;

-- Incomplete scope findings
SELECT COUNT(*)
FROM data_authorization_legacy_migration_entries
WHERE 'INCOMPLETE_SCOPE' = ANY(review_reasons);

-- Unmigrated legacy ODA without processing activity
SELECT oda.id
FROM org_data_authorizations oda
LEFT JOIN processing_activities pa ON pa.legacy_org_data_authorization_id = oda.id
WHERE pa.id IS NULL;

-- VPC without provider access grant bridge
SELECT vpc.id
FROM vehicle_provider_consents vpc
LEFT JOIN provider_access_grants pag ON pag.legacy_vehicle_provider_consent_id = vpc.id
WHERE pag.id IS NULL;

-- Migration run summary
SELECT id, mode, analyzed_count, migrated_count, review_required_count, error_count, report_json
FROM data_authorization_legacy_migration_runs
ORDER BY created_at DESC
LIMIT 5;
```

## Idempotency

- Fingerprint: `SHA256(sourceType:legacyId:targetType)`
- Unique on `migration_fingerprint`
- Re-runs skip `MIGRATED` entries
- Legacy FK uniqueness prevents duplicate domain rows

## Security

- No names, emails, or notes in `report_json` or logs
- Error messages use codes only
- Tenant-scoped batch processing via `organizationId` filter

## Code Locations

- Service: `backend/src/modules/data-authorizations/privacy-domain/legacy-migration/`
- Script: `backend/scripts/ops/migrate-data-authorization-legacy.ts`
- Tracking migration: `20260724010000_data_authorization_legacy_migration_tracking`

## Test Results

```bash
cd backend && npm test -- --testPathPattern='legacy-migration'
```
