# Legal Documents — Notifications, Tasks & Monitoring (Prompt 29/32)

Audit date: 2026-07-22

## Summary

All user-facing and technical alerts for customer legal texts are now derived exclusively from central resolver, bundle, integrity, and workflow states via `LegalDocumentOperationalNotificationService` and the pure matrix module `legal-document-operational-notification.matrix.ts`.

Legacy log-only paths (`BookingDocumentOrgLegalNotificationService` direct ingest, integrity log-only) are bridged or replaced. Admin tab `configAlerts` remain local UI hints; the Notification Engine is the cross-surface source for ops notifications.

## Event matrix

| Source state | Event type | User / Tech | Entity |
|--------------|------------|-------------|--------|
| Org readiness — no category versions | `LEGAL_REQUIRED_DOCUMENT_MISSING` | User | ORGANIZATION + category variant |
| Org readiness — no active version | `LEGAL_REQUIRED_DOCUMENT_MISSING` | User | ORGANIZATION + category variant |
| Org readiness — no DE active language | `LEGAL_REQUIRED_LANGUAGE_MISSING` | User | ORGANIZATION + category variant |
| Org readiness — no DE jurisdiction | `LEGAL_REQUIRED_JURISDICTION_MISSING` | User | ORGANIZATION + category variant |
| Workflow — IN_REVIEW without active | `LEGAL_APPROVAL_PENDING` | User | ORGANIZATION + category variant |
| Workflow — SCHEDULED active pick | `LEGAL_ACTIVATION_SCHEDULED` | User | ORGANIZATION + category variant |
| Active `validUntil` within 30 days | `LEGAL_DOCUMENT_EXPIRING_SOON` | User | ORGANIZATION + category variant |
| Active scan blocking status | `LEGAL_SCAN_FAILED` | User | ORGANIZATION + category variant |
| Active integrity blocking status | `LEGAL_INTEGRITY_CHECK_FAILED` | User | ORGANIZATION + category variant |
| Bundle completeness (no org gaps) | `LEGAL_BUNDLE_INCOMPLETE` | User | BOOKING |
| Bundle delivery proof missing | `LEGAL_DOCUMENT_DELIVERY_FAILED` | User | BOOKING |
| Pickup gate proof codes | `LEGAL_PICKUP_BLOCKED_MISSING_PROOF` | User | BOOKING + gate code variant |
| Multiple ACTIVE per category | `LEGAL_TECH_MULTIPLE_ACTIVE_VERSIONS` | Tech | ORGANIZATION + category variant |
| Integrity drift MISSING_OBJECT / UNEXPECTED | `LEGAL_TECH_STORAGE_OBJECT_MISSING` | Tech | ORGANIZATION + doc/key variant |
| Integrity drift CHECKSUM_MISMATCH | `LEGAL_TECH_HASH_MISMATCH` | Tech | ORGANIZATION + doc variant |
| Reconciliation run FAILED | `LEGAL_TECH_RECONCILIATION_FAILED` | Tech | ORGANIZATION |
| Bundle pointer mapping missing | `LEGAL_TECH_UNMAPPED_DOCUMENT_TYPE` | Tech | BOOKING |
| Resolver conflict | `LEGAL_TECH_RESOLVER_CONFLICT_UNRESOLVABLE` | Tech | BOOKING |
| Queue job dead (hook) | `LEGAL_TECH_QUEUE_JOB_DEAD` | Tech | ORGANIZATION |
| Malware scanner unavailable (hook) | `LEGAL_TECH_MALWARE_SCANNER_UNAVAILABLE` | Tech | ORGANIZATION |
| Object storage unavailable (hook) | `LEGAL_TECH_OBJECT_STORAGE_UNAVAILABLE` | Tech | ORGANIZATION |

## Notification matrix (severity & navigation)

| Event | Default severity | Action | Target |
|-------|------------------|--------|--------|
| `LEGAL_REQUIRED_DOCUMENT_MISSING` | CRITICAL | OPEN_RENTAL | `module: settings:legal-documents` |
| `LEGAL_REQUIRED_LANGUAGE_MISSING` | WARNING | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_REQUIRED_JURISDICTION_MISSING` | WARNING | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_APPROVAL_PENDING` | WARNING | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_ACTIVATION_SCHEDULED` | INFO | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_DOCUMENT_EXPIRING_SOON` | WARNING | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_SCAN_FAILED` | CRITICAL | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_INTEGRITY_CHECK_FAILED` | CRITICAL | OPEN_RENTAL | `settings:legal-documents` |
| `LEGAL_BUNDLE_INCOMPLETE` | WARNING | OPEN_BOOKING | bookingId |
| `LEGAL_DOCUMENT_DELIVERY_FAILED` | WARNING | OPEN_BOOKING | bookingId |
| `LEGAL_PICKUP_BLOCKED_MISSING_PROOF` | WARNING | OPEN_BOOKING | bookingId |
| `LEGAL_TECH_*` | CRITICAL | OPEN_RENTAL | `settings:legal-documents` (admin roles) |

Legacy `REQUIRED_DOCUMENT_MISSING` registry entry updated to ORGANIZATION + settings navigation; bridge resolves legacy fingerprint on clear.

## Deduplication keys

Fingerprint = `buildRegistryFingerprint(orgId, eventType, entityId, entityType)` with `conditionCodeVariant` = document category key, gate code, or object key.

Examples:

- Missing AGB: `org|LEGAL_REQUIRED_DOCUMENT_MISSING|ORGANIZATION|{orgId}|legal_required_document_missing:TERMS_AND_CONDITIONS|v1`
- Bundle incomplete: `org|LEGAL_BUNDLE_INCOMPLETE|BOOKING|{bookingId}|legal_bundle_incomplete|v1`
- Hash mismatch: `org|LEGAL_TECH_HASH_MISMATCH|ORGANIZATION|{orgId}|legal_tech_hash_mismatch:{legalDocumentId}|v1`

Matrix-level dedup: `eventType + entityType + entityId + conditionVariant` — higher severity wins.

Cross-path dedup: org configuration gaps are **not** mirrored as booking `LEGAL_BUNDLE_INCOMPLETE`. User integrity alerts suppress parallel `LEGAL_TECH_HASH_MISMATCH` / `LEGAL_TECH_STORAGE_OBJECT_MISSING` for the same `legalDocumentId`.

## Auto-close logic

1. **STATE notifications** use registry `STATE_RESOLUTION` (`autoResolveWhenConditionClears: true`).
2. **Scope sync** (`syncScope`) tracks prior fingerprints per `scopeKey` in-process; fingerprints absent from the current evaluation batch are resolved via `resolveNotificationByFingerprint`.
3. **Lifecycle hooks**: `LegalDocumentsService` status transitions trigger `loadAndSyncOrgReadiness`; bundle task sync triggers `syncBundleCompleteness`; integrity/reconciliation emit technical signals that auto-clear when drift is fixed and re-evaluated.

## Wiring

| Trigger | Service method |
|---------|----------------|
| Legal lifecycle transition | `loadAndSyncOrgReadiness` |
| Bundle completeness / task sync | `syncBundleCompleteness` + org gap bridge |
| Integrity drift alert | `syncIntegrityTechnicalAlert` |
| Reconciliation failure | `syncTechnicalAlert(TECH_RECONCILIATION_FAILED)` |
| Bundle monitoring resolver/pointer | `syncTechnicalAlert` |

## Test results

```
npm test -- --testPathPattern="legal-document-operational|booking-document-org-legal"
Test Suites: 3 passed
Tests:       15 passed
```

Coverage includes: deduplication, stable fingerprint re-evaluation, status resolution, severity escalation, tenant isolation, multiple document categories, expiring document, fixed integrity error, bundle/org-gap non-duplication.

## Files

- `backend/src/modules/documents/notifications/*`
- `backend/src/modules/notifications/registry/legal-document-notification-event.definitions.ts`
- `frontend/src/rental/lib/notifications/notification-v2-action-router.ts` (settings tab navigation)
- `frontend/src/rental/i18n/translations/{de,en}.ts` (notification.* legal keys)
