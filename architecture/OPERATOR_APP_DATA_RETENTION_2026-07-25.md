# Operator App Data Retention & Privacy (V4.9.827)

| Feld | Wert |
|------|------|
| **Datum** | 2026-07-25 |
| **Prompt** | Operator App Production Readiness #34 |
| **Audit** | `docs/audits/operator-app-privacy-retention-2026-07.md` |
| **Runbook** | `docs/runbooks/operator-data-retention.md` |

## Scope

Operator WebApp evidence: handover drafts, protocols/signatures, damage/condition images (via existing document/damage domains), technical observations, AI upload/OCR, tire measurements, audit logs, and client session data.

## Architecture

```
OperatorRetentionModule
├── OperatorDataRetentionService (phased cleanup)
├── OperatorDataRetentionScheduler (cron 05:00 UTC)
├── OperatorEvidenceLegalHoldService (per booking)
├── OperatorHandoverDraftService (TTL drafts, no signatures)
└── OperatorDataRetentionController
    └── /organizations/:orgId/operator/*
```

### Retention phases

| Phase | Action | Legal hold |
|-------|--------|------------|
| `abandoned_handover_draft` | Hard delete `operator_handover_drafts` | `OperatorBookingEvidenceLegalHold` |
| `handover_signature_bitmap` | Soft delete signature bitmap columns | Booking legal hold |
| `operator_orphan_extraction` | Hard delete stale operator extractions | Document pipeline `lifecycle.legalHold` + downstream link check |
| `operator_extraction_ocr_cache` | Strip `contentCache` from plausibility | Document pipeline legal hold |

### Prisma models

- `OperatorHandoverDraft` — `@@unique([organizationId, bookingId, kind])`, `expiresAt` index
- `OperatorBookingEvidenceLegalHold` — `@@unique([bookingId])`, `active` index per org

### Config

All day-based windows default **0** (disabled). Master switch `OPERATOR_DATA_RETENTION_ENABLED=false`, dry-run default `true`.

### Privacy

- `operator-audit-privacy.util.ts` — redacts signature data URLs and sensitive query params in HTTP audit descriptions
- `operatorClientPrivacy.ts` — no durable local storage; purge on handover close
- Existing `ActivityLogService` PII scrubbing remains for structured meta

### Integration

- Reuses `DocumentLifecycleService` / document pipeline legal hold for extraction phases
- Does not duplicate `DocumentRetentionService` — operator phases filter `sourceSurface` ∈ `{operator_app, operator_ai_upload}`

## Non-goals (this release)

- Per-org retention policy table (env-only platform defaults)
- Automatic damage image blob purge (remains in document/damage domains)
- Frontend draft sync (API ready; client sync optional follow-up)

## Legal confirmation required

See audit doc § "Offene rechtliche Bestätigungspunkte" — no statutory periods invented in code defaults.
