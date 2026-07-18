# Document Storage & Lifecycle Hardening (V4.9.624)

**Date:** 2026-07-17  
**Prompt:** 49/84 — Storage provider interface, quarantine vs clean, retention, legal hold, audit

## Goals

- Provider-neutral `DocumentStoragePort` with declared capabilities (transport, encryption-at-rest, backup)
- Quarantine vs clean zones (from V4.9.623 malware scan) integrated into lifecycle snapshot
- Tenant-scoped retention with dry-run default and explicit day windows (`0` = disabled)
- Soft delete vs final row delete; legal hold blocks destructive actions
- OCR raw data minimization; sensitive `extractedData` redaction per policy
- Mistral transfer status audit (`includesDocumentBytes`, no image base64)
- Fachliche audit metadata may outlive file/OCR payloads

## Storage port

`DocumentStoragePort` (`document-storage.interface.ts`):

| Method | Purpose |
|--------|---------|
| `putObject` | Clean zone |
| `putQuarantineObject` | Pre-scan quarantine |
| `promoteQuarantineToClean` | Post-scan promotion |
| `getCapabilities()` | Lifecycle audit snapshot |
| `resolveStorageZone(key)` | `quarantine` \| `clean` |

Default implementation: `LocalDocumentStorageService` — not publicly served; HTTPS at API layer.

## Lifecycle payload

Stored under `plausibility._pipeline.lifecycle`:

```typescript
{
  storage: DocumentStorageCapabilities,
  retention: DocumentRetentionState,
  legalHold: DocumentLegalHoldState,
  mistralTransfer: DocumentMistralDataTransferState,
}
```

Seeded on `createFromUpload` via `DocumentLifecycleService.seedLifecycleOnCreate()`.

## Soft delete

`DELETE /vehicles/:vehicleId/document-extractions/:id/file`:

1. `assertNotOnLegalHold`
2. `storage.deleteObject(objectKey)` (best-effort)
3. Clear `objectKey`, set `fileDeletedAt` / `fileDeletedById`
4. Optional immediate OCR cache strip (`DOCUMENT_DELETE_STRIP_OCR_CACHE`, default true)
5. Audit `delete_file` with `mode: soft_delete`

Confirmed downstream entities (fines, invoices, damages, …) are **not** removed.

## Retention phases

`DocumentRetentionService.runOnce()` — master switch `DOCUMENT_RETENTION_ENABLED` (default **false**).

| Phase | Trigger | Action |
|-------|---------|--------|
| `ocr_cache_after_soft_delete` | `fileDeletedAt` + days | Strip `_pipeline.contentCache` |
| `sensitive_extracted_data_after_soft_delete` | `fileDeletedAt` + days | Redact string fields in `extractedData` |
| `final_row_after_soft_delete` | `fileDeletedAt` + days, `objectKey=null` | `DELETE` row if no downstream links |
| `rejected_without_file` | `REJECTED`, no file, `createdAt` + days | `DELETE` row if no downstream links |

All phases:

- Respect `organizationId` filter when provided
- Skip rows with `legalHold.active === true`
- Honor `dryRun` (default **true** when enabled)
- Never run on deploy — cron `30 4 * * *` only

## Legal hold

- `POST/DELETE .../legal-hold` on vehicle-scoped controller
- Blocks `softDeleteFile` (403 `DOCUMENT_LEGAL_HOLD_ACTIVE`)
- Blocks `delete_file` in `getAllowedDocumentExtractionActions`
- Blocks all retention phases

## Mistral transfer audit

After OCR in `DocumentExtractionProcessor`:

```typescript
mistralTransfer: {
  provider: 'mistral',
  status: 'completed',
  includesDocumentBytes: true,
  includesImageBase64: false,
  model, pageCount, sentAt, completedAt,
}
```

## Config

| Env | Default |
|-----|---------|
| `DOCUMENT_RETENTION_ENABLED` | `false` |
| `DOCUMENT_RETENTION_DRY_RUN` | `true` |
| `DOCUMENT_DELETE_STRIP_OCR_CACHE` | `true` |
| `DOCUMENT_RETENTION_OCR_CACHE_AFTER_SOFT_DELETE_DAYS` | `90` |
| `DOCUMENT_RETENTION_SENSITIVE_EXTRACTED_DATA_DAYS` | `0` |
| `DOCUMENT_RETENTION_ROW_AFTER_SOFT_DELETE_DAYS` | `0` |
| `DOCUMENT_RETENTION_REJECTED_WITHOUT_FILE_DAYS` | `30` |
| `DOCUMENT_STORAGE_ENCRYPTION_DECLARED` | `false` |
| `DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS` | `false` |

See `docs/runbooks/document-storage-retention.md` for operations.

## Tests

- `document-lifecycle.service.spec.ts` — soft delete, legal hold, redaction
- `document-retention.service.spec.ts` — dry-run, legal hold skip, tenant scope
- `document-extraction-actions.util.spec.ts` — legal hold blocks delete

## Related

- V4.9.623 — Malware scan quarantine (`DOCUMENT_MALWARE_SCAN_ABSTRACTION_2026-07-17.md`)
- V4.9.619 — Content hash at upload
