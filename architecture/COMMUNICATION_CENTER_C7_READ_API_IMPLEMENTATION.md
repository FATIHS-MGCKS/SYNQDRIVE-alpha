# Communication Center C7 — Read API Implementation

**Phase:** C7 (Canonical inbox read API)  
**Date:** 2026-08-22  
**Branch:** `feature/communication-center-c7-read-api`  
**Depends on:** C1 persistence, C2 normalization, C0.2 RBAC, C6 context resolution

---

## 1. Scope

Provider-neutral **read** surface for Communication Center:

- Inbox list (cursor pagination)
- Conversation detail
- Event timeline (cursor pagination)
- Optional summary counts
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
| `CommunicationModule` HTTP | Missing before C7 | **Added** |
| RBAC `@RequireCommunicationPermission('read')` | Exists (C0.2) | **Reused** |
| `OrgScopingGuard` | Exists | **Reused** |
| Task/cursor utilities | `tasks-list-cursor.util.ts` | **Pattern reused** (base64url JSON cursor) |
| Invoice list query patterns | Offset pagination | **Not used** for inbox (keyset required) |
| `sanitizeCanonicalMetadata` / allowlist | C1/C2 | **Reused** for read projection |

---

## 3. Public DTO contract

### List item (`CommunicationConversationListItemDto`)

`id`, `channel`, `status`, `unreadCount`, `lastActivityAt`, `displayLabel`, optional context refs (`customer`, `booking`, `vehicle`, `station`, `assignedUser`, `assignedAgent`).

No `lastMessagePreview` — canonical schema does not store message preview on `CommunicationConversation` (native tables remain authoritative for content).

### Detail (`CommunicationConversationDetailDto`)

List fields + `createdAt`, `updatedAt`.

### Event (`CommunicationEventDto`)

`id`, `eventType`, `direction`, `actorType`, `occurredAt`, `providerIdentity`, allowlisted `metadata` only. **No body/content/transcript.**

### Summary (`CommunicationConversationSummaryDto`)

`totalUnread`, `unassigned`, `requiresAttention` (`HUMAN_REQUIRED` count), `byChannel`.

---

## 4. Inbox list

`GET /api/v1/organizations/:orgId/communication/conversations`

- Single Prisma `findMany` with `select` + relation `select` (no per-row fetches)
- Sort: `lastActivityAt DESC`, `id DESC`
- Default limit 25, max 100

---

## 5. Filters

| Filter | Implementation |
|--------|----------------|
| `channel` | multi enum |
| `status` | multi enum |
| `unreadOnly` | `unreadCount > 0` |
| `customerId` / `bookingId` / `vehicleId` / `stationId` | exact FK |
| `assignedUserId` | exact FK |
| `unassigned` | `assignedUserId IS NULL` |
| `providerIdentity` | `events.some` (org-scoped) |
| `dateFrom` / `dateTo` | `lastActivityAt` bounds (ISO validated) |

Invalid enums → `400` via global `ValidationPipe`.

---

## 6. Search

Bounded `search` (max 120 chars), case-insensitive:

- Customer first/last/company (multi-term AND across fields, org-scoped via relation)
- Vehicle plate/name/make/model (org-scoped)
- Station name (org-scoped)
- Assigned user name fields
- Booking reference prefix `BK-XXXXXX` → `booking.id` suffix match

**Not searched:** phone, email, message body, transcript, raw metadata.

---

## 7. Cursor contract

Opaque base64url JSON:

**Inbox:** `{ v: "inbox-v1", lastActivityAt, id }`  
Predicate: `(lastActivityAt < cursor) OR (lastActivityAt = cursor AND id < cursor.id)`

**Timeline:** `{ v: "timeline-v1", occurredAt, id }` — sort `occurredAt DESC`, `id DESC` (newest-first pagination for chat-style UI).

Malformed cursor → `400` (`COMMUNICATION_INBOX_INVALID_CURSOR` / `COMMUNICATION_TIMELINE_INVALID_CURSOR`).

---

## 8. Conversation detail

`GET /api/v1/organizations/:orgId/communication/conversations/:id`

Org-scoped `findFirst`; wrong org → `404` (no cross-tenant leakage).

---

## 9. Timeline

`GET /api/v1/organizations/:orgId/communication/conversations/:id/events`

Separate from detail; canonical `CommunicationEvent` rows only.

---

## 10. Summary counts

`GET /api/v1/organizations/:orgId/communication/conversations/summary`

Same org + filter semantics as list (except cursor/search pagination). Aggregate queries only.

---

## 11. Context projection

Lightweight refs only:

- Customer: `{ id, displayName }` (includes archived customers for historical usability)
- Booking: `{ id, reference: BK-…, status, startDate, endDate }`
- Vehicle: `{ id, displayLabel }`
- Station: `{ id, name }`
- Assigned user: `{ id, displayName }`
- Assigned agent: `{ ref, type }` (no provider name resolution)

Display label fallback: customer name → **`Unbekannter Kontakt`** (no raw phone default).

---

## 12. Safe metadata allowlist

Read projection uses `CANONICAL_COMMUNICATION_METADATA_KEYS` from `communication-metadata.ts` (pick-only; forbidden keys stripped, never echoed).

Conversation-level arbitrary JSON (e.g. `contextResolutionSources`) is **not** exposed in public DTOs.

---

## 13. Content policy

| Data | C7 behavior |
|------|-------------|
| Message body | **Not available** — no column on `CommunicationEvent`; **not** joined from native tables |
| Transcript | **Not exposed** |
| Voice recording | **Not exposed** |
| Event timeline | Canonical `eventType` + operational metadata only |

**STOP condition not triggered** — C7 exposes operational timeline without inline message text; future rich preview requires canonical content storage (separate phase).

---

## 14. RBAC

All routes: `@RequireCommunicationPermission('read')` + `PermissionsGuard`.

Legacy bridges (ai-assistant / voice operational) follow C0.2 — unchanged.

No new permissions. No field-level content gating in C7.

---

## 15. Multi-tenancy

- `organizationId` from route + `OrgScopingGuard`
- All filters/search joins include org ownership predicates
- Cross-org IDs → `404` on detail/timeline

---

## 16. Query strategy

`CommunicationReadRepository` builds one `where` object; list uses one `findMany` with embedded relation selects.

Summary uses `aggregate` + `count` + `groupBy` in parallel.

---

## 17. N+1 prevention

List path: **1** `communicationConversation.findMany` per page (verified in PostgreSQL test Y).

No per-conversation customer/booking/vehicle queries.

---

## 18. Index audit

**SUFFICIENT** for C7 keyset inbox/timeline on current schema:

- `communication_conversations (organization_id, last_activity_at)`
- Filter composites: `(organization_id, channel|status|station_id, last_activity_at)`, FK indexes on customer/booking/vehicle
- `communication_events (organization_id, conversation_id, occurred_at)`

**C7.1 not required** for initial read API. Optional future composite `(organization_id, last_activity_at DESC, id DESC)` may be proposed if EXPLAIN shows regressions at scale.

---

## 19. Query plan / scale validation

PostgreSQL integration tests seed realistic volumes per test case (up to 25-row list N+1 proof). Full 5k-row benchmark deferred; indexes match C1 inbox rationale.

---

## 20. PII boundary

Public DTOs exclude phone, email, raw payloads, transcripts, signatures. Mapper unit + integration tests assert allowlist behavior.

Safe logging: org id, conversation id, filter names, counts, duration — **no search terms or message content**.

---

## 21. Tests

| Suite | Coverage |
|-------|----------|
| `communication-read.cursor.util.spec.ts` | Cursor encode/decode, limits |
| `communication-read.mapper.spec.ts` | Labels, metadata, PII |
| `communication-read.controller.spec.ts` | Delegation |
| `communication-read.postgres.integration.spec.ts` | Matrix A–Z (org isolation, filters, cursor, timeline, summary, search, N+1, canonical-only) |

Regression: C1–C6 communication postgres suites pass alongside C7.

---

## 22. Deployment

1. Merge PR  
2. Deploy backend only  
3. Smoke: list/detail/timeline on internal org  
4. Cross-org negative check  
5. No provider activation required  

---

## 23. Rollback

Revert read controller/service/repository — read-only, no migrations, no provider impact.

---

## 24. Known limitations

1. No message preview/text in timeline (canonical content gap by design)  
2. `providerIdentity` list filter uses event existence subquery (not denormalized on conversation)  
3. Search is relational prefix/contains — no full-text/trigram index yet  
4. No mark-read / handoff mutations (deferred)  
5. Email channel conversations not in V1 inbox scope  

---

## 25. C8 readiness

**READY FOR C8** — Frontend can build Communication Center inbox against:

- `GET …/communication/conversations`
- `GET …/communication/conversations/:id`
- `GET …/communication/conversations/:id/events`
- `GET …/communication/conversations/summary`

Provider-neutral DTOs include channel, status, unread, display label, context badges, and operational timeline events.

---

## Files added/changed

| Path | Role |
|------|------|
| `backend/src/modules/communication/read/*` | Read API layer |
| `backend/src/modules/communication/communication.module.ts` | Wire controller + providers |

**Changes / Architektur (SynqDrive Code):** architecture record updated in-repo (`architecture/COMMUNICATION_CENTER_C7_READ_API_IMPLEMENTATION.md`).
