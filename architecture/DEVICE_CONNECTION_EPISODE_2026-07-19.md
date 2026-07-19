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

## Next steps (not in this commit)

- Snapshot/telemetry **apply** path (closure at runtime — Prompt 5 remediation step)
- Run `scripts/ops/audit-device-connection-episode-reconciliation.ts` against staging/prod (read-only) before controlled apply
- Runtime builder `activeEpisodeId` wiring
- Production reconciliation backfill (Prompt 18) — only `applyEligible=yes` rows

## Reconciliation audit (Prompt 6)

Read-only classifier: `backend/src/modules/dimo/device-connection-episode-reconciliation/`

- Script: `backend/scripts/ops/audit-device-connection-episode-reconciliation.ts`
- Fixture artifacts: `docs/audits/device-connection-episode-reconciliation-2026-07.md`
- CSV: `docs/audits/data/device-connection-episode-reconciliation-2026-07.csv`
