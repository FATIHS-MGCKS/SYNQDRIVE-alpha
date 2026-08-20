# Fleet Readiness Hard-Offline & Station Filter Re-Audit (PR #1090)

**Audit date (UTC):** 2026-08-21  
**Auditor mode:** Read-only verification — no production code, data, config, or flags modified  
**Audited PR:** [#1090](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1090) — Fleet Readiness: hard-offline NOT_READY + notification stationId filter remediation  
**Audited HEAD:** `94027ad275c17ce80cfc22a20155446dc129c6d6`  
**Prior audit:** PR #1089 / `docs/audits/fleet-readiness-production-data-lineage-2026-08-21.md`

---

## 1. Executive verdict

### **YELLOW — mergeable with explicit follow-up**

Both production defects targeted by PR #1090 are **correctly fixed at the code level**:

1. Vehicle-scoped Notification V2 `stationId` filtering now includes station-member vehicles.
2. Canonical rental readiness treats telemetry `offline` (≥48h) as hard `NOT_READY` via the shared freshness resolver.

Authorization is sound (org isolation + station ACL preserved). Threshold logic is **not duplicated** in Rental Health.

Non-blocking risks remain:

- Notification station membership uses `expectedStationId` while fleet summary vehicle selection uses only `homeStationId` + `currentStationId` — potential cross-surface mismatch.
- Fleet summary 5-vehicle regression test mocks batch rows; it does not prove end-to-end telemetry → readiness → aggregation.
- `rh-projection-v3` does not change Redis cache key version; recomputation relies on 45s TTL + live `getVehicleHealth()` on cache miss — not immediate projection-version invalidation.
- `blocking_reasons` uses a localized display string (pre-existing pattern), not a structured cause key.
- No DB-backed integration test for notification station SQL.

**Recommendation:** Merge #1090 after acknowledging follow-ups. No ORANGE/RED blockers found.

---

## 2. Audited PR + HEAD

| Item | Value |
|------|-------|
| PR | #1090 |
| Branch | `cursor/fleet-readiness-hard-offline-station-filter-dcd7` |
| HEAD | `94027ad275c17ce80cfc22a20155446dc129c6d6` |
| Base | `main` (includes merged #1089 audit doc) |

---

## 3. Changed-file scope

### Production code (6 files)

| File | Purpose |
|------|---------|
| `notification-query.util.ts` | `buildStationIdQueryFilter()` — vehicle/booking/station OR membership |
| `notification-api.service.ts` | `resolveStationFilterMembership()`; wired into `list()` + `getCounts()` |
| `notification-api.dto.ts` | `stationId` on `NotificationCountsQueryDto` |
| `rental-health-telemetry-blocking.policy.ts` | **NEW** — canonical ≥48h block via `resolveTelemetryFreshness()` |
| `rental-health.service.ts` | Integrates telemetry block into `blocking_reasons`; projection `rh-projection-v3` |

### Tests (6 files)

| File | Coverage |
|------|----------|
| `notification-query.util.spec.ts` | WHERE construction + attentionScope AND |
| `notification-api.service.spec.ts` | Service membership + counts path |
| `rental-health-telemetry-blocking.policy.spec.ts` | Boundary + no_signal + 5-vehicle helper scenario |
| `rental-health.service.spec.ts` | Integration via `getVehicleHealth()` |
| `rental-health-fleet.service.spec.ts` | Summary aggregation math (mocked rows) |
| `vehicle-readiness-notification.spec.ts` | VEHICLE_NOT_READY on telemetry blocking reason |

### Documentation only (3 files)

- `docs/audits/fleet-readiness-hard-offline-and-station-filter-remediation-2026-08-21.md`
- `ChangesView.tsx`, `ArchitekturView.tsx`

**Unrelated behavior:** No dashboard UI, unrelated health modules, notification producers, or fleet summary aggregation logic changed beyond consuming updated readiness rows.

---

## 4. Canonical hard-offline rule verification

### Code path

```
DimoVehicle.lastSignal + VehicleLatestState.updatedAt
  → RentalHealthService.evaluateTelemetryRentalBlocking()
  → evaluateTelemetryRentalBlocking() [policy]
  → resolveTelemetryFreshness() [telemetry-freshness.resolver]
  → resolveCanonicalTelemetryObservedAtMs()
  → classifyTelemetryFreshness() [vehicle-state-interpreter]
  → freshness === 'offline' → blocksRental=true
  → append to blocking_reasons[]
  → resolveRentalBlockedState() → rental_blocked=true
  → deriveRentalReadiness() → rental_readiness='not_ready'
  → RentalHealthSummaryService.getFleetRow() → fleet summary counts
```

### Answers

| Question | Answer |
|----------|--------|
| Helper determining telemetry state | `resolveTelemetryFreshness()` → `classifyTelemetryFreshness()` |
| ≥48h state name | **`offline`** (type `TelemetryFreshness`) |
| Threshold duplicated in Rental Health? | **No** — policy checks `freshness === 'offline'` only; thresholds live in `vehicle-state-interpreter.ts` (`TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS = 48h`) |

Desired architecture confirmed:

```
canonical freshness helper → offline → rental readiness blocker
```

---

## 5. Threshold boundary verification

### Implementation (`classifyTelemetryFreshness`)

- `< 15 min` → `live`
- `< 24h` → `standby`
- `< 48h` → `signal_delayed`
- `≥ 48h` → `offline`

Blocking gate: `freshness === 'offline'` only.

### Test evidence (`rental-health-telemetry-blocking.policy.spec.ts`)

| Case | Test | Result |
|------|------|--------|
| Live (5 min) | `does not block live telemetry` | pass |
| Standby (10h) | `does not block standby telemetry` | pass |
| Soft-offline (~47h59m) | `TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS - 60_000` | `signal_delayed`, no block |
| Exactly 48h | `blocks at exactly 48h` | `offline`, blocks |
| >48h (72h) | `blocks beyond 48h` | `offline`, blocks |
| Standby upper bound | `TELEMETRY_STANDBY_THRESHOLD_MS - 1` | `standby`, no block |

Integration (`rental-health.service.spec.ts`):

- 49h `lastSignal` → `not_ready` ✓
- 30h `lastSignal` → `ready` ✓

**Note:** Tests use 47h59m via `- 60_000ms`, not literal 47h59m59s — sufficient for boundary intent.

---

## 6. Unknown / never-seen telemetry behavior

| Case | Freshness | Rental block | rental_readiness (healthy modules) |
|------|-----------|--------------|-------------------------------------|
| Missing timestamp | `no_signal` | **No** | `ready` (test: `does not block missing telemetry timestamp`) |
| Malformed timestamp | `no_signal` | **No** | not blocked |
| Never connected | `no_signal` | **No** | preserved |

PR does **not** convert unknown cases to hard-offline NOT_READY.

**UNEVALUABLE** remains driven by module availability / `rental_blocked === null` — unchanged.

**Separate system:** `ConnectivityAlertService` opens `TELEMETRY_OFFLINE` notification for `no_signal` too (`shouldOpenTelemetryOfflineAlert`). That is pre-existing connectivity taxonomy, not rental readiness.

---

## 7. VEHICLE_NOT_READY pipeline

### Producer

`vehicle-readiness-notification.projector.ts` → `projectVehicleReadinessAggregate()` on `rental_readiness === 'not_ready'`.

Triggered by `VehicleHealthNotificationSyncService` during notification evaluation runs.

### Verified lifecycle (existing + new test in #1090)

| Transition | Behavior |
|------------|----------|
| READY → NOT_READY (telemetry reason) | Opens `VEHICLE_NOT_READY` ✓ (new test) |
| Repeated NOT_READY | Same notification id ✓ |
| NOT_READY → READY | Resolves ✓ |
| NOT_READY → READY → NOT_READY | Reopens same lifecycle identity ✓ |
| NOT_READY + TIRE_CRITICAL | Both coexist ✓ |

Fingerprint: `org|VEHICLE_NOT_READY|VEHICLE|veh|vehicle_not_ready|v1` — unchanged.

**Verdict:** Existing generic producer correctly handles telemetry-driven NOT_READY; no new producer required.

---

## 8. TELEMETRY_OFFLINE event relationship

| Aspect | Detail |
|--------|--------|
| Event exists | Yes — registry `TELEMETRY_OFFLINE`, `attentionScope=FLEET_READINESS` |
| Producer | `ConnectivityAlertService.syncRuntimeAlerts()` (DIMO connectivity path) |
| Opens when | `telemetryFreshness === 'offline'` **or** `'no_signal'` |
| OPERATIONS scope | No — FLEET_READINESS only |

After #1090 deploy, hard-offline vehicles may show **both**:

- `VEHICLE_NOT_READY` (aggregate from rental readiness)
- `TELEMETRY_OFFLINE` (connectivity cause)

Both are FLEET_READINESS. UI vehicle grouping should combine under same vehicle context — pre-existing pattern for aggregate + causes.

**Not a defect in #1090** — document for operator UX awareness.

---

## 9. station ACL verification

### Request flow

```
orgId (route param)
  → resolveAccessContext() [membership + station scope]
  → validateEntityFilters() / getCounts station check:
      assertEntityInOrg(orgId, 'station', stationId)
      isEntityInCallerScope(ctx, { kind: 'station', id: stationId })
  → resolveStationFilterMembership(orgId, stationId)
      vehicle.findMany({ organizationId: orgId, OR: [home|current|expected] })
      booking.findMany({ organizationId: orgId, OR: [pickup|return] })
  → buildAccessWhere() [role visibility + preferences + snooze + station scope OR org-wide]
  → buildNotificationWhereInput() [station OR filter AND attentionScope AND orgId]
```

### ACL verdict: **PASS**

- `organizationId` on every membership query ✓
- Cross-org station/vehicle access blocked by `assertEntityInOrg` ✓
- Worker station ACL via `isEntityInCallerScope` + existing `bypassStationScope` station scope filter ✓
- Cannot use `stationId` to widen beyond caller ACL ✓

---

## 10. Vehicle station-membership semantics

### PR #1090 notification filter

Includes vehicle if **any** of: `homeStationId`, `currentStationId`, `expectedStationId` = requested station.

### Comparison with existing code

| Surface | home | current | expected |
|---------|------|---------|----------|
| `NotificationStationScopeService.buildScopeContext` | ✓ | ✓ | ✓ |
| PR #1090 `resolveStationFilterMembership` | ✓ | ✓ | ✓ |
| `RentalHealthFleetService.buildVehicleSelectionWhere` | ✓ | ✓ | **✗** |
| `StationAccessService.buildVehicleStationScopeWhere` | ✓ | ✓ | **✗** |

### Verdict: **YELLOW — intentional for notifications, diverges from fleet summary**

Notification station filter aligns with **notification ACL** semantics (NotificationStationScopeService), not fleet summary vehicle selection.

**Risk:** Vehicle with only `expectedStationId = S1` could appear in station-filtered notifications but **not** in fleet summary vehicle set for S1.

Production pilot (5 vehicles at Zentrale) likely uses home/current — low immediate risk.

**Follow-up:** Document or align fleet summary `expectedStationId` if product intends parity.

---

## 11. Booking pickup/return semantics

PR includes booking if `pickupStationId` OR `returnStationId` matches.

Same pattern as `NotificationStationScopeService` (lines 56–64, 108–116) — **consistent with existing notification station scope**.

**Cross-station booking** (pickup=A, return=B): notification visible on **both** station dashboards if entity is booking-scoped or actionTarget references that booking. Pre-existing notification scope behavior; not introduced by #1090.

**Verdict:** Consistent with notification architecture; acceptable if booking notifications are station-relevant at both endpoints.

---

## 12. attentionScope AND/OR composition

`buildNotificationWhereInput` structure:

```typescript
{
  organizationId,
  eventType: { in: FLEET_READINESS types },  // top-level AND
  AND: [
    buildStationIdQueryFilter({ OR: [station, vehicle, booking clauses] })
  ]
}
```

Station filter is **ANDed** with `eventType` constraint — not OR-broadened.

Test: `combines FLEET_READINESS attentionScope with station vehicle membership` ✓

**Verdict: PASS**

---

## 13. List / count parity

| Endpoint | stationId membership | station filter in WHERE |
|----------|---------------------|-------------------------|
| `list()` | `resolveStationFilterMembership` | yes |
| `getCounts()` active | same | yes |
| `getCounts()` unread | derived from activeWhere | yes |
| `getCounts()` resolvedRecent | **no stationId** | attentionScope only |

**Active list vs active count:** Equivalent semantics ✓ — production empty-panel bug fixed for active queries.

**Minor gap:** `resolvedRecentWhere` omits dashboard `stationId` — resolved-recent metric may count org-wide when station selected. Dashboard primarily uses active list + fleet summary; classify as low-risk follow-up.

---

## 14. Cache / projection behavior

| Mechanism | Detail |
|-----------|--------|
| Projection version | `rh-projection-v3` stored on `VehicleHealth` payload |
| Redis cache key | `rental-health-summary:{org}:{vehicle}:v1` — **unchanged** |
| Cache TTL | 45 seconds |
| Projection version checked on cache read? | **No** |

Recomputation path:

1. Cache miss or TTL expiry → `getVehicleHealth()` runs full evaluator with new rule
2. Fresh health written to cache

**Misstatement in #1090 remediation doc:** "projection v3 invalidates stale cached projections" overstates — cache key version not bumped. **Mitigation:** 45s TTL bounds staleness; production audit found cache empty.

**Rental Health summary:** Updates on first fleet summary request after cache miss (≤45s worst case per vehicle).

**Notification VEHICLE_NOT_READY:** Requires notification evaluation run (`VehicleHealthNotificationSyncService`) — scheduled/debounced cadence, not instantaneous with deploy.

---

## 15. Test quality

| Layer | Present | Limitation |
|-------|---------|------------|
| Policy unit tests | ✓ | Direct policy function |
| Query util unit tests | ✓ | WHERE shape only |
| API service unit tests | ✓ | Mocked prisma/repository; recursive WHERE inspection |
| RentalHealth integration | ✓ | Mocked modules; real `getVehicleHealth()` path |
| Fleet summary aggregation | Partial | Mocks `getFleetRowsBatch` — tests counter math only |
| DB integration / E2E | ✗ | Residual risk for Prisma JSON path edge cases |
| Notification producer | ✓ | In-memory adapter tests |

**Confidence:** High for rule correctness and WHERE semantics; medium for production SQL under real notification rows.

---

## 16. Independent validation results (re-audit run)

**Audited at:** PR #1090 HEAD `94027ad2`

### Backend tests (9 suites)

```
Test Suites: 9 passed, 9 total
Tests:       136 passed, 136 total
```

Suites: `notification-query.util.spec`, `notification-api.service.spec`, `rental-health-telemetry-blocking.policy.spec`, `rental-health.service.spec`, `rental-health-fleet.service.spec`, `vehicle-readiness-notification.spec`, related.

### Frontend regression (3 files)

```
Test Files: 3 passed (3)
Tests:      11 passed (11)
```

### Builds

| Command | Result |
|---------|--------|
| `backend npm run build` | pass |
| `frontend npx tsc -b` | pass |
| `frontend npm run build` | pass |

---

## 17. CI failure classification (HEAD `94027ad2`)

### Vehicle Detail workflow (`32427602234`) — **failure**

| Job | Result | Root cause |
|-----|--------|------------|
| Typecheck | **fail** | Pre-existing: `billing.controller.security.characterization.spec.ts`, `vehicles-security-negative.spec.ts`, `vehicles.controller.status-patch.spec.ts` |
| Backend unit tests | **fail** | Pre-existing: `vehicles.controller.status-patch.spec.ts` suite failed to run (TS2345) |
| All other jobs | pass | — |

**#1090 files in failures:** None.

### Legal Documents workflow (`32427602235`) — **failure**

| Job | Result |
|-----|--------|
| Typecheck | **fail** (same pre-existing TS errors) |
| All other jobs including Backend unit tests | pass |

**Conclusion:** CI failures are **pre-existing baseline debt**. No new regression attributable to #1090 diff.

---

## 18. Expected production convergence sequence

Pilot: 5 vehicles, 2 hard-offline ≥48h, Zentrale station.

| Step | When | Expected outcome |
|------|------|------------------|
| A. Deploy backend | T+0 | New evaluator active |
| B. Fleet summary recompute | T+0 to ~45s per vehicle (cache TTL) | **3 ready / 2 notReady / 60%** |
| C. stationId notification list | Immediate on next API call | Vehicle FLEET_READINESS notifications visible for station members |
| D. VEHICLE_NOT_READY materialization | Next notification evaluation run (scheduled/debounced — not instant) | 2 aggregate notifications for hard-offline vehicles |
| E. TELEMETRY_OFFLINE (connectivity) | Connectivity sync path (may already exist) | May coexist with aggregate |
| F. Dashboard | After B+C (+ D for notification rows) | Panel non-empty; header shows 3/5 not 5/5 |

**Do not promise** instantaneous notification generation at deploy second.

---

## 19. Hard-offline cause representation

- Stored in `blocking_reasons[]` as string: `'Telemetrie: Kein Signal innerhalb der letzten 48 Stunden'`
- Appended via spread — **does not overwrite** other blockers ✓
- **Flag:** Localized display string used as semantic token (pre-existing pattern across rental health). Not a structured enum key. Acceptable for auditability but fragile for i18n/refactor.

---

## 20. Remaining risks

1. **expectedStationId mismatch** with fleet summary vehicle selection
2. **Cache/projection versioning** documentation overstated; 45s TTL mitigates
3. **No DB integration test** for station filter SQL
4. **resolvedRecent** counts ignore stationId
5. **Dual notifications** (VEHICLE_NOT_READY + TELEMETRY_OFFLINE) for same vehicle
6. **Fleet summary test** does not prove telemetry → readiness E2E

No HIGH/BLOCKER findings.

---

## 21. Merge recommendation

**Approve #1090 for merge** with YELLOW classification.

Both critical acceptance criteria from PR #1089 remediation are met in code:

1. ✓ stationId-filtered Fleet Readiness notifications for vehicle entities
2. ✓ telemetry hard-offline ≥48h canonically NOT_READY

Follow-ups (non-blocking):

- Align or document `expectedStationId` between notifications and fleet summary
- Consider bumping `RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION` on rule changes
- Add optional DB integration test for station-filtered notification query
- Apply `stationId` to `resolvedRecentWhere` if product uses that metric with station filter

---

**Re-audit artifact only. PR #1090 unchanged.**
