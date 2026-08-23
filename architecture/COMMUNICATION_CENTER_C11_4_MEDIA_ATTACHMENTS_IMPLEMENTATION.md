# Communication Center C11.4 — Media Attachments Implementation

**Phase:** C11.4  
**Status:** Implemented (draft PR #1200)  
**Depends on:** C11.2 send safety, C11.3 ownership, C7/C7.2 canonical content, C8.3 timeline

## 1. Scope

V1 outbound media for **WhatsApp IMAGE + DOCUMENT** only (one attachment per reply, optional caption).

- Canonical upload/storage/download via SynqDrive backend
- Extended durable reply idempotency (`payloadHash`)
- Inbound WhatsApp image/document webhook ingestion + secure storage
- Timeline media rendering from canonical attachment summaries
- Composer attachment UX (paperclip, preview tile, upload progress)

**Out of scope:** SMS MMS, voice media, multi-attachment batching, AI/OCR, virus scanning architecture, sticker picker, email attachments.

## 2. Canonical payload hash authority

**Single authority:** `buildReplyPayloadHash()` in `communication-reply-payload.ts` using `JSON.stringify({ contentType, text, attachmentId })` + SHA-256.

- No SQL-side hash backfill
- No duplicate serializers in frontend or provider adapters
- All **new** C11.4 `CommunicationReplyCommand` rows MUST have non-null `payloadHash` at insert

## 3. Legacy C11.2 migration compatibility

Migration `20260823120000_communication_center_c11_4_media_attachments`:

- Adds nullable `payload_hash` column (no SQL `json_build_object` backfill)
- Pre-C11.4 rows may have `payloadHash = null`

**Replay semantics** (`matchesReplyCommandPayload`):

| Stored state | Request match rule |
|--------------|-------------------|
| `payloadHash` present | Exact hash equality |
| `payloadHash` null (legacy TEXT) | `contentType=TEXT`, `attachmentId=null`, `text` equality |

On successful legacy replay, `shouldBackfillLegacyPayloadHash` lazily persists canonical hash via runtime helper.

**Migration evidence:** `backend/scripts/test/communication-center-c11-4-migration-test.sh` seeds ACCEPTED/FAILED/PENDING legacy rows with NULL hash after full deploy.

## 4. Attachment immutability invariant

`CommunicationAttachment` bytes are immutable from upload:

- `contentHash` + `objectKey` set at READY
- `sealedAt` + `nativeMessageId` set after send or inbound ingest
- **V1 identity for idempotency:** `attachmentId` is sufficient (no separate content-hash fingerprint in command payload)

## 5. Attachment send reservation (one attachment → one send)

`reservedCommandId` on `CommunicationAttachment`:

- Set atomically in same transaction as `CommunicationReplyCommand` create via conditional `updateMany` (`READY`, `sealedAt=null`, `reservedCommandId` null or same command)
- Second idempotency key reusing same attachment → `ATTACHMENT_NOT_ALLOWED` before provider call
- Replay/resume of owning command passes `commandId` into `requireReadyAttachmentForReply`

**Product semantics (V1):** one uploaded attachment record = one logical outbound customer message.

## 6. Supported media matrix

| Channel | Outbound TEXT | Outbound IMAGE | Outbound DOCUMENT | Inbound IMAGE/DOCUMENT |
|---------|---------------|----------------|-------------------|------------------------|
| WhatsApp | Yes | Yes | Yes | Yes (stored + timeline) |
| SMS | Yes (if configured) | No | No | N/A |
| Voice | No | No | No | N/A |

## 7. Storage authority

Reuses **`DocumentStoragePort`** (`DOCUMENTS_STORAGE`) with document type `COMMUNICATION_MEDIA`.

- Org-scoped object keys (generated; never user filename)
- Conversation-bound `CommunicationAttachment` records
- **MIME consistency:** persisted `mimeType` uses validated upload input, not storage adapter return metadata
- No public bucket URLs; no Meta media URLs in frontend DTOs

## 8. Download / access model

`GET /organizations/:orgId/communication/attachments/:attachmentId/content`

- RBAC: `communication.read` + conversation readable + station scope
- `Content-Disposition` via `buildCommunicationAttachmentContentDisposition()` — sanitized filename, `filename*` UTF-8, no CRLF injection
- `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`

## 9. Reply DTO extension

```json
{
  "text": "optional caption",
  "attachmentId": "uuid",
  "contentType": "IMAGE | DOCUMENT",
  "idempotencyKey": "client-key"
}
```

## 10. WhatsApp provider media

1. Upload bytes to Meta → `providerMediaId` (persisted on native message)
2. Atomic `providerDispatchStartedAt` claim
3. Send customer message referencing media ID
4. **Retry reuses `providerMediaId`** when present (`resumeOrReturnExistingMediaMessage`)

## 11. Inbound media dedupe

Webhook path (`handleInboundMessage`):

1. `whatsAppMessage.findUnique({ providerMessageId })` **before** Meta media download
2. `whatsAppWebhookEvent.externalEventId` idempotency at entry level
3. Duplicate delivery → no second native message, attachment, or MESSAGE_RECEIVED projection

Unit evidence: `whatsapp-webhook.service.spec.ts` — `skips duplicate provider message`.

## 12. PostgreSQL test evidence

| Suite | Coverage |
|-------|----------|
| `communication-reply-media.postgres.integration.spec.ts` | Legacy null-hash replay/conflict/special chars; same-key media replay; attachment/caption conflicts; parallel same-key; two-key same-attachment; dispatch crash; cross-org/conv; legacy FAILED/PENDING |
| `communication-reply.postgres.integration.spec.ts` | C11.2 text idempotency regression |
| `whatsapp-dispatch.postgres.integration.spec.ts` | Provider media ID reuse on retry |
| `communication-center-c11-4-migration-test.sh` | Post-migrate legacy NULL payload_hash rows |

Run (fresh DB):

```bash
DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_comm_c11_4_test?schema=public \
  npx jest communication-reply-media.postgres.integration.spec.ts communication-reply.postgres.integration.spec.ts --runInBand
```

## 13. Known limitations

- Storage orphan if DB insert fails after `putObject` (documented operational gap; no partial READY returned)
- No orphan upload cleanup worker
- No EXIF stripping / malware scanning (MIME allowlist + magic bytes only)

## 14. Human takeover fix (C11.4 hardening)

Same assigned operator may reply again from `WAITING_CUSTOMER` (post-send transition) without `ALREADY_CLAIMED` — required so attachment reservation conflicts surface correctly on subsequent sends.
