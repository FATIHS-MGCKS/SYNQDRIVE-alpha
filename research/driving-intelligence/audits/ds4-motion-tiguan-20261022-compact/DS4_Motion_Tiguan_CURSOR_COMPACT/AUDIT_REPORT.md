> Kompaktfassung ohne Bilder und Diagramme. Der vollständige Text und die numerischen Tabellen des Audits sind erhalten; die drei bereits geprüften Video-Standbilder werden nur über ihre Zeit-/Clipangaben referenziert. Keine erneute Videosichtung ist für diesen Arbeitsauftrag nötig.

DS4 Motion – Intensivprüfung Tiguan

SYNQDRIVE · OFFLINE-AUDIT · FAHRT VOM 22.10.2026

# DS4 Motion: intensive Prüfung am Tiguan

Die typische Geschwindigkeit passt im untersuchten Videofenster gut. Zwei konkrete Fehlerpfade sind jedoch reproduziert: extreme GPS-Sprünge werden als Geschwindigkeit übernommen, und historische OBD-Werte ohne belegten Messzeitpunkt überschreiben den Bewegungszustand.

**Status:** Auswertung, unabhängiger Replay und isolierte Korrekturexperimente durchgeführt. Die Experimente sind Forschungsvarianten; kein Runtime-Patch, Commit, Merge, Deploy oder Production-Reprocessing in diesem Audit. M7A bleibt pausiert; Mapbox und Scoring bleiben unberührt.

## Was unabhängig geprüft wurde

| Prüfung | Ergebnis |
| --- | --- |
| Videoreferenz | 1.464 Zeilen; 1.417 lesbare Tacho-Werte; 9 ausgewählte Manöverfenster; 11 sichtbare Nullfolgen |
| S4-Evidence | Container-SHA und beide Kanal-Hashes (POSITION / R1_OBD) stimmen mit dem Export überein |
| Motion-Replay | 2.094 C4-Werte einschließlich Quality, Support, Flags und Estimator reproduziert (numerische Toleranz 10⁻⁹ km/h) |
| FSM / Stops / Events | Alle persistierten FSM-Felder, 12 Stop-Episoden und alle persistierten Felder der 21 Events reproduziert |
| Originalvideo | TC_00080, TC_00081 und TC_00084 vollständig geladen, SHA-256 jeweils identisch zur Referenz; drei kritische Frames direkt geprüft |
| Code-Stand | Snapshot des Repositorys dea2555bb746550c632f4315dabe08b9481be0df |
| Historische Production-Binary | Exakter Binary-SHA zum damaligen Run nicht attestiert; der Replay belegt gleiche Ergebnisse auf diesem Input |

## Geschwindigkeit: vollständige Metriken und Abdeckung

Nominaler Zeitversatz 0 s. Tachoanzeige ist eine Videoreferenz, kein kalibriertes Messgerät. Keine Interpolation und keine Entfernung großer Fehler aus den Primärmetriken. L3 ist der ältere Shadow-Schätzer; C4 ist die tatsächlich gespeicherte Motion-Geschwindigkeit.

| Metrik | L3 gespeichert | Motion C4 gespeichert | Experiment A: GPS-Schutz |
| --- | --- | --- | --- |
| Lesbare Vergleichspaare / 1.417 | 1284 | 1372 | 1364 |
| Numerische Werte / 1.464 | 1312 | 1416 | 1408 |
| Median absoluter Fehler, km/h | 2,86 | 2,78 | 2,77 |
| MAE, km/h | 14,51 | 9,22 | 2,91 |
| RMSE, km/h | 132,07 | 93,37 | 3,41 |
| Bias (Schätzer − Tacho), km/h | 8,93 | 3,92 | -2,42 |
| Innerhalb ±5 km/h | 90,0 % | 90,5 % | 90,9 % |
| P95 absoluter Fehler, km/h | 6,13 | 6,04 | 5,92 |
| Paare mit Fehler >100 km/h | 11 | 7 | 0 |

**Abdeckung ist Teil des Ergebnisses:** Experiment A liefert acht zuvor numerische Vergleichswerte weniger: sieben extreme Werte und einen angrenzenden plausiblen Wert ohne hinreichenden verbleibenden Support. Auf den gemeinsamen 1.364 Paaren sind Baseline und Kandidat numerisch gleich. Der niedrigere MAE entsteht durch ehrliche Enthaltung im kontaminierten Bereich, nicht durch rekonstruierte wahre Geschwindigkeiten.

Auch L3 und C4 müssen auf gemeinsamen Zeilen verglichen werden: Auf 1.279 gemeinsamen Paaren beträgt der MAE 10,06 bzw. 9,77 km/h. Die höhere C4-Abdeckung darf nicht als großer allgemeiner Genauigkeitssprung verkauft werden.

## Fehler 1: Positionssprünge passieren die lokale Plausibilitätsprüfung

Zwischen 20:49:13 und 20:49:23 wechseln die Positionen mehrfach zwischen etwa 500 m auseinanderliegenden Orten. Acht der 1-s-Übergänge innerhalb dieses Abschnitts entsprechen 1.774–2.015 km/h. Die benachbarten Übergänge sind ebenfalls kontaminiert: Ein rein relativer Medianvergleich bewertet dadurch mehrere Sprünge als „PLAUSIBLE“.

`computeC4AdaptiveL3` übernimmt anschließend Teile dieser Serie über `L3_DIRECT` als `OK`; der robuste Ersatzpfad enthält ebenfalls betroffene Positionen. Am 20:49:18 entstehen 1.930,83 km/h bei 66 km/h auf dem Tacho. Daraus wird ein ACCELERATION-Event 20:49:12–20:49:18 mit Δv = 1.863,5 km/h, lediglich `DEGRADED`. Die 2-s-Rückkehrprüfung greift bei diesem längeren Mehrfachsprung nicht.

**Bestätigt:** Der Fehlerpfad beginnt bereits in den eingefrorenen Positionsdaten. **Offen:** Warum der historische Positionskanal diese Sprünge enthält (Sensor, Zuordnung, Aggregation oder andere Ursache), ist aus dem Snapshot allein nicht beweisbar.

## Fehler 2: OBD-Bucketzeit wird zur punktgenauen Zustandsautorität

Alle 560 verwendeten Sparse-OBD-Samples haben `measurementTimeUtc = null` und `arrivalTimestampUtc = null`. Der Adapter übergibt dennoch ihre Aggregationslabels als zeitgleiche Geschwindigkeit an die FSM. Dort kann `directMoving` einen niedrigen C4-Wert überstimmen und `DIRECT` auslösen.

| Zeit Berlin | Videotacho | C4 / Quality | Historisches OBD | Gespeicherte Folge |
| --- | --- | --- | --- | --- |
| 20:47:58 | 0 km/h | fehlend / FROZEN_POSITION | 84 km/h | STARTING während sichtbarem Halt |
| 20:58:53 | 0 km/h | 2,28 km/h / OK | 63 km/h | MOVING, Widerspruch nur als Flag |
| 21:00:18 | 0 km/h (Referenztabelle) | 0,92 km/h / OK | 44 km/h | STARTING, sichtbare Nullfolge wird unterbrochen |

Ein pauschaler Zeitversatz oder künstlich erfundener Messzeitpunkt wäre keine Lösung. Das Forschungs-Experiment B lässt ausschließlich die nicht zeitlich belegten OBD-Werte aus der punktgenauen FSM-Entscheidung heraus. Die Rohdaten bleiben erhalten. Eine Produktkorrektur braucht eine explizite Quellenregel mit Messzeitbeleg und dokumentierter Unterstützung; reine Bucketlabels dürfen keine Punktfreigabe ersetzen.

## Direkt am Originalvideo überprüft

TC_00080 · 166 s · 20:47:58: Tacho 0, nicht der GPS-Overlaywert 10,9

TC_00081 · 66 s · 20:49:18: Tacho 66, Motion C4 1.930,83

TC_00084 · 100 s · 20:58:53: Tacho 0, zugeordneter OBD-Wert 63

Diese Stichproben bestätigen die drei kritischen Referenzwerte. Sie ersetzen keine erneute Sichtung aller 1.464 Sekunden. Die 1-s-Referenz und die nicht kalibrierte Telefonuhr bleiben als zeitliche Unsicherheit dokumentiert.

## Stillstand und Anfahren: getrennte Quellenexperimente

| Variante | STATIONARY bei Tacho 0 / 96 | STATIONARY bei Tacho >0 / 1.321 | Events, ganze Fahrt |
| --- | --- | --- | --- |
| Baseline | 53 | 1 | 21 |
| A: GPS-Leg-Schutz | 53 | 1 | 20 |
| B: keine unbestätigte OBD-Punktfreigabe | 85 | 6 | 21 |
| A + B | 85 | 6 | 20 |

**Kein pauschaler Erfolgsprozentsatz:** Das sind Sekunden, keine Stop-Recall-Werte. `STOP_CANDIDATE` ist kein bestätigter Stillstand. Bei Variante B liegen die sechs positiven Tachoanzeigen mit `STATIONARY` bei 1, 1, 1, 2, 4 und 5 km/h. Die Fälle 4–5 km/h bleiben ein gezielter Prüfpunkt für Kriechen/Hysterese. Variante A+B erhöht im Videofenster `UNKNOWN` bei positiver Tachoanzeige von 1 auf 9 Sekunden, weil der GPS-Bereich bewusst nicht belastbar ist.

| Nullfolge | Berlin | Nullsekunden | Baseline STATIONARY | Variante B STATIONARY | Einordnung |
| --- | --- | --- | --- | --- | --- |
| 1 | 20:38:34–20:38:52 | 19 | 19 | 19 | Beginn des Videos; Halt begann vorher |
| 2 | 20:41:01–20:41:10 | 10 | 2 | 2 | 5 s fehlende/frozen Position; erst später bestätigt |
| 3 | 20:43:00–20:43:05 | 6 | 6 | 6 | Referenzfenster direkt vergleichbar |
| 4 | 20:44:04–20:44:06 | 3 | 0 | 2 | Sehr kurze Nullfolge; kein globaler Stop-Miss ableitbar |
| 5 | 20:44:10–20:44:16 | 7 | 7 | 7 | Referenzfenster direkt vergleichbar |
| 6 | 20:47:50–20:48:08 | 19 | 14 | 19 | OBD 84 km/h unterbricht Halt |
| 7 | 20:58:53–20:59:00 | 8 | 0 | 7 | OBD 59–63 km/h verhindert Bestätigung |
| 8 | 21:00:05–21:00:06 | 2 | 0 | 2 | Cliprand / kurzer sichtbarer Abschnitt |
| 9 | 21:00:13–21:00:26 | 14 | 1 | 14 | OBD 44–48 km/h zerlegt Nullfolge |
| 10 | 21:00:31–21:00:33 | 3 | 0 | 2 | Kurze Nullfolge / Kriechen abgrenzen |
| 11 | 21:02:58–21:03:01 | 4 | 4 | 4 | Nahe Videoende; Haltgrenzen unvollständig |

Die 11 Nullfolgen werden nicht über ungelesene Stellen oder Clipgrenzen zu physischen Halten zusammengefügt. Im Baseline-Lauf haben 7 dieser Folgen mindestens eine STATIONARY-Sekunde; bei Variante B alle 11. Die Episodenanzahl der ganzen Fahrt (12 → 11) ist wegen des nur teilweise gefilmten Trips keine Referenz-Stopanzahl.

## Neun Manöverfenster einzeln geprüft

Alle Überlappungen werden mit `event.start ≤ window.end AND event.end ≥ window.start` bestimmt. 13 gespeicherte Events liegen im Videofenster; 21 in der ganzen Fahrt. Sieben ausgewählte Fenster enthalten ein zeitlich überlappendes Motion-Event derselben Richtung. Das ist keine globale Precision/Recall-Aussage.

| Nr. | Referenzfenster Berlin | Tacho | Motion-Event | Bewertung |
| --- | --- | --- | --- | --- |
| 1 | 20:40:48–20:41:01 | 38→0 km/h | Kein gleichgerichtetes Event | Referenz-HF-Test erkennt 20:40:56–58; C4 fehlt genau dort. Datenlücke, nicht durch Interpolation ersetzen. |
| 2 | 20:42:46–20:43:00 | 48→0 km/h | Kein gleichgerichtetes Event | Tacho-HF-Test erkennt 20:42:56–58. C4-Spitze ca. 1,446 m/s² liegt unter 1,5; quantisierungs-/schwellennaher Fall. |
| 3 | 20:45:24–20:45:30 | 45→83 km/h | 20:45:24–20:45:28 / Δv 28,2 | Richtung und zeitliche Überlappung vorhanden; exakte Grenzen bleiben uhr-/anzeigeabhängig. |
| 4 | 20:47:00–20:47:07 | 50→90 km/h | 20:47:00–20:47:04 / Δv 31,4 | Richtung und zeitliche Überlappung vorhanden; exakte Grenzen bleiben uhr-/anzeigeabhängig. |
| 5 | 20:47:30–20:47:50 | 76→0 km/h | 20:47:42–20:47:47 / Δv 27,5 | Richtung und zeitliche Überlappung vorhanden; exakte Grenzen bleiben uhr-/anzeigeabhängig. |
| 6 | 20:58:17–20:58:22 | 44→5 km/h | 20:58:16–20:58:20 / Δv 31,1 | Verzögerung ungefähr 1 s früher; anschließende Beschleunigung ab 20:58:22 auch im Tacho sichtbar. |
| 7 | 20:59:00–20:59:07 | 0→53 km/h | 20:59:00–20:59:04 / Δv 38,6 | Richtung und zeitliche Überlappung vorhanden; exakte Grenzen bleiben uhr-/anzeigeabhängig. |
| 8 | 20:59:27–20:59:31 | 38→65 km/h | 20:59:27–20:59:29 / Δv 17,0 | Richtung und zeitliche Überlappung vorhanden; exakte Grenzen bleiben uhr-/anzeigeabhängig. |
| 9 | 20:59:31–20:59:42 | 65→18 km/h | 20:59:37–20:59:40 / Δv 18,5 | Richtung und zeitliche Überlappung vorhanden; exakte Grenzen bleiben uhr-/anzeigeabhängig. |

Zusätzliche Diagnose: derselbe HF-Detektor wurde separat pro Videoclip auf die Tacho-Werte angewandt. Das dient der Schwellenanalyse, nicht als Ground Truth für aggressives Bremsen. Pedalbetätigung wurde nicht beobachtet. Aus zwei Grenzfällen wird keine neue Schwelle abgeleitet.

## Korrekturexperiment A: Wirkung und Preis

Der isolierte Kandidat markiert beide Endpunkte eines kinematisch unmöglichen 1-s-Übergangs als unsicher. Er entscheidet nicht, welcher Punkt „richtig“ ist. Diese Punkte liefern weder C4-Support noch punktgenaue Positionsbewegung für die FSM. Das Original bleibt unverändert; unsichere Geschwindigkeiten werden `null` mit Begründung, niemals 0 oder künstlich gekappt.

Experimenteller Grenzwert: 400 km/h für die abgeleitete 1-s-Leg-Geschwindigkeit. Das ist **kein validierter Produktgrenzwert und kein Speeding-Limit**. Sensitivität 300/350/400/500/600 km/h erfasst bei dieser Fahrt dieselben acht Sprünge und elf unsicheren Labels. Moderate Ortsfehler können darunter liegen; dieses Experiment ist kein vollständiger GPS-Qualitätsfilter.

| Nachweis | Ergebnis |
| --- | --- |
| Falsches Event 20:49:12–18 | Entfällt |
| Alle übrigen Events | 20/20 in allen persistierten Feldern unverändert |
| Stop-Episoden bei Experiment A | 12/12 unverändert |
| Geänderte numerische Vergleichswerte | 8 → null; 7 extreme, 1 angrenzender valider Wert |
| Ältere Tiguan-Fahrt 19.10. | 1.480 Buckets; 1.182 numerische C4-Werte; C4 und Events unverändert; Position-only-FSM unverändert |
| Gezielte Prüffälle | 18 Assertions / Szenarien erfolgreich, einschließlich echter starker Beschleunigung, Datenlücken und Einzel-/Mehrfach-/Dauerversatz |
| Tesla-Referenzen | Nicht ausführbar: bestehende Tests erwarten nicht verfügbare /opt/cursor/artifacts-Dateien |
| CI / vollständige Backend-Suite | Nicht ausgeführt; keine Freigabe für Produktintegration daraus abgeleitet |

## Auswertungskorrekturen gegenüber PR #2133

- Motion C4 erhält eigene Primärmetriken, Abdeckung und Zeitversatzanalyse; L3 bleibt eine gesonderte Baseline.
- FSM-Zustände werden exakt unterschieden. Der frühere Substring-Test „STOP oder STATIONARY“ darf STOP_CANDIDATE nicht als bestätigten Halt zählen.
- RPM wird unabhängig von vorhandener L3-Geschwindigkeit gepaart: 390 Paare statt einer durch die L3-Maske verkleinerten Auswahl; 27 zusätzliche Paare. 67,2 % liegen innerhalb ±500 U/min. Wegen unsicherer RPM-Referenz und unbekannter OBD-Messzeit keine punktgenaue Validierung.
- Event-Inventar: 21 ganze Fahrt / 13 im Videofenster. Vollständige Intervallüberlappung und Einzelbewertung der neun Fenster.
- Das bisherige source_age_s beschreibt Verarbeitungsverzug; es ist kein Sensoralter. L3-Run, Motion-Run und unbekannte Messzeit getrennt führen.
- Originalregeln und Exporte bleiben erhalten. Dieses Addendum entstand nach Sichtung der Ergebnisse und ist ausdrücklich keine nachträgliche Präregistrierung.

## Nächster Produkt-Fix: klare Abnahmekriterien

- **Zeitautorität schließen:** Unbestätigte R1-Aggregationslabels dürfen keinen punktgenauen DIRECT-Zustand auslösen. Attestierte, tatsächlich zeitlich passende Geschwindigkeit separat weiter unterstützen. Fehlende Zeit ist UNKNOWN, kein erfundener Offset.
- **GPS-Support absichern:** Ungültige Übergänge vor C4, robustem Ersatzpfad, FSM und Events abfangen; Version/Fingerprint und Begründungsflags aktualisieren. Kein nachträgliches Wegfiltern nur in UI/Metriken.
- **Unabhängig vergleichen:** Baseline, nur GPS, nur Zeitautorität und Kombination auf denselben eingefrorenen Inputs. Abdeckung, verlorene gültige Werte, stop/creep-Grenzen und unbekannte Zustände offenlegen.
- **Regression vervollständigen:** Frühere Tesla-Referenzen und weitere Fahrzeuge mit gepinnten Daten ergänzen; fehlende Fixtures müssen SKIPPED/NOT_RUN melden, nicht unbemerkt als PASS durch frühes return enden. Native Tests und Pflicht-CI auf dem finalen Commit ausführen.
- **Saubere Branch-Basis:** Runtime-Fix auf aktuellem main; den alten Forschungsbranch von #2133 nicht als Sammelmerge übernehmen. Versions- und Architekturbelege für substanzielle Änderungen aktualisieren.

Scoring, Fahrtbewertungen, Speeding, Mapbox, M7A sowie LV/HV/PDI/DTC/VSI gehören nicht in diesen Fix. Eine produktive Aktivierung wird aus dem Offline-Ergebnis nicht behauptet.

## Quellen und Reproduktion

- [Forschungs-PR #2133](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2133)
- [Eingefrorenes Evaluation-Paket @ 36cbd9825364081ad389795c29e98420e74d0292](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/tree/36cbd9825364081ad389795c29e98420e74d0292/research/driving-intelligence/evaluations/2026-10-22-vw-tiguan)
- [C4-Übernahme und Fallback](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/blob/dea2555bb746550c632f4315dabe08b9481be0df/backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/c4-adaptive-l3.ts)
- [Positions-/Jitterfilter](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/blob/dea2555bb746550c632f4315dabe08b9481be0df/backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/leg-consistency.ts)
- [FSM: Sparse-Geschwindigkeit und Zustandswechsel](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/blob/dea2555bb746550c632f4315dabe08b9481be0df/backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-fsm.ts)
- [Adapter: Messzeit null, Sparse-Weitergabe](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/blob/dea2555bb746550c632f4315dabe08b9481be0df/backend/src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-evidence.adapter.ts)
- [Bestehende Regressionen mit optionalen externen Fixtures](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/blob/dea2555bb746550c632f4315dabe08b9481be0df/backend/src/modules/vehicle-intelligence/driving-intelligence/core/__tests__/motion-core-step2.spec.ts)

`bash run_audit.sh` im Auditpaket. Node 24 mit eingebautem Type-Stripping; Python 3 mit NumPy/Matplotlib für die Abbildungen. Kein DB-Zugriff, kein Netz für den Replay. Das Paket enthält die benötigten Daten, den unveränderten verwendeten Core-Ausschnitt und die Forschungsvarianten. Originalvideos bleiben über die Referenz-Manifestlinks zugeordnet; drei prüfbare Standbilder liegen bei.

Trip 98d2a8e0-8b7d-4529-bf76-acee44d61fbe · Motion-Run 8ec6306e-606b-4507-ab03-ea058c5d810d · S4-Snapshot 22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3. Einzelne Fahrt, nur teilweise gefilmt; keine Flottenquote und kein Produktionsfreigabenachweis.
