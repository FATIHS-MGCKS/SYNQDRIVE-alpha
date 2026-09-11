# Provider Profile — DIMO · Ruptela LTE_R1

| Field | Value |
|-------|-------|
| **Profile ID** | VDC-PROF-LTE-R1-001 |
| **Provider** | DIMO |
| **Hardware** | Ruptela LTE_R1 (`vehicles.hardware_type = LTE_R1`) |
| **Epistemic status** | INFERRED — research target, not canonicalized |
| **Validation status** | PROPOSED |

## Research topics (not answered here)

- Active/driving telemetry cadence
- Ignition-off transition behavior
- Standby/sleep source silence duration
- `signalsLatest.lastSeen` vs per-signal timestamps
- `providerFetchedAt` vs `sourceTimestamp` semantics (see VDC-INV-001)
- Native DIMO webhooks vs scheduler polls
- `obdIsPluggedIn` as physical evidence
- Low-voltage battery and GNSS on standby wakes
- Ruptela IO174 sleep timer (not visible in signalsLatest — VDC-HYP-002)
- Ruptela 0x10 heartbeat (not visible in SynqDrive ingest)
- Disconnect vs provider outage vs permission failure

## Placeholder case vehicle

See [../../evidence/LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md](../../evidence/LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md).

## Neighbor ownership

Acquisition and normalization: [DIMO Integration](../../../dimo-integration/README.md).
