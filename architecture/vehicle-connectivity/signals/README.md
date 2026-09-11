# Connectivity Signals (Vehicle Connectivity)

**Status:** Index only — signal catalog audit pending.

## Priority signals (research list)

| Signal / field | Role |
|----------------|------|
| `signalsLatest.lastSeen` | Canonical source observation time |
| `providerFetchedAt` | SynqDrive fetch time — not source time |
| `sourceTimestamp` (VLS) | Persisted monotonic source time |
| `isIgnitionOn` | Active vs resting context |
| `speed` | Motion evidence |
| `obdIsPluggedIn` | Physical connection evidence |
| `lowVoltageBatteryCurrentVoltage` | Standby wake indicator (candidate) |
| `currentLocationCoordinates` | GNSS freshness on wake |
| Per-signal `.timestamp` in raw payload | Heterogeneity (VC-HYP-004) |

DIMO field acquisition: [DIMO Integration](../../dimo-integration/README.md).
