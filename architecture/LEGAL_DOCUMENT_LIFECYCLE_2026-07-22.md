# Legal Document Lifecycle — Architecture Record

**Date:** 2026-07-22  
**Prompt:** 4/32 (Production-Readiness — Verwaltung → Rechtliche Dokumente)

## Summary

Organization legal documents (`OrganizationLegalDocument`) use a controlled eight-state lifecycle instead of the legacy three-state model (`DRAFT | ACTIVE | ARCHIVED`).

All status mutations flow through `LegalDocumentsService` and `legal-document-lifecycle.transitions.ts`. Controllers must not perform direct Prisma status updates.

## State machine

```
DRAFT ──submit──► IN_REVIEW ──approve──► APPROVED ──schedule──► SCHEDULED
  │                  │                        │                      │
  │                  └──reject──► DRAFT       ├──activate──► ACTIVE ◄──activate──┘
  └──archive──► ARCHIVED      └──archive──► ARCHIVED         │
                                                              ├──supersede (system)──► SUPERSEDED ──archive──► ARCHIVED
                                                              └──revoke──► REVOKED ──archive──► ARCHIVED
```

Activation (`APPROVED`/`SCHEDULED` → `ACTIVE`) supersedes peer ACTIVE rows (`ACTIVE` → `SUPERSEDED`), preserving booking snapshots on `GeneratedDocument` pointers.

## Resolver (`getActiveByType`)

Returns at most one resolvable document per `documentType` where:

- `status = ACTIVE`
- validity window includes `now` (`validFrom` / `validUntil`)

Expired or not-yet-valid ACTIVE rows are excluded from bundle generation inputs.

## Database

Migration `20260722120000_legal_document_lifecycle`:

- Renames `active_from` → `activated_at`
- Adds audit/validity columns
- Remaps legacy archived-after-activation rows to `SUPERSEDED`

Partial unique index from Prompt 3 unchanged.

## Error codes

| Code | When |
|------|------|
| `LEGAL_DOCUMENT_ACTIVE_CONFLICT` | Race on single-ACTIVE invariant |
| `LEGAL_DOCUMENT_NOT_ACTIVATABLE` | `activate` from non-APPROVED/SCHEDULED |
| `LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION` | Matrix violation |

## References

- `docs/audits/legal-documents-lifecycle-2026-07.md`
- `backend/src/modules/documents/legal-document-lifecycle.transitions.ts`
