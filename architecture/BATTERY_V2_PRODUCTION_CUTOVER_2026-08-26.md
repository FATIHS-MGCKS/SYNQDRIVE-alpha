# Battery V2 Production Cutover — 2026-08-26

## Verdict (code release)

**LIVE_VOLTAGE FIXED IN CODE — adversarial gate patch applied (PR #1331)**

Stage 1 cutover + canonical `LIVE_VOLTAGE` ingestion are implemented in code. Canonical `lastStored` for LIVE_VOLTAGE policy comparison uses **BatteryMeasurement only** — legacy `battery_health_snapshots` cannot suppress the first canonical bootstrap.

Production validation has **not** occurred. Stage 1 production `backend.env` must keep `BATTERY_V2_PUBLICATION_ENABLED=false` and `BATTERY_V2_READINESS_ENABLED=false` until post-deploy evidence is proven (30–60 min minimum).

---

## LIVE_VOLTAGE root cause & fix (2026-08-26)

### Root cause

1. **No production writer** — `BatteryMeasurementType.LIVE_VOLTAGE` was specified in domain docs but never persisted from `BATTERY_OBSERVATION_CLASSIFY`. Legacy path wrote `battery_health_snapshots` only.
2. **Capability QUERY_ERROR** — `fetchBatteryCapabilityPreflightSnapshot` used a separate GraphQL query (with `source` field + `availableSignals`) that failed in production while the standard `LatestVehicleSnapshot` poll path worked.

### Signal source (single normalized path)

```
DIMO signalsLatest.lowVoltageBatteryCurrentVoltage
  → mapDimoBatterySignals / toVlsBatteryFields
  → VehicleLatestState.lvBatteryVoltage
  → BatteryV2SnapshotObservationProducer.classify (evaluateBatteryProviderObservation)
  → BATTERY_OBSERVATION_CLASSIFY snapshotContext.lvBatteryVoltage
  → LvLiveVoltageIngestionService → battery_measurements LIVE_VOLTAGE
```

No synchronous DIMO API in REST target evaluation — evaluation reads persisted `LIVE_VOLTAGE` rows only.

### Sampling / idempotency policy

- Reuses `evaluateBatteryProviderObservation` — **NEW_OBSERVATION only** (~0.6–6% of polls per domain audit).
- Idempotency key: `buildBatteryProviderObservationIdempotencyKey` (org, vehicle, signal, provider, observedAt, value).
- Last-stored comparison: **canonical `battery_measurements` LIVE_VOLTAGE only** (org + vehicle scoped). Legacy `battery_health_snapshots` are **not** used for policy comparison — they cannot block the first canonical LIVE_VOLTAGE write on legacy-heavy fleets.
- Idempotency remains DB-backed: `@@unique([organizationId, vehicleId, idempotencyKey])` + P2002 handling via `createIdempotent()`.
- REST_60M and REST_6H evaluation consume persisted canonical LIVE_VOLTAGE via `listLvVoltageCandidates()`.
- Out-of-order / duplicate / stale replay → no write (against canonical store only).
- Missing or implausible voltage (outside 9.0–16.0 V) → no fabrication.

### Capability behavior after fix

- Preflight query: removed unsupported `source` GraphQL field.
- On preflight failure: fallback to `fetchAvailableSignals` + `fetchLatestVehicleSnapshot` (same path as snapshot processor).
- Real provider errors still → `QUERY_ERROR`; absent signal → `NOT_LISTED`; null → `AVAILABLE_BUT_NULL`.

### Files

- `lv-live-voltage/lv-live-voltage-ingestion.service.ts` — canonical writer
- `battery-v2-snapshot-ingestion.service.ts` — wired before REST FSM bridge
- `battery-capability-preflight.service.ts` — snapshot fallback
- `battery-capability-preflight.query.ts` — query shape fix

---

## Staged production procedure (after merge)

### A — Stage 1 (deploy first)

```env
BATTERY_V2_REST_SHADOW_ENABLED=true
BATTERY_V2_PUBLICATION_ENABLED=false
BATTERY_V2_READINESS_ENABLED=false
BATTERY_V2_RECONCILIATION_ENABLED=true
```

Validate 30–60 min:

- `battery_measurements` type `LIVE_VOLTAGE` count increasing
- `vehicle_battery_capabilities` LIVE_VOLTAGE ≠ `QUERY_ERROR` when signal present
- REST target jobs produce REST_60M/6H (not all MISSED)
- Canonical sessions > 0; queue healthy

### B — Stage 2 (only after LIVE_VOLTAGE evidence proven)

```env
BATTERY_V2_PUBLICATION_ENABLED=true
```

Validate: publications STABLE/PROVISIONAL with evidence; `isBatteryV2LegacyRestCaptureEnabled()` auto-false; no dual rest authority.

### C — Stage 3

```env
BATTERY_V2_READINESS_ENABLED=true
```

Validate: rental readiness consumes canonical publishable results only.

---

## 1. Feature flag inventory

| Flag / gate | Default | Prod (pre-cutover audit) | Code paths | Writes | Queues | User-visible |
|-------------|---------|--------------------------|------------|--------|--------|--------------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | `false` | `true` | Canonical REST FSM bridge, `processEvent`, REST target schedule/enqueue, reconciliation LV sessions | `battery_measurement_sessions` (SHADOW or VALID) | `BATTERY_REST_TARGET_EVALUATE` | No (blocked when publication off) |
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` | `false` | `BatteryPublicationService`, `evaluateLvPublicationPolicy` | `battery_publications` | `BATTERY_PUBLICATION_UPDATE` | Yes — LV health % when STABLE |
| `BATTERY_V2_READINESS_ENABLED` | `false` | `false` | `battery-readiness.policy`, `RentalHealthService` | None direct | None | Yes — rental block/hint |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` | assumed `true` | `BatteryV2ReconciliationScheduler` | Re-enqueue classify, bridge legacy rest targets | classify, rest-target, assessment | No |
| `BATTERY_V2_DLQ_REPLAY_ENABLED` | `false` | unknown | Reconciliation tick DLQ clear | dead letter rows | replay classify | No |
| `BATTERY_V2_START_PROXY_ENABLED` | `false` | `false` | Start proxy extract job | measurements | `BATTERY_START_PROXY_EXTRACT` | Diagnostic only |
| `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED` | `false` | `false` | Legacy crank scoring | `battery_features` | None | Legacy SOH path |
| `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED` | `false` | `false` | HV legacy pairwise | HV snapshots | None | No |
| `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` | `false` | varies | HV recharge reconcile | `hv_charge_sessions` | `HV_RECHARGE_SESSION_RECONCILE` | No |
| `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` | `false` | varies | Fallback charge detector | sessions | classify side path | No |
| `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | `false` | varies | HV M2 shadow | shadow observations | `HV_CAPACITY_SHADOW_RECOMPUTE` | No |
| `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | `false` | `false` | HV SOH publication gate | publications | None | HV SOH UI |
| `BATTERY_V2_RETENTION_ENABLED` | `false` | varies | Retention scheduler | deletes aged rows | None | No |
| `isLvRestShadowModeActive()` | derived | `true` when REST on + PUB off | Measurement provenance `shadowMode`, evidenceEligible=false | SHADOW quality | — | Blocks publication side effects |
| `isBatteryV2LegacyRestCaptureEnabled()` | derived | `true` in Stage 1 | `onSnapshot`, ingestion legacy branch | `battery_features` | `BATTERY_ASSESSMENT_RECOMPUTE` | Legacy health APIs |

---

## 2. Canonical production target

```
DIMO snapshot → classify (provider observation policy)
  → LvLiveVoltageIngestionService → battery_measurements LIVE_VOLTAGE
  → LvRestWindowIngestionBridge (fail-open)
  → LvRestWindowStateMachineService (sessions)
  → REST target jobs → REST_60M/6H measurements (reads LIVE_VOLTAGE DB)
  → BATTERY_ASSESSMENT_RECOMPUTE (canonical LV_HEALTH)
  → BATTERY_PUBLICATION_UPDATE (when PUBLICATION_ENABLED)
  → LvCanonicalBatteryResolver → Vehicle Health / UI
  → Readiness (when READINESS_ENABLED)
```

---

## 3. Legacy authority

| Component | Status | Cutover action |
|-----------|--------|----------------|
| `BatteryV2Service.onSnapshot` | Fallback rest capture (direct LV from snapshot) | **KEEP TEMPORARILY** until LIVE_VOLTAGE + publication; auto-disabled when pipeline+publication on |
| `battery_features` rest fields | Legacy authority for rest voltage | **DEPRECATE** after Stage 2 |
| Legacy assessment enqueue | From legacy capture | **DISABLE** with legacy capture gate |
| Legacy reconciliation bridge | `battery_features` → sessions | **KEEP** until canonical sessions stable |
| Legacy publication (`battery_features` SOH) | Separate from V2 publication | **Compatibility** — gated by legacy safety policy |

---

## 4. LIVE_VOLTAGE dependency

Canonical REST target evaluation reads **`battery_measurements` type `LIVE_VOLTAGE`** — not live DIMO API.

**Code fix (this PR):** `LvLiveVoltageIngestionService` persists from classified snapshot observations.

**Production validation still required** before Stage 2/3: confirm LIVE_VOLTAGE rows accumulate and REST targets are not all MISSED.

**Decision:** Do not enable `BATTERY_V2_PUBLICATION_ENABLED` or `BATTERY_V2_READINESS_ENABLED` until post-deploy LIVE_VOLTAGE evidence is proven.

Stage 1 production env:

```env
BATTERY_V2_REST_SHADOW_ENABLED=true
BATTERY_V2_PUBLICATION_ENABLED=false
BATTERY_V2_READINESS_ENABLED=false
BATTERY_V2_RECONCILIATION_ENABLED=true
```

---

## 5. Staged cutover sequence

| Step | Action | Validation | Rollback |
|------|--------|------------|----------|
| 1 | Merge fail-open + cutover semantics | Unit tests | Revert deploy |
| 2 | Deploy with Stage 1 flags | Sessions > 0, queue healthy | Set REST_SHADOW=false |
| 3 | Monitor 30–60 min | No bridge block of legacy; malformed jobs flat | — |
| 4 | Fix LIVE_VOLTAGE ingestion | LIVE_VOLTAGE count > 0 | — |
| 5 | Enable PUBLICATION=true | Publications STABLE/PROVISIONAL only with evidence | PUBLICATION=false |
| 6 | Enable READINESS=true | Rental blocks match policy | READINESS=false |
| 7 | Legacy capture auto-off (code) when step 5 active | No `battery_features` rest writes | PUBLICATION=false |

---

## 6. Code changes (this release)

- Fail-open canonical bridge in `ingestObservationClassify`
- `LvLiveVoltageIngestionService` — canonical LIVE_VOLTAGE persistence from snapshot classify
- Capability preflight snapshot fallback + query shape fix
- `isLvRestShadowModeActive()` = pipeline on AND publication off
- `isBatteryV2LegacyRestCaptureEnabled()` gates legacy `onSnapshot`
- Session quality VALID when not in shadow measurement mode
- Config aliases and env documentation

---

## 7. Rollback

```env
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=false
BATTERY_V2_READINESS_ENABLED=false
```

Redeploy previous release if needed. No DB cleanup required.

---

## 8. Remaining shadow behavior

Until `BATTERY_V2_PUBLICATION_ENABLED=true`:

- Measurements: `SHADOW` quality, `shadowMode` context
- Evidence/publication provenance flags false
- Legacy rest capture remains active (dual path)

---

## 9. Tests

```bash
npm test -- --testPathPattern="lv-live-voltage|battery-v2-cutover|battery-v2-snapshot-ingestion|battery-capability-preflight"
```

Regression coverage (adversarial gate):

- Legacy `battery_health_snapshots` with matching ts/voltage does **not** suppress first canonical LIVE_VOLTAGE write.
- Replay of same provider observation remains idempotent (canonical lastStored only).
- REST_60M and REST_6H chain tests exercise `listLvVoltageCandidates()` → `evaluateAndPersist()`.
- DB idempotency: `battery-measurement.repository.spec.ts` (P2002 + unique constraints); ingestion uses `measurements.create()` → `createIdempotent()`.

---

## 10. Stage 1 production validation expectations (not yet performed)

After merge + deploy with Stage 1 flags, validate 30–60 min:

- `battery_measurements` type `LIVE_VOLTAGE` count increasing on active DIMO vehicles.
- First canonical LIVE_VOLTAGE row appears even when legacy `battery_health_snapshots` already hold matching voltage/timestamp.
- REST target jobs produce REST_60M/6H measurements (not all MISSED).
- `vehicle_battery_capabilities` LIVE_VOLTAGE ≠ `QUERY_ERROR` when signal present.
- Canonical LV_REST_WINDOW sessions > 0; queue healthy.
- Do **not** enable `BATTERY_V2_PUBLICATION_ENABLED` or `BATTERY_V2_READINESS_ENABLED` until above evidence is proven.
