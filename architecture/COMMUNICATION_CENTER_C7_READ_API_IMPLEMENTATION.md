# Communication Center C7 — Read API Implementation

**Phase:** C7 (Canonical inbox read API)  
**Date:** 2026-08-22  
**Branch:** `feature/communication-center-c7-read-api`  
**PR:** #1144
**Depends on:** C1 persistence, C2 normalization, C0.2 RBAC, C6 context resolution

---

## 1. Scope

Provider-neutral **read** surface for Communication Center:

- Inbox list (cursor pagination)
- Conversation detail
- Event timeline (cursor pagination)
- Summary counts (filter-coherent with inbox)
- Filters + bounded search
- RBAC (`communication.read`) + org isolation

**Out of scope:** UI, write/mutations, provider network calls, native table federation for message bodies/transcripts.

---

## 2. Existing API audit

| Surface | Status | C7 action |
|---------|--------|-----------|
| `GET organizations/:orgId/whatsapp/conversations` | Native `WhatsAppConversation` | **Not duplicated** — legacy until C8 |
| `GET organizations/:orgId/voice-assistant/conversations` | Native `VoiceConversation` | **Not duplicated** |
| SMS native list | None | N/A |
| `CommunicationModule` HTTP | Added in C7 | **Added** |
| RBAC `@RequireCommunicationPermission('read')` | C0.2 | **Reused** |
| `OrgScopingGuard` | Platform | **Reused** |
| Swagger `@ApiTags` | Not used on org controllers | **Not added** (repo convention) |

---

## 3. Public DTO contract

### List item

`id`, `channel`, `status`, `unreadCount`, `lastActivityAt`, `displayLabel`, context refs.

No `lastMessagePreview` — not stored on canonical conversation.

### Summary

| Field | Semantics |
|-------|-----------|
| `totalUnreadMessages` | **Sum** of `unreadCount` across filtered conversations (total unread messages) |
| `unreadConversations` | **Count** of conversations with `unreadCount > 0` in filtered set |
| `unassigned` | Filtered conversations with `assignedUserId IS NULL` |
| `requiresAttention` | Filtered conversations with `status = HUMAN_REQUIRED` |
| `byChannel` | Filtered conversation counts per channel |

### Event

Canonical `eventType` + allowlisted metadata only. **No body/content/transcript.**

---

## 4. Summary filter contract (hardened)

Summary reflects the **currently filtered inbox** except `cursor` and `limit`.

Honors **all** inbox filters:

| Filter | Applied to summary |
|--------|-------------------|
| `search` | yes |
| `unreadOnly` | yes |
| `channel` | yes |
| `status` | yes |
| `customerId` | yes |
| `bookingId` | yes |
| `vehicleId` | yes |
| `stationId` | yes |
| `assignedUserId` | yes |
| `unassigned` | yes |
| `providerIdentity` | yes |
| `dateFrom` / `dateTo` | yes |

Ignores only: `cursor`, `limit`.

---

## 5. Assigned-user filters and tenant safety (hardened)

### Exact `assignedUserId` filter

Filters canonical conversations by `assignedUserId` FK. Conversations are **organization-scoped** (`organizationId` from route + `OrgScopingGuard`), so this filter does not leak cross-tenant rows by itself.

Assignment integrity on write is guaranteed by **C6** context resolution (only valid org users are assigned).

### Assigned-user **name search** (`search` term)

Name search additionally requires **ACTIVE** `OrganizationMembership` in the requested organization:

```text
assignedUser.memberships.some {
  organizationId = route org
  status = ACTIVE
}
```

Matches C0.2 `PermissionsGuard` / `OrgScopingGuard` ACTIVE membership semantics.

Users assigned on a conversation but without ACTIVE org membership are **not** discoverable via assigned-user search in that org. No extra membership join is added to the exact `assignedUserId` filter — only name search needs it.

---

## 6. Search

Org-scoped relational `ILIKE contains` on customer, vehicle, station, **membership-scoped** assigned user, and `BK-XXXXXX` booking suffix.

**Classification:** `ACCEPTABLE INITIAL BOUNDED SEARCH` at ~5k conversations. Customer name search may seq-scan `customers` without matching rows; large tenant customer tables may need **C7.1 trigram/FTS** later.

---

## 7. Cursor validation (hardened)

- Max cursor length: 1024 chars (pre-parse)
- Payload version + UUID `id` + strict ISO-8601 ms UTC timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`)
- Malformed / oversized → `400`

---

## 8. Conflicting filters (hardened)

`assignedUserId` + `unassigned=true` → `400` (`COMMUNICATION_READ_CONFLICTING_FILTERS`)

`dateFrom > dateTo` → `400` (`COMMUNICATION_READ_INVALID_DATE_RANGE`)

---

## 9. Provider identity filter semantics

`providerIdentity` filter means: conversation **HAS ANY canonical event** with matching `providerIdentity` (org-scoped `events.some`).

Operational diagnostic filter — not "current conversation provider". Multi-provider voice threads match if any lifecycle event exists.

---

## 10. Booking display reference

`Booking` has **no** separate public number column in Prisma.

Repo-wide convention (bookings service, invoices, vehicle context): `BK-${uuid.slice(-6).toUpperCase()}`.

C7 exposes this as `booking.reference` with documented **generated technical reference** — not a separate authoritative booking number field.

Search `BK-XXXXXX` matches `booking.id` suffix only.

---

## 11. PII minimization (hardened)

- `assignedUser.email` is **not** selected in Prisma `select` for Communication read mapping
- `assignedUser` projection: `id`, `name`, `firstName`, `lastName` only
- `communicationUserDisplayName()` — no email fallback
- Public DTO recursive denylist test for phone/email/body/transcript/token/secret/etc.

---

## 12. Query strategy / N+1

List path: one `communicationConversation.findMany` **plus** Prisma batched relation loads. A single `findMany` does **not** imply a single SQL statement — Prisma may emit separate queries per included relation.

Measured in PostgreSQL test Y (25-row page): **1** conversation query + batched relation loads, **≤8 SQL statements total** — not 25+ per-row queries.

---

## 13. Scale validation (disposable PostgreSQL)

Script: `backend/scripts/test/communication-read-scale-explain.ts`

Dataset: **1 org, 5,000 conversations, 50,000 events** (seeded + cleaned up).

### Inbox first page

- Index: `communication_conversations_organization_id_last_activity_a_idx`
- Plan: Index Scan Backward on `(organization_id, last_activity_at)` + Incremental Sort for `id DESC` tiebreaker
- Execution: **~0.058 ms** (2026-08-22 re-run), 27 rows examined for limit 26

### Inbox cursor page

- Same index + filter on keyset predicate
- Execution: **~0.545 ms** (mid-list cursor; ~2501 rows removed by filter in sample)

### Timeline

- Index: `communication_events_organization_id_conversation_id_occurr_idx`
- Plan: Index Scan Backward + small Incremental Sort
- Execution: **~0.035 ms**

### Provider identity filter

- Nested Loop Semi Join; event index per candidate conversation
- Execution: **~0.475 ms** at 5k conversations

### Customer search (ILIKE)

- Seq Scan on `customers` when no matching names (empty result in disposable seed)
- Execution: **~1.9 ms** on empty seed (variable; **not** production-scale indexed search)

### Index verdict

**SUFFICIENT** for inbox/timeline keyset at tested 5k-conversation / 50k-event scale (not unlimited future scale). Index-scan queries measured **~0.035–0.55 ms** in disposable EXPLAIN ANALYZE runs. Optional C7.1 composite `(organization_id, last_activity_at DESC, id DESC)` only if mid-cursor filter cost grows at much larger tenants.

---

## 14. Content policy / C8 readiness

| Capability | Status |
|------------|--------|
| Operational inbox shell (list, filters, badges, context) | **READY FOR C8 SHELL / OPERATIONAL INBOX** |
| Rich chat-style message thread (readable bodies) | **RICH MESSAGE THREAD BLOCKED ON C7.2 — CANONICAL COMMUNICATION CONTENT CONTRACT** |

C7 is an **operational read foundation**. Canonical `CommunicationEvent` stores no message body. **C8 must not join native provider tables** for message content/transcripts. Future rich thread UI requires explicit canonical storage/projection phase (**C7.2**), not C7 hardening.

---

## 15. RBAC

`@RequireCommunicationPermission('read')` + real guard pipeline tested in `communication-read.http-security.integration.spec.ts`:

- `communication.read` holder → 200
- Same-org user without permission → 403
- Cross-org JWT mismatch → 403 (`OrgScopingGuard`)

---

## 16. Swagger / OpenAPI

Repository org controllers (WhatsApp, tasks, invoices) do **not** use `@ApiTags` / `@ApiOperation`. C7 follows same convention — **no Swagger decorators added**.

---

## 17. Tests (post-hardening)

**Coverage matrix** (postgres integration): labels A–Z plus hardening cases H1–H6 — several letters share one `it(...)` block; matrix labels ≠ Jest case count.

| Suite | Jest tests passed |
|-------|-------------------|
| C7 unit (cursor, mapper, query validation, controller) | 17 |
| C7 postgres integration (`communication-read.postgres.integration.spec.ts`) | 20 |
| C7 HTTP security integration | 3 |
| Communication postgres regression (C1–C7) | 65 |
| Communication unit regression | 144 (1 pre-existing SMS adapter TS compile fail) |

---

## 18. Follow-up

| Phase | When |
|-------|------|
| **C7.1** | Optional index/trigram if tenant scale exceeds bounded search or mid-cursor scan cost |
| **C7.2** | Canonical message preview/body content contract before rich thread UI |

---

## Files

| Path | Role |
|------|------|
| `backend/src/modules/communication/read/*` | Read API + validation |
| `backend/scripts/test/communication-read-scale-explain.ts` | Disposable scale EXPLAIN |

**Changes / Architektur updated:** this document.
