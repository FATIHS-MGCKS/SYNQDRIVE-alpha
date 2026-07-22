# Legal Documents — Bundle Completeness Service (Prompt 16/32)

**Date:** 2026-07-22  
**Scope:** Central `BookingDocumentCompletenessService` replacing scattered bundle status derivations

## Status model

| Status | Meaning |
|--------|---------|
| `COMPLETE` | All required legal + operational documents present and healthy |
| `INCOMPLETE` | Required documents missing (incl. privacy/consumer when applicable) |
| `BLOCKED` | Generation failure, resolver conflict, or scan failure |
| `GENERATING` | Required document in `DRAFT` / generation in progress |
| `DELIVERY_PENDING` | Invoice generated but delivery proof missing (ACTIVE+) |
| `ACKNOWLEDGMENT_PENDING` | Pickup handover without `documentsAcknowledged` |
| `INTEGRITY_FAILED` | Attached legal document has blocking integrity status |

Structured result fields: `missingItems`, `blockingReasons`, `nonBlockingWarnings`, `evaluatedAt`, `resolverVersion`, `affectedDocumentTypes`, `phases`, `legal`, `orgConfigurationGaps`, `legacyBundleStatus`.

## Replaced derivations

| Before | After |
|--------|-------|
| `refreshBundleStatus` pointer counting | `BookingDocumentCompletenessService.evaluateForBooking` |
| `getBundleView` inline legal/warning logic | Completeness helpers (`completenessToBundleViewWarnings`, etc.) |
| `computeMissingDocumentSlots` duplicate rules | Engine `phases[].missingDocuments` |
| `requiredTypesForStage` | `cumulativeRequiredDocumentTypes` in engine |
| `BookingDocumentOrgLegalNotificationService` inline missing types | `orgConfigurationGaps` from completeness |
| `bookings.service` `DOC_SLOTS` (no privacy) | Completeness-driven slots + `PRIVACY_POLICY` |

## Blocking criteria

- Missing mandatory legal: AGB, Verbraucherinformation, Datenschutz (never `COMPLETE`)
- `GENERATION_FAILED` / document `FAILED` status
- Resolver scope conflict
- Legal integrity: `MISSING_OBJECT`, `CHECKSUM_MISMATCH`, `STORAGE_ERROR`, `integrityUnavailable`
- Legal scan not `SCAN_PASSED` on attached document

## Warning criteria (non-blocking)

- `ORG_CONFIGURATION_GAP` — org template missing (org notification, not booking task)
- `DELIVERY_PROOF_MISSING` — invoice not sent (CONFIRMED warning, ACTIVE → `DELIVERY_PENDING`)
- `ACKNOWLEDGMENT_MISSING` — pickup protocol not acknowledged
- `GENERATION_IN_PROGRESS` — DRAFT documents

## Historical stability

- `legacyBundleStatus` maps to existing `BUNDLE_STATUS` DB column (`PENDING`/`PARTIAL`/`COMPLETE`/`FAILED`)
- Bundle pointers + generated-doc fallback preserved for old bundles
- Idempotent pure engine (`evaluateBookingDocumentCompleteness`)

## Tests

```bash
cd backend && npm test -- --testPathPattern="booking-document-completeness|booking-document-phase|booking-document-bundle|documents.service"
```

**68** targeted tests + **277** full legal/booking document scope.

## Changed files

- `booking-document-completeness.constants.ts` — status + reason codes
- `booking-document-completeness.types.ts` — structured result types
- `booking-document-completeness.engine.ts` — pure evaluation
- `booking-document-completeness.engine.spec.ts` — 15 engine scenarios
- `booking-document-completeness.service.ts` — batched DB load, no N+1
- `booking-document-bundle.service.ts` — consumes completeness
- `booking-document-missing-slots.util.ts` — delegates to engine (deprecated wrapper)
- `booking-document-org-legal-notification.service.ts` — uses `orgMissingLegalTemplateTypes`
- `bookings.service.ts` — completeness-driven document slots
- `booking-detail.types.ts` — `completenessStatus`, `legalPrivacyAttached`
- `documents.module.ts` — registers + exports service
