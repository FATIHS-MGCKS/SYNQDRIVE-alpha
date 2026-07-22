# Legal Document Retention & Legal Hold Architecture

**Version:** V4.9.761 (Prompt 22/32)

## Components

```text
LegalDocumentRetentionPolicyService   → env + org JSON overrides
LegalDocumentRetentionReferenceService → FK/pointer guards
LegalDocumentLegalHoldService         → hold set/clear + audit events
LegalDocumentRetentionService         → phased purge (dry-run capable)
LegalDocumentSubjectAccessService     → GDPR export / anonymization
LegalDocumentRetentionScheduler       → nightly cron
```

## Data model fields (shared pattern)

`retentionClass`, `retainUntil`, `legalHold`, `legalHoldReason`, `legalHoldSetAt`, `legalHoldSetByUserId`, `deletionEligibleAt`, `deletedAt`, `storagePurgedAt`, `storagePurgeError`

Tables: `organization_legal_documents`, `generated_documents`, `legal_document_delivery_evidence`

Audit events: `retention_class` on `organization_legal_document_events` (default `AUDIT_EVENT`, never auto-purged)

Ops: `legal_document_retention_purge_runs` stores run reports.

## Independence invariant

Master file purge **does not** cascade to:

- `LegalDocumentDeliveryEvidence` (ON DELETE RESTRICT on master)
- `GeneratedDocument` booking snapshots
- Append-only audit events

Each class has its own eligibility timeline.

## Permissions

| Action | Code |
|--------|------|
| Set/clear legal hold | `legal_documents.manage_legal_hold` |
| Run retention / edit policy | `legal_documents.retention_admin` |
