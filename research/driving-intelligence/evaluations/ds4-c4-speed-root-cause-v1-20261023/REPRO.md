# REPRO — C4 Speed Root Cause V1

## Produktions-Code-Parität

| Check | Wert |
| --- | --- |
| Gepinntes Produktions-SHA | `579ee8b2fed06593d7d2aa57cffb6036dbf53a24` |
| Replay `git diff` auf `backend/.../driving-intelligence/` | **0 bytes** (Skript bricht sonst ab) |
| C4-Version | `MOTION_CORE_SPEED_C4_V0_5_DEV` |
| Leg-Gate | `MOTION_CORE_LEG_CONSISTENCY_V0_5_DEV` |

## Versiegelte Eingaben

| Fall | Datei | Trip-ID | Rolle |
| --- | --- | --- | --- |
| TES16 | `architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/TESLA_POSITION_GRID.json` | `358d0158-b2a9-47ed-af26-33926c5770b4` | POSITION grid + QC join |
| TES16 | `.../VIDEO_TACHO_REFERENCE.json` | (gleich) | Video-Referenz |
| TES16 | `.../PROVENANCE_MANIFEST.json` | pinned snapshot hash | Provenance |
| TIG22 | `research/.../ds4-speed-video-reference-20261023/inputs/tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin` | `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` | POSITION + R1_OBD pinned |

Hashes der **generierten** Outputs: `outputs/manifest.json` (nach Lauf).

Wiederverwendung:

- Loader-Logik: `../ds4-accel-brake-video-reference-20261023/scripts/replay_event_eval.cjs`
- Sonden: `../ds4-accel-brake-video-reference-20261023/outputs/match2s/PROBES.md`
- Trip-Ende: `../ds4-accel-brake-video-reference-20261023/outputs/match2s/TIG22_TRIP_END_FORENSIC.md`

## Kommandos

```bash
cd research/driving-intelligence/evaluations/ds4-c4-speed-root-cause-v1-20261023
node scripts/build_traces.cjs --code-root /path/to/repo --expect-sha 579ee8b2fed06593d7d2aa57cffb6036dbf53a24
```

Voraussetzung: `backend/node_modules` + sauberes DI-Verzeichnis im `--code-root`.

## Datenschutz

Trace-CSV enthält **keine** Lat/Lon — nur Beinlängen in Metern und Geschwindigkeiten. Rohkoordinaten verbleiben in den versiegelten Fixtures (nicht in diesem Report dupliziert).
