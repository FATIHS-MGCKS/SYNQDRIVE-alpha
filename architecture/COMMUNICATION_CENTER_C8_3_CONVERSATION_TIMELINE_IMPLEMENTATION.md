# Communication Center C8.3 — Conversation Timeline Implementation

**Date:** 2026-08-22  
**Phase:** C8.3 (read-only conversation detail + canonical timeline + context panel)  
**Base:** `main` after merged PR #1165 (C8.2 inbox integration)

## 1. Scope

C8.3 connects a selected canonical `CommunicationConversation` to C7/C7.2 detail and timeline data:

- Conversation detail loading via canonical detail endpoint
- Event timeline with cursor pagination (load older)
- Canonical message content rendering (WhatsApp/SMS shared bubble component)
- Voice call/lifecycle presentation (no transcript)
- Delivery/lifecycle compact events
- Conversation header (display label, channel, status, unread)
- Context panel (customer, booking, vehicle, station, assignment)
- Responsive detail behavior (desktop 3-pane, tablet/mobile sheet)
- Deep-link via `conversationId` URL param
- Tenant/conversation race safety
- i18n + accessibility

**Out of scope:** composer, mark-read, assignment mutation, media download, provider APIs, transcripts.

## 2. Canonical backend endpoints

| Purpose | Method | Route |
|---------|--------|-------|
| Detail | `GET` | `/organizations/:orgId/communication/conversations/:conversationId` |
| Timeline | `GET` | `/organizations/:orgId/communication/conversations/:conversationId/events` |

**DTO sources:**

- `backend/src/modules/communication/read/dto/communication-read-response.dto.ts`
- `backend/src/modules/communication/read/dto/communication-read-shared.dto.ts`
- `backend/src/modules/communication/read/communication-read.mapper.ts`
- `backend/src/modules/communication/read/communication-read.controller.ts`

## 3. DTO authority

- **Detail authority:** `GET .../conversations/:id` → `CommunicationConversationDetailDto` (list fields + `createdAt`, `updatedAt`)
- **Timeline authority:** `GET .../events` → `CommunicationEventListResponseDto` with embedded `content` relation (C7.2)
- **Context authority:** Detail DTO refs (`customer`, `booking`, `vehicle`, `station`, `assignedUser`, `assignedAgent`) — no extra context API

## 4. Detail state architecture

Hook: `frontend/src/lib/communication/hooks/useCommunicationConversation.ts`

- Signature: `communicationConversationSignature(orgId, conversationId)`
- Independent `detailGenerationRef` + `detailRequest` lifecycle (`idle | loading | success | error`)
- Committed detail gated by signature alignment
- 404 → `detailNotFound` (safe not-found UI, no cross-tenant leak)

## 5. Timeline state architecture

Same hook, independent timeline authority:

- `timelineGenerationRef` + `timelineRequest` lifecycle
- Committed events gated by signature
- `loadOlderInFlightCursorRef` single-flight guard
- `resolveCommunicationPagination` cursor stall guard (reused from C8.2)
- `dedupeEventsById` on merge

## 6. Tenant/conversation isolation

On org or conversation change:

- Committed detail/timeline cleared immediately when signature mismatches
- Stale responses discarded via generation counters
- No cross-org cache in query signatures

## 7. Message/event presentation model

`frontend/src/lib/communication/timeline-presentation.ts`

| Event type | Presentation |
|------------|--------------|
| `MESSAGE_RECEIVED` / `MESSAGE_SENT` + content | `CommunicationMessageBubble` |
| `MESSAGE_*` + null content | Bubble with unavailable label |
| `CALL_*` | `CommunicationCallEvent` |
| Delivery/AI/human/system | `CommunicationLifecycleEvent` |

No client-side delivery collapsing (no deterministic backend correlation exposed).

## 8–10. WhatsApp / SMS / Voice

- WhatsApp + SMS share `CommunicationMessageBubble` (channel indicator only)
- Voice renders call lifecycle cards only; no chat bubbles unless canonical MESSAGE events exist
- Duration from allowlisted `metadata.durationSeconds` only

## 11. Content types

Rendered per `CommunicationMessageContentType`:

- `TEXT` → canonical text (`whitespace-pre-wrap`)
- `IMAGE`/`VIDEO`/`AUDIO`/`DOCUMENT` → semantic label + caption text if present
- `UNSUPPORTED` → localized neutral label
- No provider media URLs

## 12. Delivery lifecycle

`MESSAGE_DELIVERED`, `MESSAGE_READ`, `MESSAGE_FAILED` → compact lifecycle chips with localized labels.

## 13. Timeline ordering

Backend: `occurredAt desc, id desc` (newest page first).  
Frontend: `sortEventsChronologically` → oldest→newest within merged set; date separators inserted per local day.

## 14. Cursor pagination

- Initial page: newest events, `limit=25`
- Load older: prepend page, dedupe by event ID, preserve visible events on pagination error
- Stall guard stops infinite loops when cursor does not advance

## 15. Context panel

`CommunicationContextPane` renders available detail refs only; single empty state when none. Links use `useRentalEntityNavigation` (customer, booking, vehicle).

## 16. Responsive behavior

| Breakpoint | Layout |
|------------|--------|
| ≥1280 | Inbox + timeline + context panel |
| 1024–1279 | Inbox + timeline; context via Sheet |
| ≤1023 mobile | Inbox ↔ conversation panes; context Sheet |

## 17. Deep links

`conversationId` URL param loads detail/events independently of inbox pagination.

## 18. Error/not-found

- Detail 404 → not-found state + clear selection
- Timeline error → inline retry; header may remain if detail succeeded
- Pagination error → inline retry at boundary; existing events retained

## 19. Security/content rendering

- React text escaping only (no `dangerouslySetInnerHTML`)
- No provider metadata/URLs in DOM
- No auto-linkification in V1

## 20. i18n

Keys under `communication.timeline.*` and `communication.context.*` in `en.ts` / `de.ts`.

## 21. Accessibility

- Message bubbles: `aria-label` with direction, channel, time
- Lifecycle/call: `role="status"`
- Context sheet: Radix Sheet focus trap; Escape closes

## 22. Performance/request count

Per conversation selection:

1. `GET .../conversations/:id` (detail)
2. `GET .../events` (timeline page 1)

No per-event requests. Context from detail DTO (no extra calls).

## 23. Tests

| Suite | Count |
|-------|-------|
| C8.3 unit/hook (communication lib + components) | 84 |
| Playwright C8.3 timeline | 9 |
| Playwright C8.2 inbox (regression) | 13 |
| Playwright C8.1 shell (regression) | included in shell spec |

## 24. C8.1/C8.2 regression

- Inbox list/search/filter/pagination unchanged
- Shell RBAC/responsive/layout preserved
- Mobile inbox test updated: `communication-timeline` replaces `communication-timeline-shell`

## 25. Known limitations

- No media download/playback
- No delivery state attached to outbound bubbles (lifecycle events separate)
- No mark-read on open
- LOCATION/CONTACT/MIXED use semantic labels only

## 26. Next phase readiness

**READY FOR NEXT COMMUNICATION PHASE** (C8.4 settings / C8.5 dashboard / write actions).
