# Vehicle Connectivity / Offline / Health / Availability — Deep Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-connectivity-operational-state-audit-2026-08` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `cursor/vehicle-connectivity-audit-90ec` |
| **Date** | 2026-08-24 UTC |
| **Mode** | **Investigation only — no code, schema, or production mutations** |
| **Production access** | Read-only SQL on VPS (`srv1374778.hstgr.cloud`) via `sudo -u postgres psql` |
| **Prior related audits** | `docs/audits/fleet-connectivity-production-readiness-2026-07.md`, `docs/audits/vehicle-operational-state-v2-final-audit.md` |

---

## A. Executive Summary

SynqDrive’s production symptoms — **offline vehicles showing `Verfügbar`**, **stale/offline vehicles showing `Gut`/`Warnung`**, and **contradictory Connectivity card labels** — are **not random UI bugs**. They arise from **multiple intentionally separate state domains** that are **not composed into one operator-facing operational truth**.

**Severity: P0 (operator trust / rental safety semantics)**

The system currently maintains at least **five parallel authorities**:

1. **Configured operational status** (booking/DB-derived `AVAILABLE` → UI `Verfügbar`)
2. **Telemetry freshness** (canonical 5-state, 15m / 24h / 48h thresholds)
3. **Dashboard rental readiness** (runtime gate; offline blocks readiness)
4. **Rental Health aggregate** (module evaluators; `overall_state` ignores connectivity staleness)
5. **Connectivity runtime v2** (6-dimension builder; computed at read time; not yet universal API/UI SSOT)

### Confirmed production evidence (redacted)

Read-only query on 2026-08-24 UTC against production PostgreSQL (`synqdrive`):

| Case | `vid` prefix | DB status | Legacy health | Days since signal | HW | DIMO conn | OBD snapshot | Open episodes | Last event |
|------|--------------|-----------|---------------|-------------------|-----|-----------|--------------|---------------|------------|
| **B — long offline** | `c43c3b45` | AVAILABLE | GOOD | **37.3** | LTE_R1 | CONNECTED | **0 (unplugged)** | 0 | OBD_DEVICE_UNPLUGGED |
| **B — long offline** | `19fedd4b` | AVAILABLE | GOOD | **32.3** | LTE_R1 | CONNECTED | 1 (plugged) | 0 | OBD_DEVICE_UNPLUGGED |
| **A — recent offline** | `68868291` | AVAILABLE | GOOD | **2.3** | LTE_R1 | CONNECTED | null | 0 | — |
| **Online** | `8c850ff1` | AVAILABLE | GOOD | 0.0 | LTE_R1 | CONNECTED | 1 | 0 | OBD_DEVICE_UNPLUGGED (Jul 20) |

Additional production facts:

- `device_connection_episodes`: **0 rows** (table exists, empty)
- `dimo_device_connection_events`: **3 rows** (unplug events persisted; episodes never opened)
- DIMO `connection_status` remains **CONNECTED** for long-offline vehicles (provider link ≠ telemetry freshness)

### Top P0 root causes

| ID | Root cause | Layer |
|----|------------|-------|
| RC-01 | **Operational availability badge is booking-derived and explicitly telemetry-agnostic** | Product semantics + `fleetVehicleDisplay.ts` |
| RC-02 | **Readiness uses telemetry-offline gate; availability badge does not** | Parallel frontend derivations |
| RC-03 | **`computeOverallState` ignores `data_stale`; modules can stay `good` with 30+ day old measurements** | `rental-health.types.ts` |
| RC-04 | **Frontend health display falls back to legacy `vehicle.healthStatus` (DB GOOD)** | `fleetVehicleDisplay.ts`, `Vehicle.healthStatus` |
| RC-05 | **Connectivity card mislabels device-connection status as “Status (Webhook)”** | `VehicleDeviceConnectionCard.tsx` |
| RC-06 | **“Keine offene Unterbrechung” is rendered for `!openUnpluggedEpisode` without epistemic distinction (KNOWN_NONE vs UNKNOWN)** | `device-connection-ui.ts` + card |
| RC-07 | **OBD unplugged badge uses snapshot `obdIsPluggedIn===false`; orthogonal to webhook episode state** | `obd-plug-status.ts` vs `device-connection-read-model.ts` |
| RC-08 | **Production episode table empty despite webhook events — interruption lifecycle not materialized** | DB / episode service deployment gap |

---

## B. Current Architecture

### B.1 Layered truth model (as implemented)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Provider (DIMO LTE_R1)                                                   │
│  • Snapshot polling (~30s) → VehicleLatestState                          │
│  • Webhook POST /api/v1/webhooks/dimo → inbox → BullMQ → events/episodes │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 VehicleLatestState      DimoVehicle            DeviceConnection*
 last_seen_at            connection_status       events / episodes
 source_timestamp        last_signal             trigger registry cache
 raw_payload_json        (provider link)         (webhook config)
        │                       │                       │
        ▼                       ▼                       ▼
 telemetry-freshness     Provider link dim       Physical device dim
 (5-state, 48h offline)  (CONNECTED/DISCONNECTED) (OBD episodes)
        │                       │                       │
        └───────────┬───────────┴───────────┬─────────┘
                    ▼                       ▼
      VehicleConnectivityRuntimeStateBuilder (computed, not persisted)
                    │
     ┌──────────────┼──────────────┬─────────────────┐
     ▼              ▼              ▼                 ▼
 Fleet map      Fleet connectivity  Device-connection  Alerts/notifications
 API            API                 API
     │              │                  │
     ▼              ▼                  ▼
 Frontend telemetryFreshness.ts   VehicleDeviceConnectionCard
 vehicleRuntimeStateBuilder       ObdUnpluggedBadge (snapshot)
 fleetVehicleDisplay (operational badge — separate)
 RentalHealthService (health — separate)
```

### B.2 Canonical backend modules

| Concern | Canonical file(s) | Persisted? |
|---------|-------------------|------------|
| Telemetry 5-state thresholds | `backend/src/modules/vehicles/vehicle-state-interpreter.ts` | Computed from `VehicleLatestState.lastSeenAt` |
| Timestamp priority | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` | Evidence persisted; freshness computed |
| Fleet map interpretation | `backend/src/modules/vehicles/vehicles.service.ts` → `interpretVehicleState` | Computed |
| Connectivity runtime v2 | `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` | **Not persisted** (comment: “no persistence table yet”) |
| Operational/booking status | `vehicles.service.ts` → `deriveFleetStatusContext` | DB `Vehicle.status` + booking overlay |
| Rental health | `backend/src/modules/rental-health/rental-health.service.ts` | Computed per request; summary cache optional |
| Device connection summary | `backend/src/modules/dimo/device-connection-read-model.ts` | Events persisted; summary computed |
| Webhook intake | `dimo-webhook.controller.ts` → inbox → `device-connection-webhook-processing.service.ts` | Inbox + events |

### B.3 Canonical frontend modules

| Concern | Canonical file(s) |
|---------|-------------------|
| Telemetry freshness (UI SSOT) | `frontend/src/rental/lib/telemetryFreshness.ts` |
| Dashboard runtime / readiness | `frontend/src/rental/components/dashboard/runtime/vehicleRuntimeStateBuilder.ts`, `rentalReadiness.ts` |
| Operational status badge (`Verfügbar`) | `frontend/src/rental/lib/vehicle-operational-state/selectors.ts` → `fleetVehicleDisplay.ts` |
| Fleet visual / offline for rental chip | `frontend/src/rental/lib/fleetVisualState.ts` |
| Health severity display | `frontend/src/rental/components/vehicle-detail/vehicle-health-display.mapper.ts` |
| OBD unplugged badge | `frontend/src/rental/lib/obd-plug-status.ts` |
| Connectivity card | `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx` |

---

## C. End-to-End Data Lineage

### C.1 Telemetry freshness → Offline / Standby / Soft-offline

| Stage | Location | Input | Output | Timestamp |
|-------|----------|-------|--------|-----------|
| Ingest | `dimo-snapshot.processor.ts` | DIMO snapshot payload | Upsert `VehicleLatestState` | `lastSeenAt`, `sourceTimestamp`, `providerFetchedAt` |
| Resolve | `telemetry-freshness.resolver.ts:resolveCanonicalTelemetryObservedAtMs` | VLS + Dim oVehicle fields | `observedAtMs` | Priority: providerObservedAt → lastValidTelemetryAt → receivedAt (if not backfill-lag) → lastSignal → lastSeenAt |
| Classify | `vehicle-state-interpreter.ts:classifyTelemetryFreshness` | `lastSeenAt`, `now` | `live` / `standby` / `signal_delayed` / `offline` / `no_signal` | Age vs thresholds |
| Fleet API | `vehicles.service.ts:getFleetMapData` | VLS row | `telemetryFreshness`, `onlineStatus`, `signalAgeMs` | Computed per request |
| Frontend | `telemetryFreshness.ts:resolveTelemetryFreshness` | `lastSignal`, `onlineStatus` | Same 5-state (+ `shouldWarnUser` only for offline/no_signal) | Client `Date.now()` |

**Exact thresholds (verified in code, not config/env):**

| State | Age |
|-------|-----|
| `live` | < **15 minutes** |
| `standby` | 15 min – **24 hours** |
| `signal_delayed` (soft-offline) | 24 h – **48 hours** |
| `offline` | ≥ **48 hours** |
| `no_signal` | no usable timestamp |

**Legacy divergence:** `onlineStatus` 3-state maps `OFFLINE` at **≥24h**, collapsing soft-offline and hard-offline. Consumers should use `telemetryFreshness`.

### C.2 Operational availability (`Verfügbar`)

| Stage | Location | Input | Output |
|-------|----------|-------|--------|
| DB | `Vehicle.status` | Admin/booking writes | `AVAILABLE` / `RENTED` / … |
| Backend derive | `deriveFleetStatusContext` | DB status + active/reserved bookings | `operationalState.status` |
| Frontend selector | `selectOperationalStatus` | `operationalState` or flat status | `AVAILABLE` → label **Verfügbar** |
| Badge | `resolveOperationalStatusBadge` / `fleetVehicleDisplay.resolveOperationalStatus` | selector only | Green **Verfügbar** |

**Critical:** `selectOperationalStatus` does **not** read `lastSignal`, `telemetryFreshness`, or connectivity runtime.

Documented intentionally in `fleetVehicleDisplay.ts:223–227`:

> “Operational status is derived independently of telemetry freshness so that an offline / soft-offline available vehicle still reads as Available (with a separate signal note).”

### C.3 Rental readiness (`Bereit` / `Nicht bereit`)

| Stage | Location | Input | Output |
|-------|----------|-------|--------|
| Runtime build | `vehicleRuntimeStateBuilder.ts` | vehicle + rental health + telemetry | `VehicleRuntimeState` |
| Readiness gate | `rentalReadiness.ts:deriveIsReadyForRenting` | operational=available, clean, blockLevel=none, **telemetry≠offline**, no blocking reasons | `isReadyToRent` |
| Slice | `dashboardSliceBuilder.ts:buildReadyToRentSlice` | `operationalStatus==='available'` groups; split by `isReadyToRent` | **Bereit** vs **Nicht bereit** |

**Offline threshold for readiness:** `telemetryState === 'offline'` (≥48h). Soft-offline and standby do **not** block readiness.

### C.4 Health (`Gut` / `Warnung` / `Critical` / `Unknown`)

| Stage | Location | Input | Output |
|-------|----------|-------|--------|
| Module evaluators | `rental-health.service.ts` | battery, tires, brakes, DTC, service, complaints, alerts | per-module `ModuleHealth` |
| Stale flag | `rental-health.types.ts:isStale` | module `last_updated_at` | `data_stale` if > **48h** |
| Aggregate | `computeOverallState` | module `state` only (**ignores `data_stale`**) | `overall_state` |
| Rental gate | `deriveRentalReadiness` | `availability` + `rental_blocked` | `rental_readiness` |
| Frontend fleet | `fleetVehicleDisplay.resolveHealthDisplay` | `overall_state` OR legacy `v.healthStatus` | Gut/Warnung chip |
| Frontend detail | `mapHealthSeverityDisplay` | `overall_state` + module reasons | Good/Warning/Critical + separate **Stale Data** coverage chip |

### C.5 OBD unplugged

| Stage | Location | Input | Output |
|-------|----------|-------|--------|
| Snapshot extract | `connectivity-signals.ts` | DIMO raw payload | `obdIsPluggedIn: boolean \| null` |
| Persist | `VehicleLatestState.rawPayloadJson` | snapshot | `obdIsPluggedIn.value` |
| Webhook | `dimo-webhook.controller.ts` | `obdIsPluggedIn=false` | `OBD_DEVICE_UNPLUGGED` event |
| Episode | `device-connection-episode.service.ts:openFromUnplugEvent` | unplug event | `device_connection_episodes` OPEN |
| Fleet API | fleet-connectivity / fleet-map | VLS raw + runtime | `obdIsPluggedIn` on vehicle DTO |
| UI badge | `obd-plug-status.ts:shouldShowObdUnpluggedBadge` | **`obdIsPluggedIn === false` only** | “OBD unplugged” |

### C.6 Webhook status & interruptions

| Concept | Source | UI label | Meaning |
|---------|--------|----------|---------|
| Webhook **configuration** | `device-connection-webhook-configuration.service.ts` + trigger registry | `webhookConfiguredLabel` → “Webhook aktiv/unbekannt” | Is unplug trigger registered & healthy |
| Device **connection status** | `buildDeviceConnectionSummary` → `currentDeviceConnectionStatus` | `deviceConnectionStatusLabel` → “Unbekannt/Wieder verbunden/…” | Episode/event-derived plug state |
| Open interruption | `openUnpluggedEpisode` | “Offene Unterbrechung” / **“Keine offene Unterbrechung”** | OPEN episode exists or not |
| LTE_R1 title | `lteR1Capable` (= `hardwareType==='LTE_R1'`) | **“DIMO LTE_R1 verbunden”** | Hardware capability label only |

**UI bug:** `VehicleDeviceConnectionCard` labels `currentDeviceConnectionStatus` as **“Status (Webhook)”** — this is **not** webhook configuration status.

---

## D. Signal Inventory

| Signal / field | Storage | Writer | Reader(s) | Freshness-aware? |
|----------------|---------|--------|-----------|------------------|
| `VehicleLatestState.lastSeenAt` | `vehicle_latest_states` | `dimo-snapshot.processor` | telemetry resolver, fleet-map | **Yes** (primary) |
| `VehicleLatestState.sourceTimestamp` | same | snapshot processor | telemetry resolver | Yes |
| `VehicleLatestState.rawPayloadJson.obdIsPluggedIn` | same | snapshot processor | connectivity signals, OBD badge | Snapshot-age implicit |
| `DimoVehicle.lastSignal` | `dimo_vehicles` | DIMO sync | telemetry resolver fallback | Yes |
| `DimoVehicle.connectionStatus` | same | DIMO sync | provider link builder, connectivity anchor | **No** (link state) |
| `Vehicle.status` | `vehicles` | bookings/handover/admin | operational status | **No** |
| `Vehicle.healthStatus` | `vehicles` | legacy admin | frontend fallback display | **No** (deprecated) |
| `device_connection_episodes` | Postgres | episode service | device-connection API, runtime builder | Event-time |
| `dimo_device_connection_events` | Postgres | webhook processing | read-model summary | `observedAt` |
| `device_connection_trigger_registry_cache` | Postgres | trigger registry sync | webhook configuration view | Config sync time |
| `VehicleConnectivityRuntimeState` | **none** (computed) | runtime builder | fleet-connectivity API, fleet-map | Uses telemetry resolver |
| `VehicleHealth.overall_state` | **none** (computed) | rental-health service | health UI, readiness reasons | Per-module only |
| `rental_readiness` | computed | `deriveRentalReadiness` | notifications, fleet summary | Indirect |

---

## E. Telemetry / Offline State Machine

### E.1 Canonical implementation

**Backend:** `classifyTelemetryFreshness` in `vehicle-state-interpreter.ts`  
**Frontend:** `classifyTelemetryFreshness` in `telemetryFreshness.ts` (mirrored constants)

### E.2 Timestamp semantics

- **Driving metric:** `resolveCanonicalTelemetryObservedAtMs` — provider time preferred over ingestion time
- **Backfill guard:** 15 min max lag (`DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS`) before `receivedAt` is trusted
- **Missing timestamp:** → `no_signal`
- **Future timestamps:** age becomes negative → classified as `live` (no explicit clock-skew handler)
- **Timezone:** stored UTC; UI formats with locale/`Europe/Berlin` for operational booking windows
- **Computation location:** backend for API fields; frontend recomputes for live polling surfaces
- **Persistence:** freshness **not** stored; only evidence timestamps in VLS

### E.3 Consumers (non-exhaustive)

| Consumer | Uses | Offline definition |
|----------|------|-------------------|
| Fleet map markers | `telemetryFreshness` | ≥48h |
| Dashboard runtime | `telemetryState` via builder | `offline` blocks readiness |
| `isVehicleOffline` (booking) | `offline` \|\| `no_signal` | ≥48h |
| Legacy `onlineStatus` | 3-state | ≥24h → OFFLINE |
| Connectivity runtime | maps to `OFFLINE`/`SOFT_OFFLINE` | Same 48h/24h |
| Connectivity alerts | `connectivity-alert.policy.ts` | soft-offline alert on `signal_delayed`; standby never alerts |

---

## F. Webhook Architecture

### F.1 DIMO device-connection webhook

| Item | Detail |
|------|--------|
| Endpoint | `POST /api/v1/webhooks/dimo` (`dimo-webhook.controller.ts`) |
| OBD detection | `obdIsPluggedIn` signal or name inference |
| Auth | Verification token + optional HMAC (`DIMO_WEBHOOK_SECRET`) |
| Intake | `device-connection-webhook-inbox.service.ts` — dedup by `providerEventId` |
| Queue | BullMQ `connectivity.webhook.process` |
| Processing | `device-connection-webhook-processing.service.ts` |
| Domain | `device-connection-webhook.service.ts` — persist event, open/close episode |
| Idempotency | 30s dedup buckets; inbox status machine |
| Plug policy | Plug webhook disabled in production; recovery via snapshot `obdIsPluggedIn=true` or telemetry sustained recovery |

### F.2 Interruption lifecycle (designed)

```text
OBD_DEVICE_UNPLUGGED webhook
  → dimo_device_connection_events (persist)
  → device-connection-episode.service.openFromUnplugEvent()
  → device_connection_episodes.status = OPEN
  → alerts/notifications

Recovery paths:
  • SNAPSHOT_PLUG_SIGNAL (dimo-snapshot.processor)
  • TELEMETRY_RESUMED
  • EXPLICIT_PLUG_WEBHOOK (disabled in prod policy)
  • DEVICE_BINDING_CHANGED / reconciliation
```

### F.3 Production gap (P0)

**Designed:** OPEN episodes are SSOT for “offene Unterbrechung”.  
**Observed 2026-08-24:** `device_connection_episodes` count = **0**, while `dimo_device_connection_events` count = **3**.

Unplug events exist for `c43c3b45`, `19fedd4b`, `8c850ff1` but **no episodes were ever materialized**. Therefore:

- `openUnpluggedEpisode` is always false → UI shows **“Keine offene Unterbrechung”**
- `currentDeviceConnectionStatus` stays **`unknown`** (no open episode, no accepted plug event)
- OBD badge can still show **unplugged** from stale snapshot (`obdIsPluggedIn=0` on 37d-old vehicle)

This explains the reported Vehicle Detail combination without speculation.

### F.4 Semantic bug: UNKNOWN + “Keine offene Unterbrechung”

`VehicleDeviceConnectionCard.tsx:107–109`:

```typescript
summary?.openUnpluggedEpisode
  ? /* active interruption */
  : DEVICE_CONNECTION_LABELS.noOpenInterruption; // "Keine offene Unterbrechung"
```

When `currentDeviceConnectionStatus === 'unknown'` and `openUnpluggedEpisode === false`, the UI **asserts no interruption** even though the system may lack positive knowledge (no episodes table population, no recent webhook config, stale snapshot-only OBD).

**Required epistemic states:** `KNOWN_NONE` | `ACTIVE` | `UNKNOWN` — only the first should render “Keine offene Unterbrechung”.

---

## G. Availability vs Readiness

### G.1 Why offline vehicles show `Verfügbar` but land under `NICHT BEREIT`

| Surface | Authority | Considers telemetry offline? |
|---------|-----------|------------------------------|
| Green **Verfügbar** badge | `selectOperationalStatus` → booking/DB | **No** (by design) |
| **Nicht bereit** readiness group | `deriveIsReadyForRenting` | **Yes** (`telemetryState==='offline'`) |
| Rental chip “Nicht bereit” | `fleetVehicleDisplay.resolveRentalDisplay` + `visual.isOffline` | **Yes** (fleet visual) |

**Data path proof:**

```text
DB: Vehicle.status = AVAILABLE
  → deriveFleetStatusContext → operationalState.status = AVAILABLE
  → API fleet-map/list
  → selectOperationalStatus → AVAILABLE
  → resolveOperationalStatusBadge / primaryLabel → "Verfügbar"

Parallel:
  last_seen_at 37d ago
  → classifyTelemetryFreshness → offline
  → vehicleRuntimeStateBuilder → telemetryState = offline
  → deriveIsReadyForRenting → false
  → buildReadyToRentSlice → group "Nicht bereit"
```

**Architectural clue:** Readiness runtime **does** understand offline; availability badge **chooses not to**. This is a **missing effective operational status** layer, not a broken readiness implementation.

### G.2 Availability concepts in codebase

| Concept | Exists? | Location |
|---------|---------|----------|
| Configured/commercial availability | **Yes** | `Vehicle.status` + booking context |
| Effective operational availability | **Partial** | `resolveRentalDisplay`, `deriveIsReadyForRenting` — not on primary badge |
| Rental Health `availability` | **Yes** (different meaning) | pipeline coverage `ready/partial/unavailable` |
| `selectIsCurrentlyAvailable` | **Yes** | also requires `selectIsStatusReliable` — still not telemetry |

---

## H. Health Freshness

### H.1 Can stale/offline vehicles show Gut/Warnung indefinitely?

**Yes — proven in code and production.**

1. **`computeOverallState`** (`rental-health.types.ts:156–164`) considers only `state`, not `data_stale`.
2. Modules set `data_stale: true` via `isStale(last_updated_at)` but may retain `state: 'good'` (e.g. `mapRentalBatteryModule` returns good + `data_stale: true`).
3. **Frontend** `mapHealthSeverityDisplay` returns **Good** when `overall_state === 'good'` OR any core module is “tracked”, even if `hasStale` is true — stale moves to separate **“Stale Data”** coverage chip, not severity.
4. **Fleet list** `resolveHealthDisplay` falls back to legacy `v.healthStatus` when rental health absent; production vehicles have `health_status = GOOD` in DB.

### H.2 Health evaluability gap

| Desired concept | Exists? |
|-----------------|---------|
| `lastKnownHealth` | **No** first-class field |
| `healthEvaluability` / confidence | **Partial** — `rental_health.availability`, module `pipeline_available` |
| Connectivity-aware health unknown | **No** — telemetry offline does not force `overall_state: unknown` |
| `data_stale` affects severity | **No** |

---

## I. Production Evidence (Cases A–E)

### Case A — ~2 days offline (`68868291`)

| Layer | Value |
|-------|-------|
| DB status | AVAILABLE |
| Legacy health | GOOD |
| Days since signal | 2.3 |
| Telemetry freshness | `signal_delayed` (soft-offline) — **not readiness-blocking** |
| OBD snapshot | null |
| Episodes | none |
| Expected UI tension | May still show **Verfügbar**; readiness may still be true (soft-offline doesn't block) |

### Case B — ~30+ days offline (`c43c3b45`, `19fedd4b`)

| Layer | `c43c3b45` | `19fedd4b` |
|-------|------------|------------|
| Days offline | 37.3 | 32.3 |
| Telemetry | `offline` | `offline` |
| OBD snapshot | **false (0)** | true (1) |
| Unplug event | 2026-07-11 | 2026-07-08 |
| Open episode | 0 | 0 |
| DIMO connection_status | CONNECTED | CONNECTED |

### Case C — long offline + Gut

Production `health_status=GOOD` + rental health likely `overall_state=good` because modules retain last-known good states with `data_stale` flags not affecting aggregate.

### Case D — long offline + Warnung

Possible if any module retains `warning` from stale service/tire/brake evaluation independent of telemetry silence.

### Case E — OBD unplugged + Webhook unknown + no interruption (`c43c3b45`)

| UI element | Source | Production-backed value |
|------------|--------|-------------------------|
| OBD unplugged | `obdIsPluggedIn===false` in 37d-old snapshot | **Shows** |
| Status (Webhook): Unbekannt | `currentDeviceConnectionStatus='unknown'` | **Shows** (mislabeled) |
| Keine offene Unterbrechung | `openUnpluggedEpisode=false` | **Shows** (misleading) |
| DIMO LTE_R1 verbunden | `lteR1Capable` | **Shows** (hardware title only) |
| Offline / Last Signal 37d | `resolveTelemetryFreshness` | **Shows** |
| Verfügbar | `selectOperationalStatus` | **Shows** (inconsistent with offline) |

---

## J. Source-of-Truth Matrix

| UI State | Current Source | Raw/Derived | Backend Authority | Frontend Consumer | Freshness-aware? | Problem |
|----------|----------------|---------------|-----------------|-------------------|------------------|---------|
| Online/Live | `classifyTelemetryFreshness` | Derived | `vehicle-state-interpreter` | `telemetryFreshness.ts`, header badges | Yes | OK |
| Standby | same | Derived | same | same | Yes | OK |
| Soft Offline | `signal_delayed` | Derived | same | runtime builder, fleet visual `stale` | Yes | OK |
| Offline | `offline` | Derived | same | readiness, `isVehicleOffline` | Yes | OK |
| Stale Data (health) | module `data_stale` | Derived | rental-health modules | `mapDataCoverageDisplay` | Partial | Severity still Good |
| Last Signal | `lastSeenAt` / `lastSignal` | Raw | VLS / Dim oVehicle | header, fleet rows | Yes | OK |
| OBD unplugged | `obdIsPluggedIn===false` | Snapshot | VLS raw JSON | `ObdUnpluggedBadge` | **Stale snapshot OK** | Orthogonal to episodes |
| Integration linked | `DimoVehicle` link + provider link builder | Mixed | connectivity runtime | fleet-connectivity | No | DIMO CONNECTED while offline |
| Webhook state (config) | trigger registry | Derived | webhook configuration service | `webhookConfiguredLabel` (rarely shown on detail card) | No | **Not shown on detail card** |
| Status (Webhook) label | `currentDeviceConnectionStatus` | Derived | `device-connection-read-model` | `VehicleDeviceConnectionCard` | Partial | **Mislabeled** |
| Open interruption | `device_connection_episodes.OPEN` | Raw/Derived | episode service | device-connection card | No | **Empty in prod** |
| Health Good | `overall_state` / legacy | Derived | rental-health | health chips | **No** | Stale good |
| Health Warning | module states | Derived | rental-health | health chips | Per-module | May be stale |
| Health Critical | module states | Derived | rental-health | health chips | Per-module | — |
| Health Unknown | `overall_state` | Derived | rental-health | health chips | Partial | Not forced by offline |
| Available (`Verfügbar`) | booking/DB operational | Derived | `deriveFleetStatusContext` | `selectOperationalStatus` | **No** | **P0: offline still available** |
| Not Ready | `deriveIsReadyForRenting` | Derived | frontend runtime | dashboard slice | Yes | OK |
| Ready | same | Derived | frontend runtime | dashboard slice | Yes | OK |
| Maintenance blocked | `Vehicle.status` / operational | Mixed | deriveFleetStatusContext | operational selectors | No | OK |

---

## K. UI Consumer Matrix

| Surface | Component | Field / hook | API | Badge mapping |
|---------|-----------|--------------|-----|---------------|
| Dashboard KPI | `ControlKpiStrip` | `runtime.slices['ready-to-rent']` | fleet-map + rental-health batch | Bereit count |
| Rental Readiness list | `FleetStateBoard`, `CompactFleetDrawerVehicleRow` | `resolveFleetVehicleDisplayState`, `runtimeState` | fleet-map, rental-health | **Verfügbar** (statusBadge) + **Nicht bereit** (runtime chip) |
| Fleet map | fleet-map layers | `telemetryFreshness`, `connectivityRuntime` | `GET fleet-map` | Map tone via `fleetVisualState` |
| Vehicle list | `FleetBoardVehicleRow` | `resolveFleetVehicleDisplayState` | fleet list / map | Operational + health + rental chips |
| Vehicle detail header | `VehicleDetailHeader`, `VehicleDetailHeaderBadges` | operational badge + `VehicleConnectionBadge` + `VehicleHealthChip` | fleet-map, rental-health, fleet-connectivity (OBD index) | Verfügbar + Offline + OBD + Good/Warning |
| Vehicle overview | `VehicleOverviewTab` | mixed | — | — |
| Vehicle health | `VehicleHealthBox`, `VehicleHealthChip` | `mapHealthSeverityDisplay`, `mapDataCoverageDisplay` | `GET rental-health` | Good + Stale Data |
| Connectivity card | `VehicleDeviceConnectionCard` | `api.vehicles.deviceConnection` | `GET .../device-connection` | LTE_R1 title, mislabeled webhook status |
| Fleet Connectivity | `FleetConnectivityTab` | `overallState`, KPIs | `GET fleet-connectivity` | Canonical connectivity v2 |
| Notifications | readiness/health projectors | `rental_readiness`, connectivity alerts | notification engine | Offline/unplug alerts |

**Duplicate mapping logic:** operational labels in `fleetVehicleDisplay`, `vehicle-operational-state/display.ts`, `CompactFleetDrawerVehicleRow` runtime labels, and `FleetConnectivityTab` presentation — intentional separation but no shared “effective status” composer.

---

## L. Root Causes (classified)

| ID | Symptom | Root Cause | Layer | Severity | Surfaces | Recommended Fix |
|----|---------|------------|-------|----------|----------|-----------------|
| RC-01 | Offline + Verfügbar | Operational badge explicitly telemetry-agnostic | Frontend display policy | **P0** | Readiness list, fleet rows, detail header | Introduce **effective operational status** server-side; badge consumes it |
| RC-02 | Readiness correct, availability wrong | Parallel derivations by design | Architecture | **P0** | Dashboard readiness drawer | Same as RC-01 — do not patch per-component `if (offline)` |
| RC-03 | 30d offline + Gut | `computeOverallState` ignores `data_stale`; modules stay good | rental-health | **P0** | Health box, fleet health chip | Force `unknown` when telemetry unevaluable; retain `lastKnownHealth` |
| RC-04 | Gut from legacy column | `Vehicle.healthStatus` fallback + DB GOOD | DB + frontend | **P1** | Fleet display | Stop reading deprecated column for UI |
| RC-05 | “Status (Webhook)” misleading | Card shows `currentDeviceConnectionStatus`, not webhook config | UI copy + wiring | **P1** | Connectivity card | Rename + split config vs device state |
| RC-06 | Unknown + Keine offene Unterbrechung | Boolean negation without epistemic state | device-connection UI | **P0** | Connectivity card | `interruptionKnowledge: KNOWN_NONE\|ACTIVE\|UNKNOWN` |
| RC-07 | OBD unplugged + no interruption | Snapshot OBD ≠ episode SSOT | Architecture | **P1** | Header + card | Unified physical device dimension in runtime API |
| RC-08 | Events but zero episodes | Episode persistence not active in production | Backend ops/data | **P0** | All interruption UI | Investigate episode service deployment/migration; backfill policy |
| RC-09 | DIMO CONNECTED while offline | Provider link uses DIMO connection_status, not freshness | DIMO mirror semantics | **P2** | Connectivity, provider label | Never label link “verbunden” without freshness qualifier |
| RC-10 | `onlineStatus` 24h offline | Legacy 3-state compat | API | **P2** | Older consumers | Deprecate; document migration |
| RC-11 | No connectivity freshness metrics | Observability gap | Ops | **P2** | Production diagnosis | Metrics on state transitions, episode counts |

---

## M. Canonical Architecture Recommendation

### M.1 Do NOT add frontend-only `if (offline) hide Verfügbar`

The correct fix is a **single server-side projection** consumed by all surfaces.

### M.2 Reuse existing pieces (minimal new abstraction)

| Dimension | Reuse |
|-----------|-------|
| Telemetry freshness | `telemetry-freshness.resolver.ts` + `vehicle-state-interpreter.ts` |
| Connectivity runtime | `VehicleConnectivityRuntimeStateBuilder` (already 6-dimension) |
| Operational/booking | `deriveFleetStatusContext` (unchanged semantically) |
| Health modules | `RentalHealthService` evaluators |
| Readiness rules | `deriveRentalReadiness` + `deriveIsReadyForRenting` logic moved server-side |

### M.3 Proposed canonical projection (evaluation only — not implemented)

Extend fleet-map / vehicle detail API with **`VehicleOperationalProjection`** (name TBD) containing:

```typescript
{
  integration: { state, source, evaluatedAt },
  connectivity: { telemetryFreshness, overallConnectivityState, lastSignalAt },
  physicalDevice: { obdState, openInterruption, interruptionKnowledge },
  webhook: { configState, lastEventAt },
  health: {
    severity: 'good'|'warning'|'critical'|'unknown',
    evaluability: 'evaluable'|'stale'|'unevaluable',
    lastKnownSeverity?,
    lastAssessedAt?,
    dataStale: boolean
  },
  configuredAvailability: { status, reliable },
  effectiveStatus: { code, label, blockers[] },
  readiness: { state: 'ready'|'not_ready'|'unevaluable', blockers[] }
}
```

**Deprecate for operator UI:** direct use of `Vehicle.status`, `Vehicle.healthStatus`, and raw `currentDeviceConnectionStatus` labels without projection context.

**Keep separate:** booking/legal/commercial availability in DB; projection composes **effective** view only.

---

## N. Proposed State Matrix (expected behavior)

| Connectivity | Health evaluability | Configured avail. | Effective status | Readiness | OBD | Webhook epistemic |
|--------------|--------------------|--------------------|------------------|-----------|-----|-------------------|
| live | evaluable | AVAILABLE | **Available** | ready* | plugged | KNOWN_NONE |
| standby | evaluable | AVAILABLE | **Available (standby)** | ready* | any | KNOWN_NONE/UNKNOWN |
| soft-offline | stale | AVAILABLE | **Degraded signal** | ready* | any | varies |
| offline | unevaluable | AVAILABLE | **Offline — not rentable** | not_ready | any | UNKNOWN unless episode |
| offline | unevaluable | AVAILABLE | badge must **not** show green Verfügbar | not_ready | unplugged | ACTIVE if episode |
| any | evaluable + warning | AVAILABLE | **Available with health warning** | not_ready if blocked | — | — |
| any | any | RENTED | **Active rented** | n/a | — | — |

\*ready assuming clean + no hard health blockers

---

## O. Migration Plan (recommended order)

### P0.1 — State provenance / source-of-truth cleanup
- Document and enforce: `Vehicle.healthStatus` not read for UI
- Fix production episode materialization (RC-08)
- Add epistemic `interruptionKnowledge` to device-connection summary

### P0.2 — Canonical connectivity / operational projection (backend)
- Persist or cache `VehicleConnectivityRuntimeState` per vehicle (optional but recommended for explainability)
- Expose projection on `fleet-map`, `vehicles/:id`, `fleet-connectivity/:id`

### P0.3 — Effective availability semantics
- Add `effectiveStatus` that composes configured availability + connectivity + physical device
- **Verfügbar** badge reads `effectiveStatus`, not raw `AVAILABLE`

### P0.4 — Freshness-aware health / Unknown
- Update `computeOverallState` or add pre-pass: if telemetry unevaluable → `overall_state = unknown`
- Expose `lastKnownHealth` + `healthEvaluability` in API

### P0.5 — Webhook + OBD + interruption consistency
- Fix Connectivity card labels; show webhook config separately
- Align OBD badge with `physicalDeviceState` from runtime builder

### P1.1 — API contract consolidation
- Single DTO for vehicle operational projection; version additive fields

### P1.2 — Frontend consumer migration
- Migrate `fleetVehicleDisplay`, dashboard runtime, detail header to projection only

### P1.3 — Vehicle Detail connectivity redesign
- Replace misleading strings; show KNOWN_NONE vs UNKNOWN

### P1.4 — Badge hierarchy cleanup
- Primary badge = effective status; secondary chips = telemetry, health, OBD

### P1.5 — Regression / integration coverage
- Cross-surface tests for offline+AVAILABLE, stale health, episode gaps

### P2 — Observability + state explainability
- Structured logs for episode open/close, freshness transitions
- Prometheus metrics: vehicles by `telemetryFreshness`, open episodes, projection blockers

---

## P. Regression Test Plan

| Area | Existing tests | Gaps to add |
|------|----------------|-------------|
| Telemetry thresholds | `telemetryFreshness.test.ts`, `vehicle-state-interpreter.spec.ts` | Future timestamp / clock skew |
| Cross-surface parity | `connectivity-cross-surface-regression.test.ts` | offline + AVAILABLE effective status |
| Fleet display | `fleetVehicleDisplay.test.ts` | health unknown when telemetry offline |
| Readiness | `vehicleRuntimeStateBuilder.test.ts`, `rental-health-readiness-contract.spec.ts` | server-side projection parity |
| Device connection | `device-connection-webhook.service.spec.ts` | episode materialization integration |
| Health stale | `rental-health.types.spec.ts` | `data_stale` + offline → unknown |
| Production fixture | fleet-connectivity incident replay | Add Aug 2026 prod anonymized fixture |

**Commands executed in this audit:**

```bash
cd frontend && npm test -- --run src/rental/lib/telemetryFreshness.test.ts \
  src/rental/lib/connectivity-cross-surface-regression.test.ts \
  src/rental/lib/fleetVehicleDisplay.test.ts
# 57 passed

cd backend && npm test -- --testPathPattern="rental-health|connectivity|telemetry-freshness|device-connection|vehicle-state-interpreter"
# 523 passed
```

---

## Q. Risks

| Risk | Mitigation |
|------|------------|
| Rental workflows depend on raw `AVAILABLE` | Keep configured availability in API; only change **displayed effective** status |
| Billing uses connectivity | `billable-vehicles.characterization.spec.ts` — connectivity informational; re-verify |
| Over-aggressive health unknown | Use `lastKnownHealth` sublabel, not silent data loss |
| Episode backfill false positives | Binding-scoped reconciliation; manual review queue exists |
| Fleet map performance | Projection caching with event invalidation (pattern exists from operational v2) |

---

## Root-Cause Table (concise)

See section **L** above for full table (RC-01 through RC-11).

---

## Required Questions — Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Where does SynqDrive get each connectivity signal? | DIMO snapshots → VLS; DIMO webhooks → device events; DIMO sync → `dimo_vehicles`; trigger registry → webhook config |
| 2 | Where stored? | `vehicle_latest_states`, `dimo_vehicles`, `dimo_device_connection_events`, `device_connection_episodes` (empty prod), trigger registry cache |
| 3 | Which timestamps determine freshness? | `resolveCanonicalTelemetryObservedAtMs` → primarily `lastSeenAt` / provider timestamps |
| 4 | How are Live/Standby/Soft/Offline derived? | `classifyTelemetryFreshness` — 15m / 24h / 48h |
| 5 | Why offline + Verfügbar? | Operational badge is booking-derived, telemetry-agnostic by policy |
| 6 | Why 30d offline + Gut? | Health aggregate ignores connectivity + `data_stale`; legacy DB GOOD fallback |
| 7 | Where does OBD unplugged originate? | Snapshot `obdIsPluggedIn===false` in VLS raw JSON; badge via `obd-plug-status.ts` |
| 8 | Why OBD unplugged + Webhook unknown? | Orthogonal signals: snapshot OBD vs event-derived `currentDeviceConnectionStatus` default unknown |
| 9 | Why Webhook unknown + Keine offene Unterbrechung? | UI treats `!openEpisode` as positive “none”; prod has zero episodes |
| 10 | What does DIMO LTE_R1 verbunden mean? | **Hardware type LTE_R1** section title only — not live connectivity |
| 11 | Readiness authority? | Frontend runtime `deriveIsReadyForRenting` + backend `deriveRentalReadiness` for API/notifications |
| 12 | Availability authority? | Backend `deriveFleetStatusContext` / `selectOperationalStatus` (configured, not effective) |
| 13 | Health authority? | Backend `RentalHealthService` / `computeOverallState` |
| 14 | Connectivity authority? | **Split:** telemetry resolver + runtime builder (v2); not yet single UI SSOT |
| 15 | Which UI surfaces derive own state? | Dashboard runtime, fleetVehicleDisplay, health mappers, device-connection card |
| 16 | Duplicate derivations? | Yes — availability vs readiness vs health vs connectivity runtime vs legacy onlineStatus |
| 17 | Minimal safe architecture change? | Server-side **VehicleOperationalProjection** composing existing builders |
| 18 | Implementation sequence? | See section **O** (P0.1–P2) |

---

## Edge Cases (current vs expected) — Summary

| # | Scenario | Current | Expected domain |
|---|----------|---------|-----------------|
| 1 | Online | live, Verfügbar | OK |
| 2 | Standby | standby, still Verfügbar | OK (product) |
| 3 | >24h no signal | soft-offline; legacy onlineStatus OFFLINE | OK with 5-state |
| 4 | >48h | offline; readiness blocked | OK |
| 5 | 30d offline | Verfügbar + Gut possible | **effective offline + health unknown** |
| 6 | Never telemetry | no_signal | unknown health, not ready |
| 7 | Linked, no telemetry | provider link may show CONNECTED | integration linked, connectivity offline |
| 8 | Unlinked | NO_ACTIVE_DATA_SOURCE | OK in runtime v2 |
| 9 | OBD unplugged | snapshot badge; episode may be absent | physical device unplugged + interruption ACTIVE |
| 10 | OBD reconnected | snapshot plug closes episode (if service running) | KNOWN_NONE |
| 11 | Webhook config unknown | legacy `webhookConfigured=unknown` | show UNKNOWN, not “no interruption” |
| 12 | Webhook healthy, vehicle offline | possible — independent dimensions | show both |
| 13 | Active interruption | UI only if OPEN episode | show ACTIVE |
| 14 | Recovered | episode RESOLVED | KNOWN_NONE |
| 15 | Stale health measurements | Good + Stale Data chip | health unknown + last known |
| 16 | Fresh telemetry + health warning | warning shown | OK |
| 17 | Offline + configured AVAILABLE | **Verfügbar shown** | **effective not available** |
| 18 | Active rental + telemetry offline | operational ACTIVE_RENTED | show rented + offline telemetry |
| 19 | Maintenance blocked | maintenance status | OK |
| 20 | Missing timestamps | no_signal | OK |
| 21 | Future timestamps | classified live | should clamp/log skew |
| 22 | Out-of-order webhook | ordering in `device-connection-event-order.ts` | OK at intake |
| 23 | Duplicate webhook | inbox dedup | OK |
| 24 | Backend restart, active interruption | episodes durable — **but prod table empty** | episodes must persist |

---

## Observability (production)

| Capability | Status |
|------------|--------|
| Webhook inbox with statuses | Implemented (`device_connection_webhook_inbox`) |
| Structured connectivity logs | Partial via NestJS loggers |
| Episode transition logs | Service-level; **no prod episodes** |
| Freshness metrics | **Gap** — noted in July 2026 audit |
| Prometheus/Grafana | General infra; no fleet connectivity freshness dashboard |
| BullMQ queue monitoring | Available for `connectivity.webhook.process` |
| Dead-letter | inbox `DEAD_LETTER` status |

---

## Tests Audit Summary

- **Strong:** telemetry threshold parity, cross-surface regression, rental-health readiness contract, device-connection webhook unit tests, connectivity runtime builder specs
- **Missing:** effective availability projection; health unknown on telemetry offline; production episode materialization e2e; UI copy/epistemic interruption states
- **Incorrect assumptions:** tests encode intentional Verfügbar+offline separation — product must decide if still valid

---

## Unresolved / Follow-up

1. **Why production `device_connection_episodes` is empty** — requires ops investigation (migration not applied? episode service errors? feature flag?). Events exist → intake works; episode open path may not run in deployed build.
2. **Live API response capture** — blocked without tenant auth token; DB evidence used instead.
3. **Per-vehicle rental-health API for case vehicles** — would confirm `overall_state` at evaluation time; inferred from code paths + DB legacy health.

---

## References

- `backend/src/modules/vehicles/vehicle-state-interpreter.ts`
- `backend/src/modules/vehicles/telemetry-freshness.resolver.ts`
- `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts`
- `backend/src/modules/dimo/device-connection-read-model.ts`
- `backend/src/modules/rental-health/rental-health.types.ts`
- `frontend/src/rental/lib/fleetVehicleDisplay.ts`
- `frontend/src/rental/components/dashboard/runtime/rentalReadiness.ts`
- `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx`
- `docs/audits/fleet-connectivity-production-readiness-2026-07.md`

---

**Changes / Architektur updated:** No — audit-only task; no implementation changes.
