# Legal Documents — Storage Integrity & Reconciliation (Prompt 14/32)

**Date:** 2026-07-22  
**Status:** Implemented  
**Branch:** `cursor/legal-docs-integrity-reconciliation-28ca`

## Overview

SHA-256 checksums stored at upload time are reused for ongoing integrity control:
- **Download verification** — optional pre-check + streaming hash while serving bytes
- **Reconciliation** — paginated DB ↔ storage audit with dry-run, checkpoint/resume, metrics

## Integrity status model

| Status | Meaning | Blocks new bookings | Persists on document |
|--------|---------|---------------------|----------------------|
| `VERIFIED` | Checksum matches storage | No | Yes |
| `UNVERIFIED` | Not yet checked / no checksum | No | Yes (default) |
| `MISSING_OBJECT` | DB row references missing object | Yes (`integrityUnavailable`) | Yes |
| `CHECKSUM_MISMATCH` | Hash drift / corruption | Yes | Yes |
| `STORAGE_ERROR` | Provider/read failure | Yes | Yes |

Historical booking references are **not deleted**. Documents stay in DB with `integrityUnavailable=true` and `statusReason` updated.

## Reconciliation behaviour

`LegalDocumentStorageReconciliationService.run()`:

| Property | Implementation |
|----------|----------------|
| Tenant scope | `organizationId` filter or all orgs |
| Pagination | Cursor on `organizationLegalDocument.id` |
| Idempotent | Re-running re-verifies; checkpoint updates same run on resume |
| Large volumes | Configurable batch size + rate limit sleep |
| Dry-run | `dryRun: true` — alerts logged, no DB integrity updates |
| Metrics | `documentsProcessed`, `verified`, `missingObject`, `checksumMismatch`, `storageError`, `unexpectedObjects`, `durationMs`, `batches` |
| Interruptible | `AbortSignal` → run status `INTERRUPTED`, cursor saved |
| Resume | `resumeRunId` continues from stored cursor |
| Memory | Metadata-first verify; full stream hash only when needed |
| Unexpected objects | Listed, never auto-deleted |

Run state: `legal_document_storage_reconciliation_runs` table.

## Alerts & audit

- `LegalDocumentIntegrityAlertService` — `ALERT` logs on drift / unexpected objects
- Append-only events: `INTEGRITY_VERIFIED`, `INTEGRITY_MISSING_OBJECT`, `INTEGRITY_CHECKSUM_MISMATCH`, `INTEGRITY_STORAGE_ERROR`
- Resolver excludes candidates with blocking integrity status (`INTEGRITY_UNAVAILABLE` reason)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENT_LEGAL_INTEGRITY_VERIFY_ON_DOWNLOAD` | `true` | Verify before/at download |
| `DOCUMENT_LEGAL_INTEGRITY_RECONCILIATION_BATCH_SIZE` | `50` | Documents per batch |
| `DOCUMENT_LEGAL_INTEGRITY_RECONCILIATION_RATE_LIMIT_MS` | `25` | Sleep between documents |
| `DOCUMENT_LEGAL_INTEGRITY_ALERT_THRESHOLD` | `5` | Sustained alert threshold |

## Recovery process

1. Run reconciliation dry-run per org: `LegalDocumentStorageReconciliationService.run({ organizationId, dryRun: true })`
2. Review drifts (missing / mismatch / unexpected)
3. For **missing**: restore object from backup or re-upload new version; backfill `objectKey` if restored to new key
4. For **checksum mismatch**: treat as corruption — revoke/supersede ACTIVE doc, upload replacement, do not delete historical row
5. For **unexpected objects**: investigate provenance; manual cleanup only after ops review (never automatic)
6. Execute reconciliation with `dryRun: false` to persist `integrityStatus`
7. Verify resolver no longer selects damaged ACTIVE documents for new bookings

## Test results

| Suite | Scenarios |
|-------|-----------|
| `legal-document-checksum-verification.service.spec.ts` | metadata match, stream mismatch, missing object |
| `legal-document-storage-reconciliation.service.spec.ts` | dry-run, missing object, verified, tenant isolation |
| `legal-document-integrity-resolver.spec.ts` | resolver blocks CHECKSUM_MISMATCH |
| Full legal-documents scope | **248 tests passing** |

## Changes / Architektur

- **Changes:** updated (`legal-documents-integrity-reconciliation-2026-07-22`)
- **Architektur:** updated (`LEGAL_DOCUMENT_INTEGRITY_RECONCILIATION_2026-07-22`)
