# Legal Document Operational Notifications — 2026-07-22

## Architecture

```
Org legal rows / bundle completeness / integrity drift / pickup gate
        │
        ▼
legal-document-operational-notification.matrix (pure)
        │
        ▼
LegalDocumentOperationalNotificationService
        │
        ▼
NotificationCoreService (V2 registry ingest + fingerprint resolve)
        │
        ▼
Notification panel (IN_APP) + settings/booking navigation
```

## Principles

- Single derivation path per alert type — no parallel log-only duplicates for the same condition.
- Fingerprints from registry `conditionCode` + `conditionCodeVariant` (never localized labels).
- Org template gaps → org-level notifications only; booking bundle incomplete excludes `orgConfigurationGaps`.
- Technical details in occurrence payload / logs; user template keys stay operational.

## Registry

Twenty new `LEGAL_*` event types in `legal-document-notification-event.definitions.ts`. Legacy `REQUIRED_DOCUMENT_MISSING` retained with corrected ORGANIZATION entity and settings action target.

## Frontend navigation

`OPEN_RENTAL` action target `module: settings:legal-documents` opens Verwaltung → Rechtliche Dokumente via `onOpenSettingsTab` in dashboard notification handlers.
