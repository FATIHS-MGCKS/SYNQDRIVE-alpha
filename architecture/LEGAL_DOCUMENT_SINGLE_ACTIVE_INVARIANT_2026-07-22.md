# Legal Document Single-ACTIVE Invariant (2026-07-22)

> Prompt 3/32. Detail: [`docs/audits/legal-documents-single-active-invariant-2026-07.md`](../docs/audits/legal-documents-single-active-invariant-2026-07.md)

## Changes

- Migration `20260722110000_legal_document_single_active_invariant`:
  - Repair log table `organization_legal_document_repair_log`
  - Deterministic dedup of duplicate ACTIVE rows (archive losers)
  - Partial unique index `organization_legal_documents_single_active_key`
- `LegalDocumentsService.activate`: transactional, idempotent for sole ACTIVE,
  maps Prisma `P2002` to HTTP 409 `LEGAL_DOCUMENT_ACTIVE_CONFLICT`
- `legal-documents.errors.ts`, `legal-documents-prisma.util.ts`
- Integration tests: `legal-documents-activation.integration.spec.ts`

## Architektur

- DB enforces at most one ACTIVE legal version per `(org, documentType, language)`.
- Application activate path aligns with index; concurrent losers get structured 409.
