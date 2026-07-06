# DIMO OBD Device Connection — Connectivity Reconcile (2026-07-06)

## Problem

WOB X 6511: user unplugged OBD once and did not replug. DIMO sent a phantom `PLUGGED_IN` webhook 14s after `UNPLUGGED` during a contact-flutter burst (~46 webhooks in 4 minutes).

- **Master Admin / `DimoVehicle.connectionStatus`**: `DISCONNECTED` (correct)
- **Vehicle Detail Konnektivität card**: „Wieder verbunden“ (incorrect — trusted last webhook only)

## Solution (two layers)

### 1. Read-model reconcile (primary)

`reconcileDeviceConnectionEvents()` in `device-connection-read-model.ts`:

- Input anchor: `DimoVehicle.connectionStatus` + snapshot `obdIsPluggedIn` from `VehicleLatestState`
- Drops short `PLUGGED_IN` impulses (≤120s) after `UNPLUGGED` when connectivity still indicates unplugged/disconnected
- Strips trailing `PLUGGED_IN` rows when DIMO is still disconnected

Used by:

- `buildDeviceConnectionSummary` (vehicle detail, fleet deviceConnection projection)
- `buildTripDeviceConnectionFlags`
- `getTripEvidence`

### 2. Intake impulse filter (secondary)

`shouldIgnorePlugImpulseAfterUnplug()` + `DeviceConnectionWebhookService.evaluateStateChangeGate`:

- Within 120s after persisted unplug, only persist plug-in when anchor confirms `CONNECTED` or `obdIsPluggedIn=true`
- Prevents new phantom rows; reconcile still corrects historical rows

## Architecture preserved

- Webhook events remain tamper evidence — not misuse cases
- Fleet `connectionStatus` (online/offline/stale) unchanged
- `deviceConnection` webhook column distinct from snapshot OBD plug
- Reconcile is read-time only; raw `dimo_device_connection_events` rows are not deleted
