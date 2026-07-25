# Operator / Rental Handover — State Machine Reference

| Field | Value |
|-------|-------|
| **Version** | V4.9.844 (Prompt 18 — server draft lifecycle) |
| **Date** | 2026-07-25 |
| **Status** | Session SM + drafts + atomic complete + completion records |
| **Full audit** | `docs/audits/operator-app-production-readiness-2026-07.md` §35 |

---

## Ist-State-Machine (summary)

Handover has **no single lifecycle column**. Authoritative state is layered:

1. **Booking.status** — `CONFIRMED` → (pickup POST) → `ACTIVE` → (return POST) → `COMPLETED`
2. **BookingHandoverProtocol** — row exists = final protocol (`@@unique([bookingId, kind])`); no `status` field
3. **Wizard UI** — React-only; lost on close; two UIs (Operator 6-step, Rental modal)
4. **Vehicle.status** — `RENTED` on pickup; `AVAILABLE` on return (conditional)
5. **Async** — document jobs, workflows (return), task automation

Protocol transition today: `ABSENT` → `FINAL` in one POST (no server draft).

---

## Ziel-State-Machine (summary)

Per `(bookingId, HandoverKind)` introduce **`BookingHandoverSession`** with:

| State | Role |
|-------|------|
| `not_started` | Implicit — no session |
| `draft` | Server-persisted partial payload |
| `in_progress` | Active editing (optional lock) |
| `awaiting_requirements` | Pickup gate / eligibility / documents |
| `awaiting_signature` | Signatures missing |
| `submitted` | Transient during transaction |
| `completed` | Immutable `BookingHandoverProtocol` created |
| `cancelled` | Session discarded |
| `superseded` | Replaced by correction version |

Existing protocols map to `completed`. Legacy POST endpoints remain as submit shortcuts during migration.

---

## Implemented (Prompt 14)

| Component | Path |
|-----------|------|
| Prisma model | `BookingHandoverSession`, enum `HandoverSessionStatus` |
| Transition matrix | `handover-session-transition.matrix.ts` |
| Pickup policy | `handover-pickup-transition.policy.ts` |
| Return policy | `return-transition.policy.ts` |
| State machine | `handover-state-machine.ts` |
| Service | `bookings-handover-session.service.ts` |
| API | `GET/POST …/handover/sessions/:kind[/transition]` |

**Deferred:** Return complete command ~~(Prompt 16+)~~ — **implemented Prompt 16**.

### Return complete (Prompt 16)

| Component | Path |
|-----------|------|
| Command | `complete-return-handover.service.ts` |
| Atomic executor | `handover-return-completion.executor.ts` |
| Idempotency | `BookingHandoverReturnCompletionIdempotency` |
| API | `POST …/handover/return/complete` |
| Permission | `operator.handover.complete` → `bookings.write` |

### Pickup complete (Prompt 15)

| Component | Path |
|-----------|------|
| Command | `complete-pickup-handover.service.ts` |
| Atomic executor | `handover-pickup-completion.executor.ts` |
| Idempotency | `BookingHandoverPickupCompletionIdempotency` |
| API | `POST …/handover/pickup/complete` |
| Permission | `operator.handover.complete` → `bookings.write` |

Vehicle availability on return uses `resolveReturnVehicleUpdate()` — never sets maintenance from observations; respects `IN_SERVICE`/`OUT_OF_SERVICE` and other active bookings.

### Draft lifecycle (Prompt 18)

| Component | Path |
|-----------|------|
| Draft service | `bookings-handover-draft.service.ts` |
| Payload schema | `handover-session-draft.payload.ts` |
| Step validation | `handover-session-draft-step.validation.ts` |
| API | `POST/GET/PATCH/DELETE …/handover/drafts/:kind` |
| Frontend | `useOperatorHandoverDraft.ts`, `OperatorHandoverFlow.tsx` |

---

### Completion record (Prompt 17)

| Component | Path |
|-----------|------|
| Canonical payload + hash | `handover-completion-payload.canonical.ts` |
| Record persistence | `handover-completion-record.service.ts` |
| Correction command | `correct-handover-completion.service.ts` |
| Prisma | `BookingHandoverCompletionRecord`, `BookingHandoverCompletionAuditEvent` |
| Protocol versioning | `BookingHandoverProtocol.version`, `isCurrent`, `supersededById` |

---

## Invalid transitions (Ist)

- PATCH booking → `ACTIVE` / `COMPLETED` (must use handover POST)
- Pickup/return POST with wrong booking status
- Second return POST (`HANDOVER_ALREADY_EXISTS`)
- Pickup while vehicle `IN_SERVICE` / `OUT_OF_SERVICE`
- Server draft/resume (no API)

## Model changes required (target)

- New `BookingHandoverSession` table (recommended over drafting on protocol row)
- Partial unique indexes for one active session + one completed protocol per side
- Session CRUD + submit APIs; shared payload validator
- ActivityLog on complete/cancel; `GATE_PASSED` audit
- Deprecate misleading `returnProtocolStatus` in favor of session status

## Migration risks

See audit §35.8 — highest: unique constraint, dual UI race, signature GDPR in drafts.

## Acceptance criteria

See audit §35.9 — 10 criteria for implementation phase (Prompt 14+).

---

## Key source files

| Area | Path |
|------|------|
| Prisma | `backend/prisma/schema.prisma` — `BookingHandoverProtocol` |
| Service | `backend/src/modules/bookings/bookings-handover.service.ts` |
| Types | `backend/src/modules/bookings/handover.types.ts` |
| Lifecycle matrix | `backend/src/modules/bookings/booking-lifecycle-status.matrix.ts` |
| Pickup gate | `backend/src/modules/bookings/booking-pickup-gate/*` |
| Operator UI | `frontend/src/operator/handover/*` |
| Rental UI | `frontend/src/rental/components/handover/HandoverProtocolDialog.tsx` |
| Gates (FE) | `frontend/src/rental/lib/bookingHandoverGates.ts` |
