# DS4 Motion — aktueller Korrekturstand zu PR #2135

Die vier Review-Mängel werden hier vom **historischen Ausgangsaudit** getrennt. Quelle der aktuellen Zahlen: `analysis/hardened_comparison.json`, reproduziert mit `node compare_hardened.cjs`. Runtime-Basis B ist #2134 `f95420593ecae98d54d1d3185476c66427d2aede`, nicht der alte Compact-Code. Der Reproducer verlangt einen leeren Runtime-Diff gegen diesen SHA und ruft `processDiV0MotionCoreShadowTrip` auf dem hash-verifizierten Container auf.

## 1. Original A und gehärteter Processor B

| Größe | Original A (historisch) | Processor B (#2134) |
|---|---:|---:|
| Ereignisse | 21 | 20 |
| Numerische C4-Werte ganze Fahrt | 1916 | 1908 |
| Stillstandsintervalle | 12 | 11 |
| Lesbare Videoreferenz-Sekunden | 1417 | 1417 |
| Vergleichbare Sekunden | 1372 | 1364 |
| Fehlende C4-Werte bei lesbarem Video | 45 | 53 |
| MAE km/h | 9,2232 | 2,9053 |
| Median absolut km/h | 2,7795 | 2,7657 |
| P95 absolut km/h | 6,0380 | 5,9181 |
| RMSE km/h | 93,3650 | 3,4100 |
| Bias km/h | +3,9198 | −2,4238 |

Gesamt: 1464 Referenzzeilen, 47 ohne lesbaren Geschwindigkeitswert. Primärversatz 0 s. Auf den **gemeinsamen 1364 Sekunden** sind A und B exakt gleich (MAE beide 2,9053). Die niedrigere Roh-MAE folgt dem Zurückhalten von acht Ausreißerwerten; eine genauere Berechnung der übrigen Werte ist damit nicht bewiesen. Alle 20 erhaltenen Event-Payloads sind feldgleich. Nur ACCELERATION 18:49:12–18:49:18 UTC entfällt. Die sieben Matches der neun ausgewählten Referenzfenster bleiben erhalten; keine globale Precision/Recall-Aussage.

K-E markiert historisch vier Ereignisse, auf B noch drei (19:04:26, 19:04:34, 19:04:49 UTC). Diese drei liegen **außerhalb des Videos**. Der bereits durch #2134 beseitigte Fehler zählt nicht als zusätzlicher Gate-Erfolg. Kein neuer videobestätigter Artefaktfund gegenüber #2134. G1/G2 bleiben experimentelle Hypothesen. Die bisherige G2-Label-Gap-Bedingung erkennt keine Positionslücken in einem lückenlosen 1-Hz-Labelraster; dafür wird kein Wirksamkeitsnachweis behauptet.

Tiguan-19: 1480 Labels, 1182 numerische C4-Werte und 21 Events im Position-only-Core feldgleich erhalten; null experimentelle Gate-Markierungen. Das ist ein Erhaltungscheck, kein unabhängiger Genauigkeitsnachweis.

## 2. Klassifikation und Darstellung

G1 wurde aus Marker-Stilisierung und Kunden-Popover entfernt und liegt ausschließlich in `event_quality_research.cjs`. 5 m/s², −9 m/s² und 250 km/h sind **keine validierten allgemeinen physikalischen Grenzen**. Keine automatische Messartefaktbehauptung aufgrund dieser Zahlen. Bestehende serverseitige Artefaktkennzeichnung und Qualitätslabels bleiben erhalten. Die 19:04-Fälle sind Artefaktverdacht beziehungsweise unbewertet, nicht video-bestätigte Messfehler.

## 3. Ereignisgeometrie

Das Highlight besteht aus getrennten zusammenhängenden Teilstücken innerhalb des Eventfensters. Fehlende Koordinaten und fehlende 1-Hz-Labels trennen die Linie; interne Lücken werden bis in das Popover weitergereicht. Keine automatische Erweiterung um Nachbarsekunden. Start-/Endmarker erfordern eine Position am jeweiligen tatsächlichen Zeitlabel. Fehlende Grenzpositionen werden nicht durch den nächstgelegenen Punkt ersetzt. Gleiche Koordinaten bei anderer Durchfahrt verändern die zeitliche Zuordnung nicht. Die vorhandene Hinweisübersetzung wurde in allen neun Locales auf „unvollständig“ korrigiert.

## 4. Delta und Rundung

Symmetrisch: Betrag runden, Vorzeichen danach anwenden, keine negative Null. +29,5→+30 und −29,5→−30. Der gespeicherte Delta-Betrag entsteht vor der unabhängigen Rundung der Endpointwerte und bleibt daher die dokumentierte Betragsquelle; nur das Vorzeichen kommt aus deren Reihenfolge. Ø m/s² verwendet dieselbe signierte Quelle und positive gültige Zeitdifferenz. 98,2→68,6 / gespeichertes Δ=29,5 zeigt −30; 34,7→5,5 zeigt −29. Ungültige Mittelwerte werden zurückgehalten.

## Grenzen / nächste Arbeit

Kein neuer Geschwindigkeitsschätzer oder Manöverdetektor, keine Backend-/Production-Änderung. M7A, Mapbox, Scoring und andere Workstreams unverändert. Noch keine authentifizierte Live-Mapbox-QA. Die Screenshot-Dateizuordnung des ursprünglichen Audits wurde in diesem auf Punkte 1–4 begrenzten Korrekturschritt nicht neu validiert; Fälle für den aktuellen Vergleich werden über Typ und UTC-Intervall gebunden. Entwicklung neuer Algorithmen folgt separat nach Review.

---

# Historisches Ausgangsaudit — superseded in den vier oben korrigierten Punkten

Die folgende Erstfassung bleibt als historische Evidenz erhalten. Aussagen über aktuelle G1-Kundenklassifikation, durchgehende Geometrie, den −29-Halbwert sowie alte 21-Event-Gates sind durch die Korrektur oben ersetzt. Physikalische Unmöglichkeit und bestätigte 19:04-Messartefakte wurden damit nicht nachgewiesen.

# DS4 Motion — Geschwindigkeit, Beschleunigung, Verzögerung und Kartenanzeige (Audit 2026-10-23)

**Status:** Research + isolierter Frontend-Prototyp · kein Backend-Algorithmuswechsel · keine Production-Seiteneffekte
**Basis:** PR #2134 HEAD `3f3c4a516` (GPS/OBD-Hardening) · Branch `cursor/ds4-motion-speed-event-audit-192d`
**Gepinnte Daten:** Tiguan WOB L 7503 · Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` · Motion-Run `8ec6306e-606b-4507-ab03-ea058c5d810d` · Snapshot `…22e2a662…`
**Algorithmusstände im Payload:** `MOTION_CORE_SPEED_C4_V0_1_DEV` · `MOTION_FSM_V0_3_CAND_DEV[staleSpeedContextFix+startingTimeout+evidencePropagation]` · `HF_THRESHOLDS_V1_REUSED + MOTION_CORE_EVENT_GUARDS_V0_1_DEV + MOTION_EVENT_V0_2_CAND_DEV[spikeReversionCheck]`

Die eingefrorene Baseline reproduziert exakt (C4 0 Abweichungen, FSM 0, 21/21 Events feldgleich) — Beleg `analysis/event_display_candidates.json → frozenBaseline`.

---

## 1. Datenweg (POSITION → Karte)

| Stufe | Ort | Befund |
|---|---|---|
| POSITION 1-s-Grid | S4 Evidence Container → `position_grid_verified.json` | 2094 Labels, 2005 `PRESENT`, 89 `ROW_ABSENT`. Positionierte Legs: 1980× 1 s, 14× 2 s, 6× 3 s, je 1× 7/8/20/30 s. Die Fix-Kadenz liegt stellenweise unter 1 Hz → Lücken und *Label-Jitter* (Fix fällt in Nachbar-Bucket). |
| C4 Speed | `computeC4AdaptiveL3` | Pro Label Wert + Qualität (`OK`, `SPARSE_SUPPORT`, `JITTER_SUSPECT`, `OUTLIER_REJECTED`, `NO_POSITION`, `NO_SUPPORT`) + Flags. Jitter-Buckets werden markiert, aber **nicht** aus dem Event-Detektor ausgeschlossen (`usableQualities` enthält `JITTER_SUSPECT`). |
| Event-Detektor | `detectMotionManoeuvreEvents` | HF-Schwellen (Eintritt 1,5 m/s², Fortsetzung 1,2 m/s², ≥2 Schritte, Δv ≥ 4/3 km/h). `deltaKmh = sign·(v_end − v_start)` ist **immer positiv** (Betrag). Qualität: `OK` nur bei ausschließlich `OK`-Samples, `DEGRADED` bei Jitter/Repaired, sonst `LIMITED`. `meanAccelMps2`, `durationS`, `peakAccel*` werden berechnet… |
| Persistenz | Shadow-Payload `events[]` | …aber **nur** `kind, startLabel, endLabel, startSpeedKmh, endSpeedKmh, deltaKmh, quality, flags` werden persistiert. Dauer/Ø-Beschleunigung gehen verloren. |
| Read-Mapper | `di-v0-motion-core-shadow-trip-map-read.mapper.ts` | `artefactSuspect = quality === 'ARTEFACT_SUSPECT'` → `DEGRADED`/`LIMITED` werden **nicht** als Artefaktverdacht markiert; `peakAccel1sMps2: null`; Position = Grid am `startLabel`. |
| Frontend Popover | `TripMotionMapPopover.tsx` (vorher) | `deltaKmh > 0 ? '+'+…` → Bremsen wird als `35 → 6 km/h (+29)` angezeigt. Nur Startzeit, keine Dauer, keine m/s². |
| HUD | `TripMapSummaryOverlay` ← `countTripEvents(trip)` | Zählt Legacy-`VehicleTrip`-Counter (`totalAccelerationEvents`/`totalBrakingEvents`/`abuseEvents` bzw. `harsh*Count`), nie den Motion-Payload → „0 Ereignisse“ bei 21 Markern. |

## 2. Screenshot-Fälle (19:04 UTC = 21:04 lokal) — alle `NOT_VIDEO_COVERED`

Vollständige Tabellen je Fall in `analysis/screenshot_case_audit.md`.

| Screenshot | Event | UI-Text beobachtet | Legacy-Formatter reproduziert | Prototyp | Ø m/s² | Verdict |
|---|---|---|---|---|---|---|
| IMG_7778 | DECEL 19:04:26–:29, 34,7→5,5 | `35 → 6 km/h (+29)` | ja | `35 → 6 km/h (−29)` · 3 s · Ø −2,7 · Qualität unsicher | −2,7 | **Plausibles Bremsen, Anzeige-Vorzeichenfehler**; Timing unsicher (`JITTER_SUSPECT` bei :26/:27, 2-s-Leg :25→:26) |
| IMG_7779 | DECEL 19:04:39–:42, 98,2→68,6 | `98 → 69 km/h (+30)` | ja | `98 → 69 km/h (−29)` · 3 s · Ø −2,7 · eingeschränkt | −2,7 | **Plausibles Bremsen, Anzeige-Vorzeichenfehler**; 1 `ROW_ABSENT` (:41) im Fenster |
| IMG_7780 | ACCEL 19:04:49–:52, 52,3→142,1 | `52 → 142 km/h (+90)` | ja | `52 → 142 km/h (+90)` · Ø +8,3 · **Messartefakt wahrscheinlich** | +8,3 | **Messartefakt, kein Fahrverhalten**: Chord :51→:52 = 47 m in nominal 1 s (169 km/h), :49→:51 = 22,5 m/2 s (40 km/h); beide Endpunkte `MIN_SUPPORT_3_POINTS`; endet 1,2 s vor Trip-Ende (keine Vorwärts-Stütze) |
| IMG_7781 | ACCEL 19:04:34–:38, 5,5→100,1 | `6 → 100 km/h (+95)` | ja | `6 → 100 km/h (+95)` · Ø +6,6 · **Messartefakt wahrscheinlich** | +6,6 | **Messartefakt**: Anfahrt aus `STATIONARY`; :36 Chord 4,1 m/2 s (7 km/h) vs. C4 54 km/h (Vorwärtsfenster zieht 17,6 m/43 m-Legs hinein); :37 `OUTLIER_REJECTED`; 1 `ROW_ABSENT` |

Zusätzlicher Fund außerhalb der Screenshots, **im Videofenster**: Event #10 ACCEL 18:49:12–:18 **67 → 1931 km/h**, Qualität `DEGRADED`, `artefactSuspect=false` → wird aktuell als normaler Beschleunigungsmarker gerendert (`67 → 1931 km/h (+1864)`).

**Zeitaudit:** Bucket-Labels sind UTC; Popover formatiert mit `toLocaleTimeString(locale)` in der Browser-Zeitzone (Screenshots lokal 21:04 = 19:04 UTC, Europe/Berlin UTC+2). Trip-Ende `19:04:53.233Z`; die Fälle IMG_7780/7781 liegen in den letzten 20 s. Keine Zeitverschiebung zwischen Payload-Labels, Grid und Frontend nachweisbar; die Unsicherheit ist ±1 s Label + unbestätigter Geräte-Clock-Offset (`startUncertaintyS` im Detektor).

## 3. Referenz (Video 18:38:34–19:03:02 UTC) und Baselines

Metriken aus dem eingefrorenen Paket (`analysis/audit_metrics.json`, Shift 0 s, 1417 lesbare Referenzsekunden):

| Reihe | n | MAE km/h | Median | RMSE | Bias | ≤5 km/h | ≤10 km/h | max | Fehler >100 |
|---|---|---|---|---|---|---|---|---|---|
| Baseline A — L3 (Production) | 1284 | 14,5 | 2,9 | 132,1 | +8,9 | 90,0 % | 98,7 % | 1905 | 11 |
| Baseline B — C4 (Shadow-Payload) | 1372 | 9,2 | 2,8 | 93,4 | +3,9 | 90,5 % | 98,8 % | 1865 | 7 |
| Kandidat A (GPS-Sprungquarantäne, nicht integriert) | 1364 | 2,9 | 2,8 | 3,4 | −2,4 | 90,9 % | 99,3 % | 14,4 | 0 |

Interpretation: Der Median ist für alle Reihen ≈ 2,8 km/h (Tacho-Voreilung + Fix-Latenz). MAE/RMSE werden ausschließlich von wenigen Jitter-Sekunden dominiert (max 1865 km/h), nicht von einem systematischen Geschwindigkeitsfehler.

**Ereignisfenster (9 Referenzfenster, Richtung + Zeitüberlappung):** 7/9 gematcht (#6, #8, #9, #11, #13, #14, #15). Nicht gematcht: Fenster 1 und 2 — sanfte Ausrollvorgänge 38→0 km/h/13 s (Ø −0,81 m/s²) und 48→0 km/h/14 s (Ø −0,95 m/s²). Das ist keine Fehlfunktion, sondern die HF-Schwelle (Eintritt 1,5 m/s²): diese Fenster sind „Verzögerung“, aber kein „Bremsereignis“ im HF-Sinn. Falschalarme im Videofenster: 1 (#10, 1931 km/h). Stillstand/Anfahren: 7 der 11 sichtbaren Nullfolgen mit `STATIONARY` abgedeckt (eingefrorenes Paket, `visible_zero_runs_with_stationary`); Übergänge Stillstand→Anfahren werden vom FSM-Kandidaten `startingTimeout` begrenzt.

## 4. Kandidaten (offline, isoliert)

Die Fahrdynamik selbst wird nicht verändert; geprüft wurden **Anzeige-Gates** auf Event-Ebene (`event_display_candidates.mjs`):

| Gate | Regel |
|---|---|
| G1 Kinematik-Hüllkurve | Ø a > 5 m/s² (ACCEL) oder < −9 m/s² (DECEL) oder Endpunkt > 250 km/h |
| G2 Timing/Support | `JITTER_SUSPECT`-Sample im Fenster **oder** (Label-Lücke im Fenster **und** beide Endpunkte `SPARSE_SUPPORT`/`MIN_SUPPORT_3_POINTS`) |
| G3 Chord-Konsistenz | C4-Endpunkt weicht > max(20 km/h, 50 %) vom Chord-Tempo des positionierten Legs ab |

| Kandidat | Tiguan-22 geflaggt | im Video | außerhalb | referenz-gematchte Events geflaggt | Tiguan-19 (21 Events) |
|---|---|---|---|---|---|
| **K-E = G1 ∪ G2** | 4/21 → #10, #17, #18, #20 | 1 (#10) | 3 | **0/7** | **0/21** |
| K-E3 = K-E ∪ G3 | 4/21 (identisch) | 1 | 3 | 0/7 | 0/21 |

K-E markiert genau die vier problematischen Events (1931 km/h, IMG_7778 Timing, IMG_7781, IMG_7780) und lässt IMG_7779 (plausibles Bremsen) sowie alle sieben videobestätigten Events unberührt; Tiguan-19 bleibt vollständig erhalten. G3 bringt keinen Zusatznutzen.

Robustheit der eingefrorenen Pipeline: Datenverlust → 0 Events (PASS); Horizontstabilität 10 s (PASS, 17=17); Idempotenz (PASS); Gates deterministisch (PASS). Laufzeit gesamt 1,3 s, Heap Δ 19,5 MB, RSS 176 MB (Node 24, inkl. zweifacher C4+Event-Replay und Robustheitsläufe).

**Empfehlung:** G1 ist rein aus Start/Ende/Δt ableitbar und wurde im Frontend-Prototyp als Anzeigeregel umgesetzt (`isMotionEventKinematicallyImplausible`). G2 benötigt C4-Sample-Qualitäten, die der Trip-Map-Read nicht liefert → als Backend-Folgeschritt im Mapper (`plausibility`-Feld aus `payload.speeds`) oder direkt im Detektor (`JITTER_SUSPECT` aus `usableQualities` entfernen; dann wäre allerdings die Tiguan-19/Tesla-Erhaltung neu zu belegen). Nicht empfohlen: Schwellen für Fenster 1/2 senken, bevor die Semantik „Ausrollen“ vs. „Bremsen“ produktseitig geklärt ist.

## 5. Karten-Prototyp (Frontend, in dieser PR)

- `useTripsRouteMap`: neue Sources/Layer `motion-event-segment` (Casing + farbige Linie, rot = Bremsen, grün = Beschleunigen/Anfahren) und `motion-event-endpoints` (Start weiß/dunkel, Ende dunkel/weiß). Auswahl eines Motion-Events (Marker-Klick, Pick-List) löst `resolveMotionEventSegment` aus: alle positionierten 1-s-Samples im Fenster `[startLabel, endLabel]`; `ROW_ABSENT` wird übersprungen; bei < 2 positionierten Samples wird um ≤ 2 s erweitert und das als „angenähert“ ausgewiesen. Sichtbarkeit folgt dem Layer-Toggle „Fahr-Ereignisse“.
- `TripMotionMapPopover` (Event): Zeitfenster Start–Ende (lokal), `{from} → {to} km/h ({±Δ})` mit korrektem Vorzeichen, Dauer, Ø m/s², Qualität (gut/eingeschränkt/unsicher), Hinweis bei fehlendem/angenähertem Segment, „Messartefakt wahrscheinlich“ bei G1-Verletzung (Marker zusätzlich als Artefakt gestylt).
- `TripMapSummaryOverlay`: zeigt bei aktivem Motion-Overlay `Motion-Ereignisse: {count}` statt des Legacy-Zählers.
- i18n: 11 neue `trips.motionMap.*`-Schlüssel in allen 9 Locales (de, en, pl, fr, cs, nl, es, tr, it); Test erzwingt Schlüsselparität und verhindert englische Kopie in den Qualitätslabels.
- Tests: `motion-map.utils.test.ts` (+7, gepinnte Tiguan-19:04-Fixtures), `TripMotionMapPopover.component.test.tsx` (neu, 5).

Nicht geändert: Backend-Detektor, Mapper, Persistenz, M7A, Scoring, Legacy-Event-Marker.

## 6. Offene Grenzen

- Mapbox-Rendering konnte in dieser Umgebung nicht im Browser geprüft werden (`VITE_MAPBOX_ACCESS_TOKEN` fehlt); die Segmentauflösung ist über die echten Utility-Funktionen auf gepinnten Daten als SVG belegt (`/opt/cursor/artifacts/ds4-motion-speed-event-audit/`), die Popover-Ausgabe per Komponententest.
- Die 19:04-UTC-Fälle liegen außerhalb des Videos; ihre Einordnung stützt sich auf Chord-Geometrie, Qualitätsflags und Kinematik, nicht auf Tacho-Referenz.
- Dauer und Ø-Beschleunigung im Popover werden aus Bucket-Labels abgeleitet (±1 s), weil der Payload `durationS`/`meanAccelMps2` nicht persistiert.
- `TripMapSummaryOverlay` enthält weiterhin Legacy-Hardcodes („Ereignis“, „Analyse läuft“, „Kunde/Fahrer“) außerhalb des Motion-Pfads — nicht Teil dieses Scopes.
