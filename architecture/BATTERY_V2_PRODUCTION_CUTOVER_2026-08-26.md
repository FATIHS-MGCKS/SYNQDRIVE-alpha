# Battery V2 Production Cutover — 2026-08-26

## Verdict (code release)

**BATTERY V2 CANONICAL PROCESSING LIVE — PUBLICATION BLOCKED ON LIVE_VOLTAGE**

Stage 1 is implemented in code. Production `backend.env` must keep `BATTERY_V2_PUBLICATION_ENABLED=false` and `BATTERY_V2_READINESS_ENABLED=false` until LIVE_VOLTAGE canonical ingestion is fixed.

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
DIMO snapshot → BATTERY_OBSERVATION_CLASSIFY
  → LvRestWindowIngestionBridge (fail-open)
  → LvRestWindowStateMachineService (sessions)
  → REST target jobs → REST_60M/6H measurements (needs LIVE_VOLTAGE DB)
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

Production audit: **0 LIVE_VOLTAGE measurements**, capability `QUERY_ERROR`.

**Decision:** Do not enable `BATTERY_V2_PUBLICATION_ENABLED` or `BATTERY_V2_READINESS_ENABLED` until LIVE_VOLTAGE ingestion is fixed (Phase 2).

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
- `isLvRestShadowModeActive()` = pipeline on AND publication off
- `isBatteryV2LegacyRestCaptureEnabled()` gates legacy `onSnapshot`
- Session quality VALID when not in shadow measurement mode
- `resolveLvRestShadowPublicationEligible()` respects publication flag
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
npm test -- --testPathPattern="battery-v2-cutover|lv-rest-shadow|battery-v2-snapshot-ingestion|battery-v2.service"
```
