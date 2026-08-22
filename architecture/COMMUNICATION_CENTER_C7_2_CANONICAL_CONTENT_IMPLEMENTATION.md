# Communication Center C7.2 — Canonical Content Implementation

**Phase:** C7.2 (Canonical message content contract)
**Date:** 2026-08-22
**Branch:** `feature/communication-center-c7-2-canonical-content`
**Depends on:** C1–C7 (persistence, normalization, projections, read API)

---

## 1. Scope

Introduces provider-neutral **canonical message content** for Communication Center reads.

**In scope:**
- `CommunicationMessageContent` persistence
- WhatsApp + SMS content projection (downstream of canonical events)
- C7 read API: timeline `content`, inbox `lastMessagePreview`
- Internal backfill/repair from native DB rows
- Idempotent projection + failure isolation

**Out of scope:** UI, send/reply, mark-read, content search, voice transcripts, provider media download, email projection.

---

## 2. Native content audit

| Domain | Native authority | Body field | C7.2 action |
|--------|------------------|------------|-------------|
| WhatsApp | `WhatsAppMessage` | `content`, `messageType` | Project TEXT/media type; media text policy below |
| SMS | `SmsMessage` | `content` | Project TEXT |
| Voice | `VoiceConversation` | `transcript`, `summary` | **Not projected** |
| Email | `OutboundEmail` | send log | Deferred |

Canonical events (`CommunicationEvent`) remain lifecycle facts; content is a **separate one-to-one projection** for `MESSAGE_RECEIVED` / `MESSAGE_SENT` only.

---

## 3. Canonical content authority

**Table:** `communication_message_contents`

One logical message per canonical message event. Delivery lifecycle events (`MESSAGE_DELIVERED`, `MESSAGE_FAILED`, etc.) do **not** create content rows.

---

## 4. Schema

### `CommunicationMessageContent`
- Tenant-scoped FKs: `organizationId`, `conversationId`, `communicationEventId` (unique)
- Identity: `nativeMessageId`, optional `providerMessageId`
- `contentType`, `text`, `truncated`, `hasAttachments`, `attachmentCount`
- `idempotencyKey` unique per org (`cmc1:{sha256}` from org+channel+nativeMessageId)

### `CommunicationConversation` additions
- `lastMessagePreview` (max 120 chars, denormalized; may be null)
- `lastContentAt`, `lastContentId` (monotonic canonical content chronology; independent of preview text)

Migration: `20260822120000_communication_center_c7_2_canonical_content`

---

## 5. Event ↔ content relationship

| Event type | Content |
|------------|---------|
| `MESSAGE_RECEIVED` | yes (0..1) |
| `MESSAGE_SENT` | yes (0..1) |
| `MESSAGE_DELIVERED` | no |
| `MESSAGE_FAILED` / `MESSAGE_READ` | no |
| `CALL_*` | no |
| `HUMAN_REQUIRED` | structured event metadata only |

---

## 6. Content types

`TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `LOCATION`, `CONTACT`, `MIXED`, `UNSUPPORTED`

WhatsApp `messageType` mapped to provider-neutral enum. Unknown/sticker/reaction → `UNSUPPORTED` or media type without URLs.

---

## 7. Text policy

- Preserve Unicode + line breaks
- Max stored length: **4096 code points** (`CANONICAL_MESSAGE_TEXT_MAX_LENGTH`)
- Truncation uses **Unicode code points** (`[...text]`), never splits surrogate pairs
- Overflow → truncate + `truncated: true`

---

## 8. Media / attachment boundary

- **No binary blobs** in canonical DB
- **No provider signed URLs** persisted
- Canonical `text` for media types is **null** unless safe user-visible caption passes `extractSafeUserVisibleText` (rejects URLs, JSON blobs)
- WhatsApp `message.content` for media may contain provider URLs — **never copied**

### Template messages

WhatsApp `template`: if `message.content` is safe plain text (no URL/JSON), map as `TEXT`; otherwise `text` is null.

---

## 9. Preview semantic tokens

Machine tokens (not localized UI copy): `cc:IMAGE`, `cc:VIDEO`, `cc:AUDIO`, `cc:DOCUMENT`, `cc:LOCATION`, `cc:CONTACT`, `cc:MIXED`, `cc:UNSUPPORTED`.

Frontend maps `cc:*` to localized labels.

`lastMessagePreview` may be null. `lastContentAt` / `lastContentId` still advance for chronological tracking.

---

## 10. Voice transcript boundary

Not projected. Voice threads remain operational lifecycle events only.

---

## 11. Projection integration & atomicity

**Canonical-content-only transaction** in `CommunicationContentRepository.projectMessageContentIdempotently`:
1. Validate tenant/event/conversation integrity
2. `$transaction`: insert content + `bumpConversationPreview`
3. On idempotency replay: `assertImmutableIdentity` + `convergeConversationPreviewFromRow`

Provider/native processing does **not** depend on this transaction.

Content failure after native + event projection is logged; provider path unaffected.

---

## 12. Tenant / relational integrity

`validateProjectionContext` verifies event + conversation org/channel/eventType alignment before create. Cross-org, wrong-conversation, and delivery-event attempts → `INTEGRITY_REJECTED`.

---

## 13. Idempotency

Key: `cmc1:{sha256({v:1, organizationId, channel, nativeMessageId})}`

Immutable identity on replay: `organizationId`, `channel`, `nativeMessageId`, `communicationEventId`, `conversationId`. Mismatch → `DATA_INTEGRITY_CONFLICT`.

`providerMessageId` nullable/late; not part of idempotency key.

Concurrent create: `P2002` resolves to winner row; both converge.

---

## 14. Preview monotonicity

Tuple ordering — candidate wins iff:
- `occurredAt > lastContentAt`, OR
- `occurredAt == lastContentAt AND contentId > lastContentId`

Null-preview content still updates `lastContentAt` / `lastContentId`.

---

## 15. Repair authority

`repairMissingContentForEvent({ organizationId, communicationEventId, nativeMessageId })` — all facts derived from loaded canonical event.

---

## 16. Retention / cascade / lastContentId

Content cascades on org/conversation/event delete.

`lastContentId` is **intentionally denormalized non-FK** (avoids cascade cycles). Repair via replay/convergence. Individual event delete not supported except via conversation/org cascade.

---

## 17. Backfill

Script: `backend/scripts/ops/backfill-communication-content.ts`

- Dry-run default; batch size 1–500
- Matching authority (no timestamp/text guessing):

| Channel | Direction | Primary | Fallback |
|---------|-----------|---------|----------|
| WhatsApp | inbound | `providerMessageId` | `wa-msg:{nativeMessageId}` |
| WhatsApp | outbound | `wa-sent:{nativeMessageId}` | — |
| SMS | inbound | `providerMessageId` | — (unresolved if missing) |
| SMS | outbound | `sms-sent:{nativeMessageId}` | — |

Result counters: `unresolved`, `missingCanonicalConversation`, `missingCanonicalEvent` (no misleading `unsupported`).

---

## 18. Read API

- Timeline: single `findMany` with nested `messageContent` select
- `contentType` typed as `CommunicationMessageContentType` in DTO
- Canonical-only reads (no native federation)

Measured: 50 events → 1 `communication_events` query (+ bounded total ≤8).

---

## 19. Tests

| Suite | Count |
|-------|-------|
| Mapper + text util unit | 6 |
| Backfill util unit | 5 |
| Postgres integration | 29 |
| **C7.2 total** | **40** |

---

## Files

| Path | Role |
|------|------|
| `backend/src/modules/communication/content/*` | Service, repository, mapper, backfill, errors, text util |
| `backend/prisma/migrations/20260822120000_*` | Schema migration |

**Changes / Architektur updated:** this document (C7.2 hardening pass).
