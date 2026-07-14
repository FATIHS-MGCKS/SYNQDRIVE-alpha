# Invoice ↔ Document Integrity Audit

**Status:** Read-only diagnostic tool (no data mutations)  
**Datum:** 2026-07-14  
**Code:** `backend/scripts/ops/audit-invoice-documents.ts`  
**Service:** `backend/src/modules/invoices/invoice-document-integrity-audit.service.ts`  
**ADR:** [INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md](../../architecture/INVOICE_GENERATED_DOCUMENT_RELATION_ADR_2026-07-14.md)

---

## Purpose

Organizations-wise read-only scan of `OrgInvoice`, `GeneratedDocument`, and `BookingDocumentBundle` rows to surface invoice↔document inconsistencies before backfill or cache-sync work (ADR M2).

**This tool never writes to the database.**

---

## Invocation

```bash
cd backend

# All organizations (batched, default limit 250 findings/org)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts

# Single tenant
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a

# Single invoice + JSON file output
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --invoice-id=e9f0a1b2-4444-4555-8666-777788889999 \
  --out=/tmp/invoice-doc-audit.json

# Large tenant: raise batch window, cap findings
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts \
  --organization-id=<uuid> --batch-size=2000 --limit=500

# CI / automation: non-zero exit on critical/error findings
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts \
  --organization-id=<uuid> --fail-on-critical --quiet --out=/tmp/audit.json
```

### Flags

| Flag | Description |
|------|-------------|
| `--organization-id=<uuid>` | Limit scan to one tenant |
| `--invoice-id=<uuid>` | Limit invoices (and related docs) |
| `--limit=<n>` | Max findings per org in report (default `250`) |
| `--batch-size=<n>` | Max rows loaded per entity type per org (default `500`) |
| `--out=<path>` | Write JSON to file; otherwise stdout |
| `--quiet` | Suppress human summary on stderr |
| `--fail-on-critical` | Exit `2` on critical findings; exit `2` on errors, `1` on warnings |
| `--exit-zero` | Always exit `0` (report only) |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No findings above threshold, or `--exit-zero` |
| `1` | Warnings only |
| `2` | Critical or error-level findings (`--fail-on-critical` default when not `--exit-zero`) |

---

## Example output

### Human summary (stderr)

```
Invoice Document Integrity Audit (read-only)
Organizations: 1 | Invoices: 42 | Documents: 38 | Bundles: 15
Findings: 7 (critical: 0, errors: 0, warnings: 7, info: 0)

Org faa710c9…
  booking_invoice_without_document: 5 (MANUAL_REVIEW)
  invoice_missing_active_pointer: 2 (AUTO_FIX_SAFE)

Full entity IDs are available in the JSON output only.
```

### JSON (stdout / `--out`)

```json
{
  "mode": "audit",
  "readOnly": true,
  "generatedAt": "2026-07-14T20:35:00.000Z",
  "filters": { "organizationId": "faa710c9-6d91-4079-a7d5-91fdccdec14a" },
  "organizationsScanned": 1,
  "entitiesScanned": { "invoices": 42, "documents": 38, "bundles": 15 },
  "summary": {
    "totalFindings": 7,
    "critical": 0,
    "errors": 0,
    "warnings": 7,
    "infos": 0,
    "byCheckId": {
      "booking_invoice_without_document": 5,
      "invoice_missing_active_pointer": 2
    },
    "byRepairClass": {
      "MANUAL_REVIEW": 5,
      "AUTO_FIX_SAFE": 2
    }
  },
  "organizations": [
    {
      "organizationId": "faa710c9-6d91-4079-a7d5-91fdccdec14a",
      "countsByCheck": { "invoice_missing_active_pointer": 2 },
      "countsByRepairClass": { "AUTO_FIX_SAFE": 2 },
      "truncated": false,
      "findings": [
        {
          "checkId": "invoice_missing_active_pointer",
          "severity": "warning",
          "repairClass": "AUTO_FIX_SAFE",
          "organizationId": "faa710c9-6d91-4079-a7d5-91fdccdec14a",
          "message": "Linked document exists but invoice cache is empty or stale",
          "entityType": "GeneratedDocument",
          "entityId": "a1b2c3d4-6666-4777-8888-999900001111",
          "relatedIds": {
            "invoiceId": "e9f0a1b2-4444-4555-8666-777788889999",
            "invoiceGeneratedDocumentId": null
          }
        }
      ]
    }
  ]
}
```

Entity IDs appear **only** in JSON — not in the human summary.

---

## Checks (14)

| # | `checkId` | Severity | Repair class |
|---|-----------|----------|--------------|
| 1 | `cache_document_missing` | critical | AUTO_FIX_SAFE |
| 2 | `cache_document_invoice_mismatch` | error | AUTO_FIX_WITH_RULE |
| 3 | `invoice_missing_active_pointer` | warning | AUTO_FIX_SAFE |
| 4 | `multiple_active_documents` | error | MANUAL_REVIEW |
| 5 | `duplicate_version_numbers` | error | MANUAL_REVIEW |
| 6 | `invoice_doc_without_invoice_link` | warning | AUTO_FIX_WITH_RULE |
| 7 | `orphan_invoice_id_on_document` | critical | AUTO_FIX_SAFE |
| 8 | `organization_mismatch` | critical | UNRECOVERABLE |
| 9 | `bundle_doc_not_linked_to_invoice` | warning | AUTO_FIX_WITH_RULE |
| 10 | `booking_invoice_without_document` | warning | MANUAL_REVIEW |
| 11 | `document_completed_without_storage` | error | MANUAL_REVIEW |
| 12 | `document_file_with_bad_status` | info | AUTO_FIX_WITH_RULE |
| 13 | `multiple_active_candidates` | warning | AUTO_FIX_WITH_RULE |
| 14 | `ambiguous_legacy_assignment` | warning | MANUAL_REVIEW |

---

## Safety mechanisms

1. **Read-only service** — no `create`/`update`/`delete` Prisma calls.
2. **No file I/O on storage** — only metadata (`objectKey` presence), never PDF bytes or snapshots.
3. **No snapshot/metadata JSON** in output — only IDs, statuses, counts.
4. **Batched queries** — `--batch-size` caps rows per org to avoid unbounded memory.
5. **Finding cap** — `--limit` prevents huge JSON payloads.
6. **Lean Nest module** — `InvoiceDocumentAuditCliModule` (Prisma only), no side-effect workers.
7. **Production caution** — use dev/staging `DATABASE_URL`; document runs before M2 backfill.

---

## Known non-unique / manual cases

| Scenario | Why not auto-fixable |
|----------|----------------------|
| Duplicate `OUTGOING_BOOKING` invoices per booking | Requires `BookingInvoiceLifecycleService.resolveCanonicalBookingInvoice` + business decision which invoice keeps the PDF |
| `ambiguous_legacy_assignment` | Multiple live invoices share booking + document type; doc has `bookingId` but no `invoiceId` |
| `organization_mismatch` (cross-tenant IDs) | Data corruption — needs manual investigation |
| `document_file_with_bad_status` (VOID + file kept) | May be intentional history retention after regenerate |
| `booking_invoice_without_document` for `OUTGOING_MANUAL` | No standard PDF generator — finding only applies to `OUTGOING_BOOKING` / `OUTGOING_FINAL` |
| Orphan `invoiceId` on document when invoice was hard-deleted | FK SET NULL may not have run yet; repair must decide clear vs re-link |

---

## Tests

```bash
cd backend && npm test -- invoice-document-integrity-audit.spec.ts
```

Uses in-memory fixtures (`invoice-baseline.fixtures.ts`) — **no database required**.

---

## Changes / Architektur

- Architecture record: this document + `architecture/INVOICE_DOCUMENT_VERSIONS_SCHEMA_2026-07-14.md`
- Master UI `ChangesView` / `ArchitekturView`: deferred (no frontend changes in this task)
