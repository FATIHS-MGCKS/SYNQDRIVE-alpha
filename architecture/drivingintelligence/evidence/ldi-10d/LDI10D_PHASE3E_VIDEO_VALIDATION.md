# LDI-10D Phase 3E — Video / tachometer validation

| Comparison grid rows | 1136 |
| Trusted L3 vs tacho pairs (baseline) | 748 |
| Fixture reference pairs (baseline) | 748 |

**Coverage:** speed magnitude witness only where `VIDEO_TACHO_REFERENCE.json` aligns to bucket labels.
Tachometer footage does **not** independently confirm junctions, curves, traffic lights, or emergency braking.

**Limitation:** contextual event windows were not exhaustively frame-synced to video in this offline pass;
timing checks are limited to shared 1 Hz bucket labels and pinned L3 deltas.