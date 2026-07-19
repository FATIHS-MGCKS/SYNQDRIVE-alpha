# Device Connection Episode (2026-07-19)

## Summary

Adds persistent, binding-scoped **DeviceConnectionEpisode** records for OBD unplug/plug
current state. Replaces inferring open unplug episodes from a rolling 7-day event window.

## Separation of concerns

| Concern | Source | Notes |
|---------|--------|-------|
| **Current episode state** | `device_connection_episodes` (`status = OPEN`) | Not time-window derived |
| **Display history** | `dimo_device_connection_events` (7d window in query service) | Immutable events; counts/recent list only |

## Model

`DeviceConnectionEpisode` — fields include `organizationId`, `vehicleId`, `provider`,
`deviceBindingId`, `providerDeviceIdHash`, lifecycle timestamps, `openedReason`,
`status`, `resolutionMethod`, `resolutionEventId`, `stateVersion`.

### Status

`OPEN` · `RESOLVED` · `SUPERSEDED` · `REQUIRES_REVIEW`

### Resolution methods

`EXPLICIT_PLUG_WEBHOOK` · `SNAPSHOT_PLUG_SIGNAL` · `TELEMETRY_RESUMED` ·
`DEVICE_BINDING_CHANGED` · `MANUAL_REVIEW` · `DATA_RECONCILIATION`

## Invariants

- At most one `OPEN` episode per `organizationId + vehicleId + provider + deviceBindingId`
  (partial unique index with `COALESCE(device_binding_id, '__none__')`).
- New binding opens supersede prior `OPEN` episodes on other bindings (`DEVICE_BINDING_CHANGED`).
- `resolvedAt >= openedAt` enforced in service.
- Episode history is append-only (no service delete path).
- `DimoDeviceConnectionEvent` rows remain immutable.

## Lifecycle wiring (forward path only)

1. Webhook persists unplug event → `DeviceConnectionEpisodeService.openFromUnplugEvent`
2. Webhook persists plug event → `DeviceConnectionEpisodeService.resolveFromExplicitPlugEvent`
3. Query service loads `OPEN` episode → `buildDeviceConnectionSummary({ persistedOpenEpisode })`

**No backfill** of existing production episodes in this change.

## Changes

- Prisma: enums + `device_connection_episodes` table (additive migration)
- `DeviceConnectionEpisodeService` — open/resolve/supersede
- `DeviceConnectionQueryService` — episode-backed current state
- `DeviceConnectionWebhookService` — episode sync after new events
- `device-connection-read-model` — `persistedOpenEpisode` input

## Snapshot plug resolution (Prompt 7)

`DeviceConnectionEpisodeResolutionService.tryResolveFromSnapshotPlugSignal` closes open episodes when a **fresh**
`obdIsPluggedIn=true` snapshot arrives for the same physical OBD binding.

Guards (evaluator): provider observed + received after `openedAt`, binding match, LTE_R1 hardware, non-synthetic source.

On success (atomic transaction):

- Episode → `RESOLVED` / `SNAPSHOT_PLUG_SIGNAL`
- `device_connection_episode_resolution_audits` row
- Outbox: `CONNECTIVITY_RUNTIME_RECALCULATE`, `DEVICE_ALERT_RESOLVE_PREPARED`
- Runtime projection via `VehicleConnectivityRuntimeProjectionService`

Wired from `DimoSnapshotProcessor` after `VehicleLatestState` upsert. Raw webhooks/events unchanged.

## Telemetry-resume resolution (Prompt 8)

`DeviceConnectionEpisodeResolutionService.tryResolveFromSustainedTelemetry` closes open episodes when
**sustained physical telemetry** resumes for the same OBD/R1 binding without an explicit plug webhook.

### Conservative policy (configurable)

Env keys: `DEVICE_CONNECTION_TELEMETRY_RECOVERY_*` — see
`device-connection-telemetry-recovery.policy.ts`.

Closure requires at least one variant:

| Variant | Rule |
|---------|------|
| **SPAN** | ≥2 operational snapshots spanning ≥ `minSpanMs` without gaps > `maxGapBetweenSnapshotsMs` |
| **TRIP** | ≥1 operational snapshot after unplug plus a trip started/completed after unplug |
| **CONNECTION_STATUS** | Provider `CONNECTED` plus ≥2 fresh operational snapshots within `connectionStatusFreshWindowMs` |

A single arbitrary telemetry line never resolves an episode.

### Guards

Same binding, LTE_R1 hardware, non-OEM/non-synthetic source, provider observed + received after
`openedAt`, no backfill replay (`receivedAt − observedAt` ≤ `maxBackfillLagMs`), `obdIsPluggedIn !== false`.

### Persistence

- Observations: `device_connection_telemetry_recovery_observations` (idempotent per episode + snapshot ref)
- On resolve: episode → `RESOLVED` / `TELEMETRY_RESUMED`, `resolutionEvidenceAt` = policy evidence time
- Runtime projection → `PLUGGED_INFERRED` + `DEVICE_RECONNECTED_TELEMETRY`
- Outbox `recoverySource: telemetry_resumed`

Wired from `DimoSnapshotProcessor` after snapshot-plug attempt (telemetry path runs when `obdIsPluggedIn` is not `false`).

UI copy (later): „Wieder verbunden – aus neuer Telemetrie erkannt“.

## Binding lifecycle & event order (Prompt 9)

Canonical binding identity: `device-binding-lifecycle.ts` — DIMO token hash, `VehicleDataSourceLink`,
hardware/source class (`PHYSICAL_OBD_LTE_R1`, `OEM_API`, `SYNTHETIC_ONLY`).

### Binding change

- Open episodes on a **different binding scope** are `SUPERSEDED` with `DEVICE_BINDING_CHANGED`
- `reconcileBindingDrift()` runs on snapshot ingest before resolution
- New binding starts without inherited unplug state
- Lifecycle audits: `device_connection_episode_lifecycle_audits`

### Event ordering

Provider `observedAt` is authoritative. Webhook rows store `receivedAt` + `processedAt`.
`device-connection-event-order.ts` guards:

- Late unplug after recovery → ignored (audit `STALE_EVENT_IGNORED`)
- Plug only closes when `observedAt >= episode.openedAt`
- Historical snapshot backfills → rejected (`HISTORICAL_BACKFILL_SNAPSHOT`)

### Conflicts

`REQUIRES_REVIEW` episode status + `reviewReasonCodes[]` — no silent resolution for ambiguous OEM/synthetic or out-of-order cases.

## Next steps (not in this commit)

- Run `scripts/ops/audit-device-connection-episode-reconciliation.ts` against staging/prod (read-only) before controlled apply
- Runtime builder `activeEpisodeId` wiring
- Production reconciliation backfill (Prompt 18) — only `applyEligible=yes` rows

## Provider link authorization (Prompt 12)

`ProviderLinkStateBuilder` canonicalizes provider link truth from consent ledger, authorization,
token/binding, mapping, revocation, expiry, and provider errors — **not** `DimoVehicle` row presence.

### States (`ProviderLinkState`)

`ACTIVE` · `REAUTH_REQUIRED` · `REVOKED` · `NO_LINK` · `ERROR` · `UNKNOWN`

### Source-of-truth priority (highest wins)

1. Cross-tenant mapping mismatch → `ERROR`
2. Provider/integration error → `ERROR`
3. Explicit revocation → `REVOKED`
4. No mapping and no historical identity → `NO_LINK`
5. Active mapping without token → `REAUTH_REQUIRED` (`TOKEN_MISSING`)
6. Authorization expired → `REAUTH_REQUIRED` (`AUTHORIZATION_EXPIRED`)
7. Consent missing/expired → `REAUTH_REQUIRED` (`CONSENT_MISSING`)
8. Historical `DimoVehicle` identity only → `UNKNOWN` (never `ACTIVE`)
9. Ambiguous authorization → `UNKNOWN`
10. Full active chain → `ACTIVE` (`LINK_ACTIVE`)

Telemetry freshness is a **separate dimension** — live telemetry with missing consent yields
`telemetryState=live` and `providerLinkState=REAUTH_REQUIRED`.

### API reason codes

`CONSENT_MISSING` · `AUTHORIZATION_EXPIRED` · `TOKEN_MISSING` · `PROVIDER_REVOKED` ·
`PROVIDER_ERROR` · `LINK_ACTIVE` · `NO_ACTIVE_PROVIDER_LINK`

### Wiring

- `provider-link-evidence.assembler.ts` — maps Prisma rows to evidence input
- `VehicleConnectivityRuntimeProjectionService` — loads consent + mapping + org authorization
- `VehicleConnectivityRuntimeStateBuilder` — consumes `ProviderLinkStateResult` (no `dimoVehicleId` shortcut)

## Telemetry freshness unification (Prompt 13)

Single resolver: `telemetry-freshness.resolver.ts` (backend) / `telemetryFreshness.ts` (frontend).

### Thresholds (canonical)

| State | Age |
|-------|-----|
| LIVE (`live`) | < 15 min |
| STANDBY (`standby`) | 15 min – 24 h |
| SOFT_OFFLINE (`signal_delayed`) | 24 h – 48 h |
| OFFLINE (`offline`) | ≥ 48 h |
| UNKNOWN (`no_signal`) | no usable timestamp |

### Timestamp priority

1. `sourceTimestamp` (provider observedAt)
2. Last valid telemetry at
3. `receivedAt` — blocked when backfill lag exceeds 15 min vs observed
4. `DimoVehicle.lastSignal`
5. `lastSeenAt` / `updatedAt` (lowest trust)

Fleet Connectivity API exposes `telemetryFreshness` (canonical) + legacy `connectionStatus` mapping (`signal_delayed` added).

## Data coverage (Prompt 14)

Capability-, provider-, powertrain-, and freshness-aware coverage replaces the misleading flat `readinessScore`.

### Module

`fleet-data-coverage.ts` + `fleet-data-coverage.types.ts`

### Signal groups

`gps` · `odometer` · `speed` · `fuel` · `evSoc` · `dtc` · `obdPlug` · `jamming`

### Capability matrix dimensions

Provider (`DIMO` / `HIGH_MOBILITY` / `MANUAL` / `NONE`) · device class (`PHYSICAL_OBD` / `OEM` / `SYNTHETIC`) · powertrain (`ICE` / `EV` / `PHEV` / `UNKNOWN`)

### Coverage formula

`fresh usable expected signals / expected and supported signals`

Excluded from denominator: EV SoC on ICE, fuel on EV, OBD plug on OEM/synthetic, jamming without physical-OBD capability. Empty DTC poll counts as available; speed `0` is valid.

### API fields

`coverageState` (`GOOD` | `PARTIAL` | `INSUFFICIENT` | `UNKNOWN` | `NOT_APPLICABLE`) · optional `coveragePercent` · `expectedSignalCount` · `freshSignalCount` · `staleSignalCount` · `missingSignalCount` · `reasonCodes`

Legacy `readinessScore` / `readinessLevel` / `signalCoveragePercent` remain as transitional aliases derived from coverage.

## Connectivity alerts (Prompt 15)

Unified structured connectivity alerts via `connectivity-alert/` module + notification registry.

### Alert types

`DEVICE_UNPLUGGED` · `DEVICE_RECONNECTED` · `TELEMETRY_SOFT_OFFLINE` · `TELEMETRY_OFFLINE` · `AUTHORIZATION_REQUIRED` · `DATA_SOURCE_DISCONNECTED` · `DATA_COVERAGE_INSUFFICIENT` · `WEBHOOK_FAILURE` · `DEVICE_BINDING_CHANGED` · `CONNECTIVITY_STATE_UNKNOWN`

### Categories

DEVICE · TELEMETRY · AUTHORIZATION · DATA_QUALITY · INTEGRATION

### Dedupe key

`organizationId:vehicleId:provider:deviceBindingId:episodeId:alertType:stateVersion`

Episode-scoped device alerts use notification fingerprint variant `conditionCode:episode:{episodeId}`.

### Wiring

- `DeviceConnectionEpisodeService.openFromUnplugEvent` → `DEVICE_UNPLUGGED` (once per episode)
- Explicit plug / resolution outbox → resolve unplug + one `DEVICE_RECONNECTED` info event
- `DeviceConnectionEpisodeResolutionOutbox` consumer → `ConnectivityAlertService.processResolutionOutboxRow`
- `VehicleConnectivityRuntimeProjectionService` → telemetry / authorization / coverage runtime sync
- Notifications link to Fleet Connectivity via `OPEN_VEHICLE_MODULE` + `module: connectivity`

## Reconciliation audit (Prompt 6)

Read-only classifier: `backend/src/modules/dimo/device-connection-episode-reconciliation/`

- Script: `backend/scripts/ops/audit-device-connection-episode-reconciliation.ts`
- Fixture artifacts: `docs/audits/device-connection-episode-reconciliation-2026-07.md`
- CSV: `docs/audits/data/device-connection-episode-reconciliation-2026-07.csv`
