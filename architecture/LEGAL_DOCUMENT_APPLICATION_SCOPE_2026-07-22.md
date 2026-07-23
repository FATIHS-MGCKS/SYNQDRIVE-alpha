# Legal Document Application Scope — Architecture Record

**Date:** 2026-07-22  
**Prompt:** 7/32

## Summary

Organization legal documents carry an explicit **application scope** separate from document category (`documentType`) and consumer variant (`legalVariant`). Scope dimensions are validated, indexed, and checked for conflicts before activation. No booking resolver is implemented in this prompt.

## Data model

```
OrganizationLegalDocument
  language, jurisdictionCountry
  customerSegment, bookingChannel
  productScope (BusinessType?), stationScopeMode
  priority, isMandatory, noticePurpose
  validFrom, validUntil
  stations → OrganizationLegalDocumentStation[]

OrganizationLegalDocumentStation
  organizationId, legalDocumentId, stationId
```

Prisma enums: `LegalCustomerSegment`, `LegalBookingChannel`, `LegalStationScopeMode`, `LegalNoticePurpose`.

## Conflict policy

```
activate / updateApplicationScope
  └─ LegalDocumentScopeService.assertNoScopeConflicts
       └─ legal-document-scope.conflicts.detectScopeConflicts
            ├─ IDENTICAL_SCOPE_FINGERPRINT → conflict
            └─ OVERLAPPING_SCOPE_SAME_PRIORITY → conflict
```

Supersede on activate only affects peers with **identical scope fingerprint** (not all same type+language).

## Index strategy

`organization_legal_documents_resolver_scope_idx` on  
`(organization_id, status, document_type, language, jurisdiction_country, customer_segment, booking_channel)`.

Legacy `organization_legal_documents_single_active_key` **dropped**.

## API contract

Response DTO includes `applicationScope` object with all scope fields + `stationIds[]`.

## References

- `docs/audits/legal-documents-application-scope-2026-07.md`
- `backend/src/modules/documents/legal-document-scope.conflicts.ts`
