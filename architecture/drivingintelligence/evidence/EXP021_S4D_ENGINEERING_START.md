# EXP-021 S4D engineering start

**Main baseline:** `78ee9909c24611f01432dcfa2ca6c95818bd74ef`  
**Production (unchanged):** `6952fdf727f236ac7b338e14b85d54af6733fa0f`

## Delivered (dormant)

- Strict parsers: `DI_V0_S4_EVIDENCE_CONTAINER_V1`, position `V0_1`, R1 `V0_3` (byte-for-byte round-trip).
- `readVerifiedPinnedEvidence` (read-only, lease-fenced): gunzip → re-hash → container parse before S1.
- S4C executor composes S4D pinned replay (single registry executor; no AppModule wiring).
- Native: no payload under channel policy V1; no fabrication.

## Gap closure

`DI-GAP-S4-REPLAY-DESERIALIZER-001` → **CLOSED** (implementation status in `s4a-contract.v2.json`).

## Not activated

S4B/S4C/S4D remain dormant; no deploy; no production provider or S4 writes.
