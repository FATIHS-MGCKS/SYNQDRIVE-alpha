# Communication Center Canonical Architecture Audit

**Audit date:** 2026-08-21  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Audited commit SHA:** `df4c981bcf232b53c1d4aeb5f6991cf3e1af4b93`  
**Branch audited:** `main`  
**Scope:** Repository-wide read-only audit of existing communication, messaging, voice, WhatsApp, AI agent, notification, and dashboard surfaces to inform a future canonical **Communication Center** product area.  
**Audit mode:** READ-ONLY — no application code, migrations, routes, or UI were modified.

---

## A. Executive summary

SynqDrive already ships **substantial, production-grade customer communication infrastructure** across three parallel channel stacks — **WhatsApp (Meta Cloud API)**, **Voice AI (Twilio + ElevenLabs)**, and **org email outbound** — plus a separate **internal fleet AI chat** (`ChatMessage` / `AIAssistantView`) and **platform support tickets** (`SupportTicket`). There is **no unified Communication Center**, **no cross-channel conversation model**, and **no sent.dm integration** anywhere in the repository.

**CONFIRMED:** WhatsApp and Voice each maintain **channel-native conversation tables** (`WhatsAppConversation`, `VoiceConversation`) with org scoping, AI routing, and partial human-escalation semantics. WhatsApp links customer/booking/vehicle at the conversation row; Voice links customer/booking only on webhook events (scalar IDs, no Prisma FK on `VoiceConversation`).

**CONFIRMED:** The Notification Engine V2 explicitly marks **WhatsApp, Voice, and SMS as `disabled`** delivery channels (`docs/notification-engine-channel-matrix.md`, `notification-channel-matrix.ts`). Communication events do **not** flow through the canonical notification inbox today; human intervention is surfaced via WhatsApp `PENDING_HUMAN` status, optional Task creation, and Voice analytics — not a unified operational inbox.

**CONFIRMED:** Frontend surfaces are **fragmented** under Automation (WhatsApp, Voice, Workflow), Quick Actions (internal AI chat), and Administration (Email). Voice APIs largely bypass the membership permission matrix (`PERMISSION_MODULE_KEYS` has no `voice-assistant` module); WhatsApp reuses `ai-assistant` permissions.

**INFERRED:** A conversation-centric Communication Center should **normalize at the read/ops layer first**, wrapping existing channel tables rather than replacing them immediately. The minimum net-new persistence is a **canonical conversation envelope** (or view/projection) plus **cross-channel handoff state** and **AI action audit linkage** — not a full rewrite of Meta or ElevenLabs integrations.

**Verdict:** **Proceed with phased Communication Center implementation.** Foundation exists; gaps are **unification, RBAC, dashboard aggregation, notification integration, and canonical handoff semantics** — not greenfield provider wiring.

| Priority | Finding |
|----------|---------|
| **P0** | No unified inbox or cross-channel conversation ID; operators must switch WhatsApp vs Voice views |
| **P0** | Voice tenant APIs lack dedicated RBAC module — any org member can access most voice endpoints |
| **P1** | Communication events not integrated with Notification Engine — risk of duplicate alerting if bolted on without design |
| **P1** | Voice `escalationReason` / `ESCALATED` outcome fields exist in schema but are **not populated** from webhooks/sync (CONFIRMED by code trace) |
| **P1** | No sent.dm; Meta Cloud API is the sole WhatsApp provider — future provider swap requires normalization boundary |
| **P2** | Help Center still marks Voice/WhatsApp as "Demnächst" while live UI is shipped |
| **P2** | Station scoping absent on all communication APIs — station context only via linked booking |

**Changes / Architektur:** Not updated (read-only audit per scope).

---

## B. Current-state architecture map

### High-level topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RENTAL FRONTEND (SPA)                                │
│  App.tsx view router (in-memory, not URL routes)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Quick Actions          Automation                    Administration          │
│  ai-assistant          workflow-automation           settings/email-versand  │
│                        ai-voice-assistant                                    │
│                        whatsapp-business                                     │
│ Support / Help Center (platform tickets — not customer omnichannel)          │
└───────────────┬─────────────────────┬──────────────────────┬──────────────┘
                │                     │                      │
                ▼                     ▼                      ▼
┌───────────────────────┐ ┌─────────────────────┐ ┌─────────────────────────┐
│ AiModule / chat       │ │ WhatsAppModule      │ │ OrgEmailModule          │
│ ChatService           │ │ MetaWhatsAppCloud   │ │ OutboundEmail           │
│ FleetChatOrchestrator │ │ WhatsAppAiRouter    │ │                         │
└───────────────────────┘ └──────────┬──────────┘ └─────────────────────────┘
                                     │
┌────────────────────────────────────┴────────────────────────────────────────┐
│ Voice stack: voice-assistant, twilio, voice-webhook-ingestion,                │
│ voice-call-orchestration, voice-mcp-gateway, voice-protection, voice-billing  │
│ Providers: Twilio (PSTN), ElevenLabs (agent), MCP tools during calls          │
└───────────────────────────────────────────────────────────────────────────────┘
                │                     │                      │
                ▼                     ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL (Prisma)                                                          │
│ WhatsAppConversation/Message, VoiceConversation, ChatMessage,                │
│ Notification*, SupportTicket*, OutboundEmail*, VoiceToolExecution*          │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Async: BullMQ voice.webhook.process | notification.evaluation/delivery      │
│ Workers: VoiceRetentionScheduler (cron transcript purge)                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Master Admin (separate SPA)

- `frontend/src/master/App.tsx` → `VoiceAssistantAdminView` (`voice-assistant` view, `MASTER_ADMIN`)
- Platform integrations tabs include communication-related provider health
- Twilio/ElevenLabs control-plane provisioning under `admin/voice-assistant/*`

### Domain separation (critical)

| Domain | Purpose | Primary persistence |
|--------|---------|---------------------|
| **Customer comms (external)** | WhatsApp, Voice PSTN, transactional email | `WhatsApp*`, `Voice*`, `OutboundEmail` |
| **Internal ops AI** | Fleet intelligence for rental staff | `ChatMessage`, `OrganizationChatAgent`, `AiRequestAuditLog` |
| **Platform support** | Tenant ↔ SynqDrive support desk | `SupportTicket`, `SupportTicketMessage` |
| **Operational alerts** | Fleet health, invoices, tasks, etc. | `Notification` (V2 engine) |

These must **not** be conflated in Communication Center IA.

---

## C. Exact frontend inventory

Navigation uses **in-memory `currentView`** in `frontend/src/rental/App.tsx` (line ~216). No dedicated URL routes for communication views.

### C.1 WhatsApp Business Operations Center

| Attribute | Value |
|-----------|-------|
| **File** | `frontend/src/rental/components/WhatsAppBusinessView.tsx` |
| **Subcomponents** | `whatsapp/WhatsAppInboxLayout.tsx`, `WhatsAppConversationInbox.tsx`, `WhatsAppChatPanel.tsx`, `WhatsAppSettingsPanel.tsx`, `WhatsAppSetupWizard.tsx`, `WhatsAppTemplateManager.tsx`, `WhatsAppOverviewTab.tsx`, `WhatsAppContextDrawer.tsx`, … |
| **View ID** | `whatsapp-business` |
| **Nav** | Sidebar → Automation → WhatsApp Business (`Sidebar.tsx` ~183–200) |
| **Frontend permission** | **None** — always visible in Automation section |
| **Backend permission** | `@RequirePermission('ai-assistant', 'read'|'write')`; connect/disconnect requires `data-authorization.manage` |
| **Org/station scope** | Org via `useRentalOrg().orgId`; **no station filter** |
| **API client** | `api.whatsapp.*` in `frontend/src/lib/api.ts` |
| **Type** | **Mixed** — config (wizard, settings), ops (inbox, send, AI reply), monitoring (KPIs, stats), templates |
| **Production status** | **CONFIRMED shipped** — full ops UI, e2e-adjacent unit tests in `whatsapp.ops.test.ts` |
| **Migrate to CC?** | **Yes** — inbox + templates + settings become CC sub-areas; nav entry eventually replaced by Communication Center |
| **Old nav disappear?** | **Yes**, after CC shell ships with redirect/alias |

**Internal tabs** (local state, not routes): `overview` | `inbox` | `templates` | `settings`.

**Wiring:** `load()` fetches config, stats, conversations; inbox requires `config.isConnected`.

### C.2 AI Voice Assistant

| Attribute | Value |
|-----------|-------|
| **File** | `frontend/src/rental/components/VoiceAssistantView.tsx` |
| **Subcomponents** | `voice-assistant/VoiceOnboardingWizard.tsx`, `VoiceOperationsOverview.tsx`, `VoiceConversationsPanel.tsx`, `VoiceAssistantBuilder.tsx`, `VoiceTelephonyWizard.tsx`, `VoiceAnalyticsView.tsx`, `VoiceTestCenter.tsx`, … |
| **View ID** | `ai-voice-assistant` |
| **Nav** | Sidebar → Automation → AI Voice Assistant |
| **Frontend permission** | **None** |
| **Backend permission** | `OrgScopingGuard` + `RolesGuard` only on most routes; billing/protection/outbound require `ORG_ADMIN`/`SUB_ADMIN` |
| **Org/station scope** | Org-level phone/agent; no station membership filter |
| **API client** | `api.voiceAssistant.*`, billing, protection |
| **Type** | **Mixed** — config (builder, telephony wizard), ops (conversations, sync), monitoring (analytics, usage) |
| **Production status** | **CONFIRMED shipped** — onboarding wizard, ElevenLabs/Twilio integration, master control plane |
| **Migrate to CC?** | **Yes** — conversations + channel config; Voice-specific analytics may remain Voice tab |
| **Old nav disappear?** | **Yes**, consolidated under CC Voice channel |

**Internal ops tabs:** `overview` | `conversations` | `automations` | `analytics` | `settings`.

### C.3 Internal AI Fleet Assistant (NOT customer comms)

| Attribute | Value |
|-----------|-------|
| **File** | `frontend/src/rental/components/AIAssistantView.tsx` |
| **View ID** | `ai-assistant` |
| **Nav** | Sidebar → Quick Actions |
| **Frontend permission** | **None** |
| **Backend permission** | `@RequirePermission('ai-assistant', 'read'|'write')` on `/organizations/:orgId/chat/*` |
| **API** | `api.chat.*`, `streamChatMessage()` SSE |
| **Type** | **Ops/monitoring** — internal fleet intelligence |
| **Migrate to CC?** | **No** — keep separate; different audience and data model |
| **Station scope** | **CONFIRMED** — `ChatExecutionContextResolver` applies membership station scope to tools |

### C.4 Email & Delivery Settings

| Attribute | Value |
|-----------|-------|
| **File** | `frontend/src/rental/components/settings/email/EmailVersandTab.tsx` |
| **View ID** | `settings` + tab `email-versand` |
| **Nav** | Sidebar → Administration → E-Mail & Versand |
| **Frontend permission** | Write: `ORG_ADMIN` \| `MASTER_ADMIN` only |
| **Backend** | Reads: org member; mutations: `@Roles('ORG_ADMIN', 'MASTER_ADMIN')` |
| **API** | `api.orgEmail.*` |
| **Type** | **Config + monitoring** (domains, sender, outbound history) |
| **Migrate to CC?** | **Yes** — Email channel under CC Settings |
| **Old nav disappear?** | **Optional** — may remain linked from CC Settings |

### C.5 Workflow Automation (communication-adjacent)

| Attribute | Value |
|-----------|-------|
| **File** | `frontend/src/rental/components/WorkflowAutomationView.tsx` |
| **View ID** | `workflow-automation` |
| **Nav** | Automation (gated: `workflow-automation.read`) |
| **Type** | Config + ops for rules triggering `channel.whatsapp.send`, voice actions, etc. |
| **Migrate to CC?** | **Partial** — link/embed automations tab; do not duplicate rule engine UI |
| **Maker-checker** | External comm actions require approval (`workflow-maker-checker.constants.ts`) |

### C.6 Support & Help Center

| Surface | File | View ID | CC relevance |
|---------|------|---------|--------------|
| Platform support | `SupportView.tsx` | `support` | **Exclude** — B2B SynqDrive support, not customer omnichannel |
| Docs | `HelpCenterView.tsx` | `help-center` | Update when CC ships; **INFERRED stale** — marks Voice/WhatsApp "Demnächst" while live |

### C.7 Master Admin surfaces

| File | View | Purpose |
|------|------|---------|
| `VoiceAssistantAdminView.tsx` | `voice-assistant` | Control plane, provisioning, webhook replay |
| `PlatformIntegrationsSettingsTab.tsx` | `communication` tab id | Platform-level comm settings label "Kommunikation" |

### C.8 Sidebar wiring gaps

- **CONFIRMED:** Collapsed desktop sidebar omits WhatsApp/Voice icons — only expanded Automation accordion exposes them.
- **CONFIRMED:** No `communication-center` view exists anywhere in codebase.

---

## D. Exact backend inventory

### D.1 WhatsAppModule (`backend/src/modules/whatsapp/`)

| Dimension | Details |
|-----------|---------|
| **Controllers** | `WhatsAppController` — `organizations/:orgId/whatsapp/*`; `WhatsAppWebhookController` — `webhooks/whatsapp` (public) |
| **Key services** | `WhatsAppService`, `WhatsAppWebhookService`, `WhatsAppAiRouterService`, `WhatsAppConversationMatcherService`, `WhatsAppMessagePolicyService`, `WhatsAppTemplateService`, `WhatsAppQuickActionsService`, `WhatsAppBookingReminderService`, `WhatsAppProviderService` → `MetaWhatsAppCloudProvider` |
| **Prisma** | `OrgWhatsAppConfig`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppWebhookEvent`, `WhatsAppConsent`, `WhatsAppTemplate`, `WhatsAppAiSuggestion` |
| **Jobs/queues** | **None** — synchronous webhook processing with idempotency via `WhatsAppWebhookEvent.externalEventId` |
| **Provider** | **Meta WhatsApp Cloud API** (Graph); **no sent.dm** |
| **Auth** | Tenant: `OrgScopingGuard` + `PermissionsGuard`; webhook: verify token + HMAC signature (prod) |
| **Org scoping** | Strict via `:orgId` and `phoneNumberId` resolution |
| **Station scoping** | None at API; station from linked booking in AI context |
| **Notifications** | **Does not emit** Notification V2 events |
| **Audit** | `AuditService` / `ActivityLog` (`ActivityEntity.INTEGRATION`) |
| **Frontend** | `api.whatsapp.*`, `WhatsAppBusinessView` |

**Tenant endpoints (sample):** config, connect/disconnect, conversations, messages, AI suggestion/reply, human-review, quick actions, booking/damage reminders, templates, stats, simulate-incoming (sandbox).

### D.2 Voice stack

| Module | Controller prefix | Key responsibility |
|--------|-------------------|-------------------|
| `voice-assistant` | `organizations/:orgId/voice-assistant/*`, `admin/voice-assistant/*` | Agent CRUD, conversations, analytics, telephony, outbound calls |
| `twilio` | `webhooks/twilio/*`, admin provisioning | PSTN webhooks, TwiML, subaccount provisioning |
| `voice-webhook-ingestion` | `webhooks/elevenlabs/*`, replay endpoints | Bull ingest, lifecycle, correlation |
| `voice-call-orchestration` | (no controller — service layer) | Inbound/outbound routing policy |
| `voice-mcp-gateway` | `POST /mcp/voice/:orgId` | JSON-RPC tools during live calls |
| `voice-protection` | `.../protection/*` | Budget, abuse, concurrent call limits |
| `voice-billing` | `.../billing/*` | Plans, usage ledger |

**Prisma (voice):** `VoiceAssistant`, `VoiceConversation`, `VoicePhoneNumber`, `VoiceAgentDeployment`, `VoiceProviderWebhookEvent`, `VoiceToolExecution`, `VoiceApprovalRequest`, `VoiceUsageEvent`, `TwilioWebhookEvent`, …

**Jobs:** Bull `voice.webhook.process` (5 retries, exponential backoff); cron `VoiceRetentionScheduler` (`15 4 * * *`).

**Notifications:** Budget warnings → **ActivityLog only**, not Notification Engine.

### D.3 AiModule / chat (`backend/src/modules/ai/chat/`)

| Dimension | Details |
|-----------|---------|
| **Routes** | `organizations/:orgId/chat/*` — agent, message, stream, history |
| **Permissions** | `ai-assistant` read/write |
| **Prisma** | `ChatMessage`, `OrganizationChatAgent`, `AiRequestAuditLog` |
| **Provider** | LLM gateway (Mistral configurable) — **not** WhatsApp/Voice |
| **Station scope** | **CONFIRMED** via `ChatExecutionContextResolver` |

### D.4 NotificationsModule

| Dimension | Details |
|-----------|---------|
| **Routes** | `organizations/:orgId/notifications/*` (feature flag `NOTIFICATIONS_V2`) |
| **Channels** | In-app active; email active; **WhatsApp/Voice/SMS disabled** in engine |
| **Station scope** | `NotificationStationScopeService` filters list/counts |
| **Producers** | Vehicle health, invoices, legal docs, tasks — **no comms event types** |

### D.5 Workflow automation (communication actions)

- Actions: `channel.whatsapp.send`, `whatsapp.template.send`, `whatsapp.ai_message.send`, voice-related actions
- Rollout kill switches: `killSwitchWhatsapp`, `killSwitchVoice` per org/global
- Risk classification: EXTERNAL for WhatsApp/SMS sends
- `WhatsAppAutomationHooksService` — **INFERRED placeholder** for workflow-driven WhatsApp from notifications

### D.6 Org email

- `OutboundEmail` model + org email settings controllers
- Transactional booking/invoice sends separate from Communication Center inbox scope
- History API consumed by `EmailVersandTab`

---

## E. Database / Prisma inventory

### E.1 WhatsApp models

| Model | Purpose | Org | Station | Customer | Booking | Vehicle | User | Timestamps / retention |
|-------|---------|-----|---------|----------|---------|---------|------|------------------------|
| `OrgWhatsAppConfig` | Meta credentials, AI policy | 1:1 Cascade | — | — | — | — | — | `connectedAt`, `lastWebhookAt` |
| `WhatsAppConversation` | Thread per normalized phone | Cascade | — | SetNull | SetNull | SetNull | `assignedTo` | `lastMessageAt`, unread; **Cascade** with org |
| `WhatsAppMessage` | Message bodies + delivery status | Cascade | — | — | — | — | sender metadata | `createdAt`; full content retained |
| `WhatsAppWebhookEvent` | Raw webhook idempotency | SetNull | — | — | — | — | — | append-only |
| `WhatsAppAiSuggestion` | AI intent/decision audit | Cascade | — | — | — | — | `approvedByUserId` | append-only |
| `WhatsAppConsent` | Opt-in/out | Cascade | — | SetNull | — | — | — | |
| `WhatsAppTemplate` | Meta templates | Cascade | — | — | — | — | — | |

**Enums:** `WhatsAppConversationStatus` = `OPEN`, `PENDING_HUMAN`, `CLOSED`; `WhatsAppAiDecision` includes `HUMAN_REQUIRED`.

### E.2 Voice models

| Model | Purpose | Org | Customer FK | Booking FK | Key fields |
|-------|---------|-----|-------------|------------|------------|
| `VoiceAssistant` | Agent config, escalation phones | 1:1 | — | — | `elevenLabsAgentId`, `escalationPhone`, tool permissions |
| `VoiceConversation` | Call session | Cascade | **No FK** | **No FK** | `transcript`, `summary`, `twilioCallSid`, `lifecycleState`, `escalationReason` |
| `VoiceProviderWebhookEvent` | Redacted webhook intake | SetNull | scalar `customerId` | scalar `bookingId` | correlation keys |
| `VoiceToolExecution` | MCP tool audit | Cascade | — | — | redacted I/O |
| `VoicePhoneNumber` | Org phone inventory | Cascade | — | — | regulatory, ElevenLabs import |

**Lifecycle enum:** `VoiceConversationLifecycleState` includes `AI_ACTIVE`, `TRANSFERRING`, `FAILED`, …

**Retention:** `VoiceRetentionService` nulls `transcript`/`summary` (~90 days) and webhook `redactedPayload` (~30 days) per deployment privacy config.

**Recording:** **No DB table** — `recording_url` stripped at webhook ingestion.

### E.3 Other relevant models

| Model | CC relevance |
|-------|--------------|
| `ChatMessage` | Internal AI only — **do not merge** |
| `SupportTicket` / `SupportTicketMessage` | Platform support — **exclude** |
| `Notification` | Operational alerts — integrate via events, not duplicate |
| `OrgTask` | Optional handoff target (`createHumanReviewTask` for WhatsApp) |
| `OutboundEmail` | Email channel history |
| `AiRequestAuditLog` | Internal AI audit |
| `ActivityLog` | Integration audit for WhatsApp sends |

### E.4 Persistence sufficiency assessment

**Do we possess enough persistence for a canonical Communication Center?**

**Partially.** Channel-native storage is mature; **cross-channel canonical layer is missing**.

| Concept | Classification | Rationale |
|---------|----------------|-----------|
| WhatsApp threads | **REUSE** | `WhatsAppConversation` + messages sufficient |
| Voice calls | **REUSE** | `VoiceConversation` sufficient for voice channel |
| Email outbound | **REUSE** | `OutboundEmail` + org email settings |
| Unified conversation ID | **NEW REQUIRED** | No cross-channel parent entity |
| Cross-channel handoff state | **EXTEND** | WhatsApp `PENDING_HUMAN` exists; Voice escalation config exists; no shared enum |
| AI action audit (customer-facing) | **EXTEND** | `WhatsAppAiSuggestion`, `VoiceToolExecution` — need unified read model |
| Customer/booking linkage (voice) | **EXTEND** | Webhook events carry IDs; `VoiceConversation` lacks FKs |
| Participant model | **NEW REQUIRED** | Phone/email identities not normalized across channels |
| Provider config | **REUSE** | Per-channel config tables |
| Delivery/read receipts | **REUSE** | WhatsApp message status; voice lifecycle states |

---

## F. WhatsApp end-to-end flow

### Provider

**CONFIRMED:** Meta WhatsApp Cloud API via `MetaWhatsAppCloudProvider` (`backend/src/modules/whatsapp/providers/meta-whatsapp-cloud.provider.ts`).  
**CONFIRMED:** **sent.dm is absent** — zero repository matches.

### Flow trace

```
Meta Cloud API
  → GET/POST /api/v1/webhooks/whatsapp
  → WhatsAppWebhookService.receiveWebhook
      → signature validation (HMAC, required in prod)
      → idempotent WhatsAppWebhookEvent (externalEventId)
      → handleInboundMessage | handleStatusUpdate
          → WhatsAppConversationMatcherService (customer/booking/vehicle)
          → upsert WhatsAppConversation + WhatsAppMessage
          → WhatsAppConsentService (opt-in/out keywords)
          → AuditService (INTEGRATION)
          → WhatsAppService.processInboundAutoReply (if aiMode AUTO_SIMPLE|FULL)
              → WhatsAppAiRouterService.route
              → WhatsAppMessagePolicyService.canAutoReply / requiresHumanApproval
              → optional outbound via Meta provider
```

### Capability checklist

| Capability | Status | Evidence |
|------------|--------|----------|
| Configuration | **CONFIRMED** | `OrgWhatsAppConfig`, setup wizard UI |
| Inbound webhook | **CONFIRMED** | `WhatsAppWebhookController` |
| Outbound send | **CONFIRMED** | `WhatsAppService.sendMessage`, AI reply |
| Delivery/read status | **CONFIRMED** | `WhatsAppMessageDeliveryStatus`, status webhooks |
| Templates | **CONFIRMED** | `WhatsAppTemplate`, Meta sync |
| Media | **INFERRED supported** | `messageType` field; verify media handlers in service |
| Retry/idempotency | **CONFIRMED** | `externalEventId`, `idempotencyKey`, `providerMessageId` dedupe |
| Customer matching | **CONFIRMED** | `WhatsAppConversationMatcherService` |
| Org isolation | **CONFIRMED** | orgId on all queries; webhook resolves via `phoneNumberId` |
| Station handling | **INFERRED indirect** | Via booking context only |
| AI integration | **CONFIRMED** | `WhatsAppAiRouterService`, tools, intents |
| Human takeover | **CONFIRMED partial** | `PENDING_HUMAN`, `requestHumanReview`, optional Task |
| Notification integration | **MISSING** | No Notification V2 emission |
| Workflow integration | **PARTIAL** | Reminder services + maker-checker actions; hooks placeholder |

### Missing links

1. No unified inbox projection combining WhatsApp + Voice + email threads
2. No Notification Engine event for `PENDING_HUMAN`
3. `assignedTo` user assignment exists but no canonical handoff state machine across channels
4. No station-scoped conversation filtering

---

## G. Voice end-to-end flow

### Providers

**CONFIRMED:** Twilio (PSTN, webhooks, provisioning) + ElevenLabs (Conversational AI agent, post-call webhooks) + SynqDrive MCP gateway for live tool calls.

### Inbound call flow

```
Caller PSTN
  → Twilio → POST /webhooks/twilio/voice
  → TwilioWebhookService (signature validation)
  → VoiceWebhookIngestService → Bull voice.webhook.process
  → TwilioVoiceBridgeService.buildInboundTwiml
  → VoiceCallOrchestrationService.resolveInboundRoute
      (native ElevenLabs | fallback | rejected)
  → VoiceConversation created/updated

During call:
  → ElevenLabs agent → POST /mcp/voice/:orgId (Bearer MCP token)
  → VoiceMcpToolsService / write tools + approval flow

Post-call:
  → POST /webhooks/elevenlabs/post-call/:orgId (HMAC)
  → lifecycle: transcript, summary, outcome
  → VoiceUsageLedgerService (billing)
  → VoiceBudgetWarningService
```

### Capability checklist

| Capability | Status | Evidence |
|------------|--------|----------|
| Phone number config | **CONFIRMED** | `VoicePhoneNumber`, telephony wizard UI |
| Agent configuration | **CONFIRMED** | `VoiceAssistant`, `VoiceAgentDeployment` |
| Webhook signature verification | **CONFIRMED** | Twilio `x-twilio-signature`; ElevenLabs HMAC |
| Call IDs | **CONFIRMED** | `twilioCallSid`, `elevenLabsConvId`, `providerConversationId` |
| Transcript storage | **CONFIRMED** | `VoiceConversation.transcript` (retention purge) |
| Recording handling | **CONFIRMED partial** | Provider-side; URLs redacted at ingest — no DB storage |
| AI tool calls | **CONFIRMED** | `VoiceToolExecution`, MCP gateway |
| Human transfer | **CONFIRMED config** | Agent deployment transfer rules → ElevenLabs; `TRANSFERRING` lifecycle |
| Escalation tracking | **GAP** | `escalationReason`, `ESCALATED` outcome **not written** from webhooks/sync |
| Customer/booking linkage | **PARTIAL** | Scalar IDs on webhook events only |
| Outbound calls | **CONFIRMED** | `POST .../calls/outbound`, policy + budget checks |
| Org isolation | **CONFIRMED** | All queries org-scoped |
| UI config | **CONFIRMED** | `VoiceAssistantView`, onboarding wizard |

### Missing links

1. No REST API for operator "take over" mid-call — transfer is agent-config → ElevenLabs
2. Voice conversations not surfaced in a unified inbox with WhatsApp
3. Escalation analytics fields under-populated
4. No Notification Engine integration for failed calls or human-required states

---

## H. AI agent / action architecture

### Internal SynqDrive user AI (fleet chat)

| Question | Answerable today? | Source |
|----------|-------------------|--------|
| Which agent handled? | **Yes** | `OrganizationChatAgent` |
| What did user ask? | **Yes** | `ChatMessage` |
| Intent detected? | **Partial** | Fleet chat intent router |
| Entities read? | **Partial** | Tool execution in orchestrator |
| Tools executed? | **Partial** | Domain tools, limits |
| Booking modified? | **Via tools** | If tool invoked |
| Human escalation? | **No** | Not applicable |
| Audit sequence? | **Yes** | `AiRequestAuditLog` |

### External customer AI (WhatsApp + Voice)

| Question | WhatsApp | Voice |
|----------|----------|-------|
| Which agent handled? | AI mode + suggestion record | `VoiceAssistant` / deployment |
| Customer question | `WhatsAppMessage.content` | `transcript` |
| Intent | `WhatsAppAiIntent`, suggestion | **INFERRED limited** — not structured intent enum on voice |
| Entities read | `sourceContextIds`, tools in suggestion | `VoiceToolExecution` |
| Tools/actions | `WhatsAppAiToolsService` | MCP write tools + approval |
| Booking modified? | Via AI tools (policy gated) | Via MCP write tools |
| Human escalation? | `HUMAN_REQUIRED`, `PENDING_HUMAN` | Transfer rules; MCP approval |
| Audit? | `WhatsAppAiSuggestion` | `VoiceToolExecution`, webhook events |
| Success/failure? | Message status, decision enum | `VoiceConversationOutcome`, tool status |

**Reusable infrastructure:** AI limits (`ai-agent-limits.service.ts`), audit patterns, tool orchestration patterns, MCP gateway architecture.

**Communication-specific:** Channel routers, conversation matchers, message policy, voice lifecycle — keep separate behind normalization boundary.

---

## I. Human handoff current state

### Existing equivalent states

| Illustrative target | WhatsApp | Voice |
|---------------------|----------|-------|
| AI_ACTIVE | Implicit (OPEN + AI auto-reply) | `VoiceConversationLifecycleState.AI_ACTIVE` |
| WAITING_CUSTOMER | **INFERRED** — no explicit enum | **INFERRED** — no explicit enum |
| HUMAN_REQUIRED | `WhatsAppAiDecision.HUMAN_REQUIRED` → `PENDING_HUMAN` | Config triggers; MCP approval for writes |
| HUMAN_ACTIVE | `assignedTo` set; operator replies manually | `TRANSFERRING` lifecycle (provider-side) |
| RESOLVED | `CLOSED` | `VoiceConversationOutcome.RESOLVED` |
| FAILED | Message `FAILED` status | `FAILED` lifecycle / outcome |

### Assignment model

- **WhatsApp:** `WhatsAppConversation.assignedTo` (user ID), optional Task via `createHumanReviewTask`
- **Voice:** `escalationUserId`, `escalationPhone`, transfer rules in agent deployment — **no SynqDrive inbox assignment API**

### How humans know intervention is required

1. WhatsApp inbox filtered by `PENDING_HUMAN` status
2. Optional Task created (if `aiCanCreateTasks`)
3. Voice analytics "open escalations" KPI (**INFERRED** from `escalatedCalls` counter / analytics UI)
4. **NOT** via Notification Engine or dashboard "Kommunikation" panel (does not exist)

### AI → human → AI ownership

**GAP:** No canonical state machine supporting round-trip ownership transfer across channels.

### Recommended canonical state machine (PROPOSED)

```
AI_ACTIVE → WAITING_CUSTOMER → HUMAN_REQUIRED → HUMAN_ACTIVE → RESOLVED
                     ↓                              ↓
                  FAILED ←──────────────────────── FAILED
```

Implement as **projection/envelope** over channel-native statuses — do not break Meta/ElevenLabs semantics.

---

## J. Customer / booking / vehicle / station context flow

### Phone → customer resolution

| Channel | Resolution path | Persistence |
|---------|-----------------|-------------|
| WhatsApp | `WhatsAppConversationMatcherService` on inbound | FK on `WhatsAppConversation` |
| Voice | MCP `identify_customer` tool + webhook correlation | Scalar on webhook event only |
| Email | Recipient address → customer lookup in send flows | Outbound email metadata |

### Booking / vehicle context

| Channel | Booking link | Vehicle link | Station |
|---------|--------------|--------------|---------|
| WhatsApp | **CONFIRMED** FK on conversation | **CONFIRMED** FK | Via booking detail in AI context |
| Voice | Scalar on webhook event | **INFERRED** via tools | Transfer targets may use station phone |
| Email | Template params / booking sends | — | — |

### Conversation inspector requirements vs today

| Field | Available today | Derivable | Missing |
|-------|-----------------|-----------|---------|
| Customer | WhatsApp yes; Voice partial | Voice via tool execution join | Voice FK on conversation |
| Booking | WhatsApp yes; Voice partial | Context service | Voice FK |
| Vehicle | WhatsApp yes | Booking chain | Voice |
| Station | Via booking | Yes for WhatsApp | Explicit station FK |
| Agent | Per-channel config | Yes | Unified agent ID |
| Intent | WhatsApp AI suggestion | — | Voice structured intent |
| Executed action | WhatsApp suggestion tools | Voice tool executions | Unified action timeline |
| Conversation status | Per-channel enums | Partial map | Canonical envelope |

---

## K. Permissions / tenancy findings

### Current RBAC modules (`permission.constants.ts`)

**CONFIRMED:** No `voice-assistant`, `whatsapp`, or `communication` module keys.

| Surface | Permission module used |
|---------|------------------------|
| WhatsApp ops | `ai-assistant` read/write |
| WhatsApp connect | `data-authorization.manage` |
| Internal AI chat | `ai-assistant` read/write |
| Voice tenant APIs | **Org membership only** (+ admin roles on subset) |
| Email settings | `@Roles ORG_ADMIN` |
| Workflow comm actions | `workflow-automation` |
| Notifications | Role-based + station scope on reads |

### Role behavior

| Role | Communication impact |
|------|---------------------|
| ORG_ADMIN | Bypasses all permission checks (`hasPermission`) |
| SUB_ADMIN | Configurable per module; voice largely ungated |
| Worker | May access voice/WhatsApp UI without explicit grants |
| Driver / Customer | No rental comms admin surfaces audited |

### Recommended permission extensions (PROPOSED)

Extend existing conventions rather than inventing parallel names:

| Module key | read | write | manage |
|------------|------|-------|--------|
| `communication` (new) | View CC inbox, transcripts | Reply, assign | Channel connect, AI policy |
| `voice-assistant` (new) | Voice ops/analytics | Agent config | Telephony provision |
| Keep `ai-assistant` | Internal fleet chat only | | |
| Split WhatsApp from `ai-assistant` | **INFERRED desirable** | | |

### Tenancy

- **Org isolation:** **CONFIRMED strict** on WhatsApp and Voice tenant APIs
- **Station filtering:** **MISSING** on communication APIs; notifications have `NotificationStationScopeService` as reference pattern
- **Master Admin:** Separate control plane for voice provisioning — preserve

---

## L. Notifications / tasks integration

### Current emission from communication paths

| Event | Notification V2 | Task | ActivityLog |
|-------|-----------------|------|-------------|
| WhatsApp inbound | No | Optional (human review) | Yes |
| WhatsApp PENDING_HUMAN | No | Optional | Yes |
| Voice call failed | No | No | Webhook event |
| Voice budget warning | No | No | Yes (org admins) |
| Workflow WhatsApp send | No | Via workflow | Workflow audit |

### Integration recommendation (PROPOSED)

Avoid parallel alert systems:

| Event type | Dashboard CC panel | Notification | Task | CC state only |
|------------|-------------------|--------------|------|---------------|
| Human handoff required | **Yes** (priority 1) | Optional (role-gated) | Optional | **Yes** |
| Outbound failure | Yes (priority 2) | WARNING | Optional | Yes |
| Overdue/unanswered | Yes (priority 3) | INFO | No | Yes |
| Active AI-handled thread | Yes (priority 4) | No | No | Yes |
| Completed AI action | Yes (priority 5) | No | No | Yes |
| Provider health degraded | Overview KPI | CRITICAL | No | No |

Register new `NotificationDomain` values only after canonical envelope exists — do not duplicate WhatsApp/Voice native unread counts.

---

## M. Dashboard Communication feasibility

### Planned panel: "Kommunikation"

**CONFIRMED:** No such panel exists on rental dashboard today. Dashboard components (`frontend/src/rental/components/dashboard/`) cover fleet readiness, tasks overview, notifications (operational domains) — **not** WhatsApp/Voice.

### Fields available TODAY (per channel, no aggregation API)

| Metric | WhatsApp source | Voice source |
|--------|-----------------|--------------|
| Today count | `getStats` API | `analytics` API |
| Active threads | conversations with OPEN status | active lifecycle states |
| AI handled | AI-generated messages / auto-reply | `AI_ACTIVE` lifecycle |
| Human required | `PENDING_HUMAN` count | **GAP** — escalation not reliably persisted |
| Failed | message FAILED status | FAILED outcome |

### Derivable client-side (expensive)

- Parallel fetch `api.whatsapp.getStats` + `api.voiceAssistant.analytics` + email history counts
- Merge and sort in frontend — **not recommended** for production dashboard

### Missing backend aggregation

**NEW REQUIRED:** `GET /organizations/:orgId/communication/summary` read model:

```typescript
// PROPOSED contract shape
{
  today: { inbound: number; outbound: number };
  active: number;
  aiHandled: number;
  humanRequired: number;
  failed: number;
  prioritizedRows: Array<{
    id: string;
    channel: 'WHATSAPP' | 'VOICE' | 'EMAIL';
    priority: 1 | 2 | 3 | 4 | 5;
    title: string;
    status: string;
    customerId?: string;
    bookingId?: string;
    assignedUserId?: string;
    lastActivityAt: string;
  }>;
}
```

### Station scoping semantics (PROPOSED)

- Filter rows where linked booking's pickup/return station ∈ user's station scope
- Org-wide rows (unlinked customer) visible to org admins only
- Mirror `NotificationStationScopeService` patterns

### Permission semantics

- Read: new `communication.read` or extend `ai-assistant.read` temporarily
- Rows with transcript content: same permission as channel read

---

## N. Recommended Communication Center IA

Candidate IA evaluated against repository reality:

### Recommended structure (PROPOSED — supersedes flat candidate where noted)

```
Communication Center (communication-center)
├── Overview          — cross-channel KPIs, provider health, human-required count
├── Conversations     — CANONICAL unified inbox (WhatsApp threads + voice sessions + email threads)
├── Channels
│   ├── WhatsApp      — channel-specific config, templates, connection (from WhatsAppBusinessView)
│   ├── Voice         — agent builder, telephony, analytics (from VoiceAssistantView)
│   └── Email         — sender/domains/history (from EmailVersandTab)
├── AI Activity       — cross-channel AI suggestions, tool executions, approvals
├── Automations       — deep link to workflow comm actions (not duplicate engine)
└── Settings          — org-wide comm policies, kill switches, retention
```

**Change from candidate:** Merge "Voice" and "WhatsApp" **operational inboxes** into **Conversations**; retain channel tabs for **configuration and analytics** only. Avoid duplicate inboxes.

### Tab responsibilities

| Tab | Data | Operations | Permissions | Station behavior |
|-----|------|------------|-------------|------------------|
| Overview | Summary API, provider status | Navigate to prioritized rows | communication.read | Aggregated with station filter |
| Conversations | Unified thread list + detail | Reply, assign, close, handoff | communication.read/write | Filter by booking station |
| WhatsApp | Config, templates, Meta status | Connect, template CRUD | communication.manage + data-authorization.manage | Org-level |
| Voice | Agent, phone, usage | Activate, provision, test | voice-assistant.* | Org-level |
| AI Activity | Suggestions + tool executions | Approve/reject (voice MCP) | communication.read | Org-level |
| Settings | AI modes, escalation defaults | Policy edits | ORG_ADMIN | Org-level |

### Migration map

| Current view | CC destination | Nav removal timing |
|--------------|----------------|-------------------|
| `whatsapp-business` | Channels > WhatsApp + Conversations | Phase 4+ |
| `ai-voice-assistant` | Channels > Voice + Conversations | Phase 4+ |
| `settings/email-versand` | Channels > Email | Phase 5+ |
| `ai-assistant` | **Stay in Quick Actions** | Never |
| `support` | **Stay separate** | Never |
| `workflow-automation` | Automations link | Keep nav, embed link |

---

## O. Canonical target architecture

### Minimum net-new conceptual entities (PROPOSED)

Only where existing models cannot safely serve cross-channel purpose:

#### `CommunicationConversation` (envelope)

**Why not reuse `WhatsAppConversation` alone?** Voice uses different table, different lifecycle, different provider IDs — merging would break Meta/ElevenLabs correlation and retention rules.

| Field | Purpose |
|-------|---------|
| `id` | Canonical UUID |
| `organizationId` | Tenant |
| `channel` | `WHATSAPP` \| `VOICE` \| `EMAIL` |
| `channelConversationId` | FK to native row |
| `status` | Canonical handoff state (projection) |
| `customerId`, `bookingId`, `vehicleId`, `stationId` | Normalized links |
| `assignedUserId` | Human owner |
| `assignedAgentId` | AI agent ref |
| `lastActivityAt` | Inbox sort |
| `unreadCount` | Aggregated |
| `metadata` | Provider-specific display |
| `idempotencyKey` | Webhook dedupe at envelope layer |

#### `CommunicationEvent` (timeline)

**Why not reuse messages only?** Voice has transcripts + tool executions + lifecycle events — need unified audit timeline.

Append-only: direction, eventType, content redacted ref, actor, AI decision, tool execution ref.

#### Entities NOT needed initially

| Proposed | Verdict |
|----------|---------|
| `CommunicationParticipant` | **Defer** — derive from customer + phone on native rows |
| `CommunicationCall` | **REUSE** `VoiceConversation` via envelope |
| `CommunicationMessage` | **REUSE** native message tables |
| `CommunicationHandoff` | **EXTEND** status on envelope vs separate table |

### Target read-path architecture

```
Provider webhook → normalization service → native persistence (existing)
                                        → envelope upsert (new)
                                        → optional Notification/Task
                                        → dashboard summary projection
```

---

## P. Provider normalization strategy

### Boundary design (PROPOSED)

```
┌──────────────────┐   ┌─────────────────────┐   ┌──────────────────────┐
│ Provider-specific│   │ Communication       │   │ Domain/workflow      │
│ webhook/event    │──▶│ normalization layer │──▶│ AI router / MCP      │
│ (Meta/Twilio/EL) │   │ (new module)        │   │ Notification/Task    │
└──────────────────┘   └──────────┬──────────┘   └──────────────────────┘
                                    │
                                    ▼
                         Native channel persistence (keep)
                         + CommunicationConversation envelope (new)
```

### Wrap vs migrate

| Code | Strategy |
|------|----------|
| `WhatsAppWebhookService` | **Wrap** — emit envelope after existing persist |
| `VoiceWebhookProcessingService` | **Wrap** — same |
| `MetaWhatsAppCloudProvider` | **Keep** — implement `CommunicationProviderPort` adapter |
| Twilio/ElevenLabs services | **Keep** — adapter interface |
| sent.dm (future) | **New adapter** — no current code |
| Frontend `api.whatsapp` / `api.voiceAssistant` | **Migrate gradually** — add `api.communication` read APIs |

---

## Q. Security / privacy findings

| Finding | Class | Evidence |
|---------|-------|----------|
| WhatsApp webhook HMAC required in prod | **OK** | `WhatsAppWebhookService` |
| Twilio signature validation | **OK** | `TwilioWebhookService` |
| ElevenLabs HMAC on post-call | **OK** | `elevenlabs-webhook.controller.ts` |
| Voice webhook payload redaction | **OK** | `voice-webhook-redaction.util.ts` |
| Recording URLs stripped at ingest | **OK** | redaction util |
| Voice transcript retention purge | **OK** | `VoiceRetentionService` |
| WhatsApp message bodies retained indefinitely | **P1** | No schema retention on `WhatsAppMessage.content` |
| Voice APIs lack RBAC module | **P0** | Any org member access |
| Frontend exposes nav without permission checks | **P1** | Sidebar always shows WhatsApp/Voice |
| Cross-org lookup risks | **Mitigated** | `OrgScopingGuard` on tenant routes |
| AI prompt/context in webhook logs | **P2** | Full payload in `WhatsAppWebhookEvent.payload` — review retention |
| MCP token org binding | **OK** | `VoiceMcpTokenService` |
| Secrets in git | **Not audited live** | Env-based; `.env.example` documents keys |

No secret values exposed in this audit.

---

## R. Observability / failure findings

| Failure mode | Current behavior | Gap |
|--------------|------------------|-----|
| WhatsApp provider down | Outbound fails; `WhatsAppMessage.status=FAILED`, `failureReason` | No provider health dashboard in rental UI |
| Outbound message fails | Persisted failure on message row | No notification to operators |
| Inbound webhook duplicated | Idempotent via `externalEventId` | **OK** |
| Voice call disconnects | Lifecycle → FAILED/COMPLETED via webhooks | Depends on provider delivery |
| ElevenLabs fails | Webhook processing DLQ after 5 retries | Master replay UI exists |
| Twilio webhook retries | Idempotent ingest | **OK** |
| AI agent fails | WhatsApp: fallback to HUMAN_REQUIRED; Voice: error on conversation | Unified visibility missing |
| Tool/action fails | `VoiceToolExecution` status; WhatsApp suggestion decision | No cross-channel timeline |
| Customer cannot be resolved | WhatsApp: unknown customer → human handover | Voice: tool-dependent |
| Booking context ambiguous | Matcher may leave FKs null | Operator must link manually |
| Human takeover ignored | No SLA/escalation notification | **P1 gap** |
| Metrics | Voice structured logs, protection audit | No unified comm metrics |

---

## S. Gap matrix

| Capability | Existing implementation | Canonical source today | Production-ready? | Reuse? | Gap | Required change | Risk | Phase |
|------------|------------------------|------------------------|-------------------|--------|-----|-----------------|------|-------|
| WhatsApp config | `OrgWhatsAppConfig`, setup wizard | WhatsApp module | Yes | REUSE | CC settings migration | UI move | Low | 5 |
| WhatsApp inbound | Meta webhook → matcher | `WhatsAppWebhookService` | Yes | REUSE | Envelope projection | Normalization hook | Low | 1 |
| WhatsApp outbound | Meta provider send | `WhatsAppService` | Yes | REUSE | — | — | Low | — |
| WhatsApp history | Inbox UI + API | `WhatsAppConversation` | Yes | REUSE | Unified inbox | Read API aggregation | Med | 4 |
| Voice config | Voice assistant + wizard | `VoiceAssistant` | Yes | REUSE | RBAC module | Add permissions | Med | 6 |
| Inbound calls | Twilio → ElevenLabs | Voice orchestration | Yes | REUSE | Escalation persistence | Fix outcome writes | Med | 7 |
| Outbound calls | ElevenLabs outbound API | `VoiceCallOrchestrationService` | Yes | REUSE | — | — | Low | — |
| Call history | Voice conversations panel | `VoiceConversation` | Yes | REUSE | Unified inbox | Envelope | Med | 4 |
| Transcripts | `VoiceConversation.transcript` | Voice module | Yes | REUSE | CC detail view | Read API | Low | 4 |
| Recordings | Provider-only, redacted | None in DB | Partial | N/A | No recording UI | Policy decision | Med | 9 |
| AI agent execution | WhatsApp router + Voice MCP | Per-channel | Yes | EXTEND | Unified AI Activity | Timeline API | Med | 7 |
| AI action audit | Suggestions + tool executions | Separate tables | Partial | EXTEND | Cross-channel view | `CommunicationEvent` | Med | 7 |
| Conversation model | Channel-native tables | Dual models | Partial | EXTEND | Canonical envelope | New Prisma model | High | 1 |
| Unified inbox | None | — | No | NEW | CC Conversations tab | Backend + UI | High | 4 |
| Human handoff | WhatsApp PENDING_HUMAN | Partial | Partial | EXTEND | Canonical state | State machine + notifications | High | 7 |
| Customer linking | WhatsApp FK; Voice partial | Mixed | Partial | EXTEND | Voice FK on envelope | Correlation job | Med | 2 |
| Booking linking | WhatsApp FK; Voice scalar | Mixed | Partial | EXTEND | Normalize on envelope | Backfill | Med | 2 |
| Vehicle linking | WhatsApp FK | WhatsApp only | Partial | EXTEND | Voice/context | Envelope | Low | 2 |
| Station scoping | None on comm APIs | — | No | NEW | Station filter | Scope service | Med | 3 |
| RBAC | ai-assistant for WA | Inconsistent | No | EXTEND | voice + communication modules | Permission constants | High | 0 |
| Notifications | Engine disabled for WA/Voice | — | N/A | EXTEND | Comm event types | Registry + producers | Med | 8 |
| Tasks | Optional WA human review task | Tasks module | Partial | REUSE | Standardize handoff tasks | Task template | Low | 7 |
| Dashboard summary | None | — | No | NEW | Kommunikation panel | Summary API | Med | 8 |
| Provider health | Master control plane | Master only | Partial | EXTEND | Rental overview | API surface | Low | 8 |
| Audit logging | ActivityLog + channel audits | Per-channel | Yes | REUSE | Unified timeline | Event projection | Low | 7 |
| Retention/privacy | Voice purge; WA none | Mixed | Partial | EXTEND | WA message retention | Policy + job | Med | 9 |

---

## T. Ordered PR / migration plan

### Phase 0 — Canonical contracts / architecture
- **Objective:** ADR + permission module keys + API contracts (no UI)
- **Files:** `architecture/COMMUNICATION_CENTER_*`, `permission.constants.ts`, OpenAPI stubs
- **Migrations:** No
- **Tests:** Contract tests only
- **Risk:** Low
- **Rollback:** Doc-only

### Phase 1 — Persistence / domain normalization
- **Objective:** `CommunicationConversation` + `CommunicationEvent` models; webhook envelope hooks
- **Files:** `prisma/schema.prisma`, new `communication/` module, hook in `WhatsAppWebhookService`, `VoiceWebhookProcessingService`
- **Migrations:** Yes
- **API:** Internal only
- **Risk:** Medium — webhook path
- **Rollback:** Feature flag disable envelope writes

### Phase 2 — Context normalization
- **Objective:** Backfill customer/booking/vehicle on envelope; Voice correlation
- **Files:** Normalization services, backfill script
- **Migrations:** Maybe indexes
- **Risk:** Medium

### Phase 3 — Backend read APIs
- **Objective:** `GET /communication/conversations`, `GET /communication/summary`
- **Files:** `communication.controller.ts`, station scope service
- **Migrations:** No
- **Tests:** Integration tests
- **Risk:** Low

### Phase 4 — Communication Center shell / Conversations inbox
- **Objective:** New `communication-center` view; unified inbox UI
- **Files:** `App.tsx`, `Sidebar.tsx`, new CC components; reuse chat panel patterns from WhatsApp
- **Migrations:** No
- **Risk:** Medium — UX migration
- **Rollback:** Keep legacy views behind flag

### Phase 5 — Migrate WhatsApp configuration
- **Objective:** Move WhatsAppBusinessView tabs into CC Channels > WhatsApp
- **Files:** WhatsApp components (import paths only)
- **Risk:** Low

### Phase 6 — Migrate Voice configuration
- **Objective:** Move VoiceAssistantView into CC Channels > Voice; add RBAC
- **Files:** Voice components, `voice-assistant.controller.ts` guards
- **Risk:** Medium — permission behavior change

### Phase 7 — AI Activity / handoff
- **Objective:** Canonical handoff states, notifications, task templates, AI timeline
- **Files:** Handoff service, notification registry, fix voice escalation writes
- **Risk:** High

### Phase 8 — Dashboard Kommunikation panel
- **Objective:** Summary API + dashboard widget
- **Files:** Dashboard components, `useDashboardViewModel.ts`
- **Risk:** Low

### Phase 9 — Hardening / observability / cleanup
- **Objective:** WA retention, metrics, remove legacy nav, Help Center update
- **Risk:** Low

Each PR should remain independently deployable with feature flags (`COMMUNICATION_CENTER_ENABLED`).

---

## U. REUSE / EXTEND / MIGRATE / DEPRECATE / NEW REQUIRED

| Asset | Action |
|-------|--------|
| `WhatsAppConversation` / `WhatsAppMessage` | **REUSE** |
| `VoiceConversation` / `VoiceToolExecution` | **REUSE** |
| `OrgWhatsAppConfig` / `VoiceAssistant` | **REUSE** |
| Meta WhatsApp provider | **REUSE** (adapter wrap) |
| Twilio + ElevenLabs stack | **REUSE** |
| `ChatMessage` / `AIAssistantView` | **REUSE** (separate product surface) |
| `SupportTicket` | **REUSE** (exclude from CC) |
| Notification Engine | **EXTEND** (new domain events, do not duplicate channels) |
| `ai-assistant` permission for WhatsApp | **MIGRATE** → `communication` |
| `WhatsAppBusinessView` nav entry | **DEPRECATE** after CC Phase 4 |
| `VoiceAssistantView` nav entry | **DEPRECATE** after CC Phase 4 |
| `HelpCenterView` automation "coming soon" | **DEPRECATE** stale content |
| sent.dm integration | **NEW REQUIRED** only if product selects provider — no code exists |
| `CommunicationConversation` envelope | **NEW REQUIRED** |
| `CommunicationEvent` timeline | **NEW REQUIRED** |
| Dashboard summary API | **NEW REQUIRED** |
| `communication` / `voice-assistant` permission modules | **NEW REQUIRED** |
| Unified inbox UI | **NEW REQUIRED** |

---

## V. Open questions

1. **Email in Conversations:** Should transactional `OutboundEmail` threads appear in unified inbox or only two-way conversations?
2. **Station scoping:** Is communication org-wide by policy, or must Workers at Station A only see Station A threads?
3. **sent.dm:** Product decision pending — Meta Cloud is entrenched; switching providers affects normalization boundary only if decided.
4. **Voice recording playback:** Store URLs in envelope metadata (with consent) or remain provider-console-only?
5. **Internal AI chat (`ai-assistant`):** Confirm permanent exclusion from Communication Center.
6. **Notification vs CC state:** Which human-required events also push mobile/email vs in-app CC panel only?
7. **Master Admin vs Org Admin:** Which provisioning stays master-only in CC Settings?
8. **Workflow automations:** Embed full UI vs deep-link only?
9. **Retention parity:** Should WhatsApp message bodies follow voice transcript retention (90d)?
10. **Canonical status enum:** Single enum vs mapped projections from channel-native statuses?

---

## W. Final verdict

**Recommendation: BUILD Communication Center as a normalization and operations layer over existing channel stacks — not a greenfield rewrite.**

SynqDrive has **production-ready WhatsApp (Meta) and Voice (Twilio/ElevenLabs)** implementations with AI routing, partial human escalation, and strong org isolation. The repository **does not** contain sent.dm, a unified conversation model, consistent RBAC for voice, notification integration for comms events, or a dashboard "Kommunikation" panel.

**Implementation readiness:** **YELLOW-GREEN** — provider paths are mature; canonical unification, permissions, and dashboard aggregation are the critical path.

**Blockers before CC Phase 4 (UI):** Phase 0 permissions contract, Phase 1 envelope persistence, Phase 3 read APIs.

**Do not implement** in this audit — this document is the sole deliverable.

---

*Evidence classification used throughout: **CONFIRMED** = traced in code/schema; **INFERRED** = reasonable deduction from partial traces; **PROPOSED** = recommendation only.*
