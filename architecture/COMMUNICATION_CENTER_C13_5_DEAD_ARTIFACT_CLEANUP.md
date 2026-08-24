# Communication Center C13.5 — Dead API / Service / Hook / i18n / CSS Cleanup

**Status:** PARTIAL — SAFE TO MERGE (frontend dead artifacts removed; uncertain legacy HTTP retained deprecated for C13.6 telemetry)
**Date:** 2026-08-24 (hardening pass)
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
- Dead legacy HTTP routes on `WhatsAppController` and `VoiceAssistantController` **only when external retirement is proven**
- Deprecated compatibility HTTP wrappers for C13.6 telemetry when external retirement is **not** proven
- Dead service list methods only when no compatibility wrapper needs them
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
| A | REMOVED_PROVEN_UNUSED | Remove (repo + external evidence) |
| B | DEPRECATED_COMPATIBILITY_HTTP | Retain deprecated HTTP wrapper through C13.6 |
| C | REMOVED_SECURITY_SUPERSEDED | Remove — unsafe duplicate authority |
| D | RETAINED_CONTROL_PLANE | Keep |
| E | CANONICAL_CC_DEPENDENCY | Keep |
| F | PROVIDER_INTERNAL_REQUIRED | Keep |
| G | HISTORICAL_DOC_ONLY | Keep in docs |
| H | UNKNOWN / TELEMETRY_REQUIRED | Do not delete HTTP without observation |

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

## 9. Legacy HTTP route contract table (final)

Repository caller count = production frontend + in-repo HTTP consumers. **External retirement evidence:** none in repository (no gateway inventory, no route access telemetry export). UI removal (C13.4) is **not** external contract proof.

| Method | Path | Repo callers | External evidence | Classification | Current status | Canonical replacement | C13.6 action |
|--------|------|--------------|-------------------|----------------|----------------|----------------------|--------------|
| GET | `/organizations/:orgId/whatsapp/conversations` | 0 | None | **B — DEPRECATED_COMPATIBILITY_HTTP** | Restored `@deprecated` | `GET /communication/conversations?channel=whatsapp` | Telemetry → remove if zero |
| GET | `/organizations/:orgId/whatsapp/conversations/:id/messages` | 0 | None | **B** | Restored `@deprecated` | `GET /communication/conversations/:id/events` | Telemetry → remove if zero |
| GET | `/organizations/:orgId/whatsapp/conversations/:id/context` | 0 | None | **B** | Restored `@deprecated` | CC context panels / read APIs | Telemetry → remove if zero |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/messages` | 0 | None | **B** (canonical adapter) | Restored `@deprecated` | `POST /communication/conversations/:id/reply` | Telemetry → remove if zero |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/ai-suggestion` | 0 | None | **B** (canonical adapter) | Restored `@deprecated` | `POST /communication/conversations/:id/ai-suggestion` | Telemetry → remove if zero |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/human-review` | 0 | None | **B** (canonical adapter) | Restored `@deprecated` | `POST /communication/.../quick-actions/human_review` | Telemetry → remove if zero |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/actions/:actionId` | 0 | None | **B** (canonical adapter) | Restored `@deprecated` | `POST /communication/.../quick-actions/:actionId` | Telemetry → remove if zero |
| POST | `/organizations/:orgId/whatsapp/conversations/:id/ai-reply` | 0 | None | **C — REMOVED_SECURITY_SUPERSEDED** | **Not restored** | Canonical ReplyCommand + human review flow | N/A — unsafe direct AI send |
| GET | `/organizations/:orgId/voice-assistant/conversations` | 0 | None | **B** | Restored `@deprecated` | `GET /communication/conversations?channel=voice` | Telemetry → remove if zero |

### Write adapter authority (compatibility only)

| Legacy route | Adapter | Canonical authority |
|--------------|---------|---------------------|
| POST `.../messages` | `WhatsAppLegacyHttpCompatibilityService.sendMessage` | `CommunicationReplyService.replyConversation` (ReplyCommand + idempotency key `legacy-wa-http:*`) |
| POST `.../ai-suggestion` | `CommunicationWhatsAppOpsService.getAiSuggestion` | Same canonical ops used by CC |
| POST `.../human-review` | `CommunicationQuickActionExecutorService` (`human_review`) | Canonical handoff projection |
| POST `.../actions/:actionId` | `CommunicationQuickActionExecutorService.execute` | Canonical quick-action executor |

**Not restored:** `POST .../ai-reply` — would bypass ReplyCommand and re-enable direct `sendAiReply` provider path.

---

## 10. Backend service / DTO cleanup

| Artifact | Classification | Action |
|----------|----------------|--------|
| `WhatsAppService.getConversations` | DEPRECATED_COMPATIBILITY_SERVICE | Restored for legacy HTTP reads |
| `WhatsAppService.getMessages` | DEPRECATED_COMPATIBILITY_SERVICE | Restored for legacy HTTP reads |
| `WhatsAppLegacyHttpCompatibilityService` | B | **ADDED** — non-authoritative adapters |
| `WhatsAppService.sendMessage` / domain AI | E | **RETAINED** — canonical outbound adapters |
| `SendWhatsAppMessageDto` | B | **RETAINED** — used by deprecated compatibility send route |
| `VoiceAssistantService.listConversations` | D | **RETAINED** — Master Admin + deprecated voice HTTP |

---

## 11. External retirement evidence

| Source checked | Result |
|----------------|--------|
| Rental frontend production imports | 0 legacy operational API callers |
| In-repo HTTP/integration tests for legacy paths | None required for product operation |
| Operator / mobile packages | No endpoint string matches |
| API gateway / prod access log export in repo | **Not available** |
| Documented external-only contract retirement | **None** |

**Conclusion:** HTTP routes without security supersession → **DEPRECATED_COMPATIBILITY_HTTP** through C13.6 observation. Do **not** claim "external contract retired with C13.4 UI."

---

## 12. C13.6 observation contract

Use existing `RequestLoggingInterceptor` structured HTTP logs (`method`, `route`, `organizationId`, `statusCode`) — no new telemetry stack.

C13.6 must prove before deleting **B** routes:

1. Observation window: **POLICY_REQUIRED** (platform convention not codified in repo)
2. Per-route request count from access logs/metrics (bounded route pattern; no message bodies / customer PII)
3. No legitimate caller source (User-Agent / internal client inventory where safe)
4. Canonical replacement live for equivalent operation
5. Rollback plan: keep deprecated routes one release if needed

Targets: all **B** routes in section 9.

---

## 13. Telemetry infrastructure

- **Existing:** global `RequestLoggingInterceptor` logs matched Nest route + orgId on errors; success logs when `HTTP_LOG_SUCCESS=true` or non-production.
- **C13.5 change:** none — compatibility routes are identifiable by path pattern for C13.6 log/metric queries.
- **No customer IDs / message bodies** added to telemetry.

---

## 14. Tests (hardening)

Added/updated:
- `whatsapp-legacy-http-compatibility.service.spec.ts` — canonical write adapter + org rejection
- `whatsapp-legacy-http-contract.characterization.spec.ts` — `ai-reply` route absent
- `whatsapp-org-scope.spec.ts` — `getMessages` cross-org rejection restored
- Security characterization specs — deprecated handlers remain permission-gated

Frontend legacy caller proof unchanged: **0** production `api.whatsapp` operational + `api.voiceAssistant.conversations` callers.

---

## 15. C13.5 sign-off

| Gate | Result |
|------|--------|
| Dead frontend API / helper / i18n removal | PASS |
| Unsafe duplicate write (`ai-reply`) remains removed | PASS |
| Uncertain legacy HTTP retained deprecated (not deleted) | PASS |
| Canonical write authority on compatibility adapters | PASS |
| C13.3 redirect compatibility | PASS |
| Prisma/schema | NO CHANGE |

**C13.5 sign-off: PARTIAL — SAFE TO MERGE**

---

## 16. C13.6 readiness

**READY** when merged: compatibility HTTP is explicit, `@deprecated`, non-authoritative, RBAC-secured, and observable via existing HTTP logging. Canonical CC remains independent (`api.communication.*` only in frontend).
