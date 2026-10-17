# LDI10B — Cross-source audit

**Lineage:** DIMO_TELEMETRY_EVENTS_and_S4_R1_pin_same_vehicle_session

## OBD witness candidates (3)

Corroboration = speed agreement within existing provisional band at **both** step endpoints. **Not** independent ground truth.

| Candidate | Window | OBD offset start/end ms |
|-----------|--------|-------------------------|
| `L3_ACCEL_1` | 2026-10-13T15:53:06Z→2026-10-13T15:53:07Z | 0/0 |
| `L3_ACCEL_6` | 2026-10-13T15:53:17Z→2026-10-13T15:53:18Z | 0/0 |
| `L3_ACCEL_13` | 2026-10-13T15:53:50Z→2026-10-13T15:53:51Z | 0/0 |

## HF witness

HF witness steps: **3** (often same R1 payload as OBD — avoid double-counting as independent confirmations).

Distinct witness step IDs (union): **3**

## High-confidence vs conflicted

- HIGH confidence candidates: **59** (peaks flagged: **0**, GPS jump: **0**)
- CONFLICTED candidates: **16** — see JSON array