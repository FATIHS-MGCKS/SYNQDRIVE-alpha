# Communication Center C9.1 — WhatsApp Operations Parity

**Status:** Implemented (draft PR)  
**Date:** 2026-08-23  
**Scope:** Canonical Communication Center operational parity for WhatsApp (not Channels configuration).

## 1. Scope

C9.1 closes four WhatsApp operational gaps in canonical Communication Center:

1. Human-assisted AI suggestion (draft only)
2. Per-conversation Quick Actions
3. Intent/topic inbox filters (server-side)
4. Template send from conversation composer (outside 24h window)

Out of scope: WhatsApp connection/settings, template CRUD (C10 Channels), Voice parity (C9.2), legacy nav removal (C13).

## 2. Legacy audit summary

| Area | Legacy source | C9.1 approach |
|------|---------------|---------------|
| AI suggestion | `WhatsAppService.getAiSuggestion` + `WhatsAppAiRouterService` (rule-based, persisted suggestion) | Canonical `POST .../communication/conversations/:id/ai-suggestion` — draft only, no auto-send |
| Quick actions | `WhatsAppQuickActionsService` (15 defs, 3 stubs disabled) | Canonical quick-actions menu reusing same service via native ID resolution |
| Intent filters | Client-side `whatsapp.ops.ts` on `lastDetectedIntent` | Server-side `intent` query on read API via `WhatsAppConversation` join |
| Template send | `WhatsAppTemplateService` + booking reminders | Canonical `CommunicationReplyContentType.TEMPLATE` under C11.2 |

`human_handover` maps to canonical `status=HUMAN_REQUIRED` — not duplicated as intent filter.

## 3. AI suggestion authority

- Endpoint: `POST /organizations/:orgId/communication/conversations/:conversationId/ai-suggestion`
- Requires `communication.write` + C11.3 mutable conversation scope
- Delegates to existing `WhatsAppService.getAiSuggestion` (no new model/provider)
- Does **not** call provider send; human sends via normal reply path
- No hidden prompts/reasoning exposed to frontend

## 4. AI suggestion UX

- Composer action "AI suggestion" / "KI-Vorschlag"
- Inserts editable draft when composer empty (no silent overwrite)
- Disabled outside free-form window (`TEMPLATE_REQUIRED`)
- Org/conversation race: request id ignored when signature changes

## 5–6. Quick Actions

**Migrated (enabled when legacy enables):** `link_vehicle`, `human_review`, `create_task`, `request_missing_documents`, `send_pickup_instructions`, `send_return_instructions`, `send_handover_link`, `send_return_link`, `send_payment_deposit_reminder`, `create_damage_followup_task`, `close_conversation`, `reopen_conversation`

**Deferred:** `link_booking`, `link_customer`, `assign_user` (legacy stubs — require external entity picker)

Classification: mix of auto-send operational actions (legacy semantics preserved) and business mutations via existing domain services.

## 7–8. Intent model & filter API

- Query param: `intent=` on `GET /communication/conversations`
- Values: `ai_suggested`, `unknown_customer`, `booking`, `documents`, `payment`, `damage`, or direct intent code
- Source: `WhatsAppConversation.lastDetectedIntent` (persisted by AI router)
- `unknown_customer` → `customerId IS NULL`; `booking` → `bookingId IS NOT NULL`
- Composes with channel, status, assignment, unread, search

## 9. Messaging window

- Authority: `WhatsAppMessagePolicyService.canSendFreeText` (24h from `lastCustomerMessageAt`)
- `GET .../composer-capability` returns `FREEFORM_TEXT_ALLOWED` | `TEMPLATE_REQUIRED`
- Free-form reply rejected with `TEMPLATE_REQUIRED` before provider dispatch

## 10–11. Template picker & send command

- Templates loaded only when picker opens (`GET .../sendable-templates`, APPROVED only in production)
- Reply: `contentType: TEMPLATE`, `templateId`, `templateVariables`, C11.2 idempotency key
- Prisma: `CommunicationReplyCommand.templateId`, `templateVariables`
- Dispatch: `WhatsAppService.sendOperatorTemplateMessage` → `WhatsAppTemplateService`

## 12–14. Idempotency, native correlation, dispatch safety

- Payload hash includes templateId + ordered variables
- Same key + same template → replay; different template/variables → `IDEMPOTENCY_CONFLICT`
- One `WhatsAppMessage` per logical send; canonical `MESSAGE_SENT` projection
- `providerDispatchStartedAt` + `UNKNOWN` semantics unchanged from C11.2

## 15–18. Timeline, RBAC, tenant, races

- Template body preview in timeline via existing outbound projection
- Template send: `communication.write` (not `communication.manage`)
- Org/station scoping via existing read/write scope services
- Frontend request-id guards for AI, templates, filters

## 19–22. Responsive, a11y, i18n, performance

- Composer toolbar: attach, text, AI, quick actions, send; template section contextual
- Labels/`aria` on AI, quick actions menu, intent filter, template picker
- 8 locales for C9.1 keys (`communication-center-c9-1.i18n.test.ts`)
- No inbox N+1 for templates/AI; intent filter server-side only

## 23. Tests

- `communication-reply-payload.spec.ts` (template hash)
- `communication-center-c9-1.i18n.test.ts`
- Postgres: intent filter + template idempotency (when `DATABASE_URL` set)

## 24. Legacy interoperability

Legacy `whatsapp-business` routes unchanged. Canonical CC is preferred operational path.

## 25. Remaining C9.2 Voice gaps

Voice composer, voice quick actions, voice template semantics — not started.

## 26. C9 WhatsApp sign-off

**PASS** for C9.1 operational scope with deferred quick-action stubs documented.
