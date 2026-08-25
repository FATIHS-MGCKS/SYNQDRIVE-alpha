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
| `physicalDeviceState` | `derivePhysicalDeviceEvidence` (shared) | **Derived** | `latestValidSnapshotAt` vs `latestExplicitUnplugAt` | Runtime builder, device-connection read model | `events.some(UNPLUG)` historical boolean |
| `webhookConfigurationState` | `DeviceConnectionWebhookConfigurationService` + trigger registry | Registry cache rows | Registry sync | Fleet connectivity, device-connection API | Inferring from event absence |
| `deviceConnectionEventState` | `dimo_device_connection_events` | Yes (immutable) | `observedAt` (provider), `receivedAt`, `processedAt` (lifecycle complete) | Read-model history, counts | — |
| `interruptionState` | `device_connection_episodes.status=OPEN` | Yes | `openedAt` | Device-connection API when queried | 7-day event-window inference (deprecated when episodes queried) |
| `interruptionKnowledge` | `deriveInterruptionKnowledge` | **Derived** | Episode query + physical evidence (separate) | Device-connection API (additive P0.1) | `!openUnpluggedEpisode` → "known none" |
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

## Physical device evidence (canonical ordering)

**Authority:** `backend/src/modules/vehicles/connectivity/domain/physical-device-evidence.ts`

### Normative rule

> **Latest trustworthy evidence wins.**

| Evidence type | Meaning |
|---------------|---------|
| Valid telemetry snapshot with `obdIsPluggedIn=true` or absent/null | Positive communication / inferred plugged evidence when fresh |
| Valid telemetry snapshot with `obdIsPluggedIn=false` | Negative physical signal — communication may exist but **not** physical reconnect |
| `OBD_DEVICE_UNPLUGGED` event (`observedAt`) | Explicit physical disconnect evidence |

Compare timestamps:

| Case | Result |
|------|--------|
| Snapshot newer than unplug, `obdIsPluggedIn` true/null, snapshot still fresh | `PLUGGED_INFERRED` |
| Snapshot newer than unplug, `obdIsPluggedIn=false` | `UNKNOWN` + `DEVICE_CHECK_REQUIRED` (communication ≠ physical plug) |
| Snapshot newer than unplug but snapshot now offline (≥48h) | `UNKNOWN` + `DEVICE_CHECK_REQUIRED` |
| Explicit plug newer than unplug | `PLUGGED_CONFIRMED` (does not expire with telemetry staleness) |
| Unplug newer than snapshot/plug | `UNPLUGGED_CONFIRMED` |
| No unplug, telemetry offline >48h | `UNKNOWN` + `DEVICE_CHECK_REQUIRED` — **not** unplugged |
| Non-LTE_R1 / non-DIMO | `NOT_APPLICABLE` |

**Two-step model:** (A) historical ordering — did positive evidence recover an older unplug? (B) current validity — is snapshot-based inference still fresh enough to claim plugged today?

**Physical device state and interruption lifecycle are separate dimensions.** A stale OPEN episode must never override newer physical recovery evidence; surface `STATE_CONFLICT` instead.

### Derived fields

| Field | Source |
|-------|--------|
| `latestValidSnapshotAt` | `VehicleLatestState.lastSeenAt` (or runtime telemetry input) |
| `latestExplicitUnplugAt` | Latest canonical `OBD_DEVICE_UNPLUGGED` event `observedAt` (or episode `openedAt` when persisted OPEN) |
| `physicalDeviceStateReason` | `ConnectivityReasonCode[]` from evidence derivation (`DEVICE_UNPLUG_WEBHOOK`, `DEVICE_RECONNECTED_SNAPSHOT`, `DEVICE_CHECK_REQUIRED`, …) |

---

## Interruption knowledge (P0.1 additive)

```typescript
type InterruptionKnowledge = 'known_none' | 'active' | 'unknown' | 'not_applicable';
```

| Value | Meaning |
|-------|---------|
| `active` | OPEN episode exists |
| `known_none` | Episode scope queried, authority reliable, no open episode, physical state is not `UNPLUGGED_CONFIRMED` |
| `unknown` | Episode scope not queried, authority unreliable, or unplug physical evidence exists without materialized episode |
| `not_applicable` | Non-DIMO or non-LTE_R1 — not an operator connectivity problem |

**Critical invariants:**
- `usePersistedEpisodeScope = false` must **never** yield `known_none`.
- `episodeEvidenceReliable = false` must **never** yield `known_none` (production default until pipeline verified healthy).

---

## Cross-surface connectivity contract (P0.2+ migration)

### Target flow

```text
DIMO snapshots + unplug events + provider link + webhook config + episode lifecycle
        │
        ▼
canonical evidence ordering (physical-device-evidence.ts)
        │
        ▼
VehicleConnectivityRuntimeStateBuilder
        │
        ▼
Vehicle Operational Projection (P0.2)
        │
        ├─ Dashboard / Readiness
        ├─ Vehicle list
        ├─ Vehicle Detail summary (compact)
        ├─ Fleet → Connectivity (detailed diagnostics)  ← mandatory canonical consumer
        └─ Notifications / Alerts
```

### Surface roles

| Surface | Role |
|---------|------|
| **Fleet → Connectivity** | Full detailed diagnostics per vehicle (canonical detailed surface) |
| **Vehicle Detail → Connectivity** | Compact summary + deep-link CTA only |

### Deep-link navigation contract

**File:** `frontend/src/rental/components/fleet-connectivity/fleet-connectivity-nav.types.ts`

Target URL: `?view=fleet&fleetTab=connectivity&connectivityVehicleId=<vehicleId>`

Requirements: deep-linkable, browser-back safe, org-scoped, invalid vehicleId falls back to list. UI CTA implementation deferred to P0.5.

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

## Webhook inbox processing lifecycle (production gate 2026-08)

DIMO `OBD_DEVICE_UNPLUGGED` webhooks flow: inbox (`RECEIVED`) → BullMQ `connectivity.webhook.process` → worker → canonical event → episode OPEN → `processed_at` set → inbox `PROCESSED`.

**Invariants (post gate fix):**
- Event dedupe (`dedupBucket`) is separate from lifecycle completion (`processed_at`).
- **Production cutover (corrected 2026-08-25):** `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER=2026-08-25T08:04:17.000Z` — first instant the repaired inbox→BullMQ→episode pipeline was authoritative (not the pre-activation deploy timestamp).
- Retry after partial failure must reconcile episode sync when `processed_at IS NULL` **and** `received_at >= CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER`.
- Enqueue failure (intake or scheduler) marks inbox `RETRYABLE_FAILED` (not silent `RECEIVED` forever).
- Scheduler reconciles eligible orphan `processed_at IS NULL` events only; historical pre-cutover orphans are logged, not materialized.
- **Historical reconciliation eligibility is enforced centrally at the lifecycle mutation boundary** (`ConnectivityLifecycleRuntimePolicyService`). Scheduler filtering is defense-in-depth.
- **Runtime retry/reconciliation repairs current-pipeline partial failures. Historical pre-cutover evidence is never automatically materialized into episodes.**
- Snapshot recovery resolves OPEN episodes without requiring `OBD_DEVICE_PLUGGED_IN` webhook.

**Audit:** `docs/audits/connectivity-production-processing-gate-2026-08.md`

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
