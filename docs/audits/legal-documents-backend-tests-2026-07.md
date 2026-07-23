# Legal Documents — Backend Test Coverage & Security Negatives (Prompt 30/32)

Audit date: 2026-07-22

## Summary

Backend test coverage for the full legal-document process (`Verwaltung → Rechtliche Dokumente`) was consolidated and extended with:

- **22 security negative tests** in `legal-documents-security-negative.spec.ts`
- **7 PostgreSQL invariant tests** (gated: `LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1` + `DATABASE_URL`)
- Unified verify script: `backend/scripts/test/legal-documents-backend-verify.sh`
- npm scripts: `test:legal-documents`, `test:legal-documents:security`, `test:legal-documents:integration`, `test:legal-documents:postgres`, `test:legal-documents:verify`

Supporting fixes: test factory stubs for new service dependencies (retention policy, operational notifications), harness `integrityStatus` fields, import path correction in bundle monitoring.

---

## Test inventory (46 suites / 358 tests + 7 gated PG)

| Group | File(s) | Focus |
|-------|---------|-------|
| **Security negatives** | `legal-documents-security-negative.spec.ts` | Tenant isolation, four-eyes, lifecycle, scan, integrity, idempotency, resolver conflict, pickup gate |
| **PostgreSQL invariants** | `testing/legal-documents-postgres.invariants.integration.spec.ts` | Real DB tenant isolation, audit scoping, legal hold, delivery evidence uniqueness, cascade delete |
| **Activation concurrency** | `legal-documents-activation.integration.spec.ts` | Parallel activation, single ACTIVE invariant, cross-org |
| **Lifecycle events** | `legal-documents-lifecycle-events.integration.spec.ts` | Append-only audit chain |
| **Scan gating** | `legal-documents-scan-gating.spec.ts` | Malware/PDF scan blocking |
| **Tenant scoping** | `legal-documents-tenant.spec.ts` | getDetail/list org filter |
| **Permissions** | `legal-documents.permissions.*.spec.ts` | All legal-documents.* permission gates |
| **Four-eyes** | `legal-document-four-eyes.service.spec.ts` | Separation of duties |
| **Lifecycle transitions** | `legal-document-lifecycle.transitions.spec.ts` | State machine matrix |
| **Resolver engine** | `legal-document-resolver.engine.spec.ts` | Language, jurisdiction, B2B/B2C, conflicts |
| **Bundle completeness** | `booking-document-completeness.engine.spec.ts` | Mandatory slots, privacy pointer |
| **Bundle pointers** | `booking-document-bundle-legal-pointer.spec.ts` | Privacy/terms/consumer mapping |
| **Pickup gate** | `booking-pickup-gate.integration.spec.ts` | Bundle gate, override audit, cross-tenant |
| **Delivery evidence** | `legal-document-delivery-evidence.service.spec.ts` | Zustellnachweise, idempotency, email lifecycle |
| **Contract snapshots** | `rental-contract-legal-snapshot.service.spec.ts` | Immutable legal refs |
| **Integrity / checksum** | `legal-document-checksum-verification.service.spec.ts` | Hash verification |
| **Reconciliation** | `legal-document-storage-reconciliation.service.spec.ts` | Storage drift, missing objects |
| **Retention / legal hold** | `legal-document-retention.service.spec.ts` | Purge eligibility, hold blocks |
| **Malware scan** | `legal-document-malware-scan.service.spec.ts` | Scanner adapter, failed state |
| **PDF validation** | `legal-document-pdf-validation.service.spec.ts` | Upload validation |
| **Storage contract** | `document-storage.contract.spec.ts` | Path traversal, checksums, adapters (local + S3 in-memory) |
| **Generation queue** | `booking-document-generation.service.spec.ts` | Idempotency, retry, FAILED_FINAL |
| **Operational notifications** | `legal-document-operational-notification.*.spec.ts` | Dedup, severity, matrix derivation |
| **Controller / DTO / API** | `legal-documents.controller.spec.ts`, `dto/*.spec.ts` | Wiring, validation |

---

## Executed test groups (this run)

```bash
cd backend && npm run test:legal-documents
# Result: 46 suites passed, 358 tests passed

cd backend && npm run test:legal-documents:security
# Result: 1 suite passed, 22 tests passed

cd backend && npm test -- legal-documents-postgres.invariants.integration
# Result: 7 tests skipped (no DATABASE_URL / LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1)
```

---

## Security negative matrix (22 tests)

| Scenario | Test |
|----------|------|
| Manipulated `organizationId` | `rejects manipulated organizationId on getDetail` |
| Foreign `documentId` | `rejects foreign documentId on lifecycle mutation` |
| Foreign `bookingId` | `rejects foreign bookingId on delivery evidence list` |
| Forged MIME type | `rejects forged MIME type when ingestion detects non-PDF` |
| Path traversal | `rejects path traversal in original filename via storage adapter` |
| Manipulated actor (four-eyes approve) | `blocks uploader from approving own document` |
| Manipulated actor (four-eyes activate) | `blocks uploader from activating own document` |
| Illegal status change | `rejects illegal status transition DRAFT → ACTIVE` |
| Revoked document | `rejects activation of revoked document` |
| Illegal archive | `rejects direct archive from ACTIVE` |
| Manipulated client timestamp | `rejects manipulated client schedule timestamp` |
| Unknown scan status | `rejects activation with unknown scan status` |
| Unauthorized download (tenant) | `blocks download for foreign-tenant document` |
| Hash mismatch | `blocks download on hash mismatch when verify-on-download is enabled` |
| Missing storage object | `blocks download when storage object is missing` |
| Duplicate request | `returns existing row on duplicate requestId` |
| Foreign evidence id | `rejects evidence mutation for foreign-tenant evidence id` |
| Resolver conflict | `surfaces scope conflict when two equal-priority ACTIVE candidates match` |
| Pickup gate cross-tenant | `blocks pickup when booking belongs to another organization` |
| Parallel activation | `returns ACTIVE_CONFLICT when two versions activate concurrently` |
| Foreign audit | `rejects audit access for foreign-tenant document` |
| Integrity blocking | `blocks download when integrity status is blocking` |

---

## Critical invariants (PostgreSQL — gated)

| Invariant | Verification |
|-----------|--------------|
| Tenant isolation at query layer | `findFirst` with wrong `organizationId` returns null |
| List scoping | `findMany` never crosses org boundary |
| Append-only audit org scope | Events written and listed only for owning org |
| Audit service guard | `listForDocument` → 404 for foreign doc |
| Legal hold blocks purge selection | Held docs excluded from `deletionEligibleAt` query |
| Delivery evidence idempotency | Unique `(organizationId, requestId)` enforced (P2002) |
| Org cascade delete | Legal documents removed with organization |

Enable: `LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 DATABASE_URL=... npm run test:legal-documents:postgres`

---

## Coverage notes

- Tests use **real service logic** with in-memory transaction harnesses (`legal-documents-activation.integration.harness.ts`) — not full happy-path mocks.
- Storage adapter tests use real `LocalDocumentStorageService` + in-memory S3 operations.
- Malware/PDF validation tested via dedicated service specs with fixture buffers.
- Queue idempotency/retry/FAILED_FINAL covered in `booking-document-generation.service.spec.ts`.
- Permission matrix covers all `legal_documents.*` requirements via characterization + enforcement specs.

---

## Remaining gaps

| Gap | Reason / mitigation |
|-----|---------------------|
| PostgreSQL invariants not run in CI without `DATABASE_URL` | Gated by design; run locally via `infra:up` + env flag |
| End-to-end HTTP layer | Covered by controller specs; full e2e not in scope |
| Live malware scanner | Mocked in unit tests; production scanner health via ops hooks |
| Email provider delivery | Outbound webhook bridge unit-tested; no live Resend in tests |
| Multi-region S3 | In-memory S3 contract tests only |

---

## Test results (2026-07-22)

| Command | Suites | Tests | Status |
|---------|--------|-------|--------|
| `npm run test:legal-documents` | 46 | 358 | ✅ PASS |
| `npm run test:legal-documents:security` | 1 | 22 | ✅ PASS |
| `npm run test:legal-documents:postgres` (no DB) | 1 | 7 skipped | ⏭ SKIP (expected) |

---

## How to run

```bash
cd backend
npm run test:legal-documents:verify          # full verify (unit + security + integration + prisma validate + typecheck)
npm run test:legal-documents:verify:unit     # unit only
LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 npm run test:legal-documents:postgres  # requires DATABASE_URL
```
