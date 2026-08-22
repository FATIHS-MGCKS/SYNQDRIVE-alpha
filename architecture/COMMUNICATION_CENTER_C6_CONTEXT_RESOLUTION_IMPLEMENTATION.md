# Communication Center C6 — Context Resolution Implementation

**Phase:** C6 (Canonical context resolution)  
**Date:** 2026-08-22  
**Branch:** `feature/communication-center-c6-context-resolution`  
**Depends on:** C1 persistence, C2 normalization, C3 WhatsApp projection, C4 Voice projection, C5.1 SMS persistence/projection

---

## 1. Scope

C6 adds a **provider-neutral, deterministic** context resolution layer for `CommunicationConversation`:

- `customerId`
- `bookingId`
- `vehicleId`
- `stationId`
- `assignedUserId` / `assignedAgentRef` / `assignedAgentType`

No UI, no provider sends, no sent.dm credentials, no fuzzy matching, no LLM inference.

---

## 2. Domain relationship audit

| Entity | Authoritative links for communication |
|--------|-------------------------------------|
| `WhatsAppConversation` | `customerId`, `bookingId`, `vehicleId`, `assignedTo`, `contactPhoneNormalized` |
| `SmsConversation` | `customerId`, `bookingId`, `vehicleId`, `contactPhoneNormalized` |
| `VoiceConversation` | context in `metadata` JSON (`customerId`, `bookingId`, `vehicleId`, `stationId`), `callerNumber`, `providerAgentId` / `voiceAssistantId` |
| `CommunicationConversation` | canonical context fields + `metadata.contextResolutionSources` |
| `Customer` | `phoneNormalized`, `emailNormalized`, `organizationId`, `archivedAt` |
| `Booking` | `customerId`, `vehicleId`, station role fields, `startDate`/`endDate`, `status` |
| `Station` | org-scoped FK only |
| `Vehicle` | org-scoped FK only |

Booking has **no generic `stationId`** — pickup/return/actual roles may disagree; station propagation uses a unique-candidate rule only.

---

## 3. Authority precedence

1. **NATIVE_RELATION** — persisted native conversation/message links (same-org validated)
2. **EXISTING_CANONICAL** — non-null canonical field already on `CommunicationConversation`
3. **EXACT_PHONE / EXACT_EMAIL** — unique same-org customer match (`archivedAt: null`)
4. **BOOKING_TIME_WINDOW** — exactly one eligible booking whose service window contains explicit `occurredAt`
5. **BOOKING_RELATION** — deterministic propagation from **safe** resolved booking (vehicle, unique station)

Otherwise: **unresolved** (null preferred over wrong).

---

## 4. Customer resolution

- Native `customerId` → same-org validate → use
- Exact `phoneNormalized` → unique active customer in org → use
- Exact normalized email → unique active customer in org → use
- Identity lookup result: `none` (NO_MATCH), `unique`, `ambiguous` (MULTIPLE_CUSTOMERS)
- Conservative multi-hint policy: when both phone and email hints are present, **both** must be `unique` and agree; any ambiguous hint blocks resolution
- Phone and email disagree → `CONFLICTING_IDENTITIES`, unresolved
- Cross-org native ID → `CROSS_ORG_REFERENCE`, rejected

---

## 5. Phone/email normalization

- Phone: `normalizeCommunicationPhone()` in `context/communication-phone.util.ts` (reuses `customer-normalizer.util` + conservative DE national `0…` → `49…` handling)
- Email: `normalizeEmail()` — trim + lowercase only
- Provider runtime normalization is **not** rewritten; resolver normalizes hints at resolution time only

---

## 6. Booking resolution

- Native `bookingId` → same-org validate → use only when `booking.customerId === resolvedCustomerId`
- Native booking/customer mismatch → `BOOKING_CUSTOMER_MISMATCH`; booking not applied; no propagation
- Existing canonical booking may remain on conversation but is **quarantined** from vehicle/station propagation when customer mismatch
- Time window: requires trustworthy explicit `occurredAt` (no `new Date()` / wall-clock fallback)
- Eligible statuses: `PENDING`, `CONFIRMED`, `ACTIVE`
- Inclusive window on `startDate` / `endDate` with exactly one match
- Multiple overlaps → `MULTIPLE_BOOKINGS`

---

## 7. Time-window semantics

- Anchor: explicit event `occurredAt` passed into resolver (projection event time or conversation `lastActivityAt` in backfill)
- **No wall-clock fallback** — if `occurredAt` is absent/invalid, `BOOKING_TIME_WINDOW` does not run
- Inclusive window: `startDate <= occurredAt <= endDate`

---

## 8. Vehicle resolution

- Native `vehicleId` (same-org) → use
- Else **safe booking only** → `booking.vehicleId`
- No telemetry / recent-activity inference

---

## 9. Station resolution

- Native `stationId` (same-org) → use
- Else **safe booking only** → unique non-null station role candidate
- Pickup vs return ambiguity → `BOOKING_CONTEXT_UNCLEAR`, null

---

## 10. User/agent handling

- `assignedUserId` validated against `organizationMembership` before inclusion in patch
- Reuse native `assignedAgentRef` when present
- No inference from last sender or org admin

---

## 11. Conflict policy

- Log safe structured conflicts (`field`, `code`) — no PII
- Authoritative/native wins over weaker derived evidence
- `BOOKING_CUSTOMER_MISMATCH` quarantines propagation without silently reconciling contradictions

---

## 12. Ambiguity policy

Internal codes: `NO_MATCH`, `MULTIPLE_CUSTOMERS`, `CONFLICTING_IDENTITIES`, `MULTIPLE_BOOKINGS`, `BOOKING_CONTEXT_UNCLEAR`, `CROSS_ORG_REFERENCE`, `INVALID_NATIVE_REFERENCE`.

---

## 13. Multi-tenancy

Every lookup includes `organizationId`. `CommunicationTenantContextValidation` re-validates on apply.

---

## 14. Canonical enrichment rules

`CommunicationContextApplierService.applyResolvedContext`:

- Fill null fields with deterministic results
- Overwrite only when new source is strictly stronger (recorded in `metadata.contextResolutionSources`)
- DB-authoritative conditional SQL updates for field values; metadata merged via `jsonb_set` preserving unrelated keys

---

## 15. Concurrency

- Native `NATIVE_RELATION` can replace weaker incumbent sources (`EXACT_PHONE`, `EXACT_EMAIL`, `BOOKING_*`) in either scheduling order
- Equal/weaker concurrent writers cannot arbitrarily overwrite stronger incumbent context
- `contextResolutionSources` updated atomically per field apply

---

## 16. Provider failure isolation

`CommunicationProjectionService` commits projection first, then calls enrichment in outer try/catch. Resolver/applier failures never roll back native or canonical events.

---

## 17. Backfill/reconciliation

`CommunicationContextBackfillService` + `scripts/ops/backfill-communication-context.ts`:

- org scope, optional channel filter, batch size, `unresolvedOnly` default
- `--apply` for mutations; default dry-run aggregate counts only (no PII)
- Ops scripts emit safe JSON error output (`error` name only) on failure

---

## 18. Index audit

Existing indexes sufficient for C6:

- `customers(organization_id, phone_normalized)`
- `customers(organization_id, email_normalized)`
- `communication_conversations` org + customer/booking/vehicle/station

**Schema migration required: NO**

---

## 19. Data duplicate audit

`CommunicationContextDuplicateAuditService` + `scripts/ops/audit-communication-context-duplicates.ts` report aggregate org counts only.

---

## 20. Tests

| Matrix | Coverage |
|--------|----------|
| A–P | Initial C6 resolver/applier/backfill/projection isolation |
| Q–AB | Hardening: booking quarantine, no wall-clock, identity ambiguity, concurrency, membership, metadata preservation |

Unit: `communication-context-resolver.spec.ts`, `communication-identity-match.util.spec.ts`  
PostgreSQL: `communication-context-resolver.postgres.integration.spec.ts` (A–AB)

---

## 21. Deployment

1. Merge C6
2. Deploy backend (no provider config changes)
3. New events enrich context best-effort
4. Optional dry-run backfill per org → inspect aggregates → controlled `--apply`

---

## 22. Rollback

Revert/disable enrichment hook. Resolved context is not destructively cleared on rollback.

---

## 23. Known limitations

- Voice context depends on `metadata` + `callerNumber` quality
- Station remains null when booking has multiple station roles
- Email channel projection deferred — resolver accepts email hints for future EMAIL channel
- Duplicate normalized phone/email per org possible without DB unique constraint

---

## 24. C7 readiness

Canonical conversations can be filtered by resolved `customerId` / `bookingId` / `vehicleId` / `stationId` for inbox/read APIs. **READY FOR C7** (read-model enrichment complete; inbox API still C7 scope).

---

## Module map

| File | Role |
|------|------|
| `context/communication-context.types.ts` | Types, ambiguity/source enums |
| `context/communication-context-resolver.service.ts` | Deterministic resolver |
| `context/communication-context-applier.service.ts` | DB-authoritative apply + concurrency guards |
| `context/communication-context-enrichment.service.ts` | Post-projection hook + backfill |
| `context/communication-native-context.loader.ts` | Channel native fact extraction |
| `context/communication-phone.util.ts` | Shared phone normalization |
| `context/communication-identity-match.util.ts` | Conservative identity lookup + occurredAt guard |
| `context/booking-eligibility.util.ts` | Eligible booking statuses |
| `context/communication-context-duplicate-audit.service.ts` | Aggregate duplicate phone/email audit |
| `scripts/ops/communication-ops-script.util.ts` | Safe ops script failure output |

**Changes updated:** yes (this document)  
**Architektur updated:** yes (this document)
