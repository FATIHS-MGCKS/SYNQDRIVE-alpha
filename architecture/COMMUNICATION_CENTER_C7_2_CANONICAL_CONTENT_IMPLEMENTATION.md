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
| WhatsApp | `WhatsAppMessage` | `content`, `messageType` | Project TEXT/media type |
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
- `lastMessagePreview` (max 120 chars, denormalized)
- `lastContentAt`, `lastContentId` (monotonic preview state)

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
- Max stored length: **4096** chars (`CANONICAL_MESSAGE_TEXT_MAX_LENGTH`, WhatsApp limit)
- Overflow → truncate + `truncated: true` (never silent)
- No HTML rendering; plain text only in V1

---

## 8. Media / attachment boundary

- **No binary blobs** in canonical DB
- **No provider signed URLs** persisted
- Media-only messages: `hasAttachments`, `attachmentCount`, semantic `contentType`
- Preview uses semantic tokens: `[image]`, `[document]`, etc. (frontend i18n later)

---

## 9. Voice transcript boundary

Full ElevenLabs/Twilio transcripts are **not** copied into canonical content. Voice threads remain operational lifecycle events only.

---

## 10. Projection integration

**Transaction boundary:**
1. Native message persist (authoritative)
2. Canonical event projection (C3/C5)
3. Canonical content projection (C7.2, best-effort, non-blocking)

WhatsApp/SMS integrations call `CommunicationContentService` after successful `projectNormalizedInput`. Content failure is logged; native + event paths unaffected.

---

## 11. Idempotency

Key: `cmc1:{sha256({v:1, organizationId, channel, nativeMessageId})}`

Replay/concurrent projection converges to one row. Content is **immutable** V1 (no edit/recall handling).

---

## 12. PII classification

Message `text` is customer communication data (may contain PII). Authorized via existing `communication.read`. **Not** logged, not in cursors/metadata. Timeline returns `content.text` only to authorized readers.

---

## 13. Retention

Content cascades on `organization` / `conversation` / `event` delete (`onDelete: Cascade`). Customer GDPR anonymization policy remains **governance follow-up** — not blocking C7.2.

Encryption: relies on DB-at-rest infrastructure; no ad-hoc field crypto.

---

## 14. Backfill

Script: `backend/scripts/ops/backfill-communication-content.ts`

- Dry-run default; `--apply` for bounded apply
- Matches native messages → canonical events via `providerMessageId` or `wa-sent:{id}` / `sms-sent:{id}`
- Aggregate-only output (no message text)
- No provider network calls

---

## 15. Read API integration

- `GET …/conversations` — adds `lastMessagePreview` (denormalized, no N+1)
- `GET …/conversations/:id/events` — `content` on message events via single relation `select`
- Summary unchanged (no content queries)

---

## 16. Query performance

Timeline: one `findMany` with nested `messageContent` select — no per-event content queries.

List: preview from `CommunicationConversation.lastMessagePreview` column.

---

## 17. Tests

| Suite | Count |
|-------|-------|
| C7.2 mapper unit | 3 |
| C7.2 postgres integration | 11 |
| C7 read regression | 37 |
| Communication module regression (excl. pre-existing SMS adapter TS) | 278 |

---

## 18. C8 readiness

| Capability | Status |
|------------|--------|
| Rich Communication Center (message bodies in timeline) | **READY FOR RICH COMMUNICATION CENTER** |
| Media download / attachment viewer | Deferred |
| Voice transcript UI | Deferred (operational voice events only) |

---

## Files

| Path | Role |
|------|------|
| `backend/src/modules/communication/content/*` | Content service, repository, backfill |
| `backend/scripts/ops/backfill-communication-content.ts` | Ops backfill |
| `backend/prisma/migrations/20260822120000_*` | Schema migration |

**Changes / Architektur updated:** this document.
