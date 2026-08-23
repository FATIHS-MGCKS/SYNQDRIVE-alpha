# Communication Center C11.2 — Reply / Composer Implementation

**Date:** 2026-08-22
**Phase:** C11.2 (canonical outbound reply + Communication Center composer)
**Base:** `main` after merged PR #1187 (C11.1 write foundation)

## 1. Scope

C11.2 adds canonical human text reply for Communication Center:

- `POST .../communication/conversations/:conversationId/reply`
- Provider-neutral `CommunicationReplyService` + channel outbound adapters
- WhatsApp text reply via **existing** `WhatsAppService.sendMessage` (Meta Cloud API path unchanged)
- SMS explicit `CHANNEL_NOT_CONFIGURED` (C5.2 outbound runtime not wired)
- Voice `CHANNEL_NOT_REPLYABLE` (no text composer)
- Durable idempotency (`CommunicationReplyCommand`)
- Ownership / claim-before-send (C11.1 concurrency patterns)
- Post-send canonical status → `WAITING_CUSTOMER` when `HUMAN_ACTIVE`
- `CommunicationComposer` UI + `useCommunicationReply`

**Out of scope:** attachments, media, templates UI, AI reply, sent.dm credential provisioning, Voice text, dashboard mutations.

## 2. Existing WhatsApp send audit

| Layer | Authority |
|-------|-----------|
| Controller | `whatsapp.controller.ts` → `POST .../whatsapp/conversations/:id/messages` |
| Service | `WhatsAppService.sendMessage` — policy, consent, native `WhatsAppMessage` QUEUED→SENT/FAILED |
| Provider | `MetaWhatsAppCloudProvider.sendTextMessage` |
| Projection | `WhatsAppCommunicationProjectionIntegration.projectOutboundAccepted` → `MESSAGE_SENT` + content |
| Idempotency (native API) | None per HTTP request; `WhatsAppMessage.idempotencyKey` column exists but unused in send |
| Legacy UI | `WhatsAppBusinessView` → `api.whatsapp.sendMessage` (native conversation id) |

C11.2 **does not** duplicate Meta payloads, token handling, or provider error parsing.

## 3. SMS runtime status

C5.1 provides native persistence + adapters. **C5.2 outbound HTTP runtime is not implemented** (`SmsService.sendOutbound` absent). Canonical reply returns `CHANNEL_NOT_CONFIGURED`; composer shows inline blocked state for SMS.

## 4. Voice decision

`VOICE` conversations reject text reply with `CHANNEL_NOT_REPLYABLE`. No composer DOM for Voice.

## 5. Canonical reply endpoint

`POST /organizations/:orgId/communication/conversations/:conversationId/reply`

RBAC: `@RequireCommunicationPermission('write')` + `CommunicationWriteScopeService` (same as C11.1).

## 6. Request DTO

```json
{ "text": "string", "idempotencyKey": "uuid-or-bounded-opaque" }
```

- `text`: trimmed, required, max **4096** (`COMMUNICATION_REPLY_TEXT_MAX_LENGTH`)
- No provider/recipient fields in request

## 7. Ownership rules

| State | Policy |
|-------|--------|
| `HUMAN_REQUIRED` + unassigned | Conditional claim → `HUMAN_ACTIVE` before send |
| `HUMAN_ACTIVE` + actor assigned | Allowed |
| Assigned to other operator | `ALREADY_CLAIMED` (no send) |
| `AI_ACTIVE` / `WAITING_CUSTOMER` | Human takeover → `HUMAN_ACTIVE` + assign actor |
| `RESOLVED` / `FAILED` | `INVALID_TRANSITION` (reopen first) |

`communication.manage` does **not** bypass ownership for reply.

## 8. Reply state transitions

After successful accepted send:

- `HUMAN_ACTIVE` → `WAITING_CUSTOMER` (assignment retained)
- Claim/takeover transitions occur **before** provider call (DB transaction)

## 9. Idempotency architecture

**Table:** `communication_reply_commands`
**Unique:** `(organizationId, conversationId, clientIdempotencyKey)`
**Lease:** `processingLeaseExpiresAt` — 30s processing lease for crash/orphan recovery

| Case | Behavior |
|------|----------|
| Same key + same text + `ACCEPTED` | Return success response, no provider call |
| Same key + same text + `FAILED` | Throw same canonical failure class (not HTTP 200) |
| Same key + same text + `UNKNOWN` | Throw `SEND_UNKNOWN` |
| Same key + different text | `409 IDEMPOTENCY_CONFLICT` |
| In-flight `PENDING` + active lease | `SEND_UNKNOWN` (no second provider call) |
| In-flight `PENDING` + expired lease | Resume processing (recover orphan) |
| Parallel create race | Unique constraint → replay/resume existing |

**Native correlation:** `WhatsAppMessage.idempotencyKey = comm-reply:{orgId}:{conversationId}:{clientKey}`

Provider call occurs **outside** interactive transaction after `PENDING` command reserved.

## 9a. Definitive vs unknown send outcome

| Class | Command state | Examples |
|-------|---------------|----------|
| `DEFINITIVE_REJECTED` | `FAILED` | Policy/consent rejection, explicit provider HTTP 4xx |
| `UNKNOWN` | `UNKNOWN` | Socket timeout, ECONNRESET, gateway 5xx, ambiguous transport |
| `NOT_CONFIGURED` | `FAILED` | Provider/credentials missing |
| `TEMPLATE_REQUIRED` | `FAILED` | Free-text blocked outside service window |
| `RATE_LIMITED` | `FAILED` | Provider rate limit |

Ambiguous outcomes **never** persist as `FAILED`.

## 9b. Crash recovery windows

| Window | Recovery |
|--------|----------|
| A: Command `PENDING`, no native message | Expired lease → resume send |
| B: Native `QUEUED`, no `providerMessageId` | Reuse native message, retry provider on same row |
| C: Native `SENT`, command still `PENDING` | Reconcile command → `ACCEPTED`, no provider call |
| D: Native `QUEUED` + `providerMessageId` | `UNKNOWN` until webhook/reconciliation |

## 9c. Channel preflight (before ownership mutation)

| Channel | Preflight |
|---------|-----------|
| `VOICE` | `CHANNEL_NOT_REPLYABLE` — no claim, no command |
| `SMS` | `CHANNEL_NOT_CONFIGURED` — no claim, no command |
| `WHATSAPP` | Static org config check (`isConfigured`) — no HTTP call |

WhatsApp template/policy failures may occur after human takeover (`HUMAN_ACTIVE` retained).

## 10. Transaction / external call boundary

1. **Tx:** validate, scope, ownership/claim, create `PENDING` command (or replay)
2. **External:** channel adapter → native send (WhatsApp only in C11.2)
3. **Tx:** update command state, canonical conversation status, build response

## 11. WhatsApp adapter

`WhatsAppCommunicationOutboundAdapter`:

- Validates native `WhatsAppConversation` scoped to `organizationId`
- Calls `WhatsAppService.sendMessage` with scoped `idempotencyKey` (native correlation)
- Maps provider errors → canonical reply error classes (`UNKNOWN` vs `FAILED`)
- Polls briefly for canonical `MESSAGE_SENT` event id; late reconciliation on replay

## 12. Canonical MESSAGE_SENT

Emitted only by existing WhatsApp projection on native `SENT` message — not on composer click.

## 13. Error model

`NOT_FOUND`, `FORBIDDEN`, `INVALID_TRANSITION`, `ALREADY_CLAIMED`, `STALE_STATE`, `CHANNEL_NOT_REPLYABLE`, `CHANNEL_NOT_CONFIGURED`, `MESSAGE_TOO_LONG`, `MESSAGE_EMPTY`, `IDEMPOTENCY_CONFLICT`, `SEND_FAILED`, `SEND_UNKNOWN`, `TEMPLATE_REQUIRED`, `RATE_LIMITED`

No provider secrets or raw Graph API bodies in responses.

## 14. Frontend composer

- `CommunicationComposer` — auto-growing textarea, Enter send / Shift+Enter newline, IME-safe
- `useCommunicationReply` — draft per conversation key; idempotency key preserved on `UNKNOWN`, reset on definitive failure for new logical send; non-`ACCEPTED` responses treated as failure
- `resolveCommunicationComposerState` — visibility/capability resolver
- Pessimistic timeline refresh (no fake optimistic bubbles in v1)

## 15. Legacy compatibility

`WhatsAppBusinessView` native send unchanged. Communication Center uses canonical reply route only.

## 18. PostgreSQL proof (C11.2 hardening)

Integration tests (`communication-reply.postgres.integration.spec.ts`) verify:

- Parallel same-key deduplication (1 provider call)
- Idempotency conflict (different text)
- SMS/Voice preflight without ownership mutation
- FAILED replay throws (not HTTP 200)
- UNKNOWN persists as UNKNOWN not FAILED
- Crash-after-acceptance reconciliation
- Claim+send concurrency race

## 19. Known limitations

- SMS reply blocked until C5.2 runtime
- No attachment/media/template composer
- No per-conversation SMS capability without org-level config read on send attempt
- WhatsApp `MESSAGE_SENT` event id may be null in response if projection is still async (timeline refresh authoritative)

## 20. Next phase readiness

**READY FOR NEXT COMMUNICATION WRITE PHASE** — C11.2 reply path complete for WhatsApp; SMS awaits C5.2 outbound runtime; attachments/templates/AI reply remain future phases.
