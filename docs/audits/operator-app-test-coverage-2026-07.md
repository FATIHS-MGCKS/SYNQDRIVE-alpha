# Operator App — Test Coverage Audit (2026-07)

Production-readiness Prompt 38: systematic gap analysis and test completion.

## Summary

| Area | Before (Prompt 38) | After |
|------|-------------------|-------|
| Frontend operator unit tests | 52 tests / 10 files | **114 tests / 20 files** |
| Backend `BookingsHandoverService` | 1 partial idempotency mock | **11 dedicated service tests** |
| Operator E2E (Playwright) | 0 | 0 (documented gap) |

**Net new tests:** ~62 frontend + 10 backend handover service = **~72 new tests**

Run:

```bash
cd frontend && npm run test:operator
cd backend && npm test -- --testPathPattern=bookings-handover.service
```

---

## Previous coverage (strengths)

### Frontend

- Today feed bucket merge/dedupe (`operatorTodayFeed.utils`)
- Task card display/actions/resume (`operatorTaskCard.utils`)
- Handover technical observation payload
- Pickup verification payload
- Vehicle status badges

### Backend

- Pickup gate integration (legal docs, tenant, override, audit)
- Booking lifecycle state machine matrix
- Handover signature redaction in list summaries
- Document intake upload security, tenant isolation, retention
- Task domain v2 (status machine, dedup, permissions)
- Customer verification at pickup
- Technical observations org safety
- `operator_app` upload rate limits

---

## New coverage (Prompt 38)

### Frontend

| Topic | Test file | Assertions |
|-------|-----------|------------|
| Permission gates | `lib/operatorAccess.test.ts` | Role allow/deny, rental business type |
| Deep links / routing | `lib/operatorRoutes.test.ts` | Vehicle/booking/scan/tab intents |
| Today sorting | `lib/operatorData.test.ts`, `tasks/operatorTask.utils.test.ts` | Due-now order, overdue/priority sort |
| Timezones / clocks | `operatorTask.utils.test.ts`, `operatorBooking.utils.test.ts` | `vi.useFakeTimers`, local datetime |
| Handover validation | `handover/operatorHandoverPayload.test.ts` | Signatures, odometer, warning lights, review |
| Damage capture | `damages/operatorDamagePayload.test.ts` | Photos required, source binding |
| Tire measurement | `tire-measure/operatorTireMeasure.utils.test.ts` | Legal min, axle diff warnings |
| Upload status source | `ai-upload/operatorAiUpload.config.test.ts` | `operator_app`, critical review fields |
| Connectivity | `components/OperatorConnectivityBanner.test.tsx` | Offline `role="status"` |
| Double submit guard | `lib/operatorMutationPolicy.test.ts` | In-flight mutation blocking |

### Backend

| Topic | Test file | Assertions |
|-------|-----------|------------|
| Tenant isolation | `bookings-handover.service.spec.ts` | Cross-org booking → 404 |
| Pickup completion | same | ACTIVE + RENTED + signatures + damages |
| Return completion | same | COMPLETED + kmDriven + AVAILABLE |
| Idempotency replay | same | ACTIVE pickup replay |
| Immutable return | same | Duplicate RETURN → conflict |
| Rollback | same | Blocked vehicle → no RENTED update |
| State machine | `booking-lifecycle-status.matrix.spec.ts` (existing) | PATCH forbidden |
| Signature binding | `bookings-handover.service.spec.ts` | Protocol stores signature URLs |
| Damage linking | same | `PICKUP_HANDOVER` source on damages |
| Technical observation dedup | same | Duplicate descriptions collapsed |
| Upload security | `document-upload-rate-limit.service.spec.ts` (existing) | `operator_app` limits |
| Audit / privacy | `booking-handover-privacy.util.spec.ts` (existing) | List redaction |
| Retention cleanup | `document-retention.service.spec.ts` (existing) | Extraction phases |

---

## Remaining gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Operator Playwright E2E | High | No `/operator` smoke, deep-link, or a11y e2e yet |
| `OperatorAccessGuard` / `OperatorDataContext` integration | Medium | Org switch reload not hook-tested |
| Server handover draft auto-save / resume | Medium | Awaits Prompt 34 draft API — no server persistence today |
| Task optimistic lock (`expectedUpdatedAt`) | Medium | On Prompt 36 security branch, not `main` |
| Handover HTTP permission characterization | Medium | Controller routes not in permission matrix spec |
| Station scope on handover endpoints | Medium | `station-access.service` exists; handover `actualStationId` worker filter untested |
| Correction version | Low | Not implemented in handover domain |
| Grafana/observability wiring tests | Low | Prompt 37 branch not merged to `main` |
| Full Postgres handover transaction integration | Low | Acknowledged in `booking-task.pipeline.integration.spec.ts` |

---

## Flaky / unstable tests

| Test | Status |
|------|--------|
| Operator frontend suite | Stable — fake timers for date-sensitive tests |
| `bookings-handover.service.spec.ts` | Stable — mocked Prisma transaction |
| `station-access.service.spec.ts` | **Pre-existing failure** on `main` (unrelated to operator work) |

---

## External dependencies (mocked in unit tests)

| Dependency | Mock strategy |
|------------|---------------|
| Prisma / Postgres | `jest.fn()` transaction harness |
| Redis (upload rate limit) | In-memory eval mock |
| Clerk / JWT auth | `vi.mock('../../lib/auth')` for operator access |
| Browser `navigator.onLine` | Mocked in connectivity banner test |
| DIMO / telemetry | Not in operator unit scope |
| Mistral OCR | Covered in document-extraction module tests |

---

## Related docs

- `docs/audits/operator-app-observability-2026-07.md` (Prompt 37 branch)
- `docs/audits/operator-app-security-hardening-2026-07.md` (Prompt 36 branch)
- `docs/runbooks/operator-app-incident-response.md`
