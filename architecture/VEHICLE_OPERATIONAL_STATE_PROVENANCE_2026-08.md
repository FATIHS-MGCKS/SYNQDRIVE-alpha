# Vehicle Operational State — Provenance Contract (P0.1)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-24 |
| **Slice** | P0.1 — provenance boundaries & interruption epistemics |
| **Related audit** | `docs/audits/vehicle-connectivity-operational-state-audit-2026-08.md` |

## Purpose

Define authoritative sources for operator-relevant vehicle state **before** P0.2 introduces a unified operational projection. This document is normative for backend/frontend consumers.

## Core principle

> **Persist evidence. Derive current state.**

Time-sensitive connectivity states (`standby`, `signal_delayed`, `offline`) must not be persisted as authoritative truth.

---

## Provenance matrix

| Concept | Canonical source | Persisted? | Timestamp basis | Allowed consumers | Deprecated fallbacks |
|---------|------------------|------------|-----------------|-------------------|----------------------|
| `configuredOperationalStatus` | `deriveFleetStatusContext` → `operationalState.status` | DB `Vehicle.status` + booking overlay | Booking windows, org TZ | Operational badges, booking gates | Raw `Vehicle.status` without booking context |
| `telemetryFreshness` | `classifyTelemetryFreshness` / `resolveTelemetryFreshness` | **Derived** from `VehicleLatestState.lastSeenAt` (+ resolver priority) | Provider-observed → received → lastSeen | Fleet map, readiness runtime, connectivity runtime | Legacy `onlineStatus` (3-state) |
| `legacyOnlineStatus` | `interpretVehicleState.onlineStatus` | **Derived** | Same as freshness; **OFFLINE at ≥24h** | Legacy API fields, live map store | Must migrate (see inventory) |
| `providerLinkState` | `ProviderLinkStateBuilder` / `DimoVehicle.connectionStatus` | `dimo_vehicles.connection_status` | DIMO sync time | Connectivity runtime dim A | Treating CONNECTED as telemetry-live |
| `physicalDeviceState` | Connectivity runtime dim C + OBD snapshot | Episode + snapshot evidence | Event `observedAt`, snapshot time | Runtime builder, OBD badge | Event-window-only inference when episodes authoritative |
| `webhookConfigurationState` | `DeviceConnectionWebhookConfigurationService` + trigger registry | Registry cache rows | Registry sync | Fleet connectivity, device-connection API | Inferring from event absence |
| `deviceConnectionEventState` | `dimo_device_connection_events` | Yes (immutable) | `observedAt` (provider), `receivedAt` | Read-model history, counts | — |
| `interruptionState` | `device_connection_episodes.status=OPEN` | Yes | `openedAt` | Device-connection API when queried | 7-day event-window inference (deprecated when episodes queried) |
| `interruptionKnowledge` | `deriveInterruptionKnowledge` | **Derived** | Episode query + physical evidence | Device-connection API (additive P0.1) | `!openUnpluggedEpisode` → "known none" |
| `healthAggregate` | `RentalHealthService` → `computeOverallState` | **Derived** per request | Module `last_updated_at` | Health UI, readiness reasons | — |
| `legacyHealthStatus` | `Vehicle.healthStatus` column | DB (deprecated) | Manual/admin | **None for operator UI when rental health present** | All operator surfaces |
| `rentalReadiness` | `deriveRentalReadiness` (API) + `deriveIsReadyForRenting` (dashboard runtime) | **Derived** | Health eval + telemetry | Readiness slices, notifications | — |

---

## Telemetry freshness (canonical)

| State | Threshold |
|-------|-----------|
| `live` | < 15 minutes |
| `standby` | 15 min – 24 h |
| `signal_delayed` | 24 h – 48 h |
| `offline` | ≥ 48 h |
| `no_signal` | no usable timestamp |

**Authority:** `backend/src/modules/vehicles/vehicle-state-interpreter.ts`, mirrored in `frontend/src/rental/lib/telemetryFreshness.ts`.

### Legacy `onlineStatus` consumer inventory

| Consumer | Classification |
|----------|----------------|
| Fleet-map / vehicle list API field | `SAFE_LEGACY` (compat) |
| `useVehicleLiveMapStore` / detail badge input | `MUST_MIGRATE_P02` (prefer freshness) |
| Master admin platform vehicles | `SAFE_LEGACY` |
| `isVehicleOffline` when only checking onlineStatus | `BUG` (fixed: uses 5-state freshness) |

---

## Provider link vs connectivity

`DimoVehicle.connectionStatus` (`CONNECTED`, `DISCONNECTED`, …) reflects **DIMO integration/device association**, not telemetry freshness.

A vehicle may be `CONNECTED` at the provider while `telemetryFreshness = offline`.

UI must not label provider link alone as “verbunden” without freshness context.

---

## Webhook configuration vs device connection status

| Field | Meaning |
|-------|---------|
| `webhookConfiguration.unplugTriggerState` | Is the DIMO Vehicle Trigger registered and healthy? |
| `currentDeviceConnectionStatus` | Episode/event-derived plug state (`plugged` / `unplugged` / `unknown`) |

The Vehicle Detail label **“Status (Webhook)”** is misleading — it displays `currentDeviceConnectionStatus`, not webhook configuration. UI fix deferred to P0.5; API contract clarified in P0.1.

---

## Interruption knowledge (P0.1 additive)

```typescript
type InterruptionKnowledge = 'known_none' | 'active' | 'unknown';
```

| Value | Meaning |
|-------|---------|
| `active` | OPEN episode exists |
| `known_none` | Episode table authoritative; no open episode; no conflicting physical evidence |
| `unknown` | Cannot assert no interruption (e.g. unplug events without episode, OBD snapshot unplugged) |

**Implementation:** `backend/src/modules/dimo/interruption-knowledge.ts`

---

## Health evaluability (P0.4 design requirement)

Future health gates must be **module-aware**:

| Module | Freshness dependency |
|--------|---------------------|
| Battery | Telemetry / provider signal freshness |
| Tires | Measurement age + manual inspection |
| Brakes | Measurement freshness |
| DTC | Poll age |
| Service / TÜV / BOKraft | Date/odometer compliance (not live telemetry) |

Distinguish: `module state`, `module evidence freshness`, `overall evaluability`.

---

## Connectivity runtime builder (P0.2 disposition)

`VehicleConnectivityRuntimeStateBuilder` is the **canonical multi-dimensional connectivity synthesis** for P0.2. Do not create a parallel engine.

Six dimensions: provider link, telemetry, physical device, data coverage, attention, overall.

Computed at read time — not persisted in P0.1/P0.2 initial rollout.

---

## Explainability reason codes (preparation)

Reserved vocabulary for P0.2 projection:

- `telemetry_timeout`
- `no_telemetry_seen`
- `provider_unlinked`
- `obd_unplugged`
- `episode_active`
- `episode_history_unknown`
- `webhook_configuration_unknown`
