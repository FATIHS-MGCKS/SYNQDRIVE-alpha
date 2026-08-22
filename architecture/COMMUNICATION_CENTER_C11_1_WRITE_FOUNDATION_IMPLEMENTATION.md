# Communication Center C11.1 — Write Foundation Implementation

**Date:** 2026-08-22  
**Phase:** C11.1 (canonical conversation mutations — claim, assignment, resolve, reopen, mark-read)  
**Base:** `main` after merged PR #1183 (C8.5 dashboard widget)

## 1. Scope

C11.1 establishes the canonical **write** layer for Communication conversations:

- `POST .../claim`
- `PATCH .../assignment` (assign / unassign)
- `POST .../resolve`
- `POST .../reopen`
- `POST .../mark-read`
- Frozen operator status transition matrix
- `communication.write` / `communication.manage` enforcement
- Station + tenant scope on mutations
- Claim concurrency (conditional `updateMany`)
- Idempotent no-op semantics
- Audit trail + selective timeline events
- Frontend mutation client + `useCommunicationConversationActions`
- Minimal C8.3 header action wiring (no composer)

**Out of scope:** outbound reply/composer, sent.dm sending, provider calls, dashboard mutations, attachments.

## 2. Mutation audit (before C11.1)

| Area | Pre-C11.1 state |
|------|-----------------|
| Canonical routes | Read-only (`GET` summary, list, detail, events) |
| WhatsApp legacy | `whatsapp-quick-actions` mutates native `WhatsAppConversation` + partial projection |
| Voice / SMS | Projection ingest only |
| RBAC | `communication.read` / `write` / `manage` exist (C0.2) |
| Events | `HUMAN_ASSIGNED`, `CONVERSATION_RESOLVED`, `CONVERSATION_REOPENED` enums existed but operator paths did not emit them |

## 3. Canonical status enum

`CommunicationConversationStatus` (Prisma authoritative):

- `AI_ACTIVE`
- `WAITING_CUSTOMER`
- `HUMAN_REQUIRED`
- `HUMAN_ACTIVE`
- `RESOLVED`
- `FAILED`

**Terminal:** `RESOLVED`, `FAILED`  
**Operator-transitionable:** non-terminal states per matrix below  
**System-only:** `FAILED` entry (operators may reopen to `HUMAN_REQUIRED` only)

## 4. Transition matrix (operator)

| From | Allowed to |
|------|------------|
| `AI_ACTIVE` | `WAITING_CUSTOMER`, `HUMAN_REQUIRED`, `RESOLVED` |
| `WAITING_CUSTOMER` | `AI_ACTIVE`, `HUMAN_REQUIRED`, `RESOLVED` |
| `HUMAN_REQUIRED` | `HUMAN_ACTIVE`, `RESOLVED` |
| `HUMAN_ACTIVE` | `WAITING_CUSTOMER`, `AI_ACTIVE`, `RESOLVED` |
| `RESOLVED` | `AI_ACTIVE`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE` (via reopen rule) |
| `FAILED` | `HUMAN_REQUIRED` (reopen) |

Implementation: `backend/src/modules/communication/write/communication-conversation-state-machine.ts`

## 5. Transition authority

Single module: `assertOperatorStatusTransition()` — controllers/services must not scatter rules.

System/projector transitions remain in `CommunicationProjectionService` (ingest path).

## 6. Claim semantics

- Eligible: `HUMAN_REQUIRED` + `assignedUserId IS NULL`
- Atomic: conditional `updateMany` sets `assignedUserId = actor`, `status = HUMAN_ACTIVE`
- Same actor + already `HUMAN_ACTIVE`: idempotent no-op (no duplicate event/audit)
- Other operator: `409 ALREADY_CLAIMED` unless `communication.manage` force-assign path used
- Event: `HUMAN_ASSIGNED` (idempotent key includes prior status)

## 7. Assignment semantics

- `communication.write`: claim self, unassign self
- `communication.manage`: assign/reassign arbitrary active org member
- Assignee validation: active `User` + active `OrganizationMembership` (same org), validated **inside** the mutation transaction
- Cross-org assignee: `ASSIGNEE_INVALID` (no membership leak)
- **No implicit reopen:** assignment on `RESOLVED` or `FAILED` is rejected (`INVALID_TRANSITION`); operator must `reopen` first, then assign
- **Concurrency:** conditional `updateMany` on `updatedAt` snapshot; write-only operators may only overwrite `assignedUserId IS NULL` or their own assignment; manage may force-reassign
- **Status change on assign:** only `HUMAN_REQUIRED → HUMAN_ACTIVE`; other non-terminal statuses keep status unchanged

## 8. Unassign semantics

- Clears `assignedUserId`
- Invariant: `HUMAN_ACTIVE` + null assignee forbidden → transitions to `HUMAN_REQUIRED`
- Event: `HUMAN_REQUIRED`
- **Concurrency:** conditional `updateMany` requires `assignedUserId = actor` (write) or `assignedUserId IS NOT NULL` (manage) plus matching `updatedAt`; stale self-unassign cannot clear a concurrent reassignment

## 9. Resolve

- Allowed from: `HUMAN_ACTIVE`, `HUMAN_REQUIRED`, `AI_ACTIVE`, `WAITING_CUSTOMER`
- Target: `RESOLVED`
- Idempotent when already `RESOLVED`
- Event: `CONVERSATION_RESOLVED`
- Assignment retained for audit/history
- **Concurrency:** optimistic `updateMany` on `status + updatedAt`; on conflict re-reads authoritative row and retries or returns `INVALID_TRANSITION` / `STALE_STATE` based on actual current state; audit `previousStatus` reflects the row that was actually resolved

## 10. Reopen

- Allowed from: `RESOLVED`, `FAILED`
- Deterministic target computed from **transactional** `assignedUserId` + `status` snapshot:
  - `assignedUserId` present → `HUMAN_ACTIVE`
  - else → `HUMAN_REQUIRED`
  - `FAILED` → always `HUMAN_REQUIRED`
- Event: `CONVERSATION_REOPENED`
- **Concurrency:** conditional `updateMany` on `status + updatedAt`; concurrent assignment during reopen cannot produce `HUMAN_ACTIVE + null assignee` or `HUMAN_REQUIRED + assigned user`

## 11. Mark-read authority

- Authority: org-wide `unreadCount` on `CommunicationConversation` (not per-user)
- `POST .../mark-read` sets `unreadCount = 0` when `lastContentAt` matches read snapshot (optimistic guard)
- Idempotent when already `0`
- No provider read receipts
- No timeline event

## 12. Read-state concurrency

Concurrent inbound projection increments `unreadCount` and advances `lastContentAt`. Mark-read uses conditional `updateMany` on `lastContentAt` snapshot to avoid stale zeroing. Integration test exercises the **service path** with concurrent inbound projection advancing `lastContentAt` during mark-read.

## 13. RBAC

| Permission | Mutations |
|------------|-----------|
| `communication.read` | None (403 on write routes) |
| `communication.write` | claim, resolve, reopen, mark-read, self-assign, self-unassign |
| `communication.manage` | force assign/reassign |

Enforced via `@RequireCommunicationPermission('write')` on controller + service-level manage checks.

## 14. Station / tenant scope

- Tenant: `organizationId + conversationId` lookup; cross-tenant → `404`
- Station: `CommunicationWriteScopeService` uses `StationAccessService.assertStationReadable` when `stationId` set (Stations V2 scope)

## 15. Transaction boundaries

Each mutation runs in `prisma.$transaction`:

1. **All authoritative reads** inside the transaction use `CommunicationReadRepository.findConversationById(orgId, id, tx)` — no root Prisma reads for mutation decisions or response assembly
2. **State mutation** via conditional `updateMany` / transactional writes on `tx`
3. **Timeline events** via `appendEventIdempotently(..., tx)` in the same transaction
4. **Post-commit audit** via `AuditService.record` (best-effort, not atomic with DB — see §17)

`actorCanManage` resolves **before** entering the transaction (controller-enforced RBAC is request-scoped). Station scope checks use the transactionally authoritative conversation row.

## 16. Concurrency / idempotency

- Claim: PostgreSQL conditional `updateMany` (`assignedUserId IS NULL`, `HUMAN_REQUIRED`)
- Assign / unassign / resolve / reopen: optimistic concurrency via `updatedAt` snapshot in `updateMany` where clause
- Repeating claim/resolve/mark-read no-op: no duplicate events/audit when no state change
- **Lifecycle event idempotency keys:** `comm:{action}:{conversationId}:{preMutationUpdatedAt}` — distinguishes separate legitimate resolve/reopen cycles while deduping HTTP retries of the same mutation attempt
- **Response convergence:** mutation HTTP response returns `mapConversationDetail` from post-write transactional read, not pre-mutation snapshot

## 17. Audit trail

`AuditService.record` (fire-and-forget `void`) with `ActivityEntity.INTEGRATION`, safe meta (`previousStatus`, `newStatus`, `assigneeUserId`) — no message content/PII.

**Durability:** audit is **best-effort** per existing `AuditService` contract — not part of the DB transaction. Mutation success does not depend on audit persistence. Do not claim mutation + audit atomicity.

## 18. Timeline event policy

| Action | Timeline event |
|--------|----------------|
| Claim / assign | `HUMAN_ASSIGNED` |
| Unassign | `HUMAN_REQUIRED` |
| Resolve | `CONVERSATION_RESOLVED` |
| Reopen | `CONVERSATION_REOPENED` |
| Mark read | none |

## 19. Legacy compatibility

WhatsApp `whatsapp-quick-actions` native paths unchanged. Canonical mutations are the new operator authority for Communication Center UI; legacy routes remain until C11.2+ convergence.

## 20. Frontend actions

- `api.communication.*` mutation methods
- `communicationClient` wrappers + `already_claimed` / `stale_state` error codes
- `useCommunicationConversationActions` with org/conversation signature authority
- **Response convergence:** `onConversationUpdated` applies authoritative mutation DTO immediately via `applyConversationUpdate`
- **Conflict refresh:** `409 ALREADY_CLAIMED` / `STALE_STATE` / `CONFLICT` triggers `onConflictRefresh` (canonical detail reload)
- `CommunicationWorkspacePane` header: primary action + overflow menu; hidden for read-only

## 21. Error model

Typed HTTP bodies: `NOT_FOUND`, `FORBIDDEN`, `INVALID_TRANSITION`, `ALREADY_CLAIMED` (409), `ASSIGNEE_INVALID`, `CONFLICT`, `STALE_STATE`

## 22. Tests

- `communication-conversation-state-machine.spec.ts`
- `communication-write.postgres.integration.spec.ts`:
  - claim concurrency (PostgreSQL)
  - unassign vs concurrent manager reassign race
  - resolve vs claim race
  - reopen vs assign race
  - repeated resolve/reopen lifecycle event cycle (2× `CONVERSATION_RESOLVED`, 1× `CONVERSATION_REOPENED`)
  - service-level mark-read vs concurrent inbound projection
  - response DTO convergence per mutation
  - RESOLVED/FAILED assignment rejection
  - RBAC, station scope, cross-tenant
- `communication-actions.test.ts`
- `CommunicationWorkspacePane.actions.test.tsx`

## 23. Provider non-interaction

Mutations touch canonical tables only — no Meta/Twilio/ElevenLabs/sent.dm calls.

## 24. C11.2 reply-routing preflight

| Channel | Planned outbound route |
|---------|------------------------|
| WHATSAPP | Existing Meta WhatsApp native send adapter |
| SMS | sent.dm adapter when credentials/runtime contract exists |
| VOICE | No text composer unless channel semantics support follow-up |

## 25. Known limitations

- No per-user unread state (org-wide `unreadCount` only)
- Legacy WhatsApp quick-actions not yet routed through canonical write service
- No automatic mark-read on conversation open (explicit action only)

## 26. Next-phase readiness

**READY FOR C11.2 REPLY / COMPOSER** — canonical operational state and claim/resolve foundation complete; outbound reply can build on write RBAC + conversation authority.
