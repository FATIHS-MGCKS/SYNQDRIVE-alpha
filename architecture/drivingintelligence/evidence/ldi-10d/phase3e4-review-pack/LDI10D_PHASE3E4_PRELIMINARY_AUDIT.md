# LDI-10D Phase 3E.4 — Preliminary original-video audit

Six source MOV files retrieved via the supplied Google Drive URLs. Three sample frames per video (18 total). Full systematic GPS transcription and cross-source alignment NOT performed.

## Video metadata

| Video | Duration (s) | UTC creation time |
|---|---:|---|
| TC_00062.MOV | 179.875 | 2026-10-16T03:37:41.000000Z |
| TC_00063.MOV | 179.995 | 2026-10-16T03:40:41.000000Z |
| TC_00064.MOV | 179.955 | 2026-10-16T03:43:41.000000Z |
| TC_00065.MOV | 179.955 | 2026-10-16T03:46:41.000000Z |
| TC_00066.MOV | 179.995 | 2026-10-16T03:49:42.000000Z |
| TC_00067.MOV | 127.813 | 2026-10-16T03:52:42.000000Z |

## Observations

- GPS overlay includes timestamp, latitude, longitude, altitude, speed.
- Tesla instrument cluster speed is visible in multiple sample frames.
- UTC metadata vs overlay local time appears consistent with CEST (+02:00), pending systematic verification.
- A zero Tesla speedometer display appears in a sampled frame; this is not proof of a sustained standstill.
- Example visually verified frame TC_00062 at video offset 30 s: overlay 16.10.2026 05:38:11, lat +51.335267, lon +9.506096, altitude 191.8 m, speed 5.7 km/h.
- Do not infer precise road identity or algorithm accuracy from these 18 frames.

## Next work

Extract synchronized per-second GPS overlay observations with human verification for uncertain digits; identify repeated fixes; align DIMO GPS by UTC and evaluate positional differences. No production changes.
