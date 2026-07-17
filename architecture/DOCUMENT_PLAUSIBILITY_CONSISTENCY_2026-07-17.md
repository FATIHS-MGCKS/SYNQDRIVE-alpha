# Document Plausibility Cross-Type Consistency (V4.9.610)

**Date:** 2026-07-17  
**Prompt:** 35/84 — Cross-document plausibility consistency checks

## Scope

| Module | Role |
|--------|------|
| `document-plausibility.types.ts` | Structured check shape: INFO/WARNING/BLOCKER, fieldPaths, explanation, resolutionHint |
| `document-plausibility-consistency.rules.ts` | Cross-type consistency rules (backend source of truth) |
| `document-plausibility-gate.util.ts` | Blocks action plans when unresolved BLOCKERs exist |

## Check output

```typescript
{
  code: string;
  status: 'INFO' | 'WARNING' | 'BLOCKER';
  message: string;
  explanation?: string;
  fieldPaths?: string[];
  resolutionHint?: string;
  source: 'DOCUMENT' | 'SYNQDRIVE_DB' | 'DIMO' | 'SYSTEM';
}
```

## Cross-type rules

| Code | Severity | Topic |
|------|----------|-------|
| `CONSISTENCY_DATE_SEQUENCE_ORDER` | BLOCKER/WARNING | Date ordering (due date, reinspection) |
| `CONSISTENCY_NET_TAX_GROSS_MISMATCH` | BLOCKER | Net + tax = gross |
| `CONSISTENCY_AMOUNT_SUM_MISMATCH` | BLOCKER | Line item sums |
| `CONSISTENCY_VIN_MISMATCH` | BLOCKER | VIN vs selected vehicle |
| `CONSISTENCY_PLATE_MISMATCH` | BLOCKER/WARNING | Plate vs selected vehicle |
| `CONSISTENCY_DOCUMENT_DATE_OUTSIDE_BOOKING` | WARNING | Document date vs booking period |
| `CONSISTENCY_ODOMETER_*` | BLOCKER/WARNING | Odometer vs vehicle history |
| `CONSISTENCY_UNIT_MISSING` | BLOCKER/WARNING | Explicit units (tire/brake/currency) |
| `CONSISTENCY_VALIDITY_BEFORE_INSPECTION` | BLOCKER | validUntil before inspection date |
| `CONSISTENCY_DUPLICATE_INVOICE_NUMBER` | BLOCKER | Duplicate invoice on vehicle |
| `CONSISTENCY_DUPLICATE_CASE_REFERENCE` | WARNING | Duplicate case/reference |
| `CONSISTENCY_MULTIPLE_CONFLICTING_VEHICLES` | BLOCKER | Multiple VINs/plates in one document |
| `CONSISTENCY_FIELD_CONFLICT_*` | BLOCKER/WARNING | Extraction merge conflicts |

## Rules

1. **Backend source of truth** — consistency rules run server-side in `DocumentExtractionPlausibilityService`.
2. **Action plan gating** — all planners accept optional `plausibilityChecks` and block on unresolved BLOCKERs.
3. **No automatic corrections** — checks only inform review; apply is blocked at confirm when overallStatus is BLOCKER.
4. **Confirm path** — `runConfirmPlausibility` loads duplicate invoice/reference numbers and booking period from DB.

## Tests

- `document-plausibility-consistency.rules.spec.ts` — one test per rule + gate util tests
