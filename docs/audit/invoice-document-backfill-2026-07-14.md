# Invoice ↔ Document Backfill (Controlled Repair)

**Status:** Implemented — dry-run default, apply requires explicit confirmation  
**Datum:** 2026-07-14  
**Audit:** [invoice-document-integrity-audit-2026-07-14.md](./invoice-document-integrity-audit-2026-07-14.md)  
**CLI:** `backend/scripts/ops/backfill-invoice-documents.ts`

---

## Purpose

Idempotent, org-scoped repair of **unambiguous** invoice↔`GeneratedDocument` links after running the read-only audit. Implements ADR M2 cache sync for safe cases only.

**Default: dry-run (no writes).**

---

## Invocation (local / staging only)

```bash
cd backend

# 1) Audit first
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts \
  --organization-id=<uuid> --out=/tmp/audit-before.json

# 2) Dry-run backfill (plan only)
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
  --organization-id=<uuid> --out=/tmp/backfill-dry.json

# 3) Apply (requires both flags)
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
  --organization-id=<uuid> --apply --confirm --out=/tmp/backfill-applied.json

# Resume large tenant
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
  --organization-id=<uuid> --checkpoint=/tmp/inv-doc-checkpoint.json --apply --confirm
```

### Flags

| Flag | Description |
|------|-------------|
| `--organization-id=<uuid>` | **Required** — one tenant per run |
| `--invoice-id=<uuid>` | Optional single-invoice scope |
| `--dry-run` | Default — plan only |
| `--apply --confirm` | Persist changes (both required) |
| `--batch-size=<n>` | Invoice batch (default 200) |
| `--transaction-size=<n>` | Actions per transaction (default 25) |
| `--checkpoint=<path>` | Resume / save cursor (`lastInvoiceId`) |
| `--out=<path>` | JSON result file |

---

## Result schema

```json
{
  "mode": "dry-run",
  "readOnly": true,
  "organizationId": "…",
  "durationMs": 142,
  "confirmed": false,
  "stats": {
    "checked": 120,
    "changed": 18,
    "skipped": 4,
    "manualReview": 3,
    "errors": 0,
    "alreadyCorrect": 42
  },
  "actions": [ "… planned/applied actions with before/after …" ],
  "skipped": [ "…" ],
  "auditLog": [ "…" ],
  "checkpoint": {
    "organizationId": "…",
    "lastInvoiceId": "…",
    "processedInvoices": 120,
    "updatedAt": "…"
  }
}
```

| Stat | Meaning |
|------|---------|
| `checked` | Invoices scanned in batch |
| `changed` | Actions applied (or would apply in dry-run) |
| `alreadyCorrect` | Planned action already satisfied in DB |
| `skipped` | Blocked (audit finding, missing doc, etc.) |
| `manualReview` | Skips tied to non-auto checkIds |
| `errors` | Transaction / conflict failures |

---

## Auto-repair cases

| # | Scenario | Action kind |
|---|----------|-------------|
| 1 | `document.invoiceId` set, cache empty | `sync_cache_from_document` |
| 2 | Cache valid, `document.invoiceId` null | `sync_invoice_id_from_cache` |
| 3 | Bundle pointer + unique invoice | `sync_from_bundle_pointer` + cache sync |
| 4 | Multiple versions, one unambiguous winner | `set_active_version` / `clear_stale_active_flags` |
| 5 | Missing `versionNumber` | `assign_version_numbers` (chronological) |

## Never auto-repaired

- `organization_mismatch`
- `multiple_active_candidates` (tie)
- `ambiguous_legacy_assignment`
- `document_completed_without_storage`
- `cache_document_missing` / `cache_document_invoice_mismatch`
- `duplicate_version_numbers`

Audit findings for these checkIds block entities via `buildAuditSkipKeys`.

---

## Safety mechanisms

1. **Dry-run default** — no `--apply --confirm` → zero writes  
2. **Org isolation** — `organizationId` required; cross-tenant actions rejected  
3. **Optimistic conflict checks** — apply verifies `before` state; throws on mismatch  
4. **Idempotency** — `isActionAlreadyApplied` skips satisfied rows  
5. **Batched transactions** — default 25 actions per `$transaction`  
6. **Checkpoint resume** — cursor on `lastInvoiceId` after each batch  
7. **Audit log** — every action/skip/error in `auditLog[]`  
8. **Pre-flight audit** — loads audit report to block manual-review entities  

---

## Suggested production workflow (do not run unreviewed)

> **Not executed by this implementation prompt.**

1. **Maintenance window** + `pg_dump` backup  
2. **Audit all tenants** (or one pilot org):
   ```bash
   npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts \
     --organization-id=<uuid> --out=/var/backups/audit-<org>-$(date +%F).json
   ```
3. **Review** critical/error findings — resolve `UNRECOVERABLE` / `MANUAL_REVIEW` manually  
4. **Dry-run backfill** on pilot org; compare `actions` count with audit warnings  
5. **Apply** on pilot org:
   ```bash
   DATABASE_URL=… npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
     --organization-id=<uuid> --apply --confirm \
     --checkpoint=/var/backups/backfill-<org>.checkpoint.json \
     --out=/var/backups/backfill-<org>-applied.json
   ```
6. **Re-audit** — expect `invoice_missing_active_pointer` ↓, no new criticals  
7. **Repeat** per organization; never batch multiple orgs in one apply run  
8. Optional VPS wrapper (future): `prod-backfill-invoice-documents.sh` reading `DATABASE_URL` from `/opt/synqdrive/shared/backend.env`

---

## Tests

```bash
cd backend && npm test -- invoice-document-backfill
```

Covers: idempotency, dry-run vs apply, transaction rollback, tenant isolation, conflict detection, planner cases.

---

## Changes / Architektur

- Extends audit tooling documented in `architecture/INVOICE_DOCUMENT_VERSIONS_SCHEMA_2026-07-14.md`
- Master UI Changes/Architektur: deferred (no frontend)
