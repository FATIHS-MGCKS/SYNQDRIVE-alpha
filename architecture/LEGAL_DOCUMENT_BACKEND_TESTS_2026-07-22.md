# Legal Documents — Backend Test Coverage (Prompt 30)

**Version:** V4.9.769 (Prompt 30/32)  
**Date:** 2026-07-22

## Scope

Comprehensive backend test coverage and security negative tests for the legal-document process (`Verwaltung → Rechtliche Dokumente`).

## Architecture

### Test layers

```
┌─────────────────────────────────────────────────────────────┐
│  legal-documents-security-negative.spec.ts (22 negatives)   │
│  Real LegalDocumentsService + harness + domain services   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  In-memory integration harnesses                          │
│  activation, lifecycle-events, pickup-gate, delivery      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL invariants (gated)                            │
│  LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 + DATABASE_URL      │
│  testing/legal-documents-postgres.integration.harness.ts    │
└─────────────────────────────────────────────────────────────┘
```

### Verify pipeline

`backend/scripts/test/legal-documents-backend-verify.sh`:

1. Unit + harness tests (`test:legal-documents`)
2. Security negative matrix
3. Integration harness suites
4. Optional PostgreSQL invariants
5. Prisma validate + typecheck

### Test factory

`integrity/legal-document-integrity.test-utils.ts` — `createLegalDocumentsServiceForTests` with noop stubs for:

- checksum verification, integrity persistence
- retention policy (`resolveClassPolicy`)
- operational notifications

### Critical invariants (PostgreSQL)

Must be verified against real PostgreSQL when `LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1`:

- Tenant isolation (`organizationId` scoping)
- Audit event org scoping
- Legal hold vs deletion eligibility
- Delivery evidence `(organizationId, requestId)` uniqueness
- Organization cascade delete

## References

- `docs/audits/legal-documents-backend-tests-2026-07.md` — full inventory and results
- `legal-documents-security-negative.spec.ts`
- `testing/legal-documents-postgres.invariants.integration.spec.ts`
