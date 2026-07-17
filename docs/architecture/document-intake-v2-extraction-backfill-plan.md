# Document Intake V2 — Extraction Control Fields Backfill Plan

**Version:** 1.0 (Plan only)  
**Date:** 2026-07-17  
**Status:** **Not for production execution in Prompt 19**  
**Migration:** `20260717230000_document_extraction_v2_control_fields`

---

## Scope

Additive schema on `vehicle_document_extractions` (`VehicleDocumentExtraction`):

| Field | Prompt 19 state | Backfill target |
|-------|-----------------|-----------------|
| `organizationId` | Nullable + FK to `organizations` | **NOT NULL** after backfill |
| `vehicleId` | Nullable (legacy rows unchanged) | Keep as-is for vehicle uploads |
| `documentCategory` | Nullable | Derive from `effectiveDocumentType` |
| `documentSubtype` | Nullable | Manual / classifier only |
| `classificationVersion` | Nullable | Set on next classification run |
| `contentHash` | Nullable | Compute from stored file bytes |
| `duplicateStatus` | Nullable | Set by dedup service |
| `currentActionPlanId` | Nullable | Set when plan is resolved |
| `processingMaturity` | Nullable | Default `SHADOW` for new pipeline |
| `applyStartedAt` / `applyCompletedAt` | Nullable | Mirror from `appliedAt` where applicable |
| `applyFailureCode` | Nullable | Mirror from `errorCode` when `errorPhase=APPLY` |
| `legacyApplyResult` | Nullable | Snapshot `serviceEventId` + apply audit JSON |
| `archivedAt` | Nullable | Set only on explicit archive |

**Explicitly out of scope (Prompt 19):**

- `objectKey` / storage path migration
- `organizationId NOT NULL` constraint
- Production backfill job execution

---

## Phase B1 — `organizationId` (required before org-only uploads)

```sql
-- Preview only — run in ops window after validation queries
UPDATE vehicle_document_extractions e
SET organization_id = v.organization_id
FROM vehicles v
WHERE e.organization_id IS NULL
  AND e.vehicle_id = v.id;
```

Validation before NOT NULL:

```sql
SELECT COUNT(*) AS missing_org
FROM vehicle_document_extractions
WHERE organization_id IS NULL;
-- Must be 0 before: ALTER COLUMN organization_id SET NOT NULL
```

---

## Phase B2 — `documentCategory`

Map legacy `effectiveDocumentType` → `DocumentCategory` (service-layer enum map; no SQL default for all types in one shot).

| DocumentExtractionType | DocumentCategory |
|------------------------|------------------|
| SERVICE, OIL_CHANGE, BRAKE, TIRE, BATTERY | MAINTENANCE |
| TUV_REPORT, BOKRAFT_REPORT | INSPECTION |
| INVOICE, FINE | FINANCE |
| DAMAGE, ACCIDENT | DAMAGE |
| VEHICLE_CONDITION | CONDITION |
| OTHER, AUTO | GENERAL |

---

## Phase B3 — Apply timestamps mirror

```sql
UPDATE vehicle_document_extractions
SET
  apply_completed_at = applied_at,
  apply_started_at = COALESCE(apply_started_at, applied_at)
WHERE status = 'APPLIED'
  AND applied_at IS NOT NULL
  AND apply_completed_at IS NULL;
```

```sql
UPDATE vehicle_document_extractions
SET apply_failure_code = error_code
WHERE error_phase = 'APPLY'
  AND error_code IS NOT NULL
  AND apply_failure_code IS NULL;
```

---

## Phase B4 — `legacyApplyResult` snapshot

One-time JSON snapshot per applied row (script, not migration):

```json
{
  "schemaVersion": 1,
  "serviceEventId": "<service_event_id>",
  "appliedAt": "<applied_at>",
  "appliedById": "<applied_by_id>",
  "source": "legacy_single_pointer"
}
```

---

## Phase B5 — `contentHash` + `duplicateStatus`

- Compute SHA-256 from private storage object via existing download path
- Batch job org-scoped; set `duplicateStatus` via `DocumentContentFingerprint` table (future P20+)
- **Do not** rewrite `objectKey`

---

## Rollout order

1. Deploy Prompt 19 migration (additive columns + nullable `vehicle_id`)
2. Deploy writers that populate new fields on new uploads only
3. Run B1 validation → org backfill → NOT NULL (separate prompt)
4. Run B2–B5 backfill scripts in maintenance window
5. Enable org-scoped upload without vehicle (API prompt, not P19)

---

## Acceptance checks (post-backfill, future)

- [ ] Zero `organization_id IS NULL` rows
- [ ] Vehicle-scoped API still returns all legacy rows with `vehicle_id` set
- [ ] `currentActionPlanId` references non-invalidated plan when set
- [ ] No `DROP COLUMN` on legacy fields
