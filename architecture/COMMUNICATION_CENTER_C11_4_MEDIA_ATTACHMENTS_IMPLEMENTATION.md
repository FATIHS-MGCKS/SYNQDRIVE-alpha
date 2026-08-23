# Communication Center C11.4 — Media Attachments Implementation

**Phase:** C11.4  
**Status:** Implemented (draft PR)  
**Depends on:** C11.2 send safety, C11.3 ownership, C7/C7.2 canonical content, C8.3 timeline

## 1. Scope

V1 outbound media for **WhatsApp IMAGE + DOCUMENT** only (one attachment per reply, optional caption).

- Canonical upload/storage/download via SynqDrive backend
- Extended durable reply idempotency (`payloadHash`)
- Inbound WhatsApp image/document webhook ingestion + secure storage
- Timeline media rendering from canonical attachment summaries
- Composer attachment UX (paperclip, preview tile, upload progress)

**Out of scope:** SMS MMS, voice media, multi-attachment batching, AI/OCR, virus scanning architecture, sticker picker, email attachments.

## 2. Existing media audit (pre-C11.4)

| Area | Finding |
|------|---------|
| Inbound WhatsApp | Webhook parsed **text only**; image/document dropped |
| Outbound WhatsApp | `sendTextMessage` only; no Meta media upload |
| Canonical content | C7.2 supports IMAGE/DOCUMENT types + `hasAttachments`; no binary identity |
| Storage | `DocumentStoragePort` / `DOCUMENTS_STORAGE` (private object storage) |
| Frontend timeline | Semantic labels only ("Image", "Document"); no secure retrieval |

## 3. Supported media matrix

| Channel | Outbound TEXT | Outbound IMAGE | Outbound DOCUMENT | Inbound IMAGE/DOCUMENT |
|---------|---------------|----------------|-------------------|------------------------|
| WhatsApp | Yes | Yes | Yes | Yes (stored + timeline) |
| SMS | Yes (if configured) | No | No | N/A |
| Voice | No | No | No | N/A |

## 4. Storage authority

Reuses **`DocumentStoragePort`** (`DOCUMENTS_STORAGE`) with document type `COMMUNICATION_MEDIA`.

- Org-scoped object keys (generated; never user filename)
- Conversation-bound `CommunicationAttachment` records
- No public bucket URLs; no Meta media URLs in frontend DTOs

## 5. Canonical attachment model

`CommunicationAttachment` (Prisma):

- `organizationId`, `conversationId` (required at creation)
- `mediaType`: IMAGE | DOCUMENT
- `state`: UPLOADING | READY | FAILED
- `fileName`, `mimeType`, `sizeBytes`, `contentHash`, `objectKey`
- `nativeMessageId`, `sealedAt` (immutable after send / inbound ingest)
- `uploaderUserId` optional (outbound operator uploads; inbound null)

## 6. Attachment lifecycle

| State | Meaning |
|-------|---------|
| UPLOADING | Reserved for future streaming upload (outbound creates READY directly after validation) |
| READY | Validated bytes stored; eligible for reply reference |
| FAILED | Upload/validation failure |

Provider send state remains on `CommunicationReplyCommand` / native `WhatsAppMessage` — not conflated with storage state.

## 7. Upload API

`POST /organizations/:orgId/communication/conversations/:conversationId/attachments`

- `multipart/form-data` field `file`
- RBAC: `communication.write` + conversation mutable (C11.3)
- Response: safe `CommunicationAttachmentDto` (no storage keys / provider IDs)

## 8. Validation / security

- Allowlist MIME: JPEG, PNG, WebP, PDF
- Magic-byte validation (`assertBufferMatchesMime`)
- Max size: **5 MB** images, **16 MB** documents
- Filename sanitized via `sanitizeAttachmentFileName` (strip path/control chars)
- No SVG/HTML outbound
- Download: `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`

## 9. Download / access model

`GET /organizations/:orgId/communication/attachments/:attachmentId/content`

- RBAC: `communication.read` + conversation readable + station scope
- Streams via authenticated proxy (not permanent public URL)
- Images: `Content-Disposition: inline` when safe; documents: attachment

## 10. Reply DTO extension

```json
{
  "text": "optional caption",
  "attachmentId": "uuid",
  "contentType": "IMAGE | DOCUMENT",
  "idempotencyKey": "client-key"
}
```

V1: **one attachment** OR text-only. Caption allowed when provider supports (WhatsApp image/document).

## 11. Idempotency payload

`payloadHash = SHA-256(JSON.stringify({ contentType, text, attachmentId }))`

Same key + different hash → `IDEMPOTENCY_CONFLICT`. Same key + same hash → replay prior result.

## 12. WhatsApp provider media

1. Upload bytes to Meta → `providerMediaId` (persisted on native message)
2. Atomic `providerDispatchStartedAt` claim
3. Send customer message referencing media ID
4. Reuse `providerMediaId` on retry when present

Media upload failure before dispatch claim: safe retry with new logical attempt. Dispatch ambiguity after claim: `SEND_UNKNOWN` (C11.2 invariant).

## 13. Inbound media

Webhook parses `image` / `document` types → downloads via Meta Graph (backend-only token) → stores attachment linked to canonical conversation → projects canonical MESSAGE_RECEIVED with media content type.

Storage failure: message still projected; timeline shows unavailable attachment fallback.

## 14. Read API

`CommunicationMessageContentDto.attachments[]` — safe summaries only (`id`, `fileName`, `mimeType`, `sizeBytes`, `mediaType`), resolved by `nativeMessageId` batch lookup.

## 15. Frontend

- `useCommunicationAttachmentDraft` — org/conversation signature guards
- `CommunicationComposer` — paperclip, preview tile, send disabled while uploading
- `CommunicationMediaContent` — timeline image preview / document download tile
- `communicationClient.uploadAttachment` + `attachmentContentUrl`

## 16. Tests

- Backend: validation, payload hash, reply service idempotency, Meta webhook parse (image/document)
- Frontend: attachment draft race + ready state
- PostgreSQL: existing C11.2 reply suite extended with attachment service wiring

## 17. Known limitations

- No orphan upload cleanup worker (documented; READY unattached attachments may persist until future TTL job)
- No EXIF stripping (metadata may remain in stored images)
- No malware scanning (MIME allowlist + magic bytes only)
- Audio/video/sticker outbound not in V1 scope

## 18. Next phase readiness

**READY** for: inbound audio/video rendering (if product priority), orphan cleanup job, thumbnail generation via existing storage hooks, MMS if sent.dm runtime audited.
