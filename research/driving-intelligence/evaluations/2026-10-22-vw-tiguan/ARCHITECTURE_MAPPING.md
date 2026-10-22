# Zuordnung: DS4, DS4 Motion, S4 (Code ↔ Auswertung)

Stand: Repository-Branch `cursor/ds4-tiguan-video-eval-20261022-192d` (Basis `origin/cursor/exp021-ev-ground-truth-7d78`), Codeinspektion 2026-10-22.

## Kurzfassung für diese Videoreferenz-Auswertung

| Nutzer-/Berichtsbegriff | Technischer Name im Code | Persistenz / Output dieser Fahrt |
| --- | --- | --- |
| **S4 (Foundation)** | S4A Evidence + Work Items | `di_v0_s4_evidence_snapshots`, `di_v0_s4_work_items` — eingefrorene POSITION + R1_OBD Kanäle |
| **DS4 (kinematisch)** | DI V0 **S4 Shadow** → L3-Intervalle | `di_v0_shadow_runs`, `di_v0_shadow_intervals` — `estimated_speed_kmh`, `motion_state`, … |
| **DS4 Motion** | Motion Core Shadow Worker | `di_v0_motion_core_shadow_runs_v1` — Payload mit `speeds`, `fsmLabels`, `events` |
| **S4 Research / M7A** | `s4-research-worker`, M7A shadow | **Nicht** Gegenstand dieser Tacho-Auswertung; M7A in Production pausiert |

Der Begriff **„DS4“** wird im Repository selten als Literal verwendet; er bezeichnet hier den **operationalisierten S4-Shadow-Kinematikpfad** (L3 in Shadow-Intervallen), der für Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` nach COMPLETED PRIMARY Work Item persistiert wurde.

## Module (Pfad unter `backend/src/modules/vehicle-intelligence/driving-intelligence/`)

| Modul | Rolle |
| --- | --- |
| `s4a-foundation/` | Evidence-Container, Snapshot-Hash, Work-Item-Zustände (S4A Contract V2) |
| `s4b-orchestration/` | Discovery/Claim (dormant bis aktiviert) |
| `s4c-executor/` | Kanal-Akquisition in Evidence |
| `s4d-replay/` | Offline-Replay aus gepinntem Container → S1 Input |
| `core/` | Pure L3/S1/QC-Bibliothek (`computeDiV0TripIntervals`) |
| `motion-core-shadow-worker/` | C4 + Motion FSM + Events → gzip Payload |
| `s4-research-worker/` | OSM/Viterbi-Forschung (separater Pfad) |
| `m7a-road-assignment-shadow-worker/` | Straßenzuordnung-Shadow (nicht validiert durch Tacho-Video) |

## Ausgaben pro Sekunde (diese Fahrt)

### Shadow-Intervalle (`di_v0_shadow_intervals`)

- **Zeitsemantik:** `reference_time` = Kalendersekunde (Bucket-Label).
- **Geschwindigkeit:** `estimated_speed_kmh` (L3; kann leer sein bei Abstention).
- **Bewegung:** `motion_state` z. B. `MOVING_SPEED_ESTIMATED`, `STATIONARY_SUPPORTED`, `NO_MOTION_EVIDENCE`, `TRANSITION_UNCERTAIN`.
- **Qualität:** `speed_evidence_state`, `claim_level`, `abstention_reason`.

### Motion-Core-Shadow-Payload

- `speeds[]`: `bucketLabelUtc`, `speedKmh`, `quality`, `estimator`, `flags`.
- `fsmLabels[]`: `state`, `evidenceQuality`, `reason`.
- `events[]`: Manöver mit `kind`, `startLabel`/`endLabel`, `deltaKmh`.
- `contract.timeSemantics.processingMode` = `POST_TRIP_RETROSPECTIVE`.

### S4 Evidence Container

- Kanäle: `POSITION`, `R1_OBD` (PRESENT für diese Fahrt), `NATIVE_EVENT` (DISABLED FLAG_OFF).
- Parser: `parseDiV0S4EvidenceContainer`, `parseDiV0R1ObdSnapshot`.

## Autoritative Architektur-Dokumentation

- Registry: `architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md` (Modul Driving Intelligence).
- `architecture/drivingintelligence/CURRENT_STATE.md` (DI V0 Shadow, S4A, Motion Core).
