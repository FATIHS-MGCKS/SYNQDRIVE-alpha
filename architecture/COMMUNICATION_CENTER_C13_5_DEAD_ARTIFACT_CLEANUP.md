# Communication Center C13.5 — Dead API / Service / Hook / i18n / CSS Cleanup

**Status:** COMPLETE (PARTIAL backend service retention documented for C13.6)
**Date:** 2026-08-24
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Base:** `main` after merged PR #1244 (C13.4 legacy operational UI removal)
**Branch:** `refactor/communication-center-c13-5-dead-artifact-cleanup`

---

## 1. Scope

C13.5 removes Communication artifacts provably dead after C13.3/C13.4. Deletion required dependency proof (classification **A — DEAD_CONFIRMED**). No Prisma/schema changes. No C13.6 cutover work.

In scope:
- Dead frontend API client methods (legacy WhatsApp ops + Voice conversation list)
- Dead helper exports in `whatsapp.ops.ts`, `voice-assistant.ops.ts`, `voice-conversation.utils.ts`
- Dead frontend types exclusively tied to removed client surface
- Dead legacy HTTP routes on `WhatsAppController` and `VoiceAssistantController`
- Dead service list methods (`WhatsAppService.getConversations`, `getMessages`)
- Dead i18n keys with zero runtime consumers
- Test updates for removed surface

Out of scope:
- Provider/webhook/native domain services
- Canonical `api.communication.*` transport
- C13.3 redirect parsers/writers compatibility
- Prisma models/tables
- C13.6 telemetry / final cutover proof

---

## 2. Candidate methodology

Every candidate classified before deletion:

| Class | Meaning | C13.5 action |
|-------|---------|--------------|
| A | DEAD_CONFIRMED | Remove |
| B | COMPATIBILITY_REQUIRED | Keep |
| C | RETAINED_CONTROL_PLANE | Keep |
| D | CANONICAL_CC_DEPENDENCY | Keep |
| E | PROVIDER_INTERNAL_REQUIRED | Keep |
| F | TEST_ONLY | Update test or retain service |
| G | HISTORICAL_DOC_ONLY | Keep in docs |
| H | UNKNOWN | Do not delete |

Proof: repository-wide ripgrep for production imports, backend service-to-service callers, Master Admin, Operator/mobile packages, and security characterization tests.

---

## 3. Frontend API removals

| Method | Classification | Production callers before | Action |
|--------|----------------|---------------------------|--------|
| `api.whatsapp.getConversations` | A | 0 | **REMOVED** |
| `api.whatsapp.getMessages` | A | 0 | **REMOVED** |
| `api.whatsapp.sendMessage` | A | 0 | **REMOVED** |
| `api.whatsapp.getAiSuggestion` | A | 0 | **REMOVED** |
| `api.whatsapp.sendAiReply` | A | 0 | **REMOVED** |
| `api.whatsapp.requestHumanReview` | A | 0 | **REMOVED** |
| `api.whatsapp.getConversationContext` | A | 0 | **REMOVED** |
| `api.whatsapp.executeQuickAction` | A | 0 | **REMOVED** |
| `api.voiceAssistant.conversations` | A | 0 | **REMOVED** |

Canonical replacement: `api.communication.*` (inbox, detail, reply, AI suggestion, quick actions, voice transcript).

---

## 4. Frontend type removals

| Type | Classification | Action |
|------|----------------|--------|
| `WhatsAppConversation` | A | **REMOVED** |
| `WhatsAppConversationContext` | A | **REMOVED** |
| `WhatsAppAiSuggestionResponse` | A | **REMOVED** |
| `VoiceConversationListParams` | A | **REMOVED** |
| `VoiceConversationListResult` | A | **REMOVED** |
| `VoiceConversationEntry` | A | **REMOVED** |
| `WhatsAppMsg` | C | **RETAINED** (`WhatsAppSimulateResult`) |
| `WhatsAppQuickActionId` / payload types | D | **RETAINED** (canonical CC quick actions) |
| `VoiceConversationOutcome` / direction types | C | **RETAINED** (Master Admin summaries) |

---

## 5. Hook / helper removals

### `whatsapp.ops.ts`

Removed (legacy inbox-only): `filterConversations`, `countHumanReview`, `countFailedInThread`, `conversationDisplayName`, `NAV_ITEMS`, `INBOX_FILTERS`, `InboxFilter`, `MobilePane`, `deliveryStatusLabel`, `canUseAiReply`, `formatTime`.

Retained: `buildReadinessChecks`, `AI_MODE_META`, `TEMPLATE_CATEGORY_LABELS`, `resolveConnectionStatus`, `formatRelativeTime`, `isSandboxEnvironment`, `WhatsAppTab`, readiness types.

### `voice-assistant.ops.ts`

Removed: `callsTodayFromConversations`, `hasConversationHistory`, `lastCallLabel`, `openEscalationsCount`.

Retained: operator status, launch checklist, nav groups, `answerRatePercent` (aggregate KPIs).

### `voice-conversation.utils.ts`

Removed: `directionLabel`, `isInbound`, `maskCallerNumber`, `OUTCOME_OPTIONS`, `outcomeBadgeTone`.

Retained: `formatDuration` (Voice analytics).

---

## 6. URL writer cleanup

| Artifact | Classification | Action |
|----------|----------------|--------|
| `legacy-communication-navigation.ts` parsers | B | **RETAINED** |
| `voice-assistant-navigation.ts` `conversations` in `OPS_TABS` | B | **RETAINED** (C13.3 redirect parse) |
| `buildVoiceAssistantUrl({ opsTab: 'conversations' })` | B | **RETAINED** (compatibility writer; zero production callers, required for URL tests) |

No dead production URL writers found beyond already-removed C13.4 UI.

---

## 7. i18n cleanup

| Key | Locales | Consumers before | Action |
|-----|---------|------------------|--------|
| `voice.ops.tab.conversations` | en, de | 0 | **REMOVED** |

---

## 8. CSS / assets cleanup

No component-exclusive CSS modules identified for removed C13.4 surfaces (components deleted in C13.4; no orphan `.css` files remained). **N/A — no additional CSS removal in C13.5.**

---

## 9. Backend route inventory (audited)

### WhatsApp (`WhatsAppController`)

| Route | Frontend callers | Internal callers | Action |
|-------|------------------|------------------|--------|
| `GET /conversations` | 0 | 0 | **REMOVED** |
| `GET /conversations/:id/messages` | 0 | 0 | **REMOVED** |
| `POST /conversations/:id/messages` | 0 | 0 | **REMOVED** |
| `POST /conversations/:id/ai-suggestion` | 0 | 0 | **REMOVED** |
| `POST /conversations/:id/ai-reply` | 0 | 0 | **REMOVED** |
| `POST /conversations/:id/human-review` | 0 | 0 | **REMOVED** |
| `GET /conversations/:id/context` | 0 | 0 | **REMOVED** |
| `POST /conversations/:id/actions/:actionId` | 0 | 0 | **REMOVED** |
| Config/templates/stats/reminders/simulate | C10 | domain | **RETAINED** |

### Voice (`VoiceAssistantController`)

| Route | Frontend callers | Internal callers | Action |
|-------|------------------|------------------|--------|
| `GET /conversations` | 0 | Master Admin uses **service** `listConversations`, not HTTP | **REMOVED** |
| `POST /conversations/sync` | 2 (control plane) | sync worker | **RETAINED** |
| `GET /analytics` | control plane | — | **RETAINED** |

---

## 10. Removed route table

| Method | Path | Previous purpose | Replacement | Caller proof | External contract |
|--------|------|------------------|-------------|--------------|-------------------|
| GET | `/organizations/:orgId/whatsapp/conversations` | Legacy WA inbox list | `GET /communication/conversations` | 0 FE / 0 BE HTTP | Retired with C13.4 UI |
| GET | `/organizations/:orgId/whatsapp/conversations/:id/messages` | Legacy thread load | `GET /communication/conversations/:id/events` | 0 / 0 | Retired |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/messages` | Legacy human send | `POST /communication/conversations/:id/reply` | 0 / 0 | Retired |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/ai-suggestion` | Legacy AI draft | `POST /communication/conversations/:id/ai-suggestion` | 0 / 0 | Retired |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/ai-reply` | Legacy AI send | canonical reply + domain service | 0 / 0 | Retired |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/human-review` | Legacy handoff | canonical handoff / quick actions | 0 / 0 | Retired |
| GET | `/organizations/:orgId/whatsapp/conversations/:id/context` | Legacy context drawer | canonical CC context panels | 0 / 0 | Retired |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/actions/:actionId` | Legacy quick action HTTP | `POST /communication/.../quick-actions/:id` | 0 / 0 | Retired |
| GET | `/organizations/:orgId/voice-assistant/conversations` | Legacy voice ops list | `GET /communication/conversations?channel=voice` | 0 FE HTTP | Retired with C13.4 UI |

---

## 11. Backend service / DTO cleanup

| Artifact | Action | Notes |
|----------|--------|-------|
| `WhatsAppService.getConversations` | **REMOVED** | Controller-only |
| `WhatsAppService.getMessages` | **REMOVED** | Controller-only; org-scope test moved to `sendMessage` |
| `WhatsAppService.sendMessage` / `getAiSuggestion` / etc. | **RETAINED** | Used by `communication-*` adapters |
| `WhatsAppConversationContextService` | **RETAINED** | Quick-action resolver |
| `WhatsAppQuickActionsService` | **RETAINED** | Domain executor; canonical uses `CommunicationQuickActionExecutorService` |
| `VoiceAssistantService.listConversations` | **RETAINED** | Master Admin `getAdminOrgDetail` |
| `SendWhatsAppMessageDto` | **RETAINED** | File remains; no controller reference (harmless DTO; C13.6 candidate for orphan DTO sweep) |

---

## 12. Retained provider / native APIs

- Meta webhook ingress (`WhatsAppWebhookController`)
- WhatsApp provider dispatch, templates, config, booking reminders
- Voice ElevenLabs sync, analytics, telephony, test session, outbound call
- Canonical communication read/ops/write modules

---

## 13. Retained C10 APIs

- WhatsApp: config, connect/disconnect, stats, templates, simulate-incoming
- Voice: overview aggregates, analytics, builder, telephony, test, billing, sync

---

## 14. Compatibility artifacts retained

- `legacy-communication-navigation.ts` + tests
- `voice-assistant-navigation.ts` conversations tab parse
- C13.3 redirect tests unchanged

---

## 15. External-caller assessment

| Client | Legacy route usage | Result |
|--------|-------------------|--------|
| Rental frontend | 0 after C13.4 | Safe to remove HTTP surface |
| Master Admin | Service-level `listConversations` only | HTTP voice list removed; admin retained |
| Operator / mobile packages | No endpoint string matches | None found |
| Webhooks / provider callbacks | Unaffected | Retained |

---

## 16. Master Admin / Operator audit

- **Master Admin:** `VoiceAssistantService.getAdminOrgDetail` → `listConversations` at service layer — **not broken** by HTTP route removal.
- **Operator app / mobile:** No references to removed paths in repository.

---

## 17. Canonical CC regression proof

Operational flows remain on `api.communication.*`:

- List/detail/events/reply/AI suggestion/quick actions/handoff
- Voice filters/transcript via communication voice endpoints
- Zero production `api.whatsapp.*` operational or `api.voiceAssistant.conversations` callers post-cleanup

---

## 18. RBAC / tenant / station

- Removed routes used `@RequireCommunicationPermission`; canonical controllers enforce same module.
- Org scoping unchanged (`OrgScopingGuard` on retained controllers).
- `whatsapp-org-scope.spec.ts` updated for `sendMessage` cross-org rejection.

---

## 19. Tests

Updated:
- `whatsapp.ops.test.ts` — readiness/sandbox only
- `voice-assistant.ops.characterization.test.ts` — removed conversation KPI helpers
- `VoiceAssistantView.control-plane.test.tsx` — removed dead `conversations` mock
- `whatsapp-org-scope.spec.ts` — `sendMessage` org scope
- `iam-endpoint-enforcement-triage.security.spec.ts` — `simulateIncoming` permission check
- `voice-assistant.controller.security.characterization.spec.ts` — removed `conversations` handler

Retained: C13.3 redirect tests, canonical CC test suites, control-plane tests.

---

## 20. Remaining deprecated artifacts (C13.6 candidates)

| Artifact | Mark | Reason |
|----------|------|--------|
| `SendWhatsAppMessageDto` | DEPRECATE | No controller reference after route removal |
| `ListVoiceConversationsQueryDto` | KEEP | Still used by `VoiceAssistantService.listConversations` |
| `voice-assistant-navigation` `conversations` writer | KEEP | C13.3 compatibility through C13.6 |
| `WhatsAppQuickActionsService` HTTP wrapper | REMOVED in C13.5 | Service retained |
| Legacy OpenAPI audit snapshots under `docs/audits/` | G | Historical only |

---

## 21. C13.6 telemetry candidates

1. `GET /organizations/:orgId/voice-assistant/conversations` — confirm no external HTTP clients before final OpenAPI retirement annotation
2. Legacy WhatsApp conversation HTTP paths — monitor 404 if any stale automation exists
3. Orphan `SendWhatsAppMessageDto` OpenAPI schema cleanup
4. `voice.ops.tab.conversations` — confirm no cached bundles reference removed key

---

## 22. C13.5 sign-off

| Gate | Result |
|------|--------|
| Dead frontend API removal | PASS |
| Dead backend HTTP removal (proven) | PASS |
| Provider/domain service preservation | PASS |
| C13.3 redirect compatibility | PASS (tests retained) |
| Prisma/schema | NO CHANGE |
| Canonical CC transport | PASS |

**C13.5 sign-off: PASS (with documented C13.6 DTO/OpenAPI sweep candidates)**

---

## 23. C13.6 readiness

**READY** — safe to proceed to final production cutover proof after merge; telemetry on removed HTTP routes recommended but not blocking.
