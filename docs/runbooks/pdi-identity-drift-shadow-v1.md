# PDI Identity Drift Shadow V1

Read-only observation of Ruptela R1 serial alignment between **active PDI INSTALL assignments** and the **DIMO vehicle mirror** (`dimo_vehicles.raw_json.aftermarketDevice.serial`).

## Feature flag

| Variable | Default | Meaning |
|----------|---------|---------|
| `PDI_IDENTITY_DRIFT_SHADOW_ENABLED` | **unset / false** | When not `true`, no evaluation runs |

Fail-closed. Does not change DIMO sync semantics, PDI lifecycle, DIMO bindings, VSI, or VDC.

## Integration

Runs **after** a successful `DimoVehicleSync` (`DimoVehicleSyncProcessor`), piggybacking the existing 24h identity sync — **no new scheduler**.

Shadow failures are logged and **do not** fail the sync job.

## Reason codes (priority order)

1. `IDENTITY_UNCONFIRMED` — ambiguous INSTALL, unverified PDI, stale/missing mirror serial, stale `syncedAt` (>25h)
2. `SWAP_SUSPECTED` — observed serial matches another vehicle’s active INSTALLED device
3. `UNKNOWN_DEVICE` — observed serial not present in PDI inventory
4. `ASSIGNMENT_MISMATCH` — observed serial known in PDI but not expected for this vehicle (and not a swap)
5. `MATCH` — aligned

Provider registry serial change is **not** proof of physical device swap.

## Dual confirmation (V1)

Uses **`dimo_poll_logs.metaJson.pdiIdentityDriftShadowV1`** (existing table) to remember observation fingerprints between sync runs:

- First independent drift observation → `CANDIDATE`
- Second drift observation with **different** `observationSnapshotFingerprint` → `CONFIRMED`
- Re-reading the same mirror snapshot does **not** count twice
- Stale mirror → `UNCONFIRMED` (no confirmation)
- Return to `MATCH` clears persisted candidates for that drift

**Limitation:** No historical serial time series beyond poll-log fingerprints; confirmation requires two successful vehicle syncs with distinct mirror snapshots.

## Logging

Structured JSON log lines (`channel: PDI_IDENTITY_DRIFT_SHADOW`). Masked serials only. Suppressed when all devices `MATCH` (debug summary only).

## Operations

Do **not** set the flag in production `backend.env` until owner approves activation. No deployment required for code presence while flag remains off.
