# Legal Documents — Retention, Legal Hold & Secure Deletion (Prompt 22/32)

**Date:** 2026-07-22

## Problem

Legal document storage had no differentiated retention model, no legal hold, no idempotent purge jobs, and master files could not be tombstoned independently from booking snapshots and delivery evidence.

## Solution

Differentiated retention classes with org-configurable policies, permission-gated legal hold, phased idempotent purge (dry-run default), and GDPR subject-access helpers.

### Retention matrix

| Class | Entity | Default platform days | Auto-purge behavior |
|-------|--------|----------------------|---------------------|
| `LEGAL_MASTER` | `OrganizationLegalDocument` | `0` (disabled) | Storage object tombstone; DB row + audit kept |
| `BOOKING_SNAPSHOT` | `GeneratedDocument` | `0` (disabled) | Storage purge when unreferenced |
| `DELIVERY_EVIDENCE` | `LegalDocumentDeliveryEvidence` | `0` (disabled) | Recipient PII redaction; row kept |
| `QUARANTINE_TEMP` | `quarantineObjectKey` on master | `7` | Quarantine object delete only |
| `AUDIT_EVENT` | `OrganizationLegalDocumentEvent` | `0` (never) | No automatic purge |

Org overrides: `organization_legal_document_retention_policies.class_policies` JSON.

### Technical deletion strategy

1. **Eligibility** — `deletionEligibleAt` computed on ARCHIVED/REVOKED/SUPERSEDED from org/env policy; `retainUntil` and `legalHold` block purge.
2. **Reference guards** — Master purge skips when delivery evidence or generated docs still reference the master row. Snapshot purge skips when bundle/rental/invoice/email/evidence pointers exist.
3. **Storage + DB** — Delete object first; on success set `objectKey=''`, `deletedAt`, `storagePurgedAt`. On failure set `storagePurgeError` (visible in DB).
4. **Tombstone** — No physical row delete for masters/evidence; audit events appended before/after purge (`STORAGE_PURGED` / `STORAGE_PURGE_FAILED`).
5. **Idempotency** — Re-run skips rows with `storagePurgedAt` or empty `objectKey`; failed rows retried on next cron.
6. **Dry-run** — `LEGAL_DOCUMENT_RETENTION_DRY_RUN=true` default; manual `POST …/retention/run { "dryRun": true }`.

### Legal hold rules

| Rule | Implementation |
|------|----------------|
| Blocks deletion | `legalHold=true` or `retainUntil > now` |
| Set/clear permission | `legal_documents.manage_legal_hold` (manage level) |
| Reason required | `legalHoldReason` mandatory on set |
| Audit | `LEGAL_HOLD_SET` / `LEGAL_HOLD_CLEARED` events |
| Clears eligibility | `deletionEligibleAt` nulled while hold active |

### Recovery bei Teilfehlern

| Failure | Recovery |
|---------|----------|
| Storage delete fails | `storagePurgeError` set; row remains; retry on next run |
| DB update after storage delete | Rare; reconciliation run can detect orphan keys |
| Partial cron batch | `LegalDocumentRetentionPurgeRun` report + per-phase `failureSamples` |
| Legal hold during purge | Skipped with reason `legal_hold` |

### API

| Method | Path | Permission |
|--------|------|------------|
| `POST` | `…/legal-documents/:id/legal-hold` | `manage_legal_hold` |
| `POST` | `…/legal-documents/:id/legal-hold/clear` | `manage_legal_hold` |
| `GET` | `…/legal-documents/retention/policy` | `retention_admin` |
| `POST` | `…/legal-documents/retention/policy` | `retention_admin` |
| `POST` | `…/legal-documents/retention/run` | `retention_admin` |

### GDPR / Betroffenenanfragen

`LegalDocumentSubjectAccessService`:

- `exportForCustomer` — delivery evidence summary (redacted snapshot when applicable)
- `anonymizeCustomerDeliveryEvidence` — redacts `recipientSnapshot`; skips rows under legal hold

### Test results

```
LegalDocumentRetentionService
  ✓ skips master purge when active delivery evidence references exist
  ✓ records storage purge failure on master document
  ✓ does not purge another tenant when organizationId is scoped
  ✓ dry-run does not delete storage objects
  ✓ skips purge when legal hold is active
  ✓ blocks generated document purge when bundle pointer exists
LegalDocumentRetentionPolicyService
  ✓ uses org override days instead of platform default

7 passed
```

### Environment

| Variable | Default |
|----------|---------|
| `LEGAL_DOCUMENT_RETENTION_ENABLED` | `false` |
| `LEGAL_DOCUMENT_RETENTION_DRY_RUN` | `true` |
| `LEGAL_DOCUMENT_RETENTION_LEGAL_MASTER_DAYS` | `0` |
| `LEGAL_DOCUMENT_RETENTION_BOOKING_SNAPSHOT_DAYS` | `0` |
| `LEGAL_DOCUMENT_RETENTION_DELIVERY_EVIDENCE_DAYS` | `0` |
| `LEGAL_DOCUMENT_RETENTION_QUARANTINE_TEMP_DAYS` | `7` |
| `LEGAL_DOCUMENT_RETENTION_AUDIT_EVENT_DAYS` | `0` |

Scheduler: `LegalDocumentRetentionScheduler` — Cron `45 4 * * *` UTC.

Runbook: `docs/runbooks/legal-document-retention.md`
