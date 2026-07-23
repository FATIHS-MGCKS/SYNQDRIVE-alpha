# Legal Document Permissions Architecture

**Date:** 2026-07-22  
**Prompt:** 10/32

## Enforcement stack

```
Request
  → AuthGuard (JWT)
  → OrgScopingGuard (tenant + membership ACTIVE)
  → RolesGuard (pass-through when no @Roles)
  → PermissionsGuard (@RequireLegalDocumentPermission → module+level)
  → LegalDocumentsService (+ LegalDocumentFourEyesService on approve/activate)
```

No client-declared permissions — only `OrganizationMembership.permissions` JSON validated against `PERMISSION_MODULE_KEYS`.

## Modules

- `legal-documents` — operational access (read/write/manage cascade)
- `legal-documents-audit` — lifecycle event log (read)

Action registry: `legal-document-permission.constants.ts`  
Decorator: `decorators/require-legal-document-permission.decorator.ts`

## Compatibility

| Actor | Behavior |
|-------|----------|
| `MASTER_ADMIN` | `PermissionsGuard` bypass (existing platform rule) |
| `ORG_ADMIN` membership | DB role bypass in `PermissionsGuard` |
| Custom roles | Explicit JSON flags per module |

## Four-eyes

Configurable per organization (`legalDocumentFourEyesEnabled`). Service-layer check in `LegalDocumentFourEyesService` — not bypassed by permission grants.

## Override handover

Permission `LEGAL_DOCUMENT_OVERRIDE_HANDOVER` is registered for future resolver/handover override APIs; no endpoint in Prompt 10.
