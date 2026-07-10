# Document Upload Page — Backend Lifecycle Wiring (2026-07-10)

## Frontend data flow

```
DocumentUploadView
  └─ useDocumentUploadPage(orgId, t)
       ├─ GET /document-extractions/metadata → doc types, AUTO, MIME, max size
       ├─ GET /organizations/:orgId/document-extractions → recent uploads (history)
       ├─ POST /vehicles/:id/document-extractions/upload (multipart, documentType=AUTO|manual)
       ├─ GET /vehicles/:id/document-extractions/:id (poll with 2s/5s/10s backoff)
       ├─ POST .../document-type | retry | confirm | cancel
       └─ GET .../download (authenticated blob preview)
```

## State truth

- **Server** owns status, `processingStage`, `allowedActions`, extracted/plausibility payloads.
- **Session storage** stores only `{ vehicleId, extractionId }` pointer for reload recovery.
- **No** `filedDocuments` local array; history sidebar reads org inbox API.

## Polling

- 0–20s: 2s interval
- 20–60s: 5s interval
- 60s+: 10s interval
- Stops on terminal statuses (`APPLIED`, `FAILED`, `READY_FOR_REVIEW`, `AWAITING_DOCUMENT_TYPE`, …)
- `AbortController` on unmount; no parallel in-flight polls

## UI states

Fine-grained flows (`ocr`, `classifying`, `awaiting_type`, …) map from `status` + `processingStage`.
Four-step stepper unchanged; stage detail shown in analysis panel.
