# Communication Center C9.2 — Voice Operations Parity (Final Hardening)

**Status:** Implemented (draft PR #1220)
**Date:** 2026-08-23  
**Scope:** Canonical Communication Center operational parity for Voice (not Channels configuration).

## 1. Scope

C9.2 closes remaining Voice operational gaps identified in the C9 audit:

1. Transcript visibility (lazy canonical read)
2. Call summary in conversation detail
3. Operational Voice inbox filters (server-side)
4. Reviewed task-from-call via canonical Tasks UI
5. Sync/reconciliation classification (no manual sync in CC)

Out of scope: Voice agent builder, telephony, analytics dashboard, test center, provider setup (C10), legacy nav removal (C13), recording playback, retention implementation (C13).

## 2. Canonical read API (C9.2)

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET .../voice-call` | `communication.read` | Call metadata + summary + safe failure state |
| `GET .../voice-call/transcript` | `communication.read` | Normalized segments (lazy) |

**Removed:** `POST .../voice-call/create-task` — task creation uses canonical `POST /organizations/:orgId/tasks` via `TasksNewTaskDialog` after operator review (`tasks.create` RBAC).

Scoped via canonical conversation → org → native `VoiceConversation`. Station scope via `CommunicationWriteScopeService`.

## 3. Transcript authority

- Source: `VoiceConversation.transcript`
- Parser: `communication-voice-transcript.util.ts`
- JSON arrays, plain-text speaker lines
- Malformed/provider JSON blobs → `TRANSCRIPT_UNAVAILABLE` (no raw echo)
- Provider metadata keys (`system_prompt`, `tool_arguments`, signed URLs, tokens) never returned
- `timestamp` / `occurredAt` validated; invalid values omitted

## 4. Provider error normalization

- `VoiceConversation.errorMessage` is **not** exposed to `communication.read`
- DTO exposes `failureState: 'CALL_FAILED' | null`
- Frontend localizes safe copy via `communication.voice.failureState.CALL_FAILED`

## 5. Voice inbox filters (server-side)

Query params on `GET /communication/conversations`:

- `callDirection`, `callOutcome`, `callHasTranscript`, `callEscalatedOnly`
- `dateFrom` / `dateTo` (call `startedAt` when `channel=VOICE` only)

Implementation: `CommunicationReadRepository.resolveVoiceFilterNativeIds` with hard cap `COMMUNICATION_VOICE_FILTER_NATIVE_ID_LIMIT` (2500). Exceeding cap → `400 Bad Request` (narrow filters).

## 6. Task-from-call (reviewed UX)

Flow:

1. Voice call card → **Create task** (requires `tasks.create`)
2. Opens canonical `TasksNewTaskDialog` with localized prefill (`communication-voice-task-prefill.ts`)
3. Operator edits title/description/priority/assignee/due date/etc.
4. Explicit submit → `api.tasks.create` (`TasksService.createManualTask`)

Prefill includes:

- Localized title (`communication.voice.taskPrefill.*`)
- Summary + escalation + communication conversation reference (no transcript dump)
- `customerId`, `bookingId`, `vehicleId`, `stationId` when available
- Metadata: `voiceConversationId`, `communicationConversationId`, `outcome`
- `sourceKey: COMMUNICATION_VOICE`

No silent persistence from call-card CTA.

## 7. AI Activity link

Voice card link opens AI Activity tab scoped to current `conversationId` when C11.5 query supports it. Global AI Activity tab (without voice link) remains unscoped.

## 8. Sync audit

Manual ElevenLabs sync classified **SUPERSEDED** for canonical CC. No manual sync button in CC.

## 9. i18n

Governed locales: `en`, `de`, `fr`, `nl`, `es`, `it`, `pl`, `cs`.

All `communication.voice.*` keys translated natively. Machine outcome values (`PENDING`, `RESOLVED`, etc.) preserved where required. Test guard: non-en/de locales must not be wholesale English copies.

## 10. Tests

| Area | Proof |
|---|---|
| Transcript parser | `communication-voice-transcript.util.spec.ts` |
| Voice ops unit | `communication-voice-ops.service.spec.ts` |
| Voice filter bound | `communication-read-voice-filter-bound.spec.ts` |
| PostgreSQL filters/security | `communication-voice-ops.postgres.integration.spec.ts` |
| Task prefill | `communication-voice-task-prefill.test.ts` |
| i18n parity + translation quality | `communication-center-c9-2.i18n.test.ts` |

## 11. C9 Voice sign-off

| Area | Status |
|---|---|
| Transcript | PASS |
| Summary | PASS |
| Operational filters | PASS |
| Task-from-call | PASS (reviewed canonical task UI) |
| i18n (all governed locales) | PASS |
| Sync/reconciliation | SUPERSEDED |
| Legacy operational Voice parity | PASS (recording deferred) |

## 12. Remaining gaps (max 5)

1. Recording playback (secure proxied media — deferred)
2. Multi-call per conversation (not in domain model today)
3. Call-level deep link `callId` query param (optional for 1:1 model)
4. Legacy Voice Conversations nav still present until C13
5. —

## 13. C13 readiness

**READY FOR RE-SIGNOFF** — C9.2 read surfaces handle `TRANSCRIPT_UNAVAILABLE`; retention purge behavior owned by existing `VoiceRetentionService`.
