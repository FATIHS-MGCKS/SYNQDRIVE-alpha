# Document Org-Wide Upload Endpoint (V4.9.625)

**Date:** 2026-07-17  
**Prompt:** 50/84 — Canonical organization upload without required vehicle

## Endpoint

`POST /organizations/:orgId/document-extractions/upload`

Multipart fields:

| Field | Required | Default |
|-------|----------|---------|
| `file` | yes | — |
| `requestedDocumentType` | no | `AUTO` |
| `optionalContextType` | no | — |
| `optionalContextId` | no | — |
| `reuploadReason`, `relatedExtractionId`, hints | no | — |

Guards: `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`, `DOCUMENT_UPLOAD` write.

## Flow

```text
OrgScopingGuard → createFromOrgUpload(organizationId from route)
  → DocumentUploadContextService.resolveUploadTarget
  → identify/hash/duplicate/rate-limit (tenant-scoped)
  → vehicleDocumentExtraction.create (vehicleId nullable)
  → storage (inbox or vehicle path)
  → malware scan → enqueue (vehicleId nullable in job)
```

Vehicle compatibility:

`POST /vehicles/:vehicleId/document-extractions/upload` → `createFromUpload` → delegates to `createFromOrgUpload` with explicit `vehicleId`.

## Context resolution

| Input | Result |
|-------|--------|
| No context | `vehicleId=null`, storage `organizations/{org}/inbox/documents/...` |
| `optionalContextType=VEHICLE` + id | Assert vehicle in org → `vehicleId=contextId`, vehicle storage path |
| Vehicle route | `vehicleId` param, context `VEHICLE` |

Cross-tenant vehicle → `404 Vehicle not found` (no leak).

## Schema

- `vehicle_document_extractions.vehicle_id` nullable
- `upload_context_type`, `upload_context_id` optional metadata

## Rules preserved

- No automatic entity confirmation
- AUTO default classification request
- Queue job includes `organizationId` for tenant safety
- Confirm/apply still require vehicle assignment (vehicle-scoped confirm or reassign first)

## Tests

- `document-extraction-upload-org.spec.ts`
- `document-upload-context.service.spec.ts`
