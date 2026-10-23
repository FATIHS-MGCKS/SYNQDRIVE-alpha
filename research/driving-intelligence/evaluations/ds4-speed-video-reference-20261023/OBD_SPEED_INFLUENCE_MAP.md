# OBD-Speed (R1) — tatsächliche Einflussstellen im DS4-Geschwindigkeitsverlauf

Stand: Code `origin/main` `dea2555bb` (Produktions-DI). Nur **Fahrzeuggeschwindigkeit** aus dem R1_OBD-Kanal;
andere OBD-Signale sind hier nicht betroffen.

| Pfad | Überschreibt berechnete km/h? | Mechanismus | Offline-Kandidat „strip“ |
| --- | --- | --- | --- |
| **C4** (`computeC4AdaptiveL3`) | **Nein** | Nur Positionsgitter | unverändert (identisch) |
| **DI-V0 L3** (`computeDiV0TripIntervals`) | **Nein** (numerischer Wert) | `estimatedSpeedKmh` kommt ausschließlich aus `evaluateL3AtCenter` + Motion-State-Gating; R1 trägt nur Metadaten bei: `sourceRelation` (`assessSourceRelationAtLabel`), Flag `R1_INTERVAL_ONLY`, `evidenceSources` enthält `R1_INTERVAL`, `deriveValueConfidence` sinkt bei Konflikt | `r1Obd: []` im S1-Input → gleiche km/h, andere Relation/Flags |
| **Speed-QC** (`evaluateDiV0SpeedQcInterval`, POLICY_V2) | **Ja** (Produkt-Lesepfad) | `sourceRelation === CONFLICTING` → `UNTRUSTED` / `CROSS_SOURCE_CONFLICT`; R1 „Korroboration“ hebt Leg-Geschwindigkeitsgrenze (`maxLegSpeedMpsCorroborated` vs. uncorroborated); R1 bei Zentrum für Plausibilität | `r1Obd: []` → kein OBD-Veto, GPS-`GEOMETRY_JUMP` / `KINEMATIC_IMPLAUSIBLE_LEG` bleiben |
| **Motion-FSM** (`runMotionFsm` via Shadow-Prozessor) | **Nein** (km/h) | Sparse R1-Samples: `directMoving` (≥ movingBandMinKmh) kann MOVING erzwingen; `directZero` kann STATIONARY unterstützen; `SPARSE_C4_CONTRADICTION`-Flags; Stopp-/Start-Evidenz zählt Sparse-Zeilen | `sparseSpeed: null` statt pinned R1 → kein OBD-Zwang |
| **Manöver-Ereignisse** (`detectMotionManoeuvreEvents` auf C4) | **Nein** | Nur C4-Werte | unverändert |
| **Vergleichsserie `obd`** im Harness | — | Nur Metrik/CSV-Spalte `obd_kmh`; kein Rückkanal in DI | bleibt aus Container gelesen |

## Semantik L3 vs. OBD (kein Override)

`assessSourceRelationAtLabel` dokumentiert: *„R1 historical OBD is INTERVAL_ONLY — never overrides fresh L3 at a label.“*
Konflikte markieren `CONFLICTING` / `CONFLICT_EXPLAINED`, ändern aber nicht `estimatedSpeedKmh`.

## Produktions-Verdrahtung (Kontext, nicht geändert in diesem PR)

- S4-Container liefert `R1_OBD` an Trip-Speed-Quality-Evidenz und an `adaptMotionCoreShadowEvidenceFromParsedContainer` → Sparse für FSM.
- PR #2134 (offen) setzt `fsmPointAuthority: false` auf Sparse-Samples; **main** übergibt alle R1-Bucket-Werte an FSM ohne Autoritätsfilter.

## Offline-Kandidat

`--strip-obd-speed-influence` im Replay-Harness:

1. `buildDiV0S4dS1InputFromParsedContainer` → `r1Obd` geleert vor `computeDiV0TripIntervals`
2. Speed-QC mit leerer `r1Obd`-Liste
3. FSM über `runMotionFsm(..., sparseSpeed: null)` statt Shadow-Prozessor-Payload
4. OBD-Werte weiterhin in `obd_kmh` / Metrikserie `obd` für den Videovergleich

Keine Änderung am Trip-Lifecycle, an S4-Acquisition oder an anderen OBD-Signalen; kein automatisches Setzen fehlender Werte auf 0 km/h.
