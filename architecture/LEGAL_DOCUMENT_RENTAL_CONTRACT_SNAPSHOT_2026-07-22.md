# Rental Contract Legal Snapshot — Architecture (2026-07-22)

## Context

Prompt 17/32 freezes verification-grade legal document references on each rental contract at generation time.

## Signal flow

```
BookingDocumentBundleService.generateInitialBundle
  → attachLegalDocuments (resolver + bundle pointers)
  → ensureRentalContract
    → RentalContractService.resolveLegalRefsForGeneration
      → RentalContractLegalSnapshotService.resolveMandatoryLegalRefs
        → LegalDocumentResolverService.resolveForBooking (mandatory types only)
        → bundlePointerValue (exact GeneratedDocument IDs — no findFirst)
    → render PDF + freeze legalRefsSnapshot + legalSnapshotFrozenAt
```

## Immutability rules

| State | Behavior |
|-------|----------|
| `legalSnapshotFrozenAt` set | Snapshot JSON never overwritten; refs read from snapshot |
| New ACTIVE legal version | Old contracts unchanged |
| Legal doc archived/revoked | Snapshot JSON preserved; FK pointers may null via SetNull |
| `force` regenerate contract PDF | Re-renders using frozen refs; snapshot unchanged |

## Snapshot schema (v1)

```typescript
RentalContractLegalRefsSnapshot {
  schemaVersion: 1
  organizationId, bookingId, frozenAt, resolverVersion
  refs: RentalContractLegalRefSnapshot[]  // TERMS, CONSUMER, PRIVACY
}
```

## Download path

```
GET …/bookings/:bookingId/rental-contract/download
  → RentalContractService.getDownloadContext (tenant scope check)
  → GeneratedDocumentsService.getDownload(frozen generatedDocumentId)
```

Serves stored PDF only — no silent regeneration.

## Error contract

| Code | When |
|------|------|
| `RENTAL_CONTRACT_MISSING_MANDATORY_LEGAL_TEXT` | Resolver/bundle missing AGB, Verbraucher, or Datenschutz |
| `RENTAL_CONTRACT_LEGAL_RESOLVER_CONFLICT` | Scope conflict at contract time |
| `RENTAL_CONTRACT_TENANT_MISMATCH` | Pointer org/booking mismatch |
| `RENTAL_CONTRACT_GENERATED_DOCUMENT_MISSING` | Bundle pointer invalid |

## Related

- Prompt 8: `LegalDocumentResolverService`
- Prompt 15: `booking-document-bundle-pointer.mapping.ts`
- Prompt 16: `BookingDocumentCompletenessService`
- `docs/audits/legal-documents-rental-contract-snapshot-2026-07.md`
