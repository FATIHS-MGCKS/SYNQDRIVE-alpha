# Legal Documents — Rental Contract Snapshot Audit (Prompt 17/32)

**Date:** 2026-07-22  
**Scope:** Immutable legal reference snapshot on `RentalContract` for verification-grade auditability.

## Problem

Rental contracts previously stored only minimal legal metadata (`id`, `versionLabel`) in the render snapshot. Datenschutzhinweise were included in rendering but not with the same verification metadata as AGB/Verbraucherinformation. Version selection used `findFirst` fallbacks that could diverge from bundle frozen pointers.

## Solution

### Schema

`rental_contracts` additive columns:

| Column | Type | Purpose |
|--------|------|---------|
| `legal_refs_snapshot` | JSONB | Verification-grade frozen refs (schema v1) |
| `legal_snapshot_frozen_at` | TIMESTAMPTZ | Immutability marker |

Each ref stores: `generatedDocumentId`, `legalDocumentId`, `documentType`, `legalVariant`, `versionLabel`, `language`, `jurisdictionCountry`, `checksum`, `validFrom`/`validUntil`, `validAtContractTime`, `snapshotAt`, `resolverVersion`, `selectionReason`.

### Services

- `RentalContractLegalSnapshotService` — resolver + bundle pointer resolution (no `findFirst` version picking)
- `RentalContractService` — contract read model + download context with tenant checks
- `BookingDocumentBundleService.ensureRentalContract` — delegates snapshot freeze on first generation

### API

- `GET /organizations/:orgId/bookings/:bookingId/rental-contract` — contract + frozen snapshot
- `GET /organizations/:orgId/bookings/:bookingId/rental-contract/download` — serves frozen `generatedDocumentId` PDF

### Guarantees

1. Later activation of new legal versions does not alter frozen contracts
2. Archival/revocation does not delete historical snapshot JSON (FK `onDelete: SetNull` on pointers only)
3. Contract generation uses central `LegalDocumentResolverService` exclusively
4. Missing mandatory texts → `RentalContractMissingMandatoryLegalTextError`
5. Privacy treated equal to AGB + Verbraucherinformation
6. All pointers validated for org + booking alignment

## Long-term verification (years later)

1. Load `rental_contracts.legal_refs_snapshot` for the booking
2. For each ref, verify `checksum` against stored legal PDF (`organization_legal_documents` or `generated_documents` if still present)
3. Confirm `legalDocumentId` + `versionLabel` + `validAtContractTime` match contract `legal_snapshot_frozen_at`
4. Download contract PDF via frozen `generatedDocumentId` (never regenerated)
5. Cross-check `organizationId` + `bookingId` on snapshot envelope

Reconciliation tooling from Prompt 14 can verify checksum drift on still-existing legal rows; snapshot JSON remains authoritative when source rows are archived.

## Tests

`rental-contract-legal-snapshot.service.spec.ts`:

- Snapshot build from bundle pointers
- Historical stability (frozen contract ignores new resolver selection)
- Missing mandatory texts (structured error)
- Tenant negative tests
- Privacy parity with AGB/consumer info
- Download context uses frozen generated document
