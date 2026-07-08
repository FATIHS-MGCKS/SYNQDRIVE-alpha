# DIMO OBD — Unplug webhook only, plug-in via snapshot (2026-07-08)

## Ops configuration

In the DIMO Developer Console:

| Direction | Channel | Status |
|-----------|---------|--------|
| OBD unplugged (plug out) | Vehicle Trigger webhook → `POST /api/v1/webhooks/dimo` | **Active** |
| OBD plugged in | Vehicle Trigger webhook | **Disabled** |
| OBD plugged in | Snapshot polling `obdIsPluggedIn` | **Active** |

## Rationale

Plug-in webhooks frequently produced phantom `PLUGGED_IN` impulses shortly after unplug (contact flutter). Unplug is time-critical tamper evidence and remains on webhooks. Re-plug is adequately represented by snapshot `obdIsPluggedIn` and the reconcile anchor (`DimoVehicle.connectionStatus` + `VehicleLatestState`).

## SynqDrive behavior (no code change required)

- **Unplug webhook** → `DeviceConnectionWebhookService.ingestObdPlugStateChange(pluggedIn: false)` or dedicated console webhook name containing `unplug` (`inferObdPlugStateFromWebhookContext`).
- **Plug-in snapshot** → `VehicleLatestState.rawPayloadJson.obdIsPluggedIn` via DIMO snapshot polling; shown in Fleet Connectivity, Vehicle Detail header/card, reconcile anchor.
- **Trip list / evidence** → `OBD_DEVICE_UNPLUGGED` rows from webhooks; trip chips for unplug during trip unchanged.
- **Plug-in event timeline rows** (`OBD_DEVICE_PLUGGED_IN` in `dimo_device_connection_events`) are **not** created from snapshots today — only from webhooks (now off) or historical data. UI “wieder eingesteckt” event lines in Trip Evidence depend on persisted `PLUGGED_IN` rows or future snapshot→event intake.

## Related

- `architecture/DIMO_DEVICE_CONNECTION_RECONCILE_2026-07-06.md`
- `device-connection-webhook.service.ts`, `device-connection-read-model.ts`
