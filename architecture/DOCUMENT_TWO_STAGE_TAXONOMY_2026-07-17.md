# Document Two-Stage Taxonomy (V4.9.634)

**Date:** 2026-07-17  
**Prompt:** 59/84 — Category + subtype taxonomy with legacy compatibility

## Categories

`FINANCE`, `AUTHORITY`, `VEHICLE`, `TECHNICAL`, `COMPLIANCE`, `INSURANCE`, `CUSTOMER`, `DRIVER`, `CONTRACT`, `GENERAL`

## Subtypes

`INVOICE`, `CREDIT_NOTE`, `REMINDER`, `FINE_NOTICE`, `DRIVER_IDENTIFICATION_REQUEST`, `SERVICE_REPORT`, `TUV_REPORT`, `BOKRAFT_REPORT`, `DAMAGE_REPORT`, `ACCIDENT_REPORT`, `INSURANCE_LETTER`, `CUSTOMER_CORRESPONDENCE`, `DRIVER_DOCUMENT`, `PAYMENT_PROOF`, `OTHER`

`taxonomyVersion`: **1.0.0**

## Legacy mapping (no data deletion)

Existing `DocumentExtractionType` values remain the apply/extraction contract. Taxonomy is derived compatibly:

| Legacy type | Category | Subtype |
|-------------|----------|---------|
| INVOICE | FINANCE | INVOICE |
| FINE | AUTHORITY | FINE_NOTICE |
| SERVICE / OIL_CHANGE / TIRE / BRAKE / BATTERY | TECHNICAL | SERVICE_REPORT |
| TUV_REPORT | COMPLIANCE | TUV_REPORT |
| BOKRAFT_REPORT | COMPLIANCE | BOKRAFT_REPORT |
| DAMAGE | INSURANCE | DAMAGE_REPORT |
| ACCIDENT | INSURANCE | ACCIDENT_REPORT |
| VEHICLE_CONDITION | VEHICLE | OTHER |
| OTHER | GENERAL | OTHER |

Subtype hints (`documentSubtype`, `archiveSubtype`) refine category/subtype without removing legacy columns.

## Classification result

`DocumentClassificationService` enriches every result with:

- `documentCategory`
- `documentSubtype`
- `taxonomyVersion`

Stored in:

- `plausibility.classification` (category/subtype/version)
- `plausibility._pipeline.documentTaxonomy` (full taxonomy state + `resolvedAt`)

Public API (`PublicDocumentExtractionDto`) exposes `documentCategory`, `documentSubtype`, `documentTaxonomyVersion`, `archiveRecommended`.

## Unknown subtypes → safe archive

Unrecognized subtype tokens resolve to:

```json
{
  "documentCategory": "GENERAL",
  "documentSubtype": "OTHER",
  "legacyDocumentType": "OTHER",
  "archiveRecommended": true,
  "source": "unknown_subtype_archive"
}
```

No destructive migration; archive path uses existing `OTHER` apply profile.

## Module

- `document-taxonomy.types.ts`
- `document-taxonomy.util.ts`
- Wired: classification service, extraction processor, public mapper, metadata endpoint, manual `setDocumentType`

## Tests

- Legacy type mapping for all `SUPPORTED_DOCUMENT_TYPES`
- Finance subtype hints (CREDIT_NOTE, REMINDER)
- Archive correspondence mapping
- Unknown subtype archive fallback
- Reverse legacy resolution for apply compatibility
