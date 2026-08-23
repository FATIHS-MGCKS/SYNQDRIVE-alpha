# Communication Center C9.2 — Voice Operations Parity

**Status:** Implemented (draft PR)  
**Date:** 2026-08-23  
**Scope:** Canonical Communication Center operational parity for Voice (not Channels configuration).

## 1. Scope

C9.2 closes remaining Voice operational gaps identified in the C9 audit:

1. Transcript visibility (lazy canonical read)
2. Call summary in conversation detail
3. Operational Voice inbox filters (server-side)
4. Task-from-call via TasksService authority
5. Sync/reconciliation classification (no manual sync in CC)

Out of scope: Voice agent builder, telephony, analytics dashboard, test center, provider setup (C10), legacy nav removal (C13), recording playback, retention implementation (C13).

## 2. Legacy capability matrix

| Legacy capability | Canonical state (pre-C9.2) | Gap? | Destination | Authority |
|---|---|---|---|---|
| Call list | CC inbox VOICE channel | PARITY | Inbox | CommunicationConversation |
| Direction / status / duration | Projected events + native metadata | GAP (detail) | C9.2 call card | VoiceConversation |
| Phone/customer/booking/vehicle/station | Context resolution | PARITY | Detail/context | CC context |
| Transcript | Legacy panel only | GAP | C9.2 lazy read | VoiceConversation.transcript |
| Summary | Legacy panel only | GAP | C9.2 call card | VoiceConversation.summary |
| AI/tool activity | C11.5 AI Activity | PARITY | Link only | CommunicationAiActivity |
| Escalation/handoff | C11.5 HUMAN_REQUIRED | PARITY | Timeline + notifications | CC projection |
| Assignment | C11.3 human ops | PARITY | Header assignee | CC write |
| Task creation | Legacy panel | GAP | C9.2 create-task | TasksService |
| Sync button | Legacy panel | SUPERSEDED | Channels → Voice / background | Webhook + sync service |
| Filters (direction/outcome/escalated/transcript/date) | Legacy API only | GAP | C9.2 inbox filters | Read repository + VoiceConversation |
| Analytics navigation | Legacy links | C10 SPECIALIZED | Channels → Voice analytics | VoiceAssistantService |
| Provider/call ID | Native only | INTENTIONALLY DEFERRED | Ops troubleshooting | Native Voice |
| Recording playback | Not in legacy ops minimum | INTENTIONALLY DEFERRED | Secure media (later) | — |

## 3. Call / conversation cardinality

**1:1** — Each `VoiceConversation.id` maps to one `CommunicationConversation` (`channel=VOICE`, `nativeConversationId`). No separate `VoiceCall` model. Transcript/summary/task reference the single native call per canonical conversation.

## 4. Native Voice authority

- Transcript: `VoiceConversation.transcript` (string or JSON-stringified ElevenLabs array)
- Summary: `VoiceConversation.summary`
- Written by ElevenLabs post-call webhook (`VoiceConversationLifecycleService`) and insert-only manual sync (`VoiceAssistantService.syncConversations`)
- CC does **not** duplicate transcript into projection tables

## 5. Canonical read API (C9.2)

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET .../voice-call` | `communication.read` | Call metadata + summary |
| `GET .../voice-call/transcript` | `communication.read` | Normalized segments (lazy) |
| `POST .../voice-call/create-task` | `communication.read` + `tasks.create` | Manual follow-up task |

Scoped via canonical conversation → org → native `VoiceConversation`. Station scope via `CommunicationWriteScopeService`.

## 6. Transcript DTO

```ts
{
  callId: string;
  availability: 'AVAILABLE' | 'TRANSCRIPT_UNAVAILABLE';
  segments: Array<{
    id: string;
    speaker: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_OPERATOR' | 'UNKNOWN';
    text: string;
    occurredAt?: string;
  }>;
}
```

Parser: `communication-voice-transcript.util.ts` — JSON array, plain text lines, redaction of provider fields.

## 7. Voice inbox filters (server-side)

Query params on `GET /communication/conversations`:

- `callDirection=INBOUND|OUTBOUND`
- `callOutcome=PENDING|RESOLVED|ESCALATED|FAILED|ABANDONED`
- `callHasTranscript=true`
- `callEscalatedOnly=true`
- `dateFrom` / `dateTo` (call `startedAt` when `channel=VOICE` only)

Implemented via `VoiceConversation` join in `CommunicationReadRepository.resolveVoiceFilterNativeIds`.

## 8. Task-from-call

- `TasksService.createManualTask` with `type=CUSTOMER_FOLLOWUP`, `sourceType=MANUAL`
- Metadata: `voiceConversationId`, `communicationConversationId`, `outcome`
- Dedupe: optional `idempotencyKey` → `voice:cc-manual:{nativeId}:{key}` (retry-safe, not global per-call lock)
- Description: summary + escalation + canonical conversation reference (no full transcript dump)

## 9. Sync audit

Legacy `Sync from ElevenLabs` is **backfill/troubleshooting** (insert-only, does not update existing rows). Primary correctness path: webhooks + background reconciliation.

**C9.2 policy:** No manual sync in canonical CC. Classified **SUPERSEDED** for operator inbox — remains under Channels → Voice / legacy Voice Assistant view.

## 10. UI

- `CommunicationVoiceCallCard` — compact call block above timeline (not chat bubbles)
- Transcript expand/collapse (lazy load)
- Summary inline
- Create task + AI Activity tab link
- Voice-specific inbox filters in `CommunicationInboxFiltersBar` when channel=voice
- URL state via `communicationVoice*` query params

## 11. Security / retention

- No raw ElevenLabs payload, tool args, prompts, or signed URLs in API responses
- Purged transcript → `TRANSCRIPT_UNAVAILABLE` (respects C13 retention without implementing purge)
- Cross-org / wrong station → 404 via existing scope services

## 12. Tests

- `communication-voice-transcript.util.spec.ts`
- `communication-voice-ops.service.spec.ts`
- `communication-center-c9-2.i18n.test.ts`
- C9.1 quick-action tests unchanged

## 13. C9 Voice sign-off

| Area | Status |
|---|---|
| Transcript | PASS |
| Summary | PASS |
| Operational filters | PASS |
| Task-from-call | PASS |
| Sync/reconciliation | SUPERSEDED (no CC manual sync) |
| Legacy operational Voice parity | PASS (recording deferred) |

## 14. Remaining gaps (max 5)

1. Recording playback (secure proxied media — deferred)
2. Multi-call per conversation (not in domain model today)
3. Call-level deep link `callId` query param (single-call 1:1 makes optional)
4. Localized non-en/de voice strings in fr/nl/es/it/pl/cs (English placeholders)
5. Legacy Voice Conversations nav still present until C13

## 15. C13 readiness impact

**READY FOR RE-SIGNOFF** — C9.2 read surfaces handle `TRANSCRIPT_UNAVAILABLE`; retention purge behavior owned by existing `VoiceRetentionService`.
