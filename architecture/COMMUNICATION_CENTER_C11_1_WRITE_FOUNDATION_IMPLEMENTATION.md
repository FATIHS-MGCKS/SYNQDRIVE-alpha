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
- Assignee validation: active `User` + active `OrganizationMembership` (same org)
- Cross-org assignee: `ASSIGNEE_INVALID` (no membership leak)

## 8. Unassign semantics

- Clears `assignedUserId`
- Invariant: `HUMAN_ACTIVE` + null assignee forbidden → transitions to `HUMAN_REQUIRED`
- Event: `HUMAN_REQUIRED`

## 9. Resolve

- Allowed from: `HUMAN_ACTIVE`, `HUMAN_REQUIRED`, `AI_ACTIVE`, `WAITING_CUSTOMER`
- Target: `RESOLVED`
- Idempotent when already `RESOLVED`
- Event: `CONVERSATION_RESOLVED`
- Assignment retained for audit/history

## 10. Reopen

- Allowed from: `RESOLVED`, `FAILED`
- Deterministic target:
  - `assignedUserId` present → `HUMAN_ACTIVE`
  - else → `HUMAN_REQUIRED`
  - `FAILED` → always `HUMAN_REQUIRED`
- Event: `CONVERSATION_REOPENED`

## 11. Mark-read authority

- Authority: org-wide `unreadCount` on `CommunicationConversation` (not per-user)
- `POST .../mark-read` sets `unreadCount = 0` when `lastContentAt` matches read snapshot (optimistic guard)
- Idempotent when already `0`
- No provider read receipts
- No timeline event

## 12. Read-state concurrency

Concurrent inbound projection increments `unreadCount` and advances `lastContentAt`. Mark-read uses conditional `updateMany` on `lastContentAt` snapshot to avoid stale zeroing.

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

Each mutation runs in `prisma.$transaction`: conversation update + idempotent event append + audit (fire-and-forget after commit).

## 16. Concurrency / idempotency

- Claim: PostgreSQL conditional `updateMany` (no version column)
- Repeating claim/resolve/mark-read: no duplicate events/audit when no state change
- Event idempotency keys on `CommunicationEvent.idempotencyKey`

## 17. Audit trail

`AuditService.record` with `ActivityEntity.INTEGRATION`, safe meta (`previousStatus`, `newStatus`, `assigneeUserId`) — no message content/PII.

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
- `communicationClient` wrappers + `already_claimed` error code
- `useCommunicationConversationActions` with org/conversation signature authority
- `CommunicationWorkspacePane` header: primary action + overflow menu; hidden for read-only

## 21. Error model

Typed HTTP bodies: `NOT_FOUND`, `FORBIDDEN`, `INVALID_TRANSITION`, `ALREADY_CLAIMED` (409), `ASSIGNEE_INVALID`, `CONFLICT`, `STALE_STATE`

## 22. Tests

- `communication-conversation-state-machine.spec.ts`
- `communication-write.postgres.integration.spec.ts` (claim concurrency, RBAC, station scope, mark-read guard)
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
