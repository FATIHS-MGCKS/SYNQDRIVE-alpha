# Communication Center C13.0 — `link_vehicle` Canonical Authority Hotfix

**Date:** 2026-08-23  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `fix/communication-link-vehicle-canonical-authority`  
**Audit source:** PR #1223 / `COMMUNICATION_CENTER_FINAL_C9_C12_RESIGNOFF_2026_08.md`  
**Scope:** Single blocking C9–C12 authority defect — **not** C13 retention/observability/cleanup

---

## 1. Defect

Canonical Quick Action `link_vehicle` updated only `WhatsAppConversation.vehicleId` without updating `CommunicationConversation.vehicleId`, causing:

- **UNSAFE_DUPLICATE_AUTHORITY** (native write bypass)
- Canonical/native context drift (context pane, filters, read APIs stale)

---

## 2. Prior unsafe authority

```typescript
// communication-quick-action.executor.ts (pre-fix)
await prisma.whatsAppConversation.update({
  where: { id: convo.id },
  data: { vehicleId: booking.vehicleId },
});
```

No canonical mutation. No transaction. No tenant conflict policy on canonical row.

---

## 3. Final authority

**Pattern A:** `CommunicationConversation.vehicleId` is canonical; native WhatsApp converges in the same transaction.

New service: `CommunicationContextLinkService.linkVehicleFromBooking()`

| Layer | Authority |
|-------|-----------|
| Canonical | `CommunicationConversation.vehicleId` + `metadata.contextResolutionSources.vehicleId = BOOKING_RELATION` |
| Native (legacy compat) | `WhatsAppConversation.vehicleId` updated in same `$transaction` |
| Vehicle source | Authoritative `booking.vehicleId` (org-scoped lookup) — never frontend-supplied |

---

## 4. Mutation / convergence path

1. Load canonical conversation via `CommunicationReadRepository`
2. `CommunicationWriteScopeService.assertConversationMutable` (station scope preserved)
3. Load native WhatsApp conversation; require `bookingId`
4. Resolve booking in same `organizationId`; derive `vehicleId`
5. `CommunicationTenantContextValidation.assertConversationContextBelongsToOrg`
6. Conflict if canonical `vehicleId` exists and differs from booking vehicle
7. Idempotent no-op if both rows already match booking vehicle
8. `$transaction`: update canonical (if needed) → update native (if needed)
9. Return `mapConversationDetail` for read-after-write

Executor delegates to service; no direct `prisma.whatsAppConversation.update` in quick-action path.

---

## 5. Transaction / atomicity

Both canonical and native updates occur inside `prisma.$transaction`.

| Evidence class | Mechanism | Result |
|----------------|-----------|--------|
| Tenant precondition rejection | Cross-org booking pointer rejected before `$transaction` | **PASS** |
| In-transaction rollback | Real PostgreSQL interactive transaction; canonical `communicationConversation.update` executes, then forced native `whatsAppConversation.update` failure; both rows remain `vehicleId = null` after rollback | **PASS** |

Do **not** conflate tenant precondition rejection with transaction rollback proof.

---

## 6. RBAC

Unchanged Quick Action permission model:

- `communication.write` for quick-action execution (existing controller guard)
- No new domain permissions (`tasks.*` not involved)
- Station scope enforced via existing `assertConversationMutable`

---

## 7. Tenant / station

- Booking and vehicle validated with `organizationId` filter
- Cross-org booking pointer on native row → rejected; neither row mutated
- Station scope: existing write-scope assertion on canonical conversation row

---

## 8. Idempotency / replay

Repeated `link_vehicle` with same booking vehicle:

- Returns `changed: false`
- Same converged `vehicleId`
- No duplicate events (no new CommunicationEvent introduced for this hotfix)

---

## 9. Conflict policy

If canonical `vehicleId` is already set to a **different** vehicle than booking's vehicle:

- `CommunicationWriteError.conflict('Conversation is already linked to a different vehicle')`
- No silent overwrite
- No relink UX in C13.0

If canonical is unset but native has a stale different vehicle: operator link from booking authority wins (both converge to booking vehicle).

---

## 10. Native compatibility

Legacy `whatsapp-business` may still read `WhatsAppConversation.vehicleId`. Native field updated in transaction for consistency until C13 legacy cleanup.

---

## 11. Frontend

No Quick Action redesign. `link_vehicle` success returns `conversation` on `BUSINESS_MUTATION`; hook refreshes detail/context via existing `onRefresh` + optional `onConversationUpdated` when conversation present.

---

## 12. PostgreSQL evidence

`communication-context-link.postgres.integration.spec.ts` — **7/7 PASS**

| Test | Result |
|------|--------|
| Convergence (canonical + native) | PASS |
| Tenant precondition rejection (pre-transaction) | PASS |
| In-transaction rollback after canonical update | PASS |
| Replay idempotency | PASS |
| Different-vehicle conflict | PASS |
| Read-after-write | PASS |

---

## 13. Regression evidence

| Suite | Result |
|-------|--------|
| `communication-quick-action.executor.spec.ts` | PASS (+ link_vehicle authority test) |
| `communication-reply-template.postgres` | PASS |
| `communication-read-intent.postgres` | PASS |
| `communication-voice-ops.postgres` | PASS |
| Backend typecheck | PASS |
| Frontend build | PASS |

---

## 14. Re-signoff impact

Resolves the **only blocking defect** from final C9–C12 re-signoff (PR #1223). Historical audit document unchanged. After merge, perform tiny gate re-check to supersede C13 BLOCKED → OPEN.

**C9–C12 blocker resolved:** YES (for `link_vehicle` authority)
