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

## Webhook inbox & retries (Prompt 10)

Durable intake via `device_connection_webhook_inbox` — decouples HTTP ack from episode processing.

### Status lifecycle

`RECEIVED` → `VALIDATED` → `PROCESSED` | `IGNORED_BY_POLICY` | `RETRYABLE_FAILED` → `PERMANENTLY_FAILED` | `DEAD_LETTER`

Technical failures (DB, episode sync) are **never** classified as policy `ignored`.

### HTTP intake

- Invalid HMAC → `401 Unauthorized`
- Valid payload → `status: accepted` + `inboxId` (fast ack)
- Async processing via BullMQ queue `device.connection.webhook.process`

### Dedupe

Unique `(provider, providerEventId)` — CloudEvent `id` / `webhookId` or synthetic hash.

### Raw payload

Redacted JSON only (secrets stripped). Retention: operational inbox rows follow standard DB retention; no raw secrets stored.

### Replay

`POST /organizations/:orgId/fleet-connectivity/webhook-inbox/:inboxId/replay` (org admin).

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

## Reconciliation audit (Prompt 6)

Read-only classifier: `backend/src/modules/dimo/device-connection-episode-reconciliation/`

- Script: `backend/scripts/ops/audit-device-connection-episode-reconciliation.ts`
- Fixture artifacts: `docs/audits/device-connection-episode-reconciliation-2026-07.md`
- CSV: `docs/audits/data/device-connection-episode-reconciliation-2026-07.csv`
