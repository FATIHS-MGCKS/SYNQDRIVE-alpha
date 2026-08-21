# Communication Center C1 — Persistence Implementation Record

**Phase:** C1 (Canonical persistence foundation)  
**Date:** 2026-08-21  
**Branch:** `feature/communication-center-c1-persistence`  
**Depends on:** C0.2 RBAC (`architecture/COMMUNICATION_CENTER_C0_2_RBAC_IMPLEMENTATION.md`)

---

## 1. Scope

C1 introduces **schema + internal repositories only**. No HTTP APIs, no webhook projection, no UI, no provider runtime changes.

Authoritative native domains remain unchanged:

| Native source | Remains authoritative for |
|---------------|-------------------------|
| `WhatsAppConversation` / `WhatsAppMessage` | WhatsApp provider data |
| `VoiceConversation` / `VoiceToolExecution` / `VoiceProviderWebhookEvent` | Voice provider data |
| `OutboundEmail` | Transactional email V1 |

---

## 2. Models added

### CommunicationConversation

Operational envelope keyed by `(organizationId, channel, nativeConversationId)`.

### CommunicationEvent

Append-oriented canonical timeline projection linked to `CommunicationConversation`.

---

## 3. Schema decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Channel enum | `CommunicationChannel` (WHATSAPP, VOICE, SMS, EMAIL) | Channel ≠ provider; cross-channel ops |
| Status enum | `CommunicationConversationStatus` | Projection-only; does not replace native statuses |
| Event enum | `CommunicationEventType` (bounded set) | Stable read-model; provider states stay native |
| Direction | `CommunicationDirection` | Justified for inbox/timeline rendering |
| Actor type | `CommunicationActorType` | Justified for audit/assignment attribution |
| Provider identity | `CommunicationProviderIdentity` enum | Bounded infra integrations; event-level only |
| Native reference | `nativeConversationId` + `channel` + unique(org, channel, native) | Avoids invalid polymorphic FKs; SMS/email not conversational yet |
| AI agent | `assignedAgentRef` + `assignedAgentType` (strings) | No brittle FK across WhatsApp AI / VoiceAssistant / future SMS agents |
| Station | `stationId` nullable FK on conversation | C6 enforcement deferred; persistence ready |
| Event station | omitted on event | Conversation owns canonical station context in C1 |
| Metadata | optional `Json` on both models | Non-provider-specific display/context only |
| Payload storage | **not** on canonical event | Privacy + native authority |

---

## 4. Idempotency strategy

| Field | Purpose |
|-------|---------|
| `idempotencyKey` | Canonical projection upsert key (`@@unique([organizationId, idempotencyKey])`) |
| `providerEventId` | Stable webhook/event id for provider dedupe |
| `providerMessageId` | Message identifier — **multiple lifecycle events may share** (delivered/read) |

Compound unique: `(organizationId, channel, providerIdentity, providerEventId)` for webhook replay safety when all provider fields are non-null.

**PostgreSQL NULL semantics:** the compound provider unique allows multiple rows when `providerIdentity` or `providerEventId` is NULL. C3+ projection **must** set `idempotencyKey` whenever dedupe is required; do not rely on the provider compound unique alone when provider fields may be absent.

Repositories use append-only idempotent create (no in-place mutation of prior events).

---

## 5. FK / delete behavior

| Relation | onDelete |
|----------|----------|
| Organization | Cascade |
| Customer, Booking, Vehicle, Station (conversation) | SetNull |
| Assigned user (`assignedUserId` → `User`) | SetNull |
| CommunicationConversation → events | Cascade |
| Customer, Booking, Vehicle (event context) | SetNull |

Matches WhatsAppConversation / VoiceConversation patterns.

---

## 6. Index rationale

Indexes align with future inbox/dashboard queries (C7/C12):

- org + `lastActivityAt` (sort)
- org + status/channel/station/assignee filters
- org + customer/booking/vehicle lookup
- event timeline by conversation / type / channel
- provider message lookup

---

## 7. Tenant invariants (pre-merge hardening)

### Assignee identity

| Decision | Detail |
|----------|--------|
| Canonical reference | **`User.id`** in `assignedUserId` (same as `OrgTask`, task automation overrides) |
| Why not `OrganizationMembership.id` | Repo-wide assignment fields store `User.id`; membership is validated at service boundary |
| DB integrity | FK `assigned_user_id` → `users.id` with `ON DELETE SET NULL` |
| Service validation | `CommunicationTenantContextValidation` requires user exists **and** active org membership before create/projection update |
| Cross-org protection | Rejected with `BadRequestException` at repository/service boundary |

Human handoff workflow is **not** implemented in C1 — only persistence invariants.

### Event channel invariant

`CommunicationPersistenceService.appendEventIdempotently` rejects when:

- conversation missing in org → `ForbiddenException`
- `event.channel !== conversation.channel` → `BadRequestException`

### Tenant context validation

**Conversation envelope** (`createConversation`, `updateConversationProjection`, `ensureConversationEnvelope` create path):

- `customerId`, `bookingId`, `vehicleId`, `stationId` must belong to `organizationId`
- `assignedUserId` must reference existing user with org membership
- Implemented in `CommunicationTenantContextValidation` (mirrors `TasksService.assertLinksBelongToOrg`)

**Event context** (option B — derive from conversation):

- `appendEventIdempotently` copies `customerId` / `bookingId` / `vehicleId` from the tenant-validated conversation
- Arbitrary cross-org event context IDs in the input are ignored — cannot attach foreign tenant entities to canonical events

Prisma cannot enforce event/conversation org equality; service layer does.

### Unread count DB invariant

| Layer | Enforcement |
|-------|-------------|
| Repository | Rejects `unreadCount < 0` with `BadRequestException` |
| Database | `CHECK (unread_count >= 0)` — consistent with billing/rental-rules migrations |

---

## 8. Feature flag

Schema exists unconditionally. No runtime projection writes in C1.

Future C3+ wiring should gate writes via `COMMUNICATION_CENTER_PROJECTION_ENABLED` (constant documented in `communication.constants.ts`).

---

## 9. Migration

**File:** `20260821140000_communication_center_c1_persistence`

- Additive only (new enums + tables + indexes + FKs + unread CHECK)
- Includes `assigned_user_id` → `users` FK
- No data backfill
- Safe on empty production (tables start empty)

**Rollback:** drop `communication_events`, `communication_conversations`, then enums (documented in migration SQL comments).

### Real migration validation

Script: `backend/scripts/test/communication-center-c1-migration-test.sh`

Validates against disposable PostgreSQL:

- `prisma migrate deploy` from empty DB
- `prisma validate` + `prisma generate`
- tables/enums/indexes/FKs exist
- native reference unique enforced
- idempotency unique enforced
- multiple NULL provider-event rows allowed (documents idempotencyKey requirement)
- unread_count CHECK enforced
- assigned_user_id FK present

Run: `npm run test:communication-center:migration` (requires local Postgres, e.g. `npm run infra:up`).

---

## 10. Module structure

```
backend/src/modules/communication/
  communication.module.ts
  communication.constants.ts
  communication.types.ts
  communication-tenant-context.validation.ts
  communication-conversation.repository.ts
  communication-event.repository.ts
  communication-persistence.service.ts
  *.spec.ts
```

Registered in `AppModule` — **no controller**.

---

## 11. Tests

| Suite | Coverage |
|-------|----------|
| `communication-tenant-context.validation.spec.ts` | same-org context, cross-org customer/booking/vehicle/station, assignee user/membership |
| `communication-conversation.repository.spec.ts` | create, status, nullable FKs, native lookup, envelope idempotency, unread guard, tenant validation on create/update |
| `communication-event.repository.spec.ts` | append, idempotent replay, shared providerMessageId, null provider dedupe behavior, org-scoped list |
| `communication-persistence.service.spec.ts` | cross-org rejection, channel invariant (WHATSAPP/SMS/VOICE), event context derivation, delegated envelope |

Migration validation: `communication-center-c1-migration-test.sh` against real PostgreSQL.

---

## 12. Known risks

1. Compound provider-event unique allows multiple NULL provider fields (PostgreSQL semantics) — projection must always set `idempotencyKey` when dedupe required
2. `assignedAgentType` is string-validated in TS only until unified agent registry
3. Station resolution not enforced until C6 (ownership validation only in C1)
4. Empty canonical tables until C3/C4 projection phases
5. Enum evolution requires migration for new event types (accepted tradeoff vs unbounded strings)

---

## 13. C2 readiness

**READY FOR C2** — persistence foundation, tenant-scoped repositories, assignee/context/channel invariants, and idempotency hooks are in place for projection contract design and native-reference mapping without changing provider tables.
