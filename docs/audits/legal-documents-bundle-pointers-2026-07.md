# Legal Documents — Bundle Pointer Wiring (Prompt 15/32)

**Date:** 2026-07-22  
**Scope:** `BookingDocumentBundleService` legal pointer mapping for AGB, Datenschutzhinweise, Verbraucherinformation

## Mapping (central, compile-time)

| Legal slot (`DocumentType`) | Bundle column | DTO field |
|-----------------------------|---------------|-----------|
| `TERMS_AND_CONDITIONS` | `termsDocumentId` | `legal.termsDocumentId` |
| `CONSUMER_INFORMATION` | `withdrawalDocumentId` | `legal.consumerDocumentId` |
| `PRIVACY_POLICY` | `privacyDocumentId` | `legal.privacyDocumentId` |

Legacy alias: `WITHDRAWAL_INFORMATION` → consumer slot (`withdrawalDocumentId`).

Generated documents use `BUNDLE_GENERATED_POINTER_FIELD` in the same module.

Source: `backend/src/modules/documents/booking-document-bundle-pointer.mapping.ts`

## Changed files

| File | Change |
|------|--------|
| `booking-document-bundle-pointer.mapping.ts` | Central type-safe mapping |
| `booking-document-bundle.errors.ts` | Controlled internal errors |
| `booking-document-bundle-monitoring.service.ts` | ALERT logging for mapping/resolver issues |
| `booking-document-bundle.service.ts` | Resolver-driven attach, idempotent pointers, extended DTO |
| `booking-document-missing-slots.util.ts` | Uses central mapping; privacy in org-missing check |
| `booking-document-phase.util.ts` | `PRIVACY_POLICY` in CONFIRMED phase |
| `documents.module.ts` | Registers monitoring service |
| `bookings.service.ts` | Uses `consumerAttached` with legacy fallback |
| `booking-document-bundle-pointer.mapping.spec.ts` | Mapping unit tests |
| `booking-document-bundle-legal-pointer.spec.ts` | Integration-style pointer tests |
| `documents.service.spec.ts` | Updated constructor mocks + privacy expectations |
| `booking-document-phase.util.spec.ts` | Privacy phase requirements |

## Error behaviour

| Condition | Behaviour |
|-----------|-----------|
| Unmapped `DocumentType` in `setBundlePointer` | `BookingDocumentBundlePointerMappingError` + `ALERT` via monitoring service |
| Resolver scope conflict | `BookingDocumentBundleResolverConflictError` + `ALERT` |
| Missing mandatory selection | WARN log; slot skipped (bundle stays PARTIAL) |
| Cross-org bundle access | `NotFoundException` (tenant isolation) |

No silent `if (!field) return` — unsupported types always surface.

## Historical stability

- Frozen bundle pointers (non-VOID `GeneratedDocument`) are never overwritten unless `force: true`.
- `attachLegalDocuments` snapshots concrete `OrganizationLegalDocument` version (language, checksum, `legalDocumentId`) — not re-selected ACTIVE on later runs.
- `ensureRentalContract` prefers frozen bundle pointers over resolver for legal refs in contract snapshot.
- `RentalContract.privacyDocumentId` now set alongside terms/consumer generated-document pointers.
- DB column `withdrawalDocumentId` unchanged for backward compatibility.

## Resolver integration (Prompt 8)

`LegalDocumentResolverService.resolveForBooking()` is the single selection path for legal attach. Resolver conflicts block attach; missing org templates degrade to PARTIAL with task/notification flows unchanged.

## Tests

Run:

```bash
cd backend && npm test -- --testPathPattern="booking-document-bundle|booking-document-phase|documents.service.spec"
```

Coverage:

- AGB → `termsDocumentId`
- Datenschutz → `privacyDocumentId`
- Verbraucherinformation → `withdrawalDocumentId`
- Idempotent repeat `setBundlePointer`
- Historical pointer not overwritten
- Unmapped type → error + monitoring
- Wrong org → `NotFoundException`
- Resolver conflict → error + monitoring
- STATIC_LEGAL snapshot language/checksum
