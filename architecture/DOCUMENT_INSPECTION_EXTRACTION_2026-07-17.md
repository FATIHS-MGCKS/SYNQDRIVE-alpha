# Document TÜV / BOKraft Inspection Extraction (V4.9.606)

**Date:** 2026-07-17  
**Prompt:** 30/84 — TÜV and BOKraft extraction and action planning hardening

## Scope

| Module | Role |
|--------|------|
| `document-inspection-extraction.rules.ts` | Field readers, plausibility, apply gate, vehicle compliance update builder |
| `document-action-planner.inspection-rules.ts` | Inspection action plan assessment |

## Canonical fields

| Field | Aliases |
|-------|---------|
| `inspectionDate` | `eventDate` |
| `validUntil` | — |
| `result` | — |
| `defectLevel` | `NONE`, `MINOR`, `MAJOR`, `CRITICAL` |
| `defects` | `defectDescription` |
| `reinspectionRequired` | inferred when defects present |
| `reinspectionDeadline` | — |
| `issuingOrganization` | `workshopName`, `inspectionStation`, `inspectorName` |
| `reportNumber` | `certificateNumber` |
| `mileage` | `odometerKm` |

## Rules

1. **validUntil priority** — `nextTuvDate` / `nextBokraftDate` use confirmed `validUntil` only.
2. **No computed defaults** — removed `+2 years` (TÜV) and `+1 year` (BOKraft) from apply path.
3. **Missing validUntil** — blocks vehicle master data update (`ARCHIVE_ONLY` plan outcome); service event still created.
4. **Defects** — `SUGGEST_DEFECT_REMEDIATION` / `SUGGEST_REINSPECTION` only; never hard-block apply.
5. **Hard block** — only when `complianceReadinessBlocked` policy flag is set.

## Apply flow

```
applyInspectionReport
  → assessInspectionApplyGate
  → CREATE vehicleServiceEvent (always if canArchive)
  → UPDATE vehicle lastTuvDate/nextTuvDate OR lastBokraftDate/nextBokraftDate
     only when canUpdateVehicleMasterData && validUntil present
```

## Tests

| Scenario | Fixture | Expected |
|----------|---------|----------|
| Ohne Mangel | `TUV_NO_DEFECT`, `BOKRAFT_NO_DEFECT` | `READY`, compliance update planned |
| Mit Mangel | `TUV_WITH_DEFECT`, `BOKRAFT_WITH_DEFECT` | defect suggestions, no hard block |
| Fehlende Gültigkeit | `TUV_MISSING_VALIDITY`, `BOKRAFT_MISSING_VALIDITY` | `ARCHIVE_ONLY`, no vehicle update |

Fixtures: `__fixtures__/document-inspection-fixtures.ts`
