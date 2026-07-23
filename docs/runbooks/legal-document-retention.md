# Runbook: Legal Document Retention, Legal Hold & Secure Deletion

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend V4.9.761 (Prompt 22/32) |
| **Architektur** | `architecture/LEGAL_DOCUMENT_RETENTION_LEGAL_HOLD_2026-07-22.md` |
| **Scheduler** | `LegalDocumentRetentionScheduler` — Cron `45 4 * * *` (04:45 UTC) |
| **Master switch** | `LEGAL_DOCUMENT_RETENTION_ENABLED=false` (default) |
| **Dry-run** | `LEGAL_DOCUMENT_RETENTION_DRY_RUN=true` (default) |

## Phases (in order)

1. `quarantine_temp` — stale `quarantineObjectKey`
2. `legal_master_storage` — archived/revoked/superseded master PDFs (tombstone row)
3. `booking_snapshot_storage` — generated PDFs without active pointers
4. `delivery_evidence_recipient_redaction` — PII in `recipientSnapshot`

## Manual dry-run (single org)

```bash
curl -X POST "https://app.synqdrive.eu/api/v1/organizations/{orgId}/legal-documents/retention/run" \
  -H "Authorization: Bearer …" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

## Legal hold

```bash
curl -X POST "…/legal-documents/{id}/legal-hold" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Litigation matter #123"}'
```

Requires `legal_documents.manage_legal_hold`.

## Org policy override

```json
{
  "classPolicies": {
    "LEGAL_MASTER": { "retentionDays": 3650, "anchor": "archived_at" },
    "QUARANTINE_TEMP": { "retentionDays": 3, "anchor": "created_at" }
  }
}
```

`0` days = disabled for that class.

## Failed storage purge

Query rows with `storage_purge_error IS NOT NULL`. Fix storage ACL/credentials, then re-run retention (idempotent).

## Recovery checklist

1. Inspect latest `legal_document_retention_purge_runs.report`
2. For `storage_purge_error`, verify object still exists in bucket
3. If object deleted but DB not updated, run integrity reconciliation
4. Never force-delete rows with active `legal_hold` or downstream FK references
