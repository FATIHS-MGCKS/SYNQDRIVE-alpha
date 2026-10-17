# Tesla 2026-10-16 GPS research fixture schema

| File | Role |
| --- | --- |
| `POSITION_CHANNEL_SNAPSHOT_V0_1.txt` | Raw S4 POSITION channel payload (LF JSON lines) |
| `TESLA_POSITION_GRID.json` | Parsed 1 Hz buckets + QC join (no interpolation) |
| `VIDEO_TACHO_REFERENCE.json` | Synchronized video tacho witness (not GPS ground truth) |
| `PROVENANCE_MANIFEST.json` | Recovery provenance + hash parity |
| `SHA256SUMS` | Integrity |

Missing seconds remain `ROW_ABSENT` with null coordinates — never synthesized.