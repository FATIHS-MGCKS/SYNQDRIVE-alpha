# Communication Center Canonical Contract V1

**Status:** PROPOSED FOR FREEZE  
**Date:** 2026-08-21  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base commit SHA:** `df4c981bcf232b53c1d4aeb5f6991cf3e1af4b93`  
**Source audit path:** `docs/audits/communication-center-canonical-architecture-audit-2026-08.md`

This document freezes the canonical Communication Center architecture and contracts for Phase **C0.1**. It contains **no runtime implementation**. All product decisions marked **DECISION** are approved for downstream phases unless repository evidence proves technical impossibility.

Evidence labels used throughout:

| Label | Meaning |
|-------|---------|
| **CONFIRMED** | Verified in repository code, schema, or audit |
| **DECISION** | Approved product/architecture decision for V1 |
| **PROPOSED** | Recommended contract detail pending implementation |
| **OPEN** | Requires resolution before or during a later phase |
| **REQUIRES PROVIDER-DOC VERIFICATION** | Cannot be asserted from SynqDrive repo; must be validated against sent.dm (or other) provider documentation before implementation |

---

## 1. Status and scope

### Purpose

Freeze cross-channel contracts before any Communication Center runtime work:

- product boundaries
- information architecture
- channel vs provider separation
- canonical conversation envelope and event timeline
- handoff state machine
- station scope, identity resolution, RBAC, dashboard, notifications
- migration and phased roadmap **C0.2–C13**

### In scope (C0.1)

Architecture and contract documentation only.

### Out of scope (C0.1)

- Backend services, controllers, Prisma migrations
- Frontend UI, navigation changes
- Provider integration changes (Meta, Twilio, ElevenLabs, Resend)
- sent.dm runtime integration
- Permission enforcement changes
- Production behavior changes
- Deployment

### Relationship to audit

`docs/audits/communication-center-canonical-architecture-audit-2026-08.md` is the **primary evidence base** for current-state claims. This contract **supersedes** audit recommendations where **DECISION** blocks explicitly approve product direction (e.g. SMS via sent.dm, Email V1 semantics).

---

## 2. Product boundaries

### Communication Center owns (DECISION)

**External operational communication** between an organization and its customers/drivers via approved channels:

| V1 channel | Initial provider(s) |
|------------|---------------------|
| WHATSAPP | META_WHATSAPP (Meta WhatsApp Cloud API) |
| VOICE | TWILIO (telephony) + ELEVENLABS (conversational AI) |
| SMS | SENT_DM (sent.dm) — **future runtime; contract now** |
| EMAIL | RESEND (transactional outbound V1; inbound later) |

### Communication Center must NOT absorb (DECISION)

| Domain | Current surface | Primary persistence | Reason |
|--------|-----------------|---------------------|--------|
| Internal fleet AI chat | `AIAssistantView`, `ai-assistant` view | `ChatMessage`, `OrganizationChatAgent`, `AiRequestAuditLog` | Staff-facing intelligence, not customer comms (**CONFIRMED** audit §C.3) |
| Platform support | `SupportView`, `support` view | `SupportTicket`, `SupportTicketMessage` | Tenant ↔ SynqDrive B2B support (**CONFIRMED** audit §C.6) |

### sent.dm is additional (DECISION)

sent.dm **does not replace**:

- Meta WhatsApp
- Resend
- Twilio
- ElevenLabs

sent.dm is introduced as the **SMS provider** in V1 architecture. Future optional capabilities (WhatsApp, RCS via sent.dm) are **FUTURE OPTIONAL CAPABILITY** only.

---

## 3. Information architecture

### Approved target IA (DECISION)

```
Communication Center
├── Overview
├── Conversations          ← ONE canonical operational inbox
├── Channels
│   ├── WhatsApp           ← config, provider state, channel analytics
│   ├── Voice
│   ├── SMS
│   └── Email
├── AI Activity            ← external comms AI only
├── Automations            ← deep-link / embed workflow engine
└── Settings               ← org-wide comm policies
```

### Critical rules (DECISION)

1. **Conversations** is the **only** canonical operational inbox for WhatsApp, Voice, and SMS threads.
2. WhatsApp must **not** retain a second permanent operational inbox after CC migration reaches parity (**CONFIRMED** legacy: `WhatsAppBusinessView` inbox tab).
3. Voice must **not** retain a second permanent conversation inbox after parity (**CONFIRMED** legacy: `VoiceConversationsPanel`).
4. SMS conversations belong in **Conversations** from first sent.dm integration (C5).
5. **Channel tabs** are primarily: configuration, provider connection state, channel-specific analytics — **not** duplicate inboxes.
6. **Automations** reuses the existing workflow engine (`WorkflowAutomationView`, workflow module) via deep-link or embed — **no duplicate rule engine**.

### Email V1 decision (DECISION)

| Email type | CC location | In unified Conversations inbox? |
|------------|-------------|--------------------------------|
| Transactional outbound (booking confirm, invoice, reminders) | Channels > Email | **No** — uses existing `OutboundEmail` history |
| Inbound email / reply threading | Future | **Yes** — only when real inbound/thread semantics exist |

**Rationale:** **CONFIRMED** audit — `OutboundEmail` is send-log oriented, not conversational threading. Forcing transactional sends into Conversations would pollute the operational inbox.

### Legacy coexistence (DECISION)

During migration phases C8–C10, legacy views (`whatsapp-business`, `ai-voice-assistant`, `settings/email-versand`) **remain operational** until CC parity is verified. See §21.

---

## 4. Channel model

### Concept: `CommunicationChannel`

A **channel** is the **user-facing communication medium** and canonical routing dimension. It is **not** a provider identifier.

### Required V1 values (DECISION)

| Value | Semantic meaning | Native persistence (CONFIRMED) | Unified inbox (DECISION) |
|-------|------------------|-------------------------------|--------------------------|
| `WHATSAPP` | Async messaging via WhatsApp Business | `WhatsAppConversation`, `WhatsAppMessage` | Yes |
| `VOICE` | Real-time PSTN voice sessions with optional AI agent | `VoiceConversation` | Yes |
| `SMS` | Async SMS text via phone number | **None today** — C5 introduces native tables | Yes |
| `EMAIL` | Email delivery | `OutboundEmail` (+ org email settings) | V1: **No** for transactional; future for threaded inbound |

### Future extension rules (PROPOSED)

Additional channels may be added without breaking the contract:

| Future channel | Extension rule |
|----------------|----------------|
| `RCS` | New enum value; requires provider adapter + native persistence decision |
| `WEB_CHAT` | New enum value; likely requires session + message native tables |
| `OTHER` | Escape hatch — must document channel semantics before use |

**Rules:**

- Do **not** overload an existing channel enum to mean a provider.
- Each new channel requires: IA placement, provider mapping, inbox inclusion policy, RBAC boundaries, retention class.
- Runtime Prisma enums are **deferred** to C1 — this section is conceptual only.

---

## 5. Provider model

### Concept: `CommunicationProvider`

A **provider** is an **external integration** that executes send/receive/webhook semantics. Providers are **extensible** and **independent** from channels.

### Initial known providers (DECISION)

| Provider identity | Typical channel(s) | Role |
|-----------------|---------------|------|
| `META_WHATSAPP` | WHATSAPP | Messaging API + webhooks |
| `SENT_DM` | SMS (V1); WhatsApp/RCS **future optional** | SMS provider (planned) |
| `TWILIO` | VOICE | PSTN telephony, call webhooks, TwiML |
| `ELEVENLABS` | VOICE | Conversational AI agent, post-call webhooks, MCP |
| `RESEND` | EMAIL | Transactional email API |

### Channel ≠ provider (DECISION — invariant)

**Never model:**

```
channel = SENT_DM   ❌
```

**Always model:**

```
channel = SMS, provider = SENT_DM        ✅
channel = WHATSAPP, provider = META_WHATSAPP ✅
channel = EMAIL, provider = RESEND         ✅
```

### Multi-provider conversations (DECISION)

A single **VOICE** conversation may involve **multiple providers simultaneously**:

- Telephony: `TWILIO` (call SID, PSTN state)
- AI: `ELEVENLABS` (agent session, transcript, tool calls)

Therefore:

- **Do not** assume a single `provider` field on `CommunicationConversation` is sufficient.
- Provider identity belongs at **event** and **execution metadata** levels, not as the sole conversation key.

### Where provider identity belongs (PROPOSED)

| Layer | Provider identity | Rationale |
|-------|-------------------|-----------|
| **Channel configuration** | Primary provider(s) for org channel setup | e.g. `OrgWhatsAppConfig` → META_WHATSAPP; future `OrgSmsConfig` → SENT_DM |
| **Native channel record** | Provider-specific external IDs | e.g. `twilioCallSid`, `elevenLabsConvId`, `providerMessageId` |
| **CommunicationEvent** | `providerIdentity` + optional `providerRole` | Timeline attribution per event |
| **Provider execution metadata** | Adapter run context, redacted payload refs | Idempotency, replay, audit |

`CommunicationConversation` carries:

- `channel` (required)
- `nativeConversationId` (required reference to authoritative native row)
- **No single mandatory `provider` field**

Optional conversation-level metadata may list **active provider roles** for display (PROPOSED), e.g. `{ telephony: TWILIO, ai: ELEVENLABS }` — derived, not authoritative.

---

## 6. Provider normalization boundary

### Target pipeline (DECISION)

```
Provider webhook / API event
  → Provider adapter (channel-specific port)
  → Normalized CommunicationEvent (conceptual)
  → Native channel persistence (authoritative for provider data)
  → CommunicationConversation projection (operational envelope)
  → AI / workflow / handoff processing
  → Inbox / dashboard / notifications / tasks
```

Native persistence **remains authoritative** for provider-specific fields. The canonical layer is a **projection**, not a replacement.

### Conceptual ports (PROPOSED — no runtime interfaces in C0.1)

#### `MessagingProviderPort` (WhatsApp, SMS, future RCS)

For message-style providers. Maps conceptually to existing `WhatsAppProviderInterface` (**CONFIRMED** `backend/src/modules/whatsapp/providers/whatsapp-provider.interface.ts`):

| Operation | Responsibility |
|-----------|----------------|
| `sendMessage()` | Outbound text/template/media (capability-dependent) |
| `normalizeInbound()` | Parse inbound message → normalized event draft |
| `normalizeDeliveryEvent()` | Delivery/read/failed status → normalized event draft |
| `validateWebhook()` | Signature + verification handshake |
| `resolveProviderMessageId()` | Stable provider message ID extraction |

#### `TelephonyProviderPort` (Twilio)

| Operation | Responsibility |
|-----------|----------------|
| `handleInboundCall()` | Inbound webhook → call started/ringing events |
| `handleCallStatus()` | Status callbacks → connected/ended/failed events |
| `buildOutboundCall()` | Initiate outbound PSTN |
| `validateWebhook()` | Twilio signature |
| `resolveCallSid()` | Stable call identifier |

**Do not** force Twilio into `MessagingProviderPort`.

#### `ConversationalVoiceProviderPort` (ElevenLabs)

| Operation | Responsibility |
|-----------|----------------|
| `normalizePostCallEvent()` | Transcript/summary/outcome |
| `normalizeConversationEvent()` | Mid-call lifecycle where applicable |
| `validateWebhook()` | HMAC verification |
| `resolveConversationId()` | ElevenLabs conversation ID |
| `syncAgentConfig()` | Deployment sync (existing control plane) |

#### `EmailProviderPort` (Resend)

| Operation | Responsibility |
|-----------|----------------|
| `sendTransactional()` | Outbound email |
| `normalizeDeliveryEvent()` | Bounce/delivery webhooks (future) |
| `validateWebhook()` | When inbound/delivery webhooks added |

### Adapter mapping — current implementations (CONFIRMED → future wrap)

| Current implementation | Future port | Phase |
|------------------------|-------------|-------|
| `MetaWhatsAppCloudProvider` | `MessagingProviderPort` | C2–C3 |
| `TwilioWebhookService` / `TwilioService` | `TelephonyProviderPort` | C2–C4 |
| `ElevenLabsService` / webhook ingestion | `ConversationalVoiceProviderPort` | C2–C4 |
| Resend integration (org email / notification delivery) | `EmailProviderPort` | C10+ |
| sent.dm (none in repo) | `MessagingProviderPort` (SMS) | C5 |

### Normalization output contract

Each adapter produces a **NormalizedCommunicationEventDraft** (conceptual) consumed by the projection layer:

- Must include: `channel`, `eventType`, `organizationId`, idempotency keys, occurredAt
- Must **not** include: raw secrets, full provider payload (store redacted ref on native/event record)
- May include: customer/booking hints — **subject to identity resolution contract (§11)**

---

## 7. sent.dm / SMS contract

### Status

| Aspect | Label |
|--------|-------|
| sent.dm in repository | **CONFIRMED** absent (audit §F) |
| SMS as V1 channel | **DECISION** |
| sent.dm as SMS provider | **DECISION** |
| sent.dm replaces Meta/Resend/Twilio/ElevenLabs | **DECISION** — No |

### Primary V1 use (DECISION)

```
sent.dm → SMS provider adapter → normalized events → native SMS persistence → CommunicationConversation projection
```

### Future optional capabilities (FUTURE OPTIONAL CAPABILITY)

- WhatsApp via sent.dm
- RCS via sent.dm

**Do not** make sent.dm the canonical WhatsApp provider in V1 or C5.

### Integration requirements (PROPOSED — capability classes)

Where provider capability allows, Phase C5 implementation **must** support:

| Capability | Label |
|------------|-------|
| Outbound SMS | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Inbound SMS | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Provider message ID | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Delivery state | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Failure state | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Idempotency | **DECISION** — required architecturally; mapping **REQUIRES PROVIDER-DOC VERIFICATION** |
| Webhook authentication | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Retries / replay safety | **DECISION** — required; mechanism **REQUIRES PROVIDER-DOC VERIFICATION** |
| Customer phone resolution | **DECISION** — reuse SynqDrive identity contract (§11) |
| Conversation association | **DECISION** — thread grouping per normalized customer phone |

**Do not fabricate** sent.dm webhook field names, endpoint paths, or payload shapes in this contract.

### Phase C5 implementation checklist (PROPOSED)

1. Obtain sent.dm API + webhook documentation (**REQUIRES PROVIDER-DOC VERIFICATION**)
2. Define `OrgSmsConfig` (conceptual) with org-scoped credentials refs — no secrets in DB
3. Implement `SentDmMessagingAdapter` implementing `MessagingProviderPort`
4. Introduce native `SmsConversation` + `SmsMessage` (recommended §13) or approved alternative
5. Webhook endpoint with signature validation per provider docs
6. Idempotent ingest keyed by provider event ID
7. Projection to `CommunicationConversation` + `CommunicationEvent`
8. Inbox visibility in CC Conversations (C9)
9. RBAC: `communication.read/write`; config: `communication.manage`
10. Station scope filtering on read APIs (C6+)
11. Notification policy for `HUMAN_REQUIRED` / delivery failures (C11)
12. E2E tests with provider sandbox (**REQUIRES PROVIDER-DOC VERIFICATION**)

---

## 8. Canonical Conversation contract

### Concept: `CommunicationConversation`

Minimum **operational envelope** over native channel conversations. **PROPOSED** — persistence in C1.

### Fields

| Field | Required | Authoritative | Nullable | Derived | Persisted | Notes |
|-------|----------|---------------|----------|---------|-----------|-------|
| `id` | yes | yes | no | no | yes | Canonical UUID |
| `organizationId` | yes | yes | no | no | yes | Tenant isolation (**CONFIRMED** pattern) |
| `channel` | yes | yes | no | no | yes | `CommunicationChannel` |
| `nativeConversationId` | yes | yes | no | no | yes | FK reference to native row ID |
| `nativeConversationType` | yes | yes | no | no | yes | Discriminator: `whatsapp` \| `voice` \| `sms` |
| `canonicalStatus` | yes | yes | no | partial | yes | Projection of handoff machine (§10) |
| `customerId` | no | yes when set | yes | partial | yes | From identity resolution |
| `bookingId` | no | yes when set | yes | partial | yes | Never silently guessed |
| `vehicleId` | no | yes when set | yes | partial | yes | Often via booking |
| `stationId` | no | yes when set | yes | partial | yes | See §12; `UNRESOLVED` = null |
| `assignedUserId` | no | yes | yes | no | yes | Human owner |
| `assignedAgentId` | no | yes | yes | partial | yes | AI agent/deployment ref |
| `lastActivityAt` | yes | yes | no | partial | yes | Inbox sort key |
| `unreadCount` | yes | yes | no | partial | yes | Aggregated from native |
| `createdAt` | yes | yes | no | no | yes | |
| `updatedAt` | yes | yes | no | no | yes | |
| `metadata` | no | no | yes | yes | optional | Display hints only — **no provider payload** |

### Ownership semantics (DECISION)

| Owner | Meaning |
|-------|---------|
| `assignedAgentId` set, no `assignedUserId` | AI_ACTIVE (default for auto-handled threads) |
| `assignedUserId` set | Human ownership; may coexist with agent for audit |
| Both null | Unassigned — still may be AI_ACTIVE via channel auto-reply |

### Native record relationship (DECISION)

- **One** envelope row per native conversation row (1:1)
- Native tables remain **source of truth** for: message bodies, transcripts, provider IDs, delivery states, templates, call lifecycle
- Envelope deletion follows org cascade; native cascade rules unchanged (**CONFIRMED** WhatsApp/Voice Prisma cascades)

### What must not leak into core contract (DECISION)

- Raw webhook payloads
- Provider secrets
- Full message/transcript text (reference native IDs for detail views)
- Provider-specific enum values as canonical status

---

## 9. Canonical Event contract

### Concept: `CommunicationEvent`

Cross-channel **operational and audit timeline**. Append-only. **PROPOSED** — persistence in C1.

### Event classes (DECISION)

| Category | Event types |
|----------|-------------|
| Message | `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_READ`, `MESSAGE_FAILED` |
| Call | `CALL_STARTED`, `CALL_CONNECTED`, `CALL_ENDED`, `CALL_FAILED` |
| AI | `AI_INTENT_DETECTED`, `AI_ACTION_STARTED`, `AI_ACTION_COMPLETED`, `AI_ACTION_FAILED` |
| Handoff | `HUMAN_REQUIRED`, `HUMAN_ASSIGNED`, `HUMAN_TAKEOVER`, `RESOLVED` |
| Provider | `PROVIDER_ERROR` |

Do **not** over-model provider-native states — map into this set at normalization time.

### Minimum fields (PROPOSED)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | |
| `organizationId` | yes | |
| `conversationId` | yes | Canonical envelope ID |
| `channel` | yes | Redundant but useful for queries |
| `eventType` | yes | From approved set |
| `direction` | no | `INBOUND` \| `OUTBOUND` \| `INTERNAL` where applicable |
| `providerIdentity` | no | e.g. `META_WHATSAPP`, `TWILIO` |
| `providerRole` | no | e.g. `TELEPHONY`, `AI`, `MESSAGING` — disambiguates multi-provider voice |
| `providerEventId` | no | Idempotency |
| `providerMessageId` | no | Message/call correlation |
| `nativeEventRef` | no | Pointer to native audit row if any |
| `actorType` | no | `CUSTOMER` \| `USER` \| `AI_AGENT` \| `SYSTEM` |
| `actorId` | no | |
| `customerId` | no | Snapshot at event time |
| `bookingId` | no | Snapshot |
| `vehicleId` | no | Snapshot |
| `stationId` | no | Snapshot |
| `status` | no | Event-level outcome if needed |
| `occurredAt` | yes | Provider timestamp preferred |
| `metadata` | no | **Canonical operational fields only** |
| `redactedPayloadRef` | no | Optional pointer to native/redacted store — **not inline raw payload** |

### Separation (DECISION)

| Store | Contents |
|-------|----------|
| `CommunicationEvent.metadata` | Canonical operational facts (intent enum, tool name, failure code class) |
| Native webhook tables | Redacted/full provider payloads per existing voice/WhatsApp patterns |
| Canonical event row | Never duplicate full message body or transcript |

---

## 10. Human handoff state machine

### Canonical status set (DECISION)

| Status | Meaning |
|--------|---------|
| `AI_ACTIVE` | AI or automation handling; no human required |
| `WAITING_CUSTOMER` | Ball with customer; no human required |
| `HUMAN_REQUIRED` | Operator intervention needed |
| `HUMAN_ACTIVE` | Human owns active response |
| `RESOLVED` | Terminal — conversation closed/completed |
| `FAILED` | Terminal — unrecoverable failure or abandoned |

These are **Communication Center canonical states** — a **projection** over native state + events. **Do not replace** provider-native enums.

### Native → canonical mapping (CONFIRMED + PROPOSED)

| Native signal | Canonical projection |
|---------------|---------------------|
| WhatsApp `PENDING_HUMAN` (**CONFIRMED** schema) | `HUMAN_REQUIRED` |
| WhatsApp `OPEN` + AI auto-reply | `AI_ACTIVE` |
| WhatsApp `CLOSED` | `RESOLVED` |
| Voice `AI_ACTIVE` lifecycle (**CONFIRMED** schema) | `AI_ACTIVE` |
| Voice `TRANSFERRING` | `HUMAN_REQUIRED` or `HUMAN_ACTIVE` (see transition context) |
| Voice `FAILED` lifecycle / outcome | `FAILED` |
| Voice completed + resolved outcome | `RESOLVED` |
| SMS (future) human queue flag | `HUMAN_REQUIRED` |

Voice `escalationReason` / `ESCALATED` outcome under-populated today (**CONFIRMED** audit) — **C4** must repair before reliable projection.

### Legal transitions (PROPOSED)

```
AI_ACTIVE → WAITING_CUSTOMER | HUMAN_REQUIRED | RESOLVED | FAILED
WAITING_CUSTOMER → AI_ACTIVE | HUMAN_REQUIRED | RESOLVED | FAILED
HUMAN_REQUIRED → HUMAN_ACTIVE | FAILED | RESOLVED
HUMAN_ACTIVE → WAITING_CUSTOMER | AI_ACTIVE | RESOLVED | FAILED
RESOLVED → (non-terminal reopen) → AI_ACTIVE | HUMAN_REQUIRED  [explicit reopen only]
FAILED → (non-terminal reopen) → HUMAN_REQUIRED  [operator retry]
```

Terminal: `RESOLVED`, `FAILED` (reopen is explicit operator action producing events).

### Assignment semantics (DECISION)

| Transition | Effect |
|------------|--------|
| → `HUMAN_REQUIRED` | May set canonical status only; `assignedUserId` optional until claimed |
| → `HUMAN_ACTIVE` | Should set `assignedUserId` (claim) |
| → `AI_ACTIVE` | Clears human requirement; may clear `assignedUserId`; AI agent remains |
| `HUMAN_TAKEOVER` event | Human sends first reply or claims thread |

### Who can transition (PROPOSED — finalized in C0.2 RBAC)

| Actor | Allowed transitions |
|-------|---------------------|
| AI router (WhatsApp/SMS/voice tools) | → `HUMAN_REQUIRED`, `AI_ACTIVE`, `WAITING_CUSTOMER` |
| Operator with `communication.write` | Claim, reply, resolve, reopen |
| Operator with `communication.manage` | Policy overrides, force assign |
| System (delivery failure) | → `FAILED` or flag `HUMAN_REQUIRED` by policy |

### AI → human → AI (DECISION)

- **AI → human:** AI or policy sets `HUMAN_REQUIRED`; optional Task/Notification (§16)
- **Human → AI:** Operator explicit "return to AI" OR auto after reply + policy (`PROPOSED` product detail in C11)
- Round-trip must emit `CommunicationEvent`s — not silent status overwrites

---

## 11. Customer identity resolution

### Canonical principle (DECISION)

These provider identities must resolve to the **same canonical `Customer`** where possible:

- WhatsApp phone
- SMS phone
- Voice caller phone
- Email address

Provider identities **must not** create independent customer entities.

### V1 contract (DECISION)

- **Canonical person/entity:** existing `Customer` model
- **Provider identifiers:** stored as references on native rows / events — not parallel customer tables
- **No duplicate Customer rows** merely because channel differs

### Contact identity resolution (PROPOSED)

Conceptual resolver input:

```
organizationId + channel + normalizedAddress (E.164 phone / email)
  → CustomerMatchResult
```

| Result | Behavior |
|--------|----------|
| `MATCH_SINGLE` | Set `customerId` on envelope |
| `MATCH_NONE` | Leave null; may trigger `HUMAN_REQUIRED` for ops-heavy flows |
| `MATCH_AMBIGUOUS` | **Never silently choose** — leave unresolved or `HUMAN_REQUIRED` |

### Ambiguity rules (DECISION)

**Never silently choose** among:

- Multiple plausible customers
- Multiple active bookings
- Conflicting booking/vehicle links

| Operational impact | Result |
|--------------------|--------|
| Low (inbound greeting) | Unresolved context; AI may ask clarifying question |
| High (payment, contract change, vehicle release) | `HUMAN_REQUIRED` |

### Existing evidence (CONFIRMED)

- WhatsApp: `WhatsAppConversationMatcherService` links customer/booking/vehicle on conversation
- Voice: customer/booking IDs on `VoiceProviderWebhookEvent` scalars only; MCP `identify_customer` tool during calls

---

## 12. Station scope contract

### Approved policy (DECISION)

| Actor | Visibility |
|-------|------------|
| `ORG_ADMIN` / global communication roles | Organization-wide communication |
| Station-scoped users | Conversations in **allowed station scope** only |
| Unresolved/unlinked conversations | **Not** visible to all station workers by default — only users with org-wide `communication.read` (or equivalent global role) |

**Server-side enforcement required** (**DECISION** — invariant). **CONFIRMED** gap: communication APIs today have no station filter (audit §K).

### Station resolution hierarchy (DECISION)

1. Explicit canonical `stationId` on envelope when confidently resolved
2. Linked booking station semantics (pickup/return — see below)
3. Linked vehicle canonical station where appropriate
4. Approved manual assignment by operator
5. Otherwise **UNRESOLVED** (`stationId = null`)

**Do not guess** station from provider phone number unless explicitly configured as canonical org mapping (**DECISION**).

### Edge cases (PROPOSED)

| Scenario | Behavior |
|----------|----------|
| Pickup ≠ return station | Default to **pickup station** for pre-rental; **return station** for active rental/post-return — **OPEN** exact rule in C6 |
| No booking | `stationId` null → org-wide visibility only |
| Vehicle moved station | Prefer booking station at conversation time; vehicle current station only when no booking — document in C6 |
| Multiple active bookings | Do not auto-link; `HUMAN_REQUIRED` or unresolved |
| Conversation predates booking link | Operator manual link; audit via events |

Reference pattern: `NotificationStationScopeService` (**CONFIRMED** audit §D.4).

---

## 13. SMS conversation semantics

### SMS as first-class conversational channel (DECISION)

Unlike transactional Email V1, SMS **must** appear in the unified Conversations inbox.

### Thread grouping (PROPOSED)

- **Primary key:** `organizationId` + normalized customer phone (E.164)
- One active SMS thread per customer phone per org (merge inbound/outbound)
- `lastActivityAt`, `unreadCount` maintained on envelope (+ native)

### Event semantics

Same canonical event types as §9 (message + handoff + AI + provider error).

### Implementation options

| Option | Description |
|--------|-------------|
| **A** | Native `SmsConversation` + `SmsMessage` + envelope projection |
| **B** | Direct `CommunicationConversation` + `CommunicationEvent` only (no native tables) |

### Recommendation: **Option A** (PROPOSED)

**Rationale:**

1. **Consistency** with WhatsApp (`WhatsAppConversation`/`WhatsAppMessage`) and Voice (`VoiceConversation`) — **CONFIRMED** audit pattern
2. Provider-specific IDs, delivery states, idempotency keys belong in native layer
3. Envelope remains thin operational projection
4. sent.dm adapter maps to native first — same pipeline as Meta WhatsApp (§6)
5. Option B would duplicate provider logic in canonical layer and break invariant §18.7–18.8

Native table names are **PROPOSED** for C5; Prisma shape deferred to C1/C5.

---

## 14. Email V1 semantics

### Provider (DECISION)

Resend remains email provider. **CONFIRMED** — org email + notification delivery via Resend paths.

### Persistence (CONFIRMED)

`OutboundEmail` remains reusable for transactional sends.

### CC placement (DECISION)

| Surface | Content |
|---------|---------|
| Channels > Email | Sender settings, domains, delivery history, test send |
| Conversations inbox | **Excluded** for V1 transactional outbound |

### Future upgrade path (PROPOSED)

When inbound/reply threading exists:

1. Introduce native `EmailThread` / `EmailMessage` (or equivalent)
2. Inbound webhook via Resend (or provider) → normalization
3. Include in Conversations when **bidirectional thread semantics** exist
4. Canonical `conversationId` for email thread separate from outbound-only log entries

---

## 15. AI Activity contract

### Scope (DECISION)

**External communication AI only.** Excludes:

- `AIAssistantView` / `ChatMessage` / `AiRequestAuditLog` (**CONFIRMED**)

### Source projections (CONFIRMED)

| Source | Data |
|--------|------|
| `WhatsAppAiSuggestion` | intent, decision, confidence, tools, human approval |
| `VoiceToolExecution` | MCP tool I/O (redacted), status |
| Future SMS AI actions | TBD C5/C11 |
| Approval events | Voice MCP approval flow |

### Minimum read-model (PROPOSED)

Operator must eventually answer:

| Question | Required fields |
|----------|-------------------|
| Which AI agent handled it? | `assignedAgentId`, deployment/agent name |
| What intent was detected? | intent enum / label |
| What entity/context was accessed? | customer/booking/vehicle IDs accessed |
| Which action/tool ran? | tool name, action type |
| Succeeded? | status outcome |
| Human approval required? | approval flag + status |
| Customer-facing output followed? | link to native message/call segment |

AI Activity tab is a **read projection** — not a new execution engine.

---

## 16. Task / Notification integration

### Separation (DECISION)

```
Communication Center state ≠ Notification ≠ Task
```

Three layers — **no duplicate alert engine** (**CONFIRMED** Notification Engine exists).

### Event → attention policy matrix (PROPOSED)

| Condition | CC state | Notification | Task |
|-----------|----------|--------------|------|
| `HUMAN_REQUIRED` | always | optional (role/policy) | optional (policy) |
| Delivery/call failure | event + possibly `FAILED` | optional WARNING | not automatic |
| Overdue/unanswered | `WAITING_CUSTOMER` or flag | optional INFO | optional |
| Active AI conversation | `AI_ACTIVE` | no | no |
| Important completed AI action | event | no | no |
| Provider health degraded | Overview KPI | CRITICAL (org admin) | no |

Reuse:

- `Notification` engine — new domain/event types in later phase (**PROPOSED** C11)
- `OrgTask` — optional human review tasks (**CONFIRMED** WhatsApp pattern)

WhatsApp today: optional `createHumanReviewTask` — **CONFIRMED** audit §I.

---

## 17. Dashboard Communication contract

### Panel name (DECISION)

**"Kommunikation"** — **one box only**.

No separate WhatsApp / Voice / SMS / AI dashboard boxes.

### Purpose (DECISION)

> What is happening now and where does a human need to intervene?

### Canonical future source (PROPOSED — not implemented in C0.1)

```
GET /organizations/:orgId/communication/summary
```

### Conceptual response

```typescript
// PROPOSED — conceptual TypeScript, not implemented
interface CommunicationSummary {
  today: {
    inbound: number;
    outbound: number;
  };
  active: number;
  aiHandled: number;
  humanRequired: number;
  failed: number;
  prioritizedRows: CommunicationSummaryRow[];
}

interface CommunicationSummaryRow {
  conversationId: string;
  channel: 'WHATSAPP' | 'VOICE' | 'SMS'; // EMAIL excluded V1
  priority: 1 | 2 | 3 | 4 | 5;
  priorityReason:
    | 'HUMAN_REQUIRED'
    | 'FAILURE'
    | 'OVERDUE'
    | 'ACTIVE'
    | 'AI_ACTION';
  title: string;
  canonicalStatus: string;
  customerId?: string;
  bookingId?: string;
  stationId?: string;
  assignedUserId?: string;
  lastActivityAt: string;
}
```

### Prioritized row order (DECISION)

1. `HUMAN_REQUIRED`
2. Provider/delivery/call failure
3. Overdue/unanswered communication
4. Currently active communication
5. Important completed AI action

### Station filter (DECISION)

Same semantics as §12 — summary counts and rows filtered server-side for station-scoped users.

### Permission (PROPOSED)

Requires `communication.read` (or legacy compat mapping during migration).

**Invariant:** Dashboard Kommunikation **only** consumes canonical Communication APIs — never parallel channel KPI endpoints (§27.15).

---

## 18. RBAC contract

### Not implemented in C0.1 (DECISION)

Permissions remain unchanged until **C0.2**.

### Required capability modules (PROPOSED)

#### `communication` module

| Capability | Scope |
|------------|-------|
| `communication.read` | Overview, Conversations inbox, transcripts/messages viewing, AI Activity read, dashboard summary |
| `communication.write` | Replies, assignment, status/handoff actions, claim thread |
| `communication.manage` | Org-wide policies, channel connect/disconnect where not delegated, escalation defaults |

#### `voice-assistant` module (separate — PROPOSED)

Deep voice administration:

| Capability | Scope |
|------------|-------|
| `voice-assistant.read` | Agent config read, telephony inventory |
| `voice-assistant.write` | Agent edits, test sessions |
| `voice-assistant.manage` | Telephony provision, deployment, billing/protection admin |

**DECISION:** Keep `voice-assistant` separate for deep configuration; `communication.read` grants ops inbox access without full telephony admin.

#### `ai-assistant` module (existing — CONFIRMED)

**Internal fleet AI only** after migration:

| Current misuse | Target |
|----------------|--------|
| WhatsApp ops uses `ai-assistant` (**CONFIRMED**) | Migrate to `communication.*` |
| Internal chat uses `ai-assistant` | **Unchanged** |

### Backwards-compatible migration (C0.2 — PROPOSED)

1. Add new modules to `PERMISSION_MODULE_KEYS` / Users & Roles UI
2. Default grants: users with `ai-assistant.read` receive `communication.read` during transition
3. WhatsApp endpoints accept **either** permission until deprecation window ends
4. Voice endpoints gain `communication.read` minimum + `voice-assistant.*` for admin routes
5. ORG_ADMIN bypass unchanged (**CONFIRMED** `RentalContext` behavior)

---

## 19. Privacy / retention

### Principles (DECISION)

| Data class | Treatment |
|------------|-----------|
| WhatsApp/SMS message content | PII — protect, minimize exposure in logs |
| Voice transcript | PII — protect |
| Provider payloads | Redact/minimize; not canonical truth |
| Recordings | **Not stored by default** (**CONFIRMED** voice redaction strips `recording_url`) |
| Raw webhook payload | Native audit only; redacted where voice already does (**CONFIRMED** `VoiceRetentionService`, webhook redaction util) |
| Retention | Configurable/explicit per channel |
| Tenant deletion | Cascade safely via org FK patterns (**CONFIRMED** WhatsApp/Voice cascades) |
| AI action logs | No unnecessary prompt secrets |

### Precedent (CONFIRMED)

`VoiceRetentionService` defaults:

- Transcript/summary purge: **90 days** (configurable via deployment privacy snapshot)
- Provider webhook payload purge: **30 days**

WhatsApp message bodies: **no retention purge today** (**CONFIRMED** audit §Q) — **OPEN** parity policy for C13.

**Do not** invent new retention periods in C0.1 beyond referencing existing voice defaults and noting WhatsApp gap.

---

## 20. Idempotency / replay

### Problem (CONFIRMED)

Provider webhooks retry. WhatsApp uses `WhatsAppWebhookEvent.externalEventId`; Voice uses Bull queue + webhook event IDs.

### Required concepts (DECISION)

| Key | Scope |
|-----|-------|
| `providerEventId` | Provider webhook dedupe (native layer) |
| `providerMessageId` | Message/call dedupe |
| `nativeEventDedupe` | Native table unique constraints |
| `envelopeEventDedupe` | `(organizationId, channel, providerEventId, eventType)` or equivalent |
| Safe replay | Admin replay must not duplicate timeline/handoff |

### Rules (DECISION)

1. Native provider integrations **remain responsible** for provider-specific dedupe
2. Communication normalization **must also** be idempotent
3. No duplicate: message events, timeline entries, handoff transitions, dashboard attention rows
4. Projection upsert for envelope: same native conversation → same envelope ID

---

## 21. Migration / feature flags

### Feature flag (PROPOSED)

```
COMMUNICATION_CENTER_ENABLED
```

Repository-consistent env pattern (see stations-v2, IAM MFA flags). Exact resolver deferred to C8.

### Migration principles (DECISION)

1. Existing WhatsApp and Voice **remain operational** throughout
2. Legacy views and CC **may coexist** until parity verified
3. **No destructive migration** before parity
4. Old navigation deprecated **only after** CC functional parity signed off
5. Envelope backfill (C1+) is additive — no native table rewrite

### Parity checklist (PROPOSED — gate for nav deprecation)

- [ ] Unified Conversations shows WhatsApp + Voice + SMS threads
- [ ] Reply, assign, human handoff work per channel
- [ ] Channel config reachable under CC Channels
- [ ] RBAC enforced server-side
- [ ] Station scope enforced server-side
- [ ] Dashboard summary live

---

## 22. Compatibility with current WhatsApp

| Aspect | Current (CONFIRMED) | CC compatibility |
|--------|---------------------|------------------|
| Provider | Meta Cloud API only | Unchanged — wrap with adapter |
| Native tables | `WhatsAppConversation`, etc. | **Remain authoritative** |
| Webhook path | `WhatsAppWebhookService` inline | Add projection hook in C3 — no behavior break |
| Permissions | `ai-assistant` + `data-authorization.manage` | Migrate to `communication.*` in C0.2 |
| UI | `WhatsAppBusinessView` | Coexist until C9/C10 |
| Inbox | Dedicated tab | Deprecated after C9 |
| AI router | `WhatsAppAiRouterService` | Unchanged; emit canonical events |
| Human handoff | `PENDING_HUMAN` | Maps to `HUMAN_REQUIRED` |

---

## 23. Compatibility with current Voice

| Aspect | Current (CONFIRMED) | CC compatibility |
|--------|---------------------|------------------|
| Providers | Twilio + ElevenLabs | Unchanged |
| Native tables | `VoiceConversation`, etc. | **Remain authoritative** |
| Multi-provider | Call SID + EL conversation ID | `providerRole` on events |
| Permissions | Org scope only on most routes | **C0.2** adds RBAC |
| Escalation fields | Under-populated | **C4** repair before reliable projection |
| UI | `VoiceAssistantView` | Coexist until C10 |
| MCP tools | `VoiceToolExecution` | Feed AI Activity projection |
| Transcript retention | 90-day purge | Precedent for policy |

---

## 24. Compatibility with Resend

| Aspect | Current (CONFIRMED) | CC compatibility |
|--------|---------------------|------------------|
| Transactional email | `OutboundEmail`, org email settings | Channels > Email in CC |
| Notification delivery | Resend via notification outbox | Unchanged — separate from CC inbox V1 |
| Conversations | Not included V1 | Future inbound threading |
| Provider port | Adapts in C10+ | No Resend replacement |

---

## 25. sent.dm implementation prerequisites

Before C5 runtime:

| Prerequisite | Status |
|--------------|--------|
| sent.dm API credentials / org config model design | **OPEN** |
| Webhook endpoint + auth scheme | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Inbound SMS payload shape | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Delivery status callbacks | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Sandbox/test mode | **REQUIRES PROVIDER-DOC VERIFICATION** |
| Rate limits / retry policy | **REQUIRES PROVIDER-DOC VERIFICATION** |
| SMS regulatory/compliance (DE/EU) | **OPEN** — product/legal |
| Native SMS schema (Option A) | **PROPOSED** in C1/C5 |
| RBAC + station scope services exist | C0.2 + C6 |
| Normalization port (`MessagingProviderPort`) | C2 |

---

## 26. Ordered C0.2–C13 roadmap

### C0.1 — Canonical Communication Contract

| | |
|--|--|
| **Purpose** | Freeze this document |
| **Prerequisites** | Audit complete |
| **Runtime risk** | None |
| **Migration** | No |
| **Systems touched** | Architecture docs only |
| **Acceptance** | Contract merged; invariants reviewed |

### C0.2 — Communication RBAC

| | |
|--|--|
| **Purpose** | Add `communication.*`, `voice-assistant.*` modules; compat mapping |
| **Prerequisites** | C0.1 |
| **Runtime risk** | Medium — behavior change if misconfigured |
| **Migration** | No |
| **Systems touched** | `permission.constants.ts`, Users & Roles UI, guards (future endpoints) |
| **Acceptance** | Permissions assignable; WhatsApp compat dual-check documented |

### C1 — CommunicationConversation + CommunicationEvent persistence

| | |
|--|--|
| **Purpose** | Prisma models + repository layer only |
| **Prerequisites** | C0.1 |
| **Runtime risk** | Low if unused |
| **Migration** | Yes |
| **Systems touched** | `schema.prisma`, communication module skeleton |
| **Acceptance** | Models migrate; no webhook changes yet |

### C2 — Provider interface / normalization foundation

| | |
|--|--|
| **Purpose** | Port interfaces + normalization draft types + feature-flagged no-op projector |
| **Prerequisites** | C1 |
| **Runtime risk** | Low |
| **Migration** | No |
| **Systems touched** | New `communication/` module, adapter contracts |
| **Acceptance** | Unit tests for draft normalization; zero production behavior change |

### C3 — WhatsApp projection

| | |
|--|--|
| **Purpose** | Envelope + events from WhatsApp webhook path |
| **Prerequisites** | C2 |
| **Runtime risk** | Medium |
| **Migration** | No |
| **Systems touched** | `WhatsAppWebhookService`, projection service |
| **Acceptance** | Idempotent envelope; native path unchanged |

### C4 — Voice projection + escalation repair

| | |
|--|--|
| **Purpose** | Envelope + events from voice webhooks; populate escalation fields |
| **Prerequisites** | C2 |
| **Runtime risk** | Medium |
| **Migration** | Maybe backfill |
| **Systems touched** | `VoiceWebhookProcessingService`, lifecycle service |
| **Acceptance** | `escalationReason` / outcomes reliable; dual-provider events |

### C5 — sent.dm / SMS integration

| | |
|--|--|
| **Purpose** | SMS channel runtime via sent.dm adapter |
| **Prerequisites** | C2, provider docs, C0.2 |
| **Runtime risk** | High — new provider |
| **Migration** | Yes (native SMS tables) |
| **Systems touched** | New SMS module, webhooks, config UI prep |
| **Acceptance** | Inbound/outbound SMS; idempotent; envelope projection |

### C6 — Context + Station Scope

| | |
|--|--|
| **Purpose** | Station resolution service + enforcement on read APIs |
| **Prerequisites** | C1, C0.2 |
| **Runtime risk** | Medium — visibility changes |
| **Migration** | Backfill `stationId` where confident |
| **Systems touched** | Station scope service, envelope updates |
| **Acceptance** | Station workers see scoped threads only |

### C7 — Communication read APIs

| | |
|--|--|
| **Purpose** | `GET /communication/conversations`, detail, summary stub |
| **Prerequisites** | C3–C6 (incremental) |
| **Runtime risk** | Low |
| **Migration** | No |
| **Systems touched** | New controller, DTOs |
| **Acceptance** | Station filter + RBAC enforced; OpenAPI |

### C8 — Communication Center shell

| | |
|--|--|
| **Purpose** | CC nav + Overview + empty Conversations shell behind flag |
| **Prerequisites** | C7 |
| **Runtime risk** | Low |
| **Migration** | No |
| **Systems touched** | `App.tsx`, `Sidebar.tsx`, new CC views |
| **Acceptance** | Flag off = legacy only; flag on = shell loads |

### C9 — Unified Conversations (WhatsApp + Voice + SMS)

| | |
|--|--|
| **Purpose** | Single inbox UI; migrate ops from legacy inbox panels |
| **Prerequisites** | C7, C8, C3–C5 |
| **Runtime risk** | Medium — UX migration |
| **Migration** | No |
| **Systems touched** | CC Conversations tab, reuse chat components |
| **Acceptance** | Parity with legacy inboxes; no second permanent inbox |

### C10 — Channel configuration migration

| | |
|--|--|
| **Purpose** | Move WhatsApp/Voice/SMS/Email config under CC Channels |
| **Prerequisites** | C8, C9 |
| **Runtime risk** | Low |
| **Migration** | No |
| **Systems touched** | Component moves, deep links |
| **Acceptance** | All channel config reachable in CC |

### C11 — AI Activity + Human Handoff

| | |
|--|--|
| **Purpose** | AI Activity tab; canonical handoff; notification/task policy |
| **Prerequisites** | C9, notification registry design |
| **Runtime risk** | High |
| **Migration** | No |
| **Systems touched** | Handoff projector, notification producers, task templates |
| **Acceptance** | End-to-end handoff visible in CC + optional alerts |

### C12 — Dashboard Kommunikation

| | |
|--|--|
| **Purpose** | Summary API + dashboard widget |
| **Prerequisites** | C7, C11 |
| **Runtime risk** | Low |
| **Migration** | No |
| **Systems touched** | Dashboard view model, summary endpoint |
| **Acceptance** | Single box; prioritized rows; station scoped |

### C13 — Retention / observability / legacy cleanup

| | |
|--|--|
| **Purpose** | WhatsApp retention parity, metrics, deprecate legacy nav, Help Center update |
| **Prerequisites** | C9–C12 parity sign-off |
| **Runtime risk** | Medium |
| **Migration** | Maybe data purge jobs |
| **Systems touched** | Retention jobs, nav removal, docs |
| **Acceptance** | Legacy comm nav removed; observability dashboards |

---

## 27. Explicit invariants

Non-negotiable unless explicit architecture version bump:

1. Internal fleet AI chat (`AIAssistantView` / `ChatMessage`) is **not** Communication Center.
2. Platform support tickets (`SupportView` / `SupportTicket`) are **not** Communication Center.
3. **Channel ≠ Provider** — never encode provider as channel.
4. **SMS is a first-class V1 channel** in Conversations.
5. **sent.dm does not replace** Resend, Meta WhatsApp, Twilio, or ElevenLabs.
6. **WhatsApp native persistence** remains authoritative for provider-specific WhatsApp data.
7. **Voice native persistence** remains authoritative for provider-specific voice data.
8. **`CommunicationConversation` is an operational envelope**, not a provider replacement.
9. **One canonical operational inbox** (Conversations) for WhatsApp, Voice, SMS.
10. **No duplicate notification/task engine** — reuse Notification V2 and OrgTask.
11. **Station scope must be enforced server-side** on communication read APIs.
12. **Ambiguous customer/booking resolution must never silently guess.**
13. **Provider webhook replay must be idempotent** at native and canonical layers.
14. **Legacy WhatsApp/Voice UI stays** until CC parity is proven.
15. **Dashboard Kommunikation only consumes canonical Communication APIs.**
16. **Transactional email is not automatically a conversation in V1.**
17. **Provider secrets/raw payloads must not leak into canonical events.**
18. **No provider-specific enum may become the cross-channel canonical state model.**

---

## 28. Open technical questions

| ID | Question | Phase |
|----|----------|-------|
| Q1 | Pickup vs return station when both exist — single rule | C6 |
| Q2 | WhatsApp message retention parity with voice (90d?) | C13 |
| Q3 | Human → AI return: explicit button vs automatic timeout | C11 |
| Q4 | Email inbound provider: Resend only or multi-provider | Post-V1 |
| Q5 | sent.dm full API surface | C5 — **REQUIRES PROVIDER-DOC VERIFICATION** |
| Q6 | SMS opt-out / compliance keyword handling | C5 |
| Q7 | Unified `assignedAgentId` format across WhatsApp AI vs Voice deployment | C1 |
| Q8 | Workflow automations: full embed vs deep-link only | C8/C10 |
| Q9 | Master Admin vs Org Admin for sent.dm credentials | C5 |
| Q10 | Reopen RESOLVED conversation — auto vs manual | C11 |

---

## 29. Final architecture decision

**Freeze approved:** Communication Center V1 is a **conversation-centric operational layer** over **existing and planned native channel stacks**, with **strict product boundaries**, **channel/provider separation**, **one unified inbox** for WhatsApp/Voice/SMS, **Email config-only in V1**, **sent.dm as SMS provider addition**, and **phased migration C0.2–C13** without breaking current Meta/Twilio/ElevenLabs/Resend runtime.

**Next step:** C0.2 — Communication RBAC module definitions and backwards-compatible guard mapping.

---

*Document version: V1.0 — C0.1 freeze candidate.*
