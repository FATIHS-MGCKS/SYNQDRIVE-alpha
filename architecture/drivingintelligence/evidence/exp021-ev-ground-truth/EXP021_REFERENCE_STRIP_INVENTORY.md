# EXP021 — Inventar Referenz- und Regressions-Strips

**Stand:** 2026-10-16

## Tesla EV-Ground-Truth (Video + Pin)

| Artefakt | Pfad / ID |
|----------|-----------|
| Referenzfahrt | Trip `358d0158-b2a9-47ed-af26-33926c5770b4`, Work item `99fe9d1b-5cb6-4cbb-ba0c-e5f27a5cd50a` |
| Video-Inventar | `external-video-review-kompakt-2026-10-16/EXP021_Video_Inventar.json` (TC_00062–64 …) |
| Retrospektiv v0_2 Freeze | `forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/` (PER_EVENT_DECISIONS, VIDEO_ABC_005_008, …) |
| Semantik LONG_HALT | `EXP021_REFERENCE_SEMANTICS_LONG_HALT.md` |

## P21 Multi-Trip Manifest (ohne Video-GT)

| Artefakt | Pfad |
|----------|------|
| Frozen 10-trip binding | `architecture/drivingintelligence/evidence/data/EXP021_P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1.json` |
| Ausgeschlossene Referenz (P21) | `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` (≠ Tesla EV-GT-Trip) |

## Historische Reference-Capture-Strips (RD001–RD004)

| Strip | Kontext | Video-GT |
|-------|---------|----------|
| RD001 | Late-arrival / Gap-Differential | **VIDEO NOT CAPTURED** |
| RD002 | Motion canary C63, HF Δt | begrenzt |
| RD003 | Tiguan session | segmentiertes Video-GT |
| RD004 | Alignment / late buckets | Teile A/B |

Dokumentation: `architecture/drivingintelligence/research/CHANGE_LEDGER.md` (Phase 3A.x).  
**Nicht** in diesem Lauf gegen v0_2 gebündelt — Pins/Loader-Pfade differieren von P21-Forensik; RD003/004 für **gezielte** nächste Video-Fälle (Stop-and-go, Lücken) vorgemerkt.

## Stationäre Evidenz-Oberfläche (Tesla Pin)

`forensic-readonly-exports-2026-10-16-stationary-evidence-surface/` — ROW_ABSENT / R1-Lücken im Haltfenster (Qualitätskontext, kein Detektor-Tuning).

## Verwendbarkeit für Übertragbarkeitslauf

| Strip-Satz | v0_2 offline | Unabhängiges Video |
|------------|--------------|-------------------|
| Tesla EV-GT + Freeze-Export | **ja** | **partiell** (Kompakt-Review) |
| P21 10-trip manifest | **ja** (DB read-only) | **nein** |
| RD001–RD004 | späterer Scope | RD003 am stärksten |
