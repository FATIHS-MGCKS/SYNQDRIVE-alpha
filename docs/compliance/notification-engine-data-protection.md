# Notification Engine — Data Protection & Retention (V4.9.873)

**Date:** 2026-07-26  
**Scope:** GDPR data minimization, classification, retention, and data-subject rights for the Notification Engine V2.

Companion: `docs/notification-engine-permissions-and-preferences.md`, `docs/compliance/workflow-audit-and-ai-transparency-2026-07.md`

## Data categories

| Category | Examples in notification artefacts | PII |
|----------|----------------------------------|-----|
| **Stammdaten (MASTER_DATA)** | `organizationId`, category prefs | Indirect |
| **Fahrzeugdaten (VEHICLE_DATA)** | `label`, `plate`, `vehicleId` in params | Low–medium |
| **Standortdaten (LOCATION_DATA)** | `stationName`, `stationId` | Low |
| **Buchungsdaten (BOOKING_DATA)** | `bookingRef`, `bookingId`, `invoiceId` in `actionTarget` | Medium |
| **Kundendaten (CUSTOMER_DATA)** | `customerId` in targets; **blocked at rest:** name/email/phone | High (blocked) |
| **Technische Daten (TECHNICAL_DATA)** | `eventType`, `fingerprint`, `entityId` | Low–medium |
| **Kommunikationsdaten (COMMUNICATION_DATA)** | `titleKey`, `bodyKey`, minimized `templateParams` | Medium |
| **Auditdaten (AUDIT_DATA)** | `runId`, `adapterId`, `primarySourceRef`, occurrence payload | Low |

Source: `compliance/notification-data-classification.ts`

## Data minimization (write-time)

Applied in `NotificationCoreService` before persistence:

- `minimizeTemplateParams()` — drops `customerName`, `customerEmail`, billing amounts, secrets
- `minimizeOccurrencePayload()` — allowlist operational metadata keys only
- `minimizeActionTarget()` — strips inline customer contact fields
- `sanitizeDeliveryErrorMessage()` — masks emails in outbox `lastError`
- Email channel continues `redactTemplateParamsForExternalChannel()` at delivery

**Removed unnecessary PII at rest:** direct customer contact fields, payment amounts, secrets, free-text producer metadata.

Entity IDs remain in `actionTarget` for operational deep links — access controlled via role/station scope.

## Retention classes

Derived from existing SynqDrive policies (not arbitrary):

| Class | Horizon | Source policy | Applies to |
|-------|---------|---------------|------------|
| `ACTIVE_OPERATIONAL` | While non-terminal | Operational necessity | OPEN / ACKNOWLEDGED / SNOOZED notifications |
| `RESOLVED_OPERATIONAL` | **180 days** | `VEHICLE_WARNING_RETENTION_NOTIFICATIONS_DAYS` | Resolved/archived operational notifications |
| `SECURITY_GOVERNANCE` | **~2555 days (7y)** | `WORKFLOW_AUDIT_RETENTION_DAYS.GOVERNANCE_AUDIT` | SECURITY / SYSTEM / integration events |
| `DELIVERY_TECHNICAL` | **90 days** | `WORKFLOW_AUDIT_RETENTION_DAYS.TECHNICAL_LOG` | Terminal delivery outbox rows |
| `WORKFLOW_TECHNICAL` | **90 days** | Workflow technical log | Notification-linked workflow runs (future phase) |

On resolve, `deletionEligibleAt` is computed from `resolvedAt` + class-specific days.

### Child artefacts

| Artefact | Retention |
|----------|-----------|
| Occurrences | Cascade delete with parent notification |
| Receipts | Cascade delete with parent; user-specific erasure deletes receipt rows |
| Delivery outbox | Purged after `DELIVERY_TECHNICAL` horizon |
| Workflow audit | Existing workflow retention classes (separate table) |

## Legal hold & purge controls

- `notifications.legalHold` + reason — blocks purge and anonymization
- `NotificationRetentionService.runOnce({ dryRun })` — dry-run by default via `NOTIFICATION_RETENTION_DRY_RUN`
- `notification_retention_purge_runs` — audit trail per run (org-scoped optional)
- Enabled via `NOTIFICATION_RETENTION_ENABLED=true`

## Data subject rights

| Right | Implementation |
|-------|----------------|
| **Auskunft (Art. 15)** | `NotificationDataSubjectService.exportForSubject()` |
| **Berichtigung (Art. 16)** | Operational corrections via source systems / resolve-reopen — notifications are derived state |
| **Löschung (Art. 17)** | `eraseForSubject()` — anonymize templateParams/actionTarget; delete user receipts |
| **Einschränkung (Art. 18)** | `restrictProcessing()` / `releaseRestriction()` — legal hold flag |

Tenant isolation: all queries require `organizationId`.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `NOTIFICATION_RETENTION_ENABLED` | `false` | Master switch |
| `NOTIFICATION_RETENTION_DRY_RUN` | `true` | Dry-run purge |
| `NOTIFICATION_RETENTION_RESOLVED_DAYS` | `180` | Resolved operational |
| `NOTIFICATION_RETENTION_SECURITY_DAYS` | `2555` | Security governance |
| `NOTIFICATION_RETENTION_DELIVERY_DAYS` | `90` | Outbox technical |

## Tests

`compliance/notification-compliance.spec.ts` — minimization, retention derivation, tenant-scoped purge.
