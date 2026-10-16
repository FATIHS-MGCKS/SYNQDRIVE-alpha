# Cursor-Aufträge zu EXP021

Die folgenden Aufträge bauen auf der unveränderten Baseline-Auswertung auf. Kein Deploy, kein Provider-Fetch, keine produktive Reparatur und kein Tuning sind damit beauftragt. Nur bereits autorisierte Read-only-Zugriffe verwenden. Fehlende Daten explizit melden. PR #2051 bleibt der Referenz-/Analyse-PR; mögliche Implementierungen getrennt reviewen.

## 1. Herkunft der frühen Fahrtgrenze beweisen

```text
Bitte prüfe für EXP021 ausschließlich die Herkunft der bestehenden Fahrtgrenzen und friere nachvollziehbare Evidenz in PR #2051 ein.

Trip: 358d0158-b2a9-47ed-af26-33926c5770b4
Vehicle: 68868291-5478-42cd-b0c4-cc77b2a78e21
Organization: faa710c9-6d91-4079-a7d5-91fdccdec14a
Baseline-Ausführungs-SHA: a0ce01f192d888974e49c2558ee05e534f3dfeea
Review-Bundle-Commit: 518fc3dd67

Gesicherte Beobachtung: Trip beginnt 03:36:00Z. Erstes Originalvideobild zeigt 05:37:41 Berlin = 03:37:41Z, also 101 s später. Owner bestätigt das anfängliche Rückwärtsmanöver als tatsächliche Abfahrt und kein früheres Video. Exakter erster physischer Bewegungsframe ist noch nicht kalibriert. Erste 101 Replay-Buckets: 98 ROW_ABSENT, drei PRESENT, alle NO_MOTION_EVIDENCE und kein numerischer Speed.

Bitte tatsächliche, trip-spezifische Werte und Herkunft exportieren: dimo_segment_id und die ursprünglichen Providersegment-Grenzen, soweit vorhanden; raw_detection_meta einschließlich confirmedStartAt und Herkunft; Detektor-/FSM-Startentscheidung, Lookback, Rundung, spätere Boundary-Revisionshistorie. Schema-Namen zuerst im Code bestätigen. Keine allgemeine Codebeschreibung als Nachweis des konkreten Trips ausgeben.

Eine zeitliche Ereigniskette erstellen: Provider-Messzeit / Empfangszeit / FSM-Entscheidungszeit / gespeicherte Grenze. Leere Felder ausdrücklich leer lassen. DIMO-Segment, FSM, Lookback und Reconciliation als alternative Ursachen prüfen. Keine Grenze ändern und keine Coverage neu etikettieren. Falls historische Felder fehlen, genau benennen, was den Ursprungsnachweis verhindert.

Post-Deploy-Evidenz gegebenenfalls separat mit eigenem SHA, Admission-Status und Fingerprints erfassen. Sie darf die eingefrorene Pre-Deploy-Evidenz nicht ersetzen.
```

## 2. Stop-/Kriech-Semantik und Datenlücken erklären

```text
Bitte ergänze einen reproduzierbaren, unveränderten Offline-Replay für die bestätigte Tesla-Referenzfahrt. Zuerst Baseline-Parität nachweisen: 1136 Buckets, 776 numeric, 775 trusted numeric, 14 trusted limited stationary null, trusted max 129.7885665128692 km/h, trusted mean ungefähr 66.08511361500206 km/h. Fingerprints und Grenzen aus bestehendem Manifest verwenden.

Videobefunde bei nominal gleicher Uhrsekunde:
- 03:40:19–03:40:49Z: 31 Tacho-Nullsekunden.
- 03:41:50–03:42:29Z: 40 Tacho-Nullsekunden.
- 03:42:50–03:42:57Z: 8 Tacho-Nullsekunden.
- 03:43:43–03:44:02Z sowie 03:44:10–03:44:35Z: 46 Tacho-Nullsekunden. Dazwischen Tacho unbekannt, nicht auffüllen.
- Insgesamt 135 lesbare Tacho-Nullsekunden: 133 ROW_ABSENT, zwei PRESENT, alle NO_MOTION_EVIDENCE.
- 14 STATIONARY_SUPPORTED-Intervalle: elf lesbare Gegenstücke mit Tacho 1–3 km/h, drei unbekannt.
- QC-evaluate-di-v0-speed-qc-interval.ts enthält STATIONARY_MAX_TRUSTED_SPEED_KMH=5 und ist zwischen Bundle-Commit und Baseline-Ausführungs-SHA byte-identisch. Daraus allein keine vollständige S1-Klassifikation ableiten.

Für die genannten Fenster sowie 03:37:41–03:38:25Z und 03:54:15–03:54:56Z bitte t−5 bis t+5 Kontext und tatsächliche S1/QC-Evidenz exportieren: Positionsverfügbarkeit, PositionState, Freshness/Messalter, Unterstützungspunkte mit Zeitstempeln, Leg-Distanzen/-Geschwindigkeiten, Hold/Release, Shadow-Flags, motionState, speedEvidenceState, Abstention, QC-Gründe und vorhandene unabhängige Stillstandsevidenz. Koordinaten nur im bereits autorisierten Umfang; sonst berechnete Distanzen plus Identitäten liefern und Reproduzierbarkeitsgrenze nennen.

ROW_ABSENT sauber auf Provider-Sampling, Akquisition, S2 oder Replay zurückführen. Keine fehlenden Zeilen durch 0 ersetzen. Prüfen, ob das Produkt STATIONARY_SUPPORTED als exakten Stillstand darstellt, obwohl fachlich ein Niedriggeschwindigkeitsband bewertet wird. Regelkonformität, semantische Fehlinterpretation und echte Falschklassifikation getrennt berichten.

±1/±2 s Zuordnungs-Sensitivität durchführen. Keine Bewertung als physisch falsch allein aufgrund eines einzelnen unkalibrierten Gegenwerts. Vollständige Intervall-Parität separat von Aggregat-Parität nachweisen.
```

## 3. Projektions- und Zeitprovenienz vervollständigen

```text
Bitte das vollständige gespeicherte projection_json zur eingefrorenen Projektion 567c3dc2-d514-447a-97d5-bc294c8c6c12 mit Content-Fingerprint 9219741e48bc78cfadf4385ca1ad77dd82bcf5bbc0f986dd3d664bd2f1fff61f exportieren, sofern die historische Version tatsächlich vorliegt. Der jetzige Bundle-Inhalt ist ausdrücklich nur ein Excerpt. Falls nur eine neue Projektion existiert: nicht als alte ausgeben, beide Versionen strikt trennen.

Bitte außerdem dokumentieren, ob bucketLabelUtc Messzeit, Aggregationsraster oder Zuordnungskonvention ist; welche Original-Signalzeit und Empfangszeit je Positions-/Speed-Evidenz erhalten sind; ob Verzögerungen oder eine Resampling-Konvention bereits berücksichtigt werden. Vorhandene Evidenz exportieren, fehlende Zeitfelder nicht rekonstruieren.

Die Videozuordnung verwendet Uhrlabels in Europe/Berlin UTC+02:00. TC_00066 enthält in der ~1-Hz-Stichprobe doppelte Labels 05:49:57 und 05:50:01. Subsekunden-Offset und Sensorlatenz sind nicht kalibriert. Ein globales Verschieben zur MAE-Minimierung darf diese Unsicherheit nicht verdecken.

Manifest mit vollständigen Hashes, Quell-SHA, Laufidentität und konkreter Paket-Hash-Bildungsregel ergänzen. Keine produktiven Mutationen und keine neuen Provider-Fetches.
```

## 4. Erst nach Diagnose: getrennte Offline-Experimente

```text
Bitte erst nach Abschluss der Evidenzaufträge ein Experimentdesign vorschlagen und als separaten Review vorlegen. Baseline unverändert behalten. Für jeden Kandidaten: konkrete Hypothese, nur betroffene Parameter/Regeln, eingefrorene Entwicklungsabschnitte, zurückgehaltene Abschnitte, Erfolgs- und Rückschrittskriterien, Regressionsfahrten sowie vollständige Intervall-Diffs.

Prioritäten:
A. Exakter Stillstand versus niedriges Tempo versus nicht bewertbar semantisch trennen; keine pauschale Herabsetzung/Anhebung von Schutzgrenzen.
B. Falls vorhandene unabhängige Evidenz Halten belegt: größere fachliche Stillstandsabdeckung bei unveränderter null-Semantik. Keine numerische Coverage durch künstliche Nullen.
C. Dynamik über vollständig unterstützte 3/5/7-s-Fenster untersuchen. Keine Dynamik über große Lücken, keine Scheingenauigkeit aus überlappenden L3-Supportfenstern.
D. Grenzen nur aufgrund nachgewiesener Provenienz und Boundary-Reconciliation korrigieren. Coverage-Gewinn durch Nenneränderung separat ausweisen.

Messgrößen: gepaarte Geschwindigkeitsdifferenzen und Quantile; Zeitversatz pro Ereignis; Stop-/Anfahrabdeckung; Verwechslung Nullanzeige/niedrige Bewegung; nicht bewertbare Dauer; numeric/trusted numeric/accepted stationary strikt getrennt. Außerdem falsch freigegebene Zahlenwerte, Hold/Release-Übergänge und Randfälle bewerten.

TC_00063 und TC_00066 wurden vor Metrikberechnung für späteres Tuning zurückgehalten, ihre Baseline aber inzwischen gesehen. Bei Hypothesen aus diesen Befunden sind sie kein blind unabhängiger Test. Weitere Referenzfahrten und Regression auf anderen DIMO-/Gerätequellen benötigen. Eine Fahrt beweist keine Flottenqualität.

GPS-L3-Autorität, R1-Abgrenzung und QC-Schutz beibehalten. Keine Implementierung auf Basis eines pauschalen +2,07-km/h-Aufschlags: Tacho-Bias und Sensorlatenz sind noch nicht identifiziert. Produktive Änderungen nur über separat überprüfbare PRs und separat autorisierten Deploy.
```
