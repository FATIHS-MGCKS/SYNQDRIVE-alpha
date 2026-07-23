# Legal Document Lifecycle Events — Architecture Record

**Date:** 2026-07-22  
**Prompt:** 5/32

## Summary

`OrganizationLegalDocumentEvent` is an append-only, tenant-scoped audit log for legal document lifecycle transitions. It complements (does not replace) the generic HTTP `AuditInterceptor`.

## Write path

```
LegalDocumentsService.{upload|submitForReview|approve|schedule|activate|revoke|archive}
  └─ prisma.$transaction
       ├─ organizationLegalDocument create/update
       └─ LegalDocumentEventsService.appendInTransaction
```

Failure in event insert aborts the transaction — no silent status changes without audit.

## Read path

- `GET …/legal-documents/:id/events` — per-document chronological log
- `GET …/legal-documents/events` — org-wide with optional filters

`OrgScopingGuard` + document ownership check before listing.

## Security

- No PDF bytes, object keys, or filenames in event rows
- Actor display name snapshotted at write time
- `correlationId` from request logging (`X-Request-Id`)

## References

- `docs/audits/legal-documents-lifecycle-events-2026-07.md`
- `backend/src/modules/documents/legal-document-events.service.ts`
