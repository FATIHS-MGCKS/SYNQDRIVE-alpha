# Fleet Readiness Hard-Offline & Station Filter Remediation

**Remediation date (UTC):** 2026-08-21  
**Follows audit:** `docs/audits/fleet-readiness-production-data-lineage-2026-08-21.md` (PR #1089, merged)  
**Scope:** Focused backend remediation — no dashboard redesign, no unrelated health rule changes  
**Pilot context:** F.S Mobility org `faa710c9…`, Zentrale station, 5 vehicles (2 hard-offline ≥48h)

---

## 1. Production issue summary

PR #1089 established two concrete production defects:

| # | Issue | Symptom | Impact |
|---|-------|---------|--------|
| A | Notification V2 `stationId` filter | Fleet Readiness panel empty with station selected | 9 OPEN vehicle-scoped notifications excluded by SQL |
| B | Canonical `rental_readiness` telemetry gap | Fleet summary 5/5 READY vs top KPI "Nicht bereit 2" | Hard-offline ≥48h not a canonical blocker |

**Product decision (final):**

- `live` / `standby` → no readiness penalty
- `soft-offline` (24–48h, `signal_delayed`) → warning only, NOT hard block
- `hard-offline` (≥48h, `offline`) → **MUST be canonical NOT_READY**
- Do not reclassify hard-offline as UNKNOWN or UNEVALUABLE

---

## 2. stationId root cause

### Broken query path (pre-fix)

`buildNotificationWhereInput` applied dashboard `stationId` via:

```typescript
entityOrActionTargetFilter('stationId', filters.stationId, filters.entityType)
```

This only matched:

- `entityType = STATION` + `entityId = stationId`
- `actionTarget.stationId = stationId`

Vehicle-entity notifications (`entityType = VEHICLE`, `entityId = vehicleId`) were **never included**, even when the vehicle belonged to the requested station.

### Production evidence

Pilot org with Zentrale station filter:

- DB: 9 OPEN FLEET_READINESS notifications (vehicle-entity)
- API: 0 rows returned with `stationId` + `attentionScope=FLEET_READINESS`

---

## 3. Exact query fix

### API layer — resolve station membership

`NotificationApiService.resolveStationFilterMembership(orgId, stationId)` queries:

- Vehicles where `homeStationId | currentStationId | expectedStationId = stationId`
- Bookings where `pickupStationId | returnStationId = stationId`

Returns `{ vehicleIds, bookingIds }` passed into filter builder.

### Query builder — `buildStationIdQueryFilter`

New exported helper in `notification-query.util.ts`:

```typescript
OR: [
  { entityType: STATION, entityId: stationId },
  { actionTarget.stationId = stationId },
  { entityType: VEHICLE, entityId: { in: vehicleIds } },  // NEW
  { actionTarget.vehicleId = vehicleId } for each vehicle,  // NEW
  { entityType: BOOKING, entityId: { in: bookingIds } },  // NEW
  ...
]
```

Applied in both `list()` and `getCounts()` when `query.stationId` is set.

### stationId semantics (documented)

| Case | Result |
|------|--------|
| A. Vehicle notification, `vehicle.stationId == requested station` | **Include** |
| B. Vehicle notification, vehicle at different station | **Exclude** |
| C. Vehicle notification, different org | **Exclude** (org isolation) |
| D. Org-level notification without station ownership | **Preserve** — org-wide scope OR clause unchanged |
| E. Notification with direct `actionTarget.stationId` | **Include** (preserved) |
| F. No `stationId` request | **Unchanged** org-wide behavior |

Authorization remains backend-authoritative; no frontend-only filtering.

---

## 4. Hard-offline policy decision

Canonical rental readiness now treats telemetry `offline` (≥48h per `classifyTelemetryFreshness`) as a **hard rental blocker**.

This aligns canonical Fleet Readiness with the operative dashboard KPI for the specific hard-offline contradiction identified in production.

---

## 5. Readiness evaluator change

### New policy module

`rental-health-telemetry-blocking.policy.ts`:

- Reuses `resolveTelemetryFreshness()` from `@modules/vehicles/telemetry-freshness.resolver`
- Blocks only when `freshness === 'offline'` (≥48h)
- Does NOT block: `live`, `standby`, `signal_delayed`, `no_signal`

### Integration in `RentalHealthService`

- Projection version bumped: `rh-projection-v3`
- Vehicle query extended: `dimoVehicle.lastSignal`
- Vehicle latest state: `updatedAt` for fallback timestamp evidence
- `evaluateTelemetryRentalBlocking()` appends to `blocking_reasons` before `deriveRentalReadiness()`

### Readiness derivation (unchanged helper)

```typescript
deriveRentalReadiness(availability, rentalBlocked):
  if availability !== 'ready' || rentalBlocked === null → 'unevaluable'
  return rentalBlocked ? 'not_ready' : 'ready'
```

Telemetry block → `rental_blocked = true` → `not_ready`.

---

## 6. Threshold semantics

Uses canonical thresholds from `vehicle-state-interpreter.ts` / `telemetry-freshness.resolver`:

| Telemetry age | Freshness | Rental block |
|---------------|-----------|--------------|
| ≤15 min | `live` | No |
| 15 min – 24h | `standby` | No |
| 24h – 48h | `signal_delayed` (soft-offline) | No |
| ≥48h | `offline` (hard-offline) | **Yes → NOT_READY** |
| No timestamp / never seen | `no_signal` | No auto-block (UNEVALUABLE path preserved) |

### Boundary tests (fixed clock)

| Age | Block? |
|-----|--------|
| 47h 59m | No |
| 48h exactly | **Yes** |
| >48h | **Yes** |

---

## 7. Notification V2 behavior

### VEHICLE_NOT_READY producer

`vehicle-readiness-notification.projector.ts` emits on `rental_readiness === 'not_ready'`.

No producer changes required — new telemetry blocking reason automatically enters the existing NOT_READY pipeline.

### Blocking reason vocabulary

`'Telemetrie: Kein Signal innerhalb der letzten 48 Stunden'`

Aligns with TELEMETRY_OFFLINE notification taxonomy.

### attentionScope routing

Hard-offline NOT_READY → `VEHICLE_NOT_READY` event → `attentionScope=FLEET_READINESS`.

With station filter fixed, vehicle notifications for station-member vehicles are returned.

---

## 8. Fleet Summary expected impact

For 5 vehicles where 2 are ≥48h hard-offline and 3 otherwise ready (no other blockers):

| Field | Before | After |
|-------|--------|-------|
| total | 5 | 5 |
| ready | 5 | **3** |
| notReady | 0 | **2** |
| unevaluable | 0 | 0 |
| unknown | 0 | 0 |
| readyPercent | 100 | **60** |

Aggregation unchanged — evaluator output drives summary naturally.

---

## 9. Tests added

### Notification station filter

- `notification-query.util.spec.ts` — unit tests for `buildStationIdQueryFilter`
- `notification-api.service.spec.ts` — service-level membership + counts endpoint

### Rental readiness / telemetry

- `rental-health-telemetry-blocking.policy.spec.ts` — boundary + soft-offline + no_signal
- `rental-health.service.spec.ts` — integration (hard-offline, soft-offline, no_signal)
- `rental-health-fleet.service.spec.ts` — 5-vehicle production scenario (60% ready)
- `vehicle-readiness-notification.spec.ts` — VEHICLE_NOT_READY on telemetry block

### Frontend P3 regression (unchanged, re-run)

- `useNotifications.attention-scope.test.ts`
- `useFleetReadinessSummary.request-race.test.ts`
- `dashboard-attention-routing.test.ts`

---

## 10. Recomputation / deploy plan

### No schema migration

Reuses existing telemetry freshness contract and blocking_reasons string array.

### Recomputation mechanism

Rental health is computed on-demand in `RentalHealthService.getVehicleHealth()`:

- Redis cache key: `rental-health-summary:{org}:{vehicle}:v1`
- Cache invalidates on health writes / projection version change
- Projection version bumped to `rh-projection-v3` — stale cached projections miss version match

### Post-deploy steps

1. Deploy backend release (no frontend changes required for core fix)
2. **Automatic:** Next `GET /rental-health/...` or fleet summary request recomputes with v3 projection
3. **Automatic:** Notification evaluator (~30 min BullMQ cadence) picks up new NOT_READY states → VEHICLE_NOT_READY events
4. **Optional:** If Redis holds stale v2 entries, they expire naturally or miss version — no ad-hoc SQL required

### One-time recompute (if faster convergence needed)

Existing paths (no new job invented):

```bash
# Per-org fleet summary refresh (authenticated)
GET /api/v1/organizations/:orgId/rental-health/fleet/summary?stationId=...

# Notification evaluation (existing worker)
# bull:notification.evaluation:{orgId}:scheduled
```

---

## 11. Remaining semantic differences

After this remediation, hard-offline contradiction is resolved. Other intentional differences may remain:

| Surface | Concept | Notes |
|---------|---------|-------|
| Top KPI "Verfügbar" | Operational availability slice | Includes ready + not-ready sub-counts |
| Fleet summary | Canonical `rental_readiness` | Now includes telemetry hard-offline block |
| Top KPI "Nicht bereit" | Client `deriveIsReadyForRenting()` | Should converge for hard-offline; may still differ for other operative rules |
| Warning notifications (TIRE_CRITICAL, etc.) | Non-blocking for rental | Unchanged — intentionally non-hard-blocking |

Soft-offline (24–48h) may still appear as warnings/attention without forcing NOT_READY.

---

## 12. Production acceptance checklist

- [ ] Deploy backend with this remediation
- [ ] Pilot org Zentrale: Fleet summary shows ~3/5 ready (60%) assuming 2 hard-offline vehicles unchanged
- [ ] Fleet Readiness panel with station filter: vehicle notifications visible (not empty)
- [ ] VEHICLE_NOT_READY notifications appear for hard-offline vehicles within one evaluator cycle
- [ ] Soft-offline vehicles (24–48h) remain READY unless other blockers exist
- [ ] No cross-org notification leakage with station filter
- [ ] Top KPI "Nicht bereit" aligns with canonical NOT_READY for hard-offline vehicles

---

## Changed files

| File | Change |
|------|--------|
| `notification-query.util.ts` | `buildStationIdQueryFilter`, membership-aware station filter |
| `notification-api.service.ts` | `resolveStationFilterMembership`, wire into list/counts |
| `notification-api.dto.ts` | `stationId` on counts DTO |
| `rental-health-telemetry-blocking.policy.ts` | **NEW** — canonical ≥48h block |
| `rental-health.service.ts` | Integrate telemetry blocking, projection v3 |
| `*.spec.ts` | Regression tests (see §9) |

**No production data, config, or flags modified in this PR.**
