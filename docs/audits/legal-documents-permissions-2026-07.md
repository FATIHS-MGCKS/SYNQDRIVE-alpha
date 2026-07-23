# Legal Documents — Dedicated Permissions (Prompt 10/32)

Date: 2026-07-22  
Branch: `cursor/legal-docs-permissions-28ca`

## Permission matrix

Membership JSON uses two modules (same pattern as payments):

| Stable code | Action key | Module | Level | Endpoints |
|-------------|------------|--------|-------|-----------|
| `LEGAL_DOCUMENT_VIEW` | `legal_documents.view` | `legal-documents` | read | `GET /`, `GET /:id`, `GET /:id/download` |
| `LEGAL_DOCUMENT_UPLOAD` | `legal_documents.upload` | `legal-documents` | write | `POST /upload` |
| `LEGAL_DOCUMENT_SUBMIT_REVIEW` | `legal_documents.submit_review` | `legal-documents` | write | `POST /:id/submit-for-review` |
| `LEGAL_DOCUMENT_SUBMIT_REVIEW` | `legal_documents.schedule` | `legal-documents` | write | `POST /:id/schedule` |
| `LEGAL_DOCUMENT_SUBMIT_REVIEW` | `legal_documents.manage_scope` | `legal-documents` | write | `PATCH /:id/application-scope` |
| `LEGAL_DOCUMENT_ARCHIVE` | `legal_documents.archive` | `legal-documents` | write | `POST /:id/archive` |
| `LEGAL_DOCUMENT_APPROVE` | `legal_documents.approve` | `legal-documents` | manage | `POST /:id/approve` |
| `LEGAL_DOCUMENT_ACTIVATE` | `legal_documents.activate` | `legal-documents` | manage | `POST /:id/activate` |
| `LEGAL_DOCUMENT_REVOKE` | `legal_documents.revoke` | `legal-documents` | manage | `POST /:id/revoke` |
| `LEGAL_DOCUMENT_AUDIT_VIEW` | `legal_documents.audit_view` | `legal-documents-audit` | read | `GET /events`, `GET /:id/events` |
| `LEGAL_DOCUMENT_OVERRIDE_HANDOVER` | `legal_documents.override_handover` | `legal-documents` | manage | Reserved — no HTTP surface yet |

**Separation uploader vs approver:** `write` (upload/prepare/archive) vs `manage` (approve/activate/revoke).

## Default role mapping

| Template | `legal-documents` | `legal-documents-audit` |
|----------|-------------------|-------------------------|
| Org Admin | read/write/manage | read |
| Sub Admin | read only | read |
| Accounting | read only | read |
| Read-only | read only | read |
| Employee / Driver / Field / Service / Disposition / Station | read only (viewer) | — |

`ORG_ADMIN` and `MASTER_ADMIN` retain full access via existing `PermissionsGuard` bypass rules (unchanged).

## Four-eyes rule

- Org flag: `Organization.legalDocumentFourEyesEnabled` (default `false`)
- Migration: `20260722160000_legal_document_permissions`
- When enabled, `approve` blocks actor if same as `uploadedByUserId` or `submittedForReviewByUserId`
- When enabled, `activate` blocks actor if same as `uploadedByUserId`
- Error: HTTP 403 `LEGAL_DOCUMENT_FOUR_EYES_VIOLATION`

## Guards

```typescript
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
@RequireLegalDocumentPermission('legal_documents.view')
```

Coarse `@Roles('ORG_ADMIN')` removed from mutations — capabilities are permission-driven.

## Backfill

Existing system role templates:

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/backfill-legal-document-permissions.ts
```

## Tests

```
npm test -- --testPathPattern='legal-document|documents.service.spec'
→ 22 suites, 186 tests passed
```

New: characterization, enforcement negatives, defaults matrix, four-eyes service specs.

## Frontend (supplementary)

`LegalDocumentsTab` uses `hasPermission('legal-documents', read|write|manage)` for button visibility only — security remains server-side.
