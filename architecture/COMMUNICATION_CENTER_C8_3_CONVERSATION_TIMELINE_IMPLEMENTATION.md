# Communication Center C8.3 — Conversation Timeline Implementation

**Date:** 2026-08-22
**Phase:** C8.3 (read-only conversation detail + canonical timeline + context panel)
**Base:** `main` after merged PR #1165 (C8.2 inbox integration)
**Hardening:** C8.3 final detail/timeline race & contract hardening (PR #1169)

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
- Tenant/conversation race safety with generation/token authority
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

## 4. Detail request authority

Hook: `frontend/src/lib/communication/hooks/useCommunicationConversation.ts`

- Signature: `communicationConversationSignature(orgId, conversationId)`
- `detailGenerationRef` incremented on each `reloadDetail` / selection change
- `detailRequest` lifecycle (`idle | loading | success | error`) scoped to signature
- Committed detail gated by `committedDetail.signature === currentSignature`
- Response commits only when `generation === detailGenerationRef.current`
- **ABA protection:** same signature re-selected increments generation; stale gen-1 cannot overwrite gen-3
- Visible `detailError` only when `detailRequest.signature === currentSignature` and request status is `error`
- 404 → signature-scoped `detailNotFoundState`; timeline in-flight invalidated; timeline error suppressed under not-found

## 5. Timeline request authority

- `timelineGenerationRef` incremented on each `reloadTimeline` / selection change
- `timelineRequest` lifecycle scoped to signature
- Committed events gated by `committedTimeline.signature === currentSignature`
- Response commits only when `generation === timelineGenerationRef.current`
- **ABA protection:** same as detail — generation token prevents stale same-signature overwrite
- Visible `timelineError` only when signature matches and `detailNotFound` is false for current signature

## 6. Pagination request generation / load-older authority

Pagination uses dedicated authority beyond committed-data identity:

```ts
type LoadOlderAuthority = {
  requestToken: number;
  signature: string;
  cursor: string;
  timelineDataVersion: number;
  paginationGeneration: number;
};
```

- `timelineDataVersionRef` + `paginationGenerationRef` invalidated on org/conversation change and full timeline reload
- `loadOlderInFlightRef` provides synchronous single-flight guard (`signature + cursor + requestToken`)
- `paginationRequest` state: `{ signature, cursor, status, error, requestToken }`
- Commit merge only when `isLoadOlderAuthoritative()` — all authority fields match current refs
- `finally` clears loading only for exact owning `requestToken + signature + cursor`
- **Cross-conversation:** stale A loadOlder cannot mutate B timeline or clear B in-flight state
- **Reload vs pagination:** full `reloadTimeline` bumps `timelineDataVersion`; stale older-page merge rejected
- Visible `loadingOlder` / `paginationError` only when `paginationRequest.signature === currentSignature`

## 7. Signature-scoped notFound

```ts
type SignatureScopedNotFound = { signature: string; notFound: boolean };
```

Exposed: `detailNotFound = state.signature === currentSignature && state.notFound`

Late 404 from conversation A cannot mark conversation B not-found.

## 8. Tenant/conversation isolation

On org or conversation change:

- Pagination generation + timeline data version invalidated
- `loadOlderInFlightRef` cleared
- Committed detail/timeline hidden immediately when signature mismatches
- Stale responses discarded via generation counters and pagination authority
- No cross-org cache in query signatures

## 9. Message/event presentation model

`frontend/src/lib/communication/timeline-presentation.ts`

| Event type | Presentation |
|------------|--------------|
| `MESSAGE_RECEIVED` / `MESSAGE_SENT` + content | `CommunicationMessageBubble` |
| `MESSAGE_*` + null content | Bubble with unavailable label |
| `CALL_*` | `CommunicationCallEvent` |
| Delivery/AI/human/system | `CommunicationLifecycleEvent` |

No client-side delivery collapsing (no deterministic backend correlation exposed).

## 10. Voice metadata contract

**Decision: KEEP `durationSeconds` as canonical safe field.**

- Backend allowlist: `backend/src/modules/communication/normalization/communication-metadata.ts` → `CANONICAL_COMMUNICATION_METADATA_KEYS`
- Read projection: `communication-read.mapper.ts` → `projectSafeReadMetadata()`
- Frontend reads only via `readCanonicalCallDurationSeconds()` — no arbitrary metadata access
- Transcript, provider URLs, phone numbers, and other metadata keys are never rendered

## 11. Content types (verified)

Backend source: `backend/prisma/schema.prisma` → `CommunicationMessageContentType`

`TEXT | IMAGE | VIDEO | AUDIO | DOCUMENT | LOCATION | CONTACT | MIXED | UNSUPPORTED`

Frontend `CommunicationApiMessageContentType` in `frontend/src/lib/communication/types.ts` matches exactly.

## 12. Event types (verified)

Backend source: `backend/prisma/schema.prisma` → `CommunicationEventType`

Includes: `MESSAGE_*`, `CALL_*`, `AI_*`, `HUMAN_*`, `CONVERSATION_*`, `PROVIDER_ERROR`

Frontend `CommunicationApiEventType` matches exactly. Lifecycle mapper uses only present enum values.

## 13. Timeline ordering contract

Backend implementation: `backend/src/modules/communication/read/communication-read.repository.ts`

```ts
orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]
```

Frontend: `compareCommunicationEventsChronologically` → `occurredAt ASC, id ASC` (inverse for display).
Invalid timestamps: valid events sort before invalid; equal timestamps tie-break by `id` ascending.
Invalid date separators omitted (no `"invalid"` label shown).

## 14. Cursor pagination

- Initial page: newest events, `limit=25`
- Load older: prepend page, dedupe by event ID, authority-checked merge
- Stall guard stops infinite loops when cursor does not advance
- Pagination stall error signature-scoped

## 15. Scroll behavior

`CommunicationTimeline.tsx`:

- **Initial open / conversation change:** scroll to bottom (newest activity)
- **Load older:** capture `scrollHeight + scrollTop` before prepend; restore `scrollTop + deltaHeight` after render
- No auto-scroll on arbitrary rerender

## 16. Context panel

`CommunicationContextPane` renders available detail refs only; single empty state when none. Links use `useRentalEntityNavigation` (customer, booking, vehicle). Station has no invented route.

## 17. Responsive behavior

| Breakpoint | Layout |
|------------|--------|
| ≥1280 | Inbox + timeline + context panel |
| 1024–1279 | Inbox + timeline; context via Sheet |
| ≤1023 mobile | Inbox ↔ conversation panes; context Sheet |

## 18. Deep links & channel mismatch

`conversationId` URL param loads detail/events independently of inbox pagination.

When deep-linked conversation channel mismatches inbox filter (e.g. URL `channel=sms` + WhatsApp conversation):

- After detail loads, shell normalizes URL channel to `conversation.channel` (`CommunicationCenterShell.tsx`, `replace: true`)
- Detail canonical conversation remains authoritative; filter aligns to avoid contradictory UI

## 19. Error/not-found behavior

| Case | Behavior |
|------|----------|
| Detail 404 | Safe not-found UI + explicit **Back to Inbox** button (user action; no automatic URL clearing) |
| Detail 403 | Safe permission-denied copy; no retry button; no cross-tenant leak wording |
| Detail 500 | Inline retry (except permission_denied) |
| Timeline error | Inline retry in timeline area; header/context remain if detail succeeded |
| Detail 404 + timeline in-flight | Timeline error suppressed; not-found UX wins |
| Pagination error | Inline retry at boundary; existing events retained; signature-scoped |

## 20. Security/content rendering

- React text escaping only (no `dangerouslySetInnerHTML`)
- No provider metadata/URLs/transcripts/phone in DOM
- No auto-linkification in V1
- Metadata boundary tests verify allowlist-only projection

## 21. i18n

Keys under `communication.timeline.*` and `communication.context.*` in `en.ts` / `de.ts`.

## 22. Accessibility

- Timeline: semantic `<ol>/<li>` with `aria-label` on list and message bubbles
- **No `role="status"` on historical timeline entries** (avoids live-region spam)
- Direction conveyed via accessible labels, not bubble alignment alone
- Date separators use meaningful localized text; invalid timestamps omit separator
- Context sheet: Radix Sheet focus trap; Escape closes

## 23. Performance/request count

Per conversation selection (production):

1. `GET .../conversations/:id` (detail)
2. `GET .../events` (timeline page 1)

No per-event requests. Context from detail DTO (no extra calls).
Measured in Playwright network proof test — exactly one detail + one initial events request per selection.

## 24. Tests

| Suite | Coverage |
|-------|----------|
| Hook race hardening | A→B detail/timeline, ABA, loadOlder cross-conv, reload invalidation, signature-scoped notFound/pagination/loading |
| Timeline presentation | Chronological sort, equal timestamp, invalid timestamp, metadata allowlist |
| XSS / security | `CommunicationMessageBubble.test.tsx` |
| Workspace pane | 403 UX, detail success + timeline failure |
| Playwright C8.3 | Scroll anchor, channel mismatch, 404/403, network proof, voice/media |
| C8.2 / C8.1 regression | Inbox + shell specs |

## 25. C8.1/C8.2 regression

- Inbox list/search/filter/pagination unchanged
- Shell RBAC/responsive/layout preserved
- Mobile inbox test updated: `communication-timeline` replaces `communication-timeline-shell`

## 26. Known limitations

- No media download/playback
- No delivery state attached to outbound bubbles (lifecycle events separate)
- No mark-read on open
- LOCATION/CONTACT/MIXED use semantic labels only

## 27. Next phase readiness

**READY FOR FINAL REVIEW** — C8.3 hardening complete; do not begin next Communication phase until merged.
