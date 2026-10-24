# DS4 Acceleration & Braking Intelligence — unabhängige Algorithmus-Recherche und Adversarial Review (Fable, READ-ONLY)

**Datum:** 2026-10-24 · **Modus:** Deep Research / strikt read-only · **Production-Baseline:** `7340637274c40d4fc03d968cdb943f16171a4a39`

Dieses Dokument verändert keinen Algorithmus, aktiviert nichts und deployt nichts. Alle Zahlen stammen aus reproduzierbaren Replays auf den vier gepinnten Referenzfahrten (siehe `REPRO.md`). Was nicht aus Replays oder Code belegbar ist, ist ausdrücklich als **HYPOTHESE** markiert.

---

## 0. Kurzfassung

| Frage | Antwort (belegt) |
|---|---|
| Ist der Produktions-Detektor grundsätzlich brauchbar? | Ja. EVAL-Pool (TIG22 + TES16): 37 akzeptierte Events, 27 TREFFER, 1 harter Fehlalarm, 1 harter Miss, 7 grenzwertige Misses, 0 Fragmente, 0 Duplikate. |
| Wo liegen die bestätigten Defekte? | (B1) K3-Spike-Prüfung ist blind, wenn das **Startsample selbst** das Artefakt ist (TES16 03:50:20). (B2) Keine Physik-Schranke: zwei physikalisch unmögliche Events (TIG22 19:04:34 5,5→100,1 km/h in 4 s; 19:04:49 52,3→142,1 km/h in 3 s) werden akzeptiert und ohne Markierung angezeigt. (B3) Systematische Intensitäts-Unterschätzung (−0,13 bis −0,55 m/s²), weil 1-s-Differenzen von C4 effektiv einen 3-s-Kernel haben. |
| Was bringt C5.1 V1.2 gegenüber C4 für Events? | In-sample nachweisbar, aber klein: entfernt genau den TES16-Fehlalarm (zwei REPAIR_ACCEPTED-Reparaturen). Auf TIG22/TES21-1/TES21-2 identisch zu C4. TES16 war C5.1-Entwicklungsdatensatz (#2144) → **kein unabhängiger Beleg**. Keine Verschlechterung beobachtet. |
| Hilft FSM V0.4 + Gap Bridge V1.3.1 den Events? | Nein (als Evidenz). Die FSM ist C4-gespeist, meldet während des unplausiblen 19:04-Schwanzes durchgehend `MOVING` und liefert keine unabhängige Geschwindigkeit. Einziger legitimer Kontextnutzen: `STATIONARY→STARTING` als Anfahr-Marker (TIG22 18:44:17), nicht als Manöver-Event. |
| Beste kleine Korrektur | Zwei additive Guards, beide nur als `ARTEFACT_SUSPECT`-Markierung bzw. Akzeptanz-Gate, kein Threshold-Shift: **Spike-Bracket/K-B** (behebt B1) + **Physik-Hüllkurve** (behebt B2). In-sample regressionsfrei: 27/27 TREFFER bleiben, 0 Fragmentierung, DEV unverändert. |
| Bester alternativer Algorithmus | Keiner ist auf dieser Datenbasis dem Baseline-Detektor überlegen. Leg-Chord-Detektor (2-s-Kernel) verbessert Intensität und den unplausiblen Schwanz, erzeugt aber 2 neue harte Fehlalarme vor dem GPS-Ausreißer 18:49 und kollabiert bei 2-s-Kadenz (TES21-1). 3-Punkt-Regression ist auf EVAL schlechter. |
| Empfehlung | **A: kleine Korrektur umsetzen (2 Pakete), kein neuer Detektor, kein ML, keine Threshold-Änderung.** Intensitätsklassifikation nur als Hypothese auf Δv/Dauer-Basis mit `UNRATED` für nicht-OK-Qualität. |

---

## 1. Scope, Baseline, Datenintegrität

### 1.1 Referenzen (vollständig gelesen, Branch-Heads direkt ausgecheckt)

| PR | Branch-Head | Verwendung |
|---|---|---|
| #2133 | `36cbd9825` | Tiguan 1-Hz-Video-Referenz (TIG22) |
| #2136 | `db6ce37dd` | Speed/GPS-Referenz TIG22/TES16/TES21-1/TES21-2, `eval_lib.cjs` |
| #2139 | `6d1de00e5` | Beschleunigungs-/Brems-Orakel, `replay_event_eval.cjs`, `event_eval_lib.cjs`, `EVALUATION_RULES.md`; **nur `v2_gap2s`/`match2s`** verwendet, nicht `v1` |
| #2148 | `d5659ba2a` | TIG22 Deep Validation (`per_second.csv`, FSM-Lag an Halten) |
| #2147 | (auf `main`) | Archive-Index #2140–#2144 |
| #2150/#2151 | (auf `main` als `7340637`) | FSM Gap Bridge V1.3.1 |

Produktionscode: `backend/src/modules/vehicle-intelligence/driving-intelligence/` auf `7340637`. `git diff 7340637 origin/main -- <DI-Verzeichnis>` = 0 Zeilen (origin/main `393ae9da2` enthält nur #2152 DTC/VSI).

### 1.2 Ground-Truth-Integrität

- **TIG22** (EVAL): Video-GT nur bis **19:03:02 UTC**. Alles ab 19:03 ist **nicht video-validiert** und wird hier ausschließlich auf Plausibilität geprüft (Fenster 19:04 → Klasse `UNVERIFIZIERBAR`, nie als TREFFER gezählt).
- **TES16** (EVAL): Video-Referenz vollständig; aber TES16 war **C5.1-Entwicklungsdatensatz** (#2144). Für die C5.1-Bewertung ist TES16 daher **nicht unabhängig**.
- **TES21-1 / TES21-2** (DEV): in der Detektor-Entwicklung verwendet; getrennt gepoolt, nie als Validierung ausgegeben.
- Es wurden **keine neuen Videos, keine manuellen Nacherfassungen** verwendet; die Orakel-/Operator-Tabellen von #2139 sind unverändert übernommen (Vergleich der Baseline-Ausgaben: `IDENTICAL_TO_PR2139_match2s`).

### 1.3 Produktions-Flag-Zeitleiste (für die Zuordnung der Replays)

| Zeitpunkt (UTC) | Zustand | Bedeutung für Events |
|---|---|---|
| bis 2026-10-23 21:47 | C4-only (`speedAuthority = C4_ONLY`) | TIG22 Production-Run `15cdc8ae` (2026-10-22) wurde mit **C4** gerechnet → `prodIdentical=true` zum Replay BASE |
| ab 2026-10-23 21:47:00 | `DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED=true` | Events auf C5.1-Preferred-Serie (nur Tiguan/Tesla-eligible) — Replay-Kandidat **C51** |
| ab 2026-10-24 09:50:18 | `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED=true` | FSM-Labels V0.4; Events **unverändert** (Detektor ist FSM-frei) |

---

## 2. Architektur-Trennung: vier Ebenen, die nicht vermischt werden dürfen

| Ebene | Quelle | Code | Verhältnis zu den anderen Ebenen |
|---|---|---|---|
| (1) **Geschwindigkeit** | GPS-Positionen → C4 adaptive L3 → optional C5.1 Gated Repair | `core/kinematics/c4-adaptive-l3.ts`, `robust-path-slope.ts`, `frozen-l3-replay.ts`, `c5-1-gated-repair.ts` | C4 = zentrierte 2-s-Sehne (t−1→t+1) wenn Legs OK, sonst Theil–Sen-Steigung über ±2 s. C5.1 ersetzt einzelne Samples nur im Repair-Fenster (`REPAIR_ACCEPTED` → Qualität `REPAIRED`). |
| (2) **Bewegung** | FSM V0.4 auf C4 (+ sparse R1-Speed, + Gap-Bridge-Auxiliary aus DI-V0-Trip-Intervallen) | `motion-fsm.ts`, `motion-fsm-gap-bridge-v1.ts`, `di-v0-motion-core-fsm-gap-bridge-auxiliary.ts` | **Konsument** von (1); liefert Labels, **nie** Geschwindigkeit. Der Prozessor speist die FSM immer mit `c4`, nicht mit der C5.1-Serie (`di-v0-motion-core-shadow-processor.ts`, `runMotionFsm(kinBuckets, c4, …)`). |
| (3) **Beschleunigungs-Ableitung** | 1-s-Differenz der Event-Speed-Serie | `motion-event-detector.ts` Zeile 133–134: `a = sign·(v[i]−v[i−1])/3.6/dt` | Keine eigene Glättung; der Kernel ergibt sich aus (1): C4-Differenz ≈ 3-s-Kernel. |
| (4) **Event-Erkennung, Qualität, Produktanzeige** | Detektor, Persistenz, Trip-Map-Mapper, Frontend | `motion-event-detector.ts`, `di-v0-motion-core-shadow.types.ts` (`mapMotionManoeuvreEventToPersisted`), `di-v0-motion-core-shadow-trip-map-read.mapper.ts`, `frontend/src/rental/components/trips/motion-map.utils.ts`, `TripMotionMapPopover.tsx` | Persistiert nur `kind, start/end, start/end speed, deltaKmh, quality, flags` — **keine Dauer, kein Mittel, kein Peak**. Trip-Map-DTO setzt `peakAccel1sMps2: null`; Frontend zeigt Δv und `artefactSuspect`, **nicht** `DEGRADED`/`LIMITED`. |

**Invariante (bestätigt):** FSM-inferierte Bewegung wird nirgends als Geschwindigkeit verwendet. Die Gap Bridge erzeugt Labels (`STATIONARY_SUPPORTED`-Auxiliary ist positionsbasiert), keine Werte. Umgekehrt ist die FSM dadurch **nicht unabhängig** von (1) — siehe §7.

---

## 3. Aktueller Event-Detektor — Parameter verifiziert auf `7340637`

`detectMotionManoeuvreEvents(trip, samples, source, usableQualities, options)`:

| Parameter | Wert | Quelle |
|---|---|---|
| `MOTION_EVENT_HF_THRESHOLDS_V1` | entry 1,5 · continue 1,2 m/s² · minSteps 2 · minΔv ACCEL 4,0 / DECEL 3,0 km/h · mergeGap ACCEL 2,0 / DECEL 1,5 s | `motion-event-detector.ts` Z. 8–15 |
| `MOTION_CORE_EVENT_GUARDS_V0_1_DEV` | maxGapS 2 · postGapGuardS 2 (nur Segmentanfang) · usable = OK, SPARSE_SUPPORT, JITTER_SUSPECT, REPAIRED, SPAN_SUPPORT, SPAN_DERIVED | Z. 17–29 |
| `MOTION_EVENT_V0_2_CANDIDATE_OPTIONS` | `spikeReversionCheck: true` (K3), Fenster 2 s, Vergleich gegen **Startgeschwindigkeit** des Events | Z. 49–54, 239–280 |
| `eventQuality` | alle OK → `OK`; JITTER_SUSPECT oder REPAIRED → `DEGRADED`; sonst → `LIMITED` | Z. 91–100 |
| Akzeptanz (Produkt) | alles außer `ARTEFACT_SUSPECT` wird gleichwertig persistiert; Frontend markiert nur `artefactSuspect` | Mapper + Frontend |
| Physik-Schranke | **keine** | — |
| Vehicle-Class für Events | **keine** (Klasse existiert nur für C5.1: `resolveC5_1PlausibilityClassForEligibleVehicle(make, model)`, Fallback `'TESLA'`) | `di-v0-motion-core-shadow.service.ts` |

Der Detektor hat **keine FSM-Eingabe** (Kommentar Z. 103–104 bestätigt durch Code).

---

## 4. Replay-Baseline (Production-Detektor, `v2_gap2s`)

`node scripts/replay_event_eval.cjs --code-root <7340637> --tag fable_base_7340637 --matching v2_gap2s --expect-sha 7340637…` → `outputs/baseline_fable_base_7340637/` (identisch zu PR #2139 `match2s`; TIG22 `prodIdentical=true` gegen Production-Payload Run `15cdc8ae`).

| Fahrt | Rolle | DS4-Events | Klassen | Orakel-Status |
|---|---|---|---|---|
| TIG22 | EVAL | 20 | TREFFER 12 · UNVERIFIZIERBAR 8 (alle ≥ 19:03) | ERKANNT 12 · VERPASST 1 · VERPASST_GRENZWERTIG 4 · VERPASST_KEINE_DS4 1 |
| TES16 | EVAL | 17 | TREFFER 15 · FEHLALARM 1 · FEHLALARM_UNBESTIMMT 1 | — |
| TES21-1 | DEV | 4 (3 akzeptiert) | TREFFER 2 · WEICHER_FEHLALARM 1 · FEHLALARM 1 (K3-markiert) | — |
| TES21-2 | DEV | 4 | TREFFER 4 | — |

Intensitäts-Bias (TREFFER-Paare, DS4 − Orakel, m/s²): TIG22 mean −0,389 / peak2 −0,372 / peak1 −0,553; TES16 −0,147 / −0,130 / −0,171; TES21-1 −0,226; TES21-2 −0,348. **Durchgehend negativ** → systematische Unterschätzung, nicht Rauschen.

---

## 5. Unabhängiges Bug-Audit

Legende Schweregrad: **HOCH** = Produkt zeigt falsche/unmögliche Information ohne Markierung · **MITTEL** = messbarer Qualitätsverlust, Produkt heute nur mittelbar betroffen · **NIEDRIG** = bekannte Grenze, kein sicherer Fix.

### B1 — K3 ist blind für V/Λ-Artefakte, deren Startsample selbst das Artefakt ist · **BESTÄTIGT · MITTEL**

- **Beispiel (EVAL, TES16 03:50:20–23):** Referenz flach 133 km/h. C4: 129,4 → **113,1** (SPARSE_SUPPORT, Schritt −4,53 m/s²) → Lücke → 128,2 (JITTER_SUSPECT, +2,09) → **148,3** (JITTER_SUSPECT, +5,59) → 126,5 (−6,05). Positions-Chord bei 03:50:22 = 256 km/h (Timing-Jitter). Es entsteht ein ACCEL-Event 113,1→148,3 km/h, Δv 35,2, Qualität `DEGRADED`, akzeptiert.
- **Ursache (Code):** `applySpikeReversionCheck` vergleicht Folgewerte mit `seg[s0].valueKmh` (= 113,1, der Dip). 126,5 liegt 13,4 km/h über dem Start → keine Reversion → nicht markiert. Die Prüfung erkennt Λ-Spitzen, aber nicht „Dip → Spitze → Baseline“.
- **Kleinste sichere Korrektur:** zusätzliche Markierung als `ARTEFACT_SUSPECT` (Event bleibt erhalten), wenn der Schritt **in** das Startsample (`s0−1 → s0`, gleiches Segment) ≤ −entry **und** der Schritt **aus** dem Endsample (`s1 → s1+1`, ≤ K3-Fenster 2 s) ≤ −entry ist (Kandidat **BRACKET**) — oder äquivalent die K-B-Formulierung aus #2139 (Pre-Event-Baseline-Reversion, Kandidat **KB**). Beide ändern in-sample **genau dieses eine Event** und sonst nichts (4 Fahrten). Für die Umsetzung sollte die bestehende K3-Ausnahme `oppositeFollows` (reales Accel→Decel) mitgelten; das in-sample markierte Event hat kein Folge-Event entgegengesetzter Art, das Ergebnis bleibt damit identisch.
- **Nicht gewählt:** Entfernen des Events, Ausschluss von `JITTER_SUSPECT` aus `usableQualities` (würde TIG22-TREFFER kosten, nicht getestet weil Abdeckung reduzierend), Threshold-Anhebung.

### B2 — Keine Physik-Schranke: physikalisch unmögliche Events werden akzeptiert und unmarkiert angezeigt · **BESTÄTIGT · HOCH (Produktvertrauen), niedrige Häufigkeit**

- **Beispiele (TIG22 Schwanz 19:04, kein Video, Plausibilität):**
  - 19:04:34–38: 5,5 → 100,1 km/h in 4 s, mittlere Beschleunigung **6,57 m/s²** (Qualität `LIMITED`). Für einen VW Tiguan (Nameplate ≤ 150 kW, 0–100 ≥ 6 s) unmöglich; C4-Schritte 6,74 / 6,40 m/s² auf SPARSE_SUPPORT mit NO_POSITION-Lücke bei 19:04:35 und OUTLIER_REJECTED bei 19:04:37.
  - 19:04:49–52: 52,3 → 142,1 km/h in 3 s, mittlere Beschleunigung **8,31 m/s²** (Qualität `DEGRADED`, Schritte 7,05 / 10,85 m/s² auf JITTER_SUSPECT).
- **Ursache (Code):** Der Detektor kennt weder Fahrzeugklasse noch Hüllkurve; Akzeptanz = „nicht `ARTEFACT_SUSPECT`“. Die Qualitätsstufe `LIMITED`/`DEGRADED` wird in Trip-Map-DTO/Frontend nicht sichtbar.
- **Mechanismus der Speed-Ebene:** C4 ≈ 2× OBD-Referenz im Schwanz (#2148); C5.1 V1.2 lehnt hier Reparaturen **fail-closed** ab (`INSUFFICIENT_EVIDENCE` bei 19:04:36/38, `worsens_triple_accel` bei 19:04:39/40/48, `no_candidate` bei 19:04:51/52) → C5.1-Serie identisch zu C4 → Events bleiben.
- **Kleinste sichere Korrektur:** Akzeptanz-Gate auf dem **Event-Mittel** (nicht auf Einzelschritten), nur für Events mit Dauer ≥ 2 s: `a_mean ≤ min(a_launch, P_wheel/(m·v_low))` für ACCEL mit `v_low = max(min(v_start, v_end), 5 m/s)` (vermeidet die 1/v-Singularität), `|a_mean| ≤ a_decel` für DECEL, mit konservativen Nameplate-Konstanten pro Klasse (TIGUAN 1800 kg / 150 kW / 4,5 / 9,0; TESLA 2000 kg / 400 kW / 9,0 / 9,0). Verletzung → `ARTEFACT_SUSPECT` + Flag `PHYSICS_ENVELOPE_VIOLATION`. Klasse aus dem bestehenden C5.1-Resolver; **Fallback = permissivste Klasse** (TESLA), damit unbekannte Fahrzeuge nie fälschlich verworfen werden. In-sample betrifft das genau die beiden genannten Events — beide verletzen die Launch-Grenze 4,5 m/s² (Kandidat **PHYS_MEAN**; `PHYS_PEAK2` identisch, aber anfälliger für Kernel-Effekte → nicht empfohlen).
- **Nicht gewählt:** Tiguan-spezifische Thresholds, Fahrzeugklasse in den Detektor-Kern ziehen (Detektor soll neutral bleiben), Verwerfen statt Markieren.

### B3 — Systematische Intensitäts-Unterschätzung durch den impliziten 3-s-Kernel · **BESTÄTIGT · MITTEL (heute kein Produkt-Impact, blockiert Intensitäts-Features)**

- **Befund:** Bias −0,13 … −0,55 m/s² auf allen vier Fahrten (Tabelle §4); peak1 am stärksten betroffen (TIG22 −0,553).
- **Ursache:** C4 ist eine zentrierte 2-s-Sehne; die 1-s-Differenz zweier Sehnen ist ein Beschleunigungs-Schätzer mit ~3 s effektiver Breite. `MOTION_EVENT_HF_THRESHOLDS_V1` wurden für direkte 1-Hz-Geschwindigkeiten entworfen (`trips/hf-acceleration.ts`), nicht für diesen Kernel. Zusätzlich beginnen/enden Events ~1 s spät (Start-Offset-Median TIG22 −1 s).
- **Produktrelevanz heute:** keine — Persistenz und Trip-Map tragen weder Mittel noch Peak (`peakAccel1sMps2: null`). Relevanz entsteht erst mit einer Intensitätsklassifikation (§9).
- **Kleinste sichere Korrektur:** keine im Detektor. `peakAccel1sMps2` **nicht** exponieren; Intensität, falls gewünscht, ausschließlich aus `deltaKmh` und Dauer (Mittelwert) ableiten und den bekannten Bias in den Klassengrenzen berücksichtigen.
- **Nicht gewählt:** Threshold-Senkung zur Bias-Kompensation (verschiebt Toleranzen, erzeugt FA auf DEV), Leg-Chord-Serie als Event-Input (siehe §8, LEG).

### B4 — Harter Miss TIG22 18:44:16–18 (Anfahren 0→15 km/h, Peak 2,5 m/s² laut Video) · **BESTÄTIGT · NIEDRIG (kein sicherer Fix)**

- **Mechanismus:** C4 4,0 → 8,7 → 14,0 km/h = Schritte **1,30 / 1,48 m/s²**, beide < entry 1,5. Davor FROZEN_POSITION-Lücken (18:44:14/15, Flag `IDENTICAL_COORDINATES_STALE_FIX_SUSPECT`). Rohe Vorwärts-Chords (1,4 → 5,4 → 12,0 → 16,0 km/h) liefern ebenfalls nur einen Schritt ≥ 1,2 m/s².
- **Widerlegte Hypothese:** Post-Gap-Guard als Ursache. Kandidat `NOGUARD_STANDSTILL` (Guard entfällt bei Segmentstart < 5 km/h) ändert **kein einziges Event** auf vier Fahrten.
- **FSM-Kontext:** `STATIONARY` bis 18:44:16, `STARTING` 18:44:17, `MOVING` ab 18:44:18 — die FSM erkennt das Anfahren 1 s nach Video, aber als Zustandswechsel, nicht als Manöver.
- **Korrektur:** keine ohne Threshold-Senkung; Threshold-Senkung ist mit vier Fahrten nicht validierbar → **bekannte Grenze dokumentieren**.

### B5 — Vier grenzwertige Misses TIG22 (18:41:11, 18:42:56, 18:58:47, 19:02:33) · **BESTÄTIGT · NIEDRIG (by design)**

C4-Schritte 1,30–1,45 m/s² (Referenz-Peaks 1,67–1,94 m/s²), alle innerhalb des Grenzbands 0,6 m/s² der `EVALUATION_RULES.md`. Mit Kernel-Bias ≈ 0,4 m/s² erwartbar. Keine Korrektur ohne Toleranzverschiebung.

### B6 — GPS-Ausreißer-Cluster TIG22 18:49 · **KEIN DEFEKT (Guard-Kette funktioniert)**

Vorwärts-Chords 1773–2015 km/h bei 18:49:13–22; 11 s `OUTLIER_REJECTED` (`IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN`, `POSITION_OUTLIER_CHORD_DEVIATION`) + 2 s `NO_SUPPORT` → Segment bricht → kein Fehlalarm. Referenz 65–73 km/h, C4 danach 64,7 (OK). Die Quarantäne arbeitet korrekt.

### B7 — Produkt-/Qualitätsebene · **BESTÄTIGT · NIEDRIG–MITTEL**

- `DEGRADED`/`LIMITED` werden an die Trip-Map durchgereicht (`quality`), aber im Frontend nicht gerendert; nur `artefactSuspect` wird visualisiert. Nutzer sehen B2-Events wie OK-Events.
- Die Qualitätsstufen kodieren **Datenherkunft**, nicht Plausibilität: 19:04:34 (`LIMITED`, nur SPARSE_SUPPORT) ist physikalisch unmöglich, 19:04:49 ist `DEGRADED`. K-A2 (nur OK/LIMITED akzeptieren) entfernt 19:04:49 **nicht aber 19:04:34** und kostet auf DEV einen Soft-FA ohne TREFFER-Gewinn → Qualität allein ist kein Plausibilitätsersatz.
- Persistierte Zeile trägt keine `durationS`/`meanAccelMps2` → jede Intensitätsanzeige bräuchte eine Schema-Erweiterung; Dauer ist aus `start/endLabel` ableitbar, Mittel aus `deltaKmh/Dauer`.

### Geprüft und ohne Befund

| Prüfpunkt | Ergebnis |
|---|---|
| Duplikate / Fragmentierung / Merging | `fragments_accepted = 0` auf allen Fahrten; Merge-Logik (`mergeGapS`) erzeugt keine Doppel-Events |
| 1–3-s-Lücken | 2-s-Lücke innerhalb eines Segments wird als ein Schritt mit `dt = 2` gemittelt und zählt als ein Step (konsistent, `coverageRatio` dokumentiert es); > 2 s bricht das Segment (Guard) |
| Über-Glättung | nur als Kernel-Effekt (B3), keine zusätzliche Filterung im Detektor |
| Kurze Manöver | `minSteps 2` + Kernel-Bias verfehlt 2-s-Anfahrer (B4/B5); keine falschen Kurz-Events |
| Falsche Start-/Endzeiten | Median-Offsets −1 s (Start) / −0,5 bis +2 s (Ende); innerhalb „±1 s Label + unvalidierter Clock-Offset“ |
| Akzeptanz ohne Evidenz | B2 (physikalisch), ansonsten keine Events außerhalb von Segmenten mit ≥ 3 nutzbaren Samples |

---

## 6. Tatsächlicher Nutzen von C5.1 V1.2 gegenüber C4 für Events

Replay-Kandidat **C51** = Produktions-Detektor auf `computeC5_1GatedRepair(buckets, {vehicleClass}).samples` (exakt die Bundle-V2/V4-Verdrahtung des Prozessors).

| Fahrt | Rolle | Ergebnis gegenüber BASE | Mechanismus |
|---|---|---|---|
| TES16 | EVAL (**C5.1-Dev-Set**) | 17 → 16 Events; harter FA 03:50:20 **entfällt**; 15 TREFFER unverändert | `REPAIR_ACCEPTED` bei 03:50:20 (113,1 → 129,6) und 03:50:23 (148,3 → 125,9); Dip und Spitze verschwinden gleichzeitig |
| TIG22 | EVAL | **identisch** (20 Events, 12 TREFFER, 2 unplausible bleiben) | 1 `REPAIR_ACCEPTED` außerhalb von Event-Fenstern; im 19:04-Schwanz fail-closed (`INSUFFICIENT_EVIDENCE`, `worsens_triple_accel`, `no_candidate`); 18:44 außerhalb des Repair-Fensters |
| TES21-1 / TES21-2 | DEV | **identisch** | keine akzeptierten Reparaturen in Event-Fenstern |

**Bewertung:** Der Nutzen ist **nachweisbar, klein (1 Event) und nicht unabhängig** — TES16 ist der Datensatz, an dem C5.1 entwickelt wurde. Eine Verschlechterung tritt in-sample nicht auf; die V1.2-Fail-closed-Logik verhindert korrekt Reparaturen ohne Evidenz, kann aber die B2-Events nicht entfernen, weil sie keine Plausibilitätsinstanz ist. Für Events ist C5.1 damit **kein Ersatz für B1/B2-Guards**, und B1/B2-Guards sind **kein Ersatz für C5.1** (unterschiedliche Ebenen). Seit 2026-10-23 21:47 UTC läuft Production mit C5.1-Preferred-Serie; BASE und C51 sind auf drei von vier Fahrten identisch.

---

## 7. FSM V0.4 + Gap Bridge V1.3.1 als unabhängiger Kontext für Events

Probe `scripts/probe_fsm.cjs` (FSM V0.3 vs. V0.4 mit leerer Auxiliary-Menge; die `STATIONARY_SUPPORTED`-Intervalle liegen in DI-V0-Trip-Intervallen, die die Offline-Container nicht enthalten — dokumentierte Replay-Grenze):

| Fenster | FSM | Aussage |
|---|---|---|
| TIG22 18:44:08–22 (harter Miss) | `STATIONARY` bis :16, `STARTING` :17, `MOVING` ab :18 | FSM markiert das Anfahren — als Zustand, 1 s nach Video; nutzbar als **Anfahr-Marker**, nicht als Beschleunigungs-Event und ohne Intensität |
| TIG22 19:04:28–53 (unplausibler Schwanz) | durchgehend `MOVING` (kurz `STOP_CANDIDATE` :31–:33, :35) | FSM widerspricht den unmöglichen Events **nicht**, weil sie dieselbe C4-Serie konsumiert → **zirkulär**, keine unabhängige Evidenz |
| TES16 03:50:16–26 (FA) | durchgehend `MOVING` | kein Beitrag |

**Bewertung:** Kein Event-Nutzen als Evidenz. Die Gap Bridge liefert Labels für Lücken, **keine Geschwindigkeiten**; aus ihr dürfen keine Δv oder Beschleunigungen abgeleitet werden. Der einzige legitime Verwendungszweck für Events ist ein FSM-Übergang `STATIONARY→STARTING` als Kontext für die Anzeige `displayKind = START` — das ist heute bereits über `startSpeedKmh < 5` abgedeckt, ohne FSM-Kopplung. Empfehlung: **keine FSM-Kopplung in den Detektor**.

---

## 8. Alternativen — fairer Vergleich auf denselben gepinnten Daten

Harness `scripts/candidates_ab.cjs`: generische Re-Implementierung des Detektors mit Hooks; **Paritätsprüfung gegen den Produktionscode auf allen vier Fahrten bestanden** (`run.log` Zeile 1). Alle Kandidaten verwenden **dieselben Thresholds**, Matching `v2_gap2s`, Grenzband 0,6 m/s². EVAL = TIG22 + TES16, DEV = TES21-1 + TES21-2 (nie gepoolt).

| Kandidat | Ebene | EVAL akzeptiert / TREFFER / harte FA / weiche FA / harter Miss / grenzw. Miss / unplausibel | DEV akzeptiert / TREFFER / harte FA / weiche FA | Urteil |
|---|---|---|---|---|
| **BASE** | Produktion | 37 / 27 / 1 / 0 / 1 / 7 / **2** | 7 / 6 / 0 / 1 | Referenz |
| C51 | Speed-Input | 36 / 27 / **0** / 0 / 1 / 7 / 2 | 7 / 6 / 0 / 1 | Produktion seit 23.10. 21:47; Nutzen nur TES16 (Dev-Set) |
| KB (K-B #2139) | Detektor-Option, `ARTEFACT_SUSPECT` | 36 / 27 / **0** / 0 / 1 / 7 / 2 | 7 / 6 / 0 / 1 | behebt B1, sonst neutral |
| BRACKET | Detektor-Option, `ARTEFACT_SUSPECT` | 36 / 27 / **0** / 0 / 1 / 7 / 2 | 7 / 6 / 0 / 1 | behebt B1, sonst neutral; unabhängige Formulierung, identisches Ergebnis |
| PHYS_MEAN | Akzeptanz-Gate | 35 / 27 / 1 / 0 / 1 / 7 / **0** | 7 / 6 / 0 / 1 | behebt B2, sonst neutral |
| PHYS_PEAK2 | Akzeptanz-Gate | 35 / 27 / 1 / 0 / 1 / 7 / **0** | 7 / 6 / 0 / 1 | wie PHYS_MEAN, Peak-basiert anfälliger → nicht bevorzugt |
| KA2 (K-A2 #2139) | Akzeptanz | 34 / 27 / 0 / 0 / 1 / 7 / 2 | **6** / 6 / 0 / **0** | entfernt FA + 19:04:49, aber **nicht** 19:04:34; entfernt TIG22-Events nach Qualität statt Plausibilität → verworfen |
| **COMBO** = KB + BRACKET + PHYS_MEAN | kleine Korrektur | 34 / **27** / **0** / 0 / 1 / 7 / **0** | 7 / 6 / 0 / 1 | **empfohlen**; verändert in-sample genau 3 Events, 0 TREFFER-Verlust |
| LEG (HYPOTHESE) | Speed-Input: qualitätsgegatete 1-s-Leg-Chords (2-s-Kernel) | 35 / **28** / **1** / **1** / 1 / 6 / 0 | 7 / 6 / 0 / 1 (TES21-1 kollabiert auf 1 Event) | Intensitäts-Bias halbiert (TIG22 −0,26), +1 grenzw. TREFFER, Schwanz sauber — **aber** 2 neue harte FA direkt vor dem 18:49-Ausreißer (18:48:45 75,1→61,5; 18:49:00 73,7→60,4), Soft-FA TES16 03:54:17 und TES21-2 12:20:37, Kadenz-Abhängigkeit → **nicht produktionsfähig** |
| REG3 (HYPOTHESE) | 3-Punkt-LSQ-Steigung auf C4 | 34 / **25** / 0 / 1 / 1 / **9** / 2 | 7 / **7** / 0 / 0 | EVAL schlechter, DEV besser → Überanpassung an DEV-Kadenz → verworfen |
| NOGUARD_STANDSTILL (HYPOTHESE) | Guard | identisch BASE | identisch BASE | widerlegt B4-Guard-Hypothese |

Nicht implementiert, als **HYPOTHESEN** eingeordnet (kein Nachweis auf vier Fahrten möglich, kein ML-Training zulässig):

| Ansatz | Einschätzung |
|---|---|
| Robuste lokale Regression (Theil–Sen auf 3–5 Punkten) | REG3 zeigt die Richtung: zusätzliche Glättung verschärft B3/B4; Robustheit gegen Ausreißer ist bereits in C4/Quarantäne gelöst |
| Mehrsekündige adaptive Fenster | identisch zum Kernel-Problem; adaptiv nach Qualität bedeutet de facto LEG bei OK und C4 sonst → erbt LEGs Fehlalarme |
| Change-Point-Detection (PELT/CUSUM) auf C4 | plausibel für Start/Ende-Präzision (B3-Offset), nicht für Intensität; ohne unabhängige Validierung nicht bewertbar |
| Physik-constrained, qualitätsgewichtete Detektion | der Physik-Teil ist PHYS_MEAN; Qualitätsgewichtung ist KA2 und schadet (DEV) → nur Physik-Teil übernehmen |
| Zustands-/probabilistische Modelle (HMM/Kalman auf Position + Speed) | würde die Speed-Ebene (C4/C5.1) ersetzen, nicht den Detektor — außerhalb des Auftrags, Nachweis auf 4 Fahrten nicht möglich |
| Hybride | COMBO ist der einzige Hybrid mit nachweisbarem Nutzen ohne Verlust |

---

## 9. Intensitätsklassifikation — Vorschlag (PROPOSED, nicht validiert)

Nur wenn ein Produktbedarf besteht. Grundsätze aus den Befunden:

1. Klassifiziere **nur** Events mit `quality = OK` und bestandener Physik-Hüllkurve; alles andere → `UNRATED` (keine Zahl, kein Label).
2. Basis ist das **Mittel** `|deltaKmh| / 3,6 / durationS` (Dauer aus Labels), **nicht** peak1 (Bias −0,55) und nicht peak2.
3. Klassengrenzen bias-bewusst (C4-Mittel liegt ≈ 0,15–0,4 m/s² unter der 1-Hz-Wahrheit): z. B. `MODERAT` < 2,0 · `DEUTLICH` 2,0–3,0 · `STARK` ≥ 3,0 m/s² (ACCEL) bzw. < 2,5 · 2,5–4,0 · ≥ 4,0 (DECEL) — **Hypothese**, nicht aus Daten geschätzt; vor Nutzung auf neuen, unabhängigen Fahrten prüfen.
4. Keine Schema-Erweiterung nötig (Mittel ist aus persistierten Feldern ableitbar); i18n für alle 9 Locales erforderlich, falls angezeigt.

---

## 10. Priorisierte Empfehlung

**A — Kleine Korrektur umsetzen (empfohlen).** Zwei additive, markierende Guards, keine Threshold-Änderung, kein neuer Detektor.

**B — Nur B2 (Physik-Gate) umsetzen.** Behebt die produktkritische Lücke; B1 bleibt, wird in Production seit 23.10. teilweise durch C5.1 abgefangen (nur in-sample belegt).

**C — Nichts ändern, dokumentieren.** Vertretbar, da 0 TREFFER-Verlust und FA-Rate niedrig; aber unmarkierte unmögliche Events bleiben sichtbar.

**D — LEG/REG3 weiterverfolgen.** Nicht empfohlen (nachgewiesene neue Fehlalarme / EVAL-Verschlechterung).

**E — Neuer Modellansatz (Change-Point / probabilistisch).** Nicht empfohlen ohne neue unabhängige Daten; verletzt „kein neuer Research-Workstream“.

### Implementierungspakete (max. 3, Shadow-Scope, additive Versionierung)

| Paket | Inhalt | Dateien (Composer) | Regressions-Gate |
|---|---|---|---|
| **P1 — Spike-Bracket/K-B als K3-Erweiterung** | neue Option `spikeBracketCheck` in `MotionEventCandidateOptions`; in `applySpikeReversionCheck` zusätzlich: Schritt in das Startsample (`s0−1 → s0`, gleiches Segment) ≤ −entry **und** Schritt aus dem Endsample (`s1 → s1+1`, ≤ `MOTION_EVENT_SPIKE_REVERSION_WINDOW_S`) ≤ −entry, `oppositeFollows`-Ausnahme beibehalten → `ARTEFACT_SUSPECT` + Flag `SPIKE_BRACKET_PRE=<a>_POST=<a>`; `motionEventVersionId` ergänzt `MOTION_EVENT_V0_3_CAND_DEV[spikeBracketCheck]`; neue `MOTION_EVENT_V0_3_CANDIDATE_OPTIONS`, Prozessor schaltet um; Bundle-Version erhöhen | `core/kinematics/motion-event-detector.ts`, `di-v0-motion-core-shadow-processor.ts`, `di-v0-motion-core-shadow.bundle.version.ts`, Unit-Tests | Replay 4 Fahrten: nur TES16 03:50:20 ändert Qualität; alle anderen Events byte-identisch zu `outputs/baseline_fable_base_7340637/` |
| **P2 — Physik-Hüllkurve als Akzeptanz-Gate** | neues Modul `core/kinematics/motion-event-physics-envelope.ts` mit `MOTION_EVENT_PHYSICS_ENVELOPE_V0_1` (Konstanten und Formel aus `scripts/candidates_ab.cjs` → `physEnvelope`/`physViolation`: Dauer ≥ 2 s, `v_low ≥ 5 m/s`, Mittel statt Peak), Funktion `applyPhysicsEnvelope(events, vehicleClass)` → `ARTEFACT_SUSPECT` + Flag `PHYSICS_ENVELOPE_VIOLATION=mean:<a>;limit:<a_max>;basis:<launch|power|tyre>`; Prozessor ruft sie **nach** dem Detektor mit `meta.vehiclePlausibilityClass ?? 'TESLA'` auf (permissivster Fallback); Bundle-Version erhöhen; Klasse auch bei C4-only auflösen (heute nur bei C5.1 effektiv) | neues Modul, `di-v0-motion-core-shadow-processor.ts`, `di-v0-motion-core-shadow.service.ts` (Klassenauflösung), Tests | Replay: genau TIG22 19:04:34 und 19:04:49 werden `ARTEFACT_SUSPECT` (beide > Launch 4,5 m/s²); TES16 03:50:20 bleibt (TESLA-Leistungsgrenze ≈ 6,4 m/s² bei v_low 113 km/h > Mittel 3,26 → P1 nötig); DEV unverändert |
| **P3 (optional, Produkt) — Qualität sichtbar machen** | Popover zeigt `quality` (`DEGRADED`/`LIMITED`) als Hinweistext; i18n-Keys in allen 9 Locales (`trips-motion-map.*.ts`); kein Algorithmus-Change | `TripMotionMapPopover.tsx`, `motion-map.utils.ts`, 9 Übersetzungsdateien | Frontend-Tests; keine Backend-Änderung |

Reihenfolge: **P2 → P1 → P3**. P2 zuerst, weil es die einzige produktsichtbare Falschinformation ohne Markierung adressiert und von C5.1 nicht abgedeckt wird. P1 danach (in Production teilweise durch C5.1 maskiert). P3 unabhängig.

**Nicht tun:** Thresholds ändern · `JITTER_SUSPECT`/`SPARSE_SUPPORT` aus `usableQualities` entfernen · FSM in den Detektor koppeln · Geschwindigkeiten aus Gap Bridge ableiten · peak1 exponieren · LEG als Event-Input · ML auf 4 Fahrten.

---

## 11. Regressionsrisiken

| Risiko | Einschätzung | Absicherung |
|---|---|---|
| P1 markiert echte Accel→Decel-Wechsel als Artefakt | gering: K3-`oppositeFollows`-Ausnahme bleibt wirksam; Bracket verlangt **beide** Flanken ≥ entry innerhalb 2 s, ein reales Manöver dieser Form wäre selbst physikalisch extrem | Replay-Gate (0 TREFFER-Verlust auf 4 Fahrten); Unit-Test mit synthetischem Accel→Decel |
| P2 lehnt echte Performance-Fahrzeuge ab | Fallback TESLA ist die obere Hüllkurve (9 m/s² Launch); Nameplate-Konstanten sind bewusst großzügig | nur Markierung, kein Verwerfen; Flag mit Zahlenwerten für Audit |
| P2 Klassenauflösung bei C4-only-Fahrzeugen | heute `'TESLA'`-Fallback → fail-permissive | Resolver-Aufruf unabhängig vom C5.1-Flag, Tests |
| Bundle-/Intent-Key-Wechsel erzeugt Neuberechnungen | erwünscht und bekannt (Shadow-Scope) | wie bei V3/V4-Einführung |
| Out-of-sample-Verhalten | **unbekannt** — alle Nachweise sind in-sample auf 4 Fahrten | Shadow-Beobachtung vor jeder Produkt-Kopplung; keine Threshold-Änderung |

---

## 12. Abschlussblock

```
PRODUCTION_BASELINE_SHA=7340637274c40d4fc03d968cdb943f16171a4a39 (DI-Verzeichnis identisch zu origin/main 393ae9da2)
REFERENCE_DRIVES_FOUND=4 (TIG22 EVAL · TES16 EVAL/C5.1-Dev-Set · TES21-1 DEV · TES21-2 DEV); Baseline-Replay IDENTICAL_TO_PR2139_match2s; TIG22 prodIdentical=true (Run 15cdc8ae, C4-only)
GROUND_TRUTH_INTEGRITY=INTAKT — TIG22 Video nur bis 19:03:02 UTC, Fenster 19:04 ausschließlich Plausibilität; keine neuen Videos, keine Nacherfassung; EVAL/DEV strikt getrennt; TES16 für C5.1 nicht unabhängig
CURRENT_EVENT_DETECTOR=HF_THRESHOLDS_V1 (1.5/1.2 m/s², minSteps 2, Δv 4.0/3.0) + GUARDS_V0_1 (maxGap 2 s, postGap 2 s, 6 usable qualities) + K3 spikeReversionCheck; FSM-frei; keine Physik-Schranke; Input C4 (bis 23.10. 21:47 UTC) bzw. C5.1-Preferred (seitdem)
C5_1_EVENT_BENEFIT=KLEIN_UND_NICHT_UNABHÄNGIG — entfernt genau TES16 03:50:20 FA (2× REPAIR_ACCEPTED); TIG22/TES21-1/TES21-2 identisch zu C4; fail-closed im 19:04-Schwanz; keine Verschlechterung in-sample
FSM_GAP_BRIDGE_EVENT_BENEFIT=KEINER_ALS_EVIDENZ — C4-gespeist (zirkulär), MOVING während unplausiblem Schwanz, keine Geschwindigkeit; einziger Kontextnutzen STATIONARY→STARTING als Anfahr-Marker (18:44:17), nicht als Event
CONFIRMED_BUGS=3 behebbare (B1 K3 blind bei Start-Artefakt · B2 keine Physik-Schranke · B3 Kernel-Bias −0.13…−0.55 m/s²) + 2 dokumentierte Grenzen (B4 harter Miss 18:44, B5 vier grenzwertige Misses) + B7 Qualität nicht sichtbar; B6 (18:49) kein Defekt
FALSE_POSITIVE_ROOT_CAUSES=Timing-Jitter/Dip-Spitze-Artefakte in SPARSE_SUPPORT/JITTER_SUSPECT-Samples, deren Startsample das Artefakt ist (K3 blind); physikalisch unmögliche C4-Sprünge nach NO_POSITION/OUTLIER-Lücken ohne Hüllkurve
MISSED_EVENT_ROOT_CAUSES=impliziter 3-s-Kernel der C4-Differenz (Schritte 1.30–1.48 < 1.5) bei kurzen Anfahr-/Bremsmanövern, verstärkt durch FROZEN_POSITION-Lücken; Post-Gap-Guard NICHT ursächlich (widerlegt)
BEST_SMALL_FIX=COMBO = Spike-Bracket/K-B (ARTEFACT_SUSPECT) + Physik-Hüllkurve auf Event-Mittel (ARTEFACT_SUSPECT, Klasse via C5.1-Resolver, Fallback permissiv) — ändert in-sample genau 3 Events, 0 TREFFER-Verlust, DEV unverändert
BEST_ALTERNATIVE_ALGORITHM=KEINER_ÜBERLEGEN — LEG (2-s-Kernel) halbiert Bias, aber +2 harte FA vor GPS-Ausreißer und Kadenz-Kollaps; REG3 EVAL-schlechter; Change-Point/probabilistisch = HYPOTHESE ohne Nachweis
PHYSICS_SAFETY=HEUTE_FEHLEND — 2 unmögliche Events akzeptiert/unmarkiert; mit P2 geschlossen (nur Markierung, fail-permissive Fallback)
REPLAY_COMPARISON=outputs/ab/CANDIDATES_AB.md — 11 Kandidaten, Parität gegen Produktionscode bestanden, EVAL/DEV getrennt, gleiche Thresholds/Matching
REGRESSION_RISKS=gering in-sample (0 TREFFER-Verlust); out-of-sample unbekannt; Bundle-Version-Wechsel erzeugt Shadow-Neuberechnung; P2 Klassenauflösung bei C4-only prüfen
RECOMMENDED_IMPLEMENTATION_ORDER=P2 Physik-Hüllkurve → P1 Spike-Bracket/K-B → P3 Qualität im Popover (optional, i18n 9 Locales)
READY_FOR_COMPOSER_IMPLEMENTATION=JA für P1+P2 (Dateien, Versionierung, Gates in §10 spezifiziert; Baseline-Outputs als Byte-Gate beigelegt); P3 JA (produktseitig, kein Algorithmus)
FINAL_RECOMMENDATION=A — kleine Korrektur (P2+P1) im Shadow-Scope umsetzen, keine Threshold-Änderung, kein neuer Detektor, kein ML, keine FSM-Kopplung, keine Geschwindigkeit aus Gap Bridge; Intensitätsklassifikation nur als bias-bewusste Δv/Dauer-Hypothese mit UNRATED für nicht-OK
```
