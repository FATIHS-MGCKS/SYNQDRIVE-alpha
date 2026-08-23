# Communication Center C11.5 — AI Activity + Handoff Alerts

## 1. Scope

C11.5 completes the Communication Center C11 roadmap with:

- Canonical **AI Activity** read model, API, and UI tab
- Provider-neutral projection from existing `CommunicationEvent` rows (WhatsApp + Voice)
- **Handoff notifications** via Notification V2 when conversations enter `HUMAN_REQUIRED`
- Station scope, tenant isolation, and `communication.read` RBAC on AI Activity

Out of scope: internal fleet AI assistant, new AI models, OrgTask auto-creation (deferred), SMS AI (none exists).

## 2. Product boundary

AI Activity covers **external operational communication only**:

| Source | Included |
|--------|----------|
| WhatsApp AI router (`WhatsAppAiSuggestion`, handoff projection) | Yes |
| Voice AI (`VoiceToolExecution`, ElevenLabs escalation) | Yes |
| SMS AI | No — no runtime |
| `AIAssistantView` / internal `ChatMessage` | **Excluded** |

AI Activity is an audit/history surface — **not** a second inbox.

## 3. Existing AI source audit

### WhatsApp

- `WhatsAppAiRouterService` persists `WhatsAppAiSuggestion`
- Handoff: native `PENDING_HUMAN` → `projectHumanRequired` → `HUMAN_REQUIRED` canonical event
- C11.5 adds `projectAiIntentDetected` after each routed suggestion (`AI_INTENT_DETECTED`)

### Voice

- `VoiceCommunicationProjectionIntegration` projects tool executions (`AI_ACTION_*`) and `HUMAN_REQUIRED` on escalation
- No live provider calls in AI Activity read path

### SMS

- No AI router — AI Activity returns empty for SMS channel filter only when events exist from other channels

## 4–6. Canonical AI activity model

Read projection from `CommunicationEvent` types:

- `AI_INTENT_DETECTED` → `AI_INTENT`
- `AI_ACTION_*` → `AI_TOOL` / `AI_FAILURE`
- `HUMAN_REQUIRED` → `HANDOFF_REQUESTED`
- `HUMAN_ASSIGNED` / `HUMAN_TAKEOVER` → `HANDOFF_ACCEPTED`

Normalized DTO: `CommunicationAiActivityItemDto` (summary, agent, tool, handoff, no prompts/transcripts).

## 7–9. Tool execution & handoff reason

- Tool name/outcome from event metadata (`toolName`, event type)
- Handoff reason from `metadata.handoffReasonCode` when present; otherwise UI shows localized empty state
- No raw provider payloads, prompts, or MCP arguments

## 10–11. AI → human lifecycle

`HUMAN_REQUIRED` on conversation is authority. AI Activity derives handoff resolution from current conversation status (`HUMAN_ACTIVE`, `WAITING_CUSTOMER`, `RESOLVED`) without mutating historical events.

**Human → AI return:** not implemented in V1 (no automatic hand-back).

## 12–17. API

`GET /organizations/:orgId/communication/ai-activity`

| Filter | Values |
|--------|--------|
| `category` | `all`, `handoffs`, `tools`, `errors` |
| `channel` | `WHATSAPP`, `VOICE`, `SMS` |
| `conversationId`, `stationId`, `dateFrom`, `dateTo` | optional |
| Pagination | cursor on `occurredAt` + `id`, default limit 40, max 50 |

## 18–19. RBAC & station scope

- `communication.read` required
- Station-scoped operators see only activity for conversations in allowed stations (server-side join filter via `StationAccessService`)

## 20–23. Notification policy

| Event | Notification | OrgTask |
|-------|--------------|---------|
| `HUMAN_REQUIRED` (new canonical event) | `COMMUNICATION_HANDOFF_REQUIRED` | **Deferred** (notification-only V1) |
| AI reply / tool success | No | No |

- Registry slug: `communication-handoff-required`
- Action: `OPEN_COMMUNICATION` with `conversationId` + `stationId`
- Dedupe: fingerprint `conditionCodeVariant = communicationEventId` (per occurrence, not per conversation)
- Recipients: operational roles via Notification V2 delivery + station scope on `actionTarget.stationId`

## 24–26. Dashboard & timeline

- Dashboard Communication Attention (C8.5) unchanged — current-state attention
- AI Activity tab = diagnostic history
- Notifications = immediate alert
- Conversation timeline not flooded with tool executions

## 27–29. Security

No message bodies, phones, transcripts, or provider debug JSON in AI Activity or notification payloads.

## 30. Tests

- Mapper unit tests
- Handoff notification adapter unit test
- Frontend navigation test for `ai-activity` tab

## 31. Known limitations

- OrgTask creation for high-priority handoffs deferred until safe classification + dedupe policy exists
- No automatic human → AI return
- SMS AI activity none

## 32. C11 completion readiness

C11.5 completes the Communication Center C11 roadmap (write, reply, human ops, media, AI activity, handoff alerts). Retention parity remains C13.
