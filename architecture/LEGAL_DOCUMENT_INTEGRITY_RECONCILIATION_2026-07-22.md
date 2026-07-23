# Legal Document Storage Integrity & Reconciliation

**Date:** 2026-07-22  
**Prompt:** 14/32

## Components

```
LegalDocumentChecksumVerificationService
  → metadata-first SHA-256 check via DocumentStoragePort
  → streaming hash fallback (no full-buffer load)

LegalDocumentIntegrityPersistenceService
  → updates integrityStatus / integrityUnavailable on document
  → append-only INTEGRITY_* audit events

LegalDocumentStorageReconciliationService
  → paginated DB scan + storage list for unexpected objects
  → checkpoint in legal_document_storage_reconciliation_runs

LegalDocumentIntegrityAlertService
  → ALERT logs for ops
```

## Download path

```
GET …/legal-documents/:id/download
  → integrityUnavailable gate
  → optional verify (DOCUMENT_LEGAL_INTEGRITY_VERIFY_ON_DOWNLOAD)
  → streaming download with inline checksum transform
  → on failure: persist drift + 409 INTEGRITY_UNAVAILABLE
```

## Resolver path

`LegalDocumentResolverCandidate` includes `integrityStatus` + `integrityUnavailable`.  
`documentMatchesContext` returns `INTEGRITY_UNAVAILABLE` for blocking statuses — ACTIVE historical rows remain in DB but are not selected for new bookings.

## Schema

`organization_legal_documents`:
- `integrity_status`, `integrity_checked_at`, `integrity_detail`, `integrity_unavailable`

`legal_document_storage_reconciliation_runs`:
- checkpoint cursor, metrics JSON, dry-run flag, status

See `docs/audits/legal-documents-integrity-reconciliation-2026-07.md` for runbook and metrics.
