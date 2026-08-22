# Communication Center C8.2 — Inbox Integration Implementation

**Date:** 2026-08-22  
**Phase:** C8.2 (Canonical inbox data integration)  
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

No native WhatsApp/SMS/Voice API reads from inbox UI.

---

## 3. API client

`frontend/src/lib/api.ts` → `api.communication.listConversations`, `getConversationSummary`

Thin wrapper: `frontend/src/lib/communication/communication-client.ts`

---

## 4. Query model

Frontend `CommunicationConversationListQuery` maps to backend DTO. Shell channel `all` omits `channel` param.

**Production UI filters:** channel, search, unreadOnly, status (select), assignment (all / unassigned only — backend has no “assigned-only” without `assignedUserId`).

---

## 5. URL state

Extended C8.1 navigation (`communication-center-navigation.ts` + `communication-inbox-state.ts`):

| Param | Purpose |
|-------|---------|
| `communicationChannel` | Shell channel filter |
| `communicationSearch` | Search term (Tasks-style URL sync; follows `taskQ` convention) |
| `communicationUnread` | `true` when unread-only |
| `communicationStatus` | Canonical status enum |
| `communicationAssignment` | `unassigned` |
| `conversationId` | Selected conversation |
| `communicationPane` | Mobile pane |

Invalid values normalized to defaults. Single atomic `history.pushState` / `replaceState` per update (inbox filters merged into shell sync — no double-write race).

---

## 6. Search

- Debounce: **350ms** (`useDebouncedValue`, same as Tasks/Customers)
- Server-side only — no client-side cross-page filtering
- URL-synced as `communicationSearch`

---

## 7. Pagination

- Pattern: **Load more** button (Tasks-style cursor, not infinite scroll)
- Uses `nextCursor` / `hasMore` exactly
- Page size: **25**
- Defensive dedupe by `id` when flattening pages
- Pagination failure: keep page 1, inline retry for load more

---

## 8. Race safety

`useRequestGeneration` in `useCommunicationInbox` — stale list responses cannot commit after filter/org change. Summary fetch does not bump list generation.

---

## 9. Channel change invariant (C8.1 preserved)

Changing channel clears `selectedConversationId` and resets mobile pane to inbox. Search/unread/status/assignment preserved.

---

## 10. Conversation row hierarchy

`CommunicationConversationRow.tsx`:

- Title: `displayLabel` (never phone/providerIdentity)
- Preview: C7.2 text or `cc:*` token → localized label; voice fallback “Call”
- Context: `booking.reference · vehicle.displayLabel` (priority order)
- Meta: timestamp, unread badge, channel icon, assignment/unassigned
- Status: filter-only (not row badge clutter)

---

## 11. Loading / empty / error

| State | Behavior |
|-------|----------|
| Initial load | `CommunicationInboxSkeleton` |
| Success zero | Differentiated empty: all / filtered / search |
| Error (no rows) | `ErrorState` with retry |
| Error (has rows) | `isStale` + existing rows kept |
| Load more | Bottom loader + retry on failure |

---

## 12. i18n

Explicit EN + DE keys under `communication.inbox.*`, `communication.filters.*`, `communication.status.*`, `communication.preview.*`. Other locales inherit via `...en` spread.

---

## 13. Performance

- One list request per page + optional one summary request
- No per-row detail fetch
- No provider SDK imports

---

## 14. Tests

| Suite | Path | Count |
|-------|------|-------|
| Inbox state + contract | `lib/communication/communication-inbox.test.ts` | 8 |
| Row display | `lib/communication/communication-inbox-display.test.ts` | 5 |
| C8.1 shell/nav/RBAC | `communication-center/*.test.ts` | 22 |
| Playwright shell | `e2e/communication-center-responsive.spec.ts` | 18 scenarios |
| Playwright inbox | `e2e/communication-center-inbox.spec.ts` | 8 scenarios |

---

## 15. Dashboard non-regression

No dashboard changes. E2E confirms tasks panel + nav unchanged.

---

## 16. Known limitations

- Assignment filter: unassigned only (no backend “assigned-only” without user id)
- Selected conversation not validated against loaded page (deep link preserved for C8.3 detail fetch)
- Summary badge on unread filter only — not full header overload

---

## 17. C8.3 readiness

Shell + URL + list selection stable for:

- `GET /communication/conversations/:id`
- Event timeline integration
- Context pane data resolution

**Status:** READY FOR C8.3 conversation detail + timeline integration.

---

**Changes / Architektur:** Updated in this document.
