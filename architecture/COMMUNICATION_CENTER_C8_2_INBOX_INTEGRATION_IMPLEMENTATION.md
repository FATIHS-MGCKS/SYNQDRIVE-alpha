# Communication Center C8.2 — Inbox Integration Implementation

**Date:** 2026-08-22  
**Phase:** C8.2 (Canonical inbox data integration, race-hardened final)
**Branch:** `feature/communication-center-c8-2-inbox-integration`  
**Depends on:** C7 read API, C7.2 canonical content, C8.1 UI shell

---

## 1. Scope

C8.2 connects the C8.1 Communication Center shell to the canonical C7 read API:

- Conversation list via `GET /organizations/:orgId/communication/conversations`
- Summary counts via `GET /organizations/:orgId/communication/conversations/summary`
- Channel, search, unread, status, assignment filters
- Cursor pagination (load more)
- Loading / empty / error / retry states
- URL-backed filter state + browser Back/Forward
- Responsive inbox behavior (390 / 1024 / 1440)

**Out of scope:** Timeline/detail API, composer, send/reply, mark read, settings, dashboard widget.

---

## 2. C7 API contract audit

| Item | Contract |
|------|----------|
| List route | `GET /organizations/:orgId/communication/conversations` |
| Summary route | `GET /organizations/:orgId/communication/conversations/summary` |
| Response | `{ items, nextCursor, hasMore }` |
| List item | `id`, `channel`, `status`, `unreadCount`, `lastActivityAt`, `displayLabel`, `lastMessagePreview?`, context refs |
| Channel param | `WHATSAPP` \| `VOICE` \| `SMS` (comma-separated) |
| Search | `search` (max 120 chars, server-side ILIKE) |
| Unread | `unreadOnly=true` |
| Unassigned | `unassigned=true` |
| Status | `status` enum (comma-separated) |
| Cursor | opaque keyset; max limit 100; default used: **25** |
| RBAC | `communication.read` |

**Backend DTO source reviewed:** `backend/src/modules/communication/read/dto/communication-read-response.dto.ts` (`CommunicationConversationListItemDto`, `CommunicationConversationSummaryDto`). Status enum matches `CommunicationConversationStatus` in `backend/prisma/schema.prisma`: `AI_ACTIVE`, `WAITING_CUSTOMER`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE`, `RESOLVED`, `FAILED`.

No native WhatsApp/SMS/Voice API reads from inbox UI.

---

## 3. API client authority

| Layer | Role |
|-------|------|
| `frontend/src/lib/api.ts` | Transport (`api.communication.*`) |
| `frontend/src/lib/communication/communication-client.ts` | Typed wrapper + safe error code mapping (`network`, `invalid_query`, `permission_denied`, `unknown`) |

Query serialization lives in `communication-inbox-state.ts` / `query-keys.ts` — not duplicated in `api.ts`.

---

## 4. Query identity

`communicationInboxQuerySignature` covers all production list dimensions:

- `orgId`
- `channel` (normalized sorted arrays)
- `status` (normalized sorted arrays)
- `unreadOnly`
- `unassigned`
- `search` (trimmed)
- `limit`

**Cursor is not part of base identity.** Same semantic query → same signature.

---

## 5. Org / filter committed-data isolation

`useCommunicationInbox` stores list + summary with a committed `signature`. UI exposes rows/summary **only when** `committed.signature === currentQuerySignature`.

On org or filter change:

- Previous-org / previous-filter rows are not renderable (zero exposed rows immediately)
- Previous summary is not renderable (null until matching result)
- Cursor / hasMore reset for mismatched signature
- List shows skeleton while loading for the new signature

Load-more retains same-query rows; filter/org change hides all prior rows synchronously via signature gating (not merely stale-response rejection).

### Request lifecycle vs alignment

| State | Alignment (`committed.signature === querySignature`) | Request status | UI |
|-------|------------------------------------------------------|----------------|-----|
| New-query loading | false | `loading` | Skeleton |
| New-query error | false | `error` | Safe ErrorState / permission denied |
| Same-query refresh loading | true | `loading` | Existing rows remain visible |
| Same-query refresh error | true | `error` | Existing rows + `isStale` |

`visibleLoading = listRequest.signature === querySignature && listRequest.status === 'loading' && !listAligned`

`!listAligned` alone does **not** imply active loading. New-query failures converge to `status: error` with `loading: false` so ErrorState is reachable.

---

## 6. Independent list vs summary race control

| Concern | Mechanism |
|---------|-----------|
| List reload | `listReloadGenerationRef` — invalidated on query signature change |
| Summary | `summaryGenerationRef` — independent; summary completion never invalidates list reload or load-more |
| Load more | Captures `baseSignature` at start; discards if signature changed; does not share list reload generation |
| Load-more single-flight | `loadMoreInFlightCursorRef` — synchronous guard; duplicate same-cursor calls → one network request |

---

## 7. Cursor non-progress guard

`resolveCommunicationPagination()` (`lib/communication/pagination.ts`):

- If `hasMore=true` but `nextCursor` is null or equals requested cursor → `hasMore=false`, `stalled=true`, pagination error surfaced
- Prevents infinite load-more loops on malformed backend pagination

---

## 8. Search

- Debounce: **350ms** (`useDebouncedValue`, same as Tasks/Customers)
- Server-side only — no client-side cross-page filtering
- **Max length:** 120 chars (`COMMUNICATION_SEARCH_MAX_LENGTH`) — input `maxLength`, URL normalization, API query clamp
- URL-synced as `communicationSearch`

### URL search privacy decision

**Kept URL-backed** (Tasks precedent: `tasksListState.ts` syncs `taskQ` to URL). Communication search may contain customer identifiers/PII; copied URLs and browser history may retain terms. Same tradeoff as Tasks — documented explicitly. No local-only precedent stronger than Tasks in this repo.

---

## 9. Clear-filter semantics

**Clear filters** resets:

- Channel → `all`
- Search → empty
- Unread → false
- Status → all
- Assignment → all
- Selected conversation → cleared

`hasActiveCommunicationInboxFilters` includes active channel.

---

## 10. Safe frontend error copy

Hook exposes `CommunicationClientErrorCode`, not raw `err.message`. UI maps to localized safe copy:

- `network`, `invalid_query`, `permission_denied`, `unknown`

**401/403:** `permission_denied` → access-denied style surface without infinite “retry conversations” (repository-consistent with notifications pattern).

Pagination errors use the same safe mapping with inline retry.

---

## 11. Summary count semantics

C7 summary honors current filters. Unread badge appears **only on the Unread-only filter control** (header duplicate removed). `aria-label` uses `communication.filters.unreadOnlyFilteredCount` to clarify filtered-scope semantics.

---

## 12. Timestamp i18n

`classifyCommunicationTimestamp(iso, now?)` + `formatCommunicationTimestamp(iso, locale, t, now?)`:

- Local timezone semantics (intentional)
- Yesterday via `communication.time.yesterday` i18n key (no DE/EN binary ternary)
- Injectable `now` for deterministic tests

---

## 13. Accessibility

- Conversation list: semantic `<ul>/<li>` (no inconsistent `role=list` without `listitem`)
- Row: `aria-current` when selected; `aria-label` includes channel + title
- Channel: `sr-only` localized label (not icon-only)
- Unread filter: accessible count label when summary loaded

---

## 14. Display label defense

`resolveConversationTitle` → localized `communication.inbox.unknownContact` when `displayLabel` blank. Never reconstructs phone/provider ID.

---

## 15. Pagination

- Pattern: **Load more** button (Tasks-style cursor)
- Page size: **25**
- Defensive dedupe by `id` when flattening pages
- Pagination failure: page 1 retained, inline retry; no full-page error overlay

---

## 16. Tests

| Suite | Path | Focus |
|-------|------|-------|
| Inbox state + contract | `lib/communication/communication-inbox.test.ts` | URL normalization, signature, DTO fixture |
| Hook race hardening | `lib/communication/hooks/useCommunicationInbox.race.test.ts` | Org/filter/summary race, load-more single-flight, cursor guard, 403 |
| Error-state convergence | `lib/communication/hooks/useCommunicationInbox.error-state.test.ts` | Initial 403/500, filter/org failure, same-query stale rows, rendered UI |
| Pagination guard | `lib/communication/pagination.test.ts` | Non-progress cursor |
| Timestamp | `lib/communication/format.test.ts` | Injectable now, i18n yesterday |
| Row display | `lib/communication/communication-inbox-display.test.ts` | Title, preview, unknown contact |
| C8.1 shell/nav/RBAC | `communication-center/*.test.ts` | Regression |
| Playwright inbox | `e2e/communication-center-inbox.spec.ts` | Search A/AB race, pagination append, pagination failure retention, org switch, channel switch, no provider APIs, 390/1024/1440 |

### Deterministic proofs

- **Search race:** type A → wait for request → type AB → AB payload wins
- **Pagination append:** page 2 returns overlapping A + new B → rendered A,B once each
- **Org switch:** Org A hidden before Org B resolves; summary 9 never shown for Org B
- **No provider APIs:** only `/communication/conversations` routes during inbox operations

---

## 17. Known limitations

- Assignment filter: unassigned only (no backend “assigned-only” without user id)
- Selected conversation not validated against loaded page (deep link preserved for C8.3 detail fetch)

---

## 18. C8.3 readiness

Shell + URL + list selection stable for detail/timeline integration.

**Status:** READY FOR FINAL REVIEW (C8.2 hardening complete). C8.3 not started.

---

**Changes / Architektur:** Updated in this document.
