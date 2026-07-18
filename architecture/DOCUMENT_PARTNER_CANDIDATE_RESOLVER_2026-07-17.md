# Document Partner Candidate Resolver (V4.9.631)

**Date:** 2026-07-17  
**Prompt:** 56/84 — Tenant-safe partner resolution for vendors, workshops, insurers, and authorities

## Inputs

| Signal | Source |
|--------|--------|
| Organisationsname | `supplier` / `workshopName` / `issuingAuthority` / `issuingOrganization` / `insurerName` |
| IBAN | `iban` / `supplierIban` (matched via historical invoice `extractedData`, not logged) |
| Umsatzsteuer-ID | `vatId` / `vatNumber` / `umsatzsteuerId` / `ustId` |
| Steuernummer | `taxId` / `taxNumber` / `steuernummer` |
| Anschrift | `address` / `street` + `city` + `zip` |
| E-Mail | `email` / `supplierEmail` / `contactEmail` |
| Vendor-ID | `vendorId` (UUID) |
| Rechnungs-/Servicebeziehungen | Prior `OrgInvoice.vendorId`, `ServiceCase.vendorId`, historical invoice tax/iban signals |

## Output

### Per candidate (existing `Vendor`)

```json
{
  "vendorId": "…",
  "confidence": 0.95,
  "matchReasons": ["IBAN_EXACT"],
  "conflicts": [],
  "rank": 1,
  "confirmationRequired": true,
  "displayLabel": "Werkstatt WM",
  "partnerKind": "WORKSHOP",
  "vendorCategory": "WORKSHOP"
}
```

### New partner suggestion (no auto-create)

```json
{
  "partnerKind": "AUTHORITY",
  "confirmationRequired": true,
  "displayLabel": "Behörde SM",
  "sourceField": "issuingAuthority"
}
```

Stored in `plausibility._pipeline.partnerCandidates` with `ambiguousPartnerMatch` and `autoConfirmEligible: false`.

## Rules

1. **Exact IDs > fuzzy name** — `VENDOR_ID_EXACT` / `IBAN_EXACT` / `VAT_ID_EXACT` outrank `NAME_NORMALIZED`.
2. **No auto-create** — unknown partners surface as `newPartnerSuggestion` only.
3. **Category separation** — `AUTHORITY` (FINE) vs `WORKSHOP` / `INSURANCE` / `SUPPLIER`; `CATEGORY_MISMATCH` conflict when misaligned.
4. **IBAN not in logs** — pipeline hints use `ibanPresent` only.
5. **Tenant scope** — all `Vendor` / `OrgInvoice` / `ServiceCase` queries filter `organizationId`.
6. **Conflicts visible** — duplicate names, multiple plausible matches, category mismatch.

## Integration

```text
DocumentExtractionProcessor.runExtraction
  → after driverCandidates
  → when organizationId + documentType ∈ {INVOICE, SERVICE, …, FINE, DAMAGE, ACCIDENT}
  → PartnerCandidateResolverService.resolve
  → mergePipelinePlausibility({ partnerCandidates })
```

Public DTO: `partnerCandidates`, `partnerNewSuggestion`.

## Tests

- `partner-candidate-matching.util.spec.ts` — known vendor, ID priority, authority mismatch, new suggestion, PII-safe hints, invoice relationship
- `partner-candidate-resolver.service.spec.ts` — tenant scope, unknown authority, historical IBAN match
