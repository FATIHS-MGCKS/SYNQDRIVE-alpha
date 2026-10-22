SYNQDRIVE — DS4 MOTION: GPS-AUSREISSER UND ZEITLICHE OBD-ZUORDNUNG GEZIELT HÄRTEN

Arbeite im Repository FATIHS-MGCKS/SYNQDRIVE-alpha. Setze die beiden nachgewiesenen Fehlerpfade nachvollziehbar in einem neuen Draft-PR auf aktuellem origin/main instand. Reproduziere zuerst die Befunde aus dem angehängten DS4_Motion_Tiguan_CURSOR_COMPACT.zip. Das Paket enthält Forschungsvarianten, keine fertig freigegebene Implementierung.

1. Auftrag und Grenzen

Ziel: Extreme GPS-Sprünge dürfen keine belastbaren Geschwindigkeiten oder Manöver erzeugen. OBD-Werte ohne belegten Messzeitpunkt dürfen den momentanen Bewegungszustand nicht als DIRECT bestimmen. Zuverlässige OBD-Evidenz soll weiterhin nutzbar bleiben.

Erlaubt: Untersuchung, gezielte Codekorrekturen, reproduzierbare Tests, Auswertungsartefakte, Commit/Push und Draft-PR. Kein Merge, Deploy, Production-Reprocessing, DB-Schreibzugriff oder Flag-Wechsel. M7A bleibt pausiert. Mapbox, Trip-Grenzen/Admission, Kunden-Scoring, Fahrtbewertungen und LV/HV/PDI/DTC/VSI bleiben außerhalb des Änderungsumfangs. Kein allgemeines Event-Schwellen-Retuning und keine neue Infrastruktur.

Lies AGENTS.md und die einschlägigen Motion-/Quellenverträge. Arbeite in einem sauberen separaten Worktree; erhalte fremde Änderungen. Übernimm nicht den alten Research-Branch aus PR #2133 als Basis und merge ihn nicht. Prüfe bestehende parallele PRs auf Überschneidungen.

2. Paket und Baseline zuerst verifizieren

Entpacke das ZIP in ein separates Audit-Verzeichnis. Lies README.md, AUDIT_REPORT.md, SOURCE_MANIFEST.json und evaluation/PROVENANCE_MANIFEST.json. Prüfe PACKAGE_SHA256.json. Der enthaltene backend/-Ausschnitt ist ausschließlich eingefrorener Replay-Code: NICHT über den aktuellen Repository-Code kopieren.

Audit-Code-SHA: dea2555bb746550c632f4315dabe08b9481be0df.
Research-Export-SHA: 36cbd9825364081ad389795c29e98420e74d0292, PR #2133.
Fahrzeug: 19fedd4b-c4e8-4de8-a125-dab293326e7e, VW Tiguan.
Trip: 98d2a8e0-8b7d-4529-bf76-acee44d61fbe.
Motion-Run: 8ec6306e-606b-4507-ab03-ea058c5d810d.
Snapshot: DI_V0_S4_EVIDENCE_V1:sha256:22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3.

Führe bash run_audit.sh aus (Node 24 mit Type-Stripping, Python 3; kein Netz/DB-Zugriff nötig). Erwartung: 2094 C4/FSM-Zeilen, 12 Stop-Episoden und 21 vollständige Trip-Events reproduzierbar; 18 gezielte Assertions/Szenarien im Forschungs-Experiment bestanden. Diese Prüfungen ersetzen keine Projekt-CI. Prüfe zusätzlich, ob aktuelles main gegenüber dem Audit-Code relevante Änderungen enthält; halte eingefrorene Baseline, aktuelle Main-Baseline und Produktkandidat getrennt. Bei Differenzen zuerst Ursache klären, niemals Expected-Werte passend machen.

3. GPS-Fehler gezielt beheben

Beleg: 22.10.2026 18:49:18 UTC / 20:49:18 Berlin: Videotacho 66 km/h, gespeichertes Motion C4 1930,8269 km/h mit quality=OK. Mehrfache Positionssprünge kontaminieren auch den lokalen Median. Falsches ACCELERATION-Event 18:49:12–18:49:18 UTC, Delta rund 1863,5 km/h.

Untersuche leg-consistency.ts, c4-adaptive-l3.ts, robust-path-slope.ts sowie die Verwendung dieser Positionen in FSM und Events. Verhindere, dass verworfene Evidenz über L3_DIRECT, Ersatzschätzer, Support-Fenster oder die Positions-FSM wieder belastbar wird. Bewahre Rohdaten und Snapshot-Hashes unverändert. Unsichere Ausgabe muss null/UNKNOWN bzw. der geltenden Qualitätssemantik entsprechen: nicht 0, nicht auf eine Höchstgeschwindigkeit gekappt und nicht künstlich interpoliert. Fehlende Bewegungsevidenz allein beweist keinen Stillstand.

candidate-leg-quarantine.mjs demonstriert einen möglichen Schutz, ist aber nicht blind zu übernehmen: 400 km/h ist ein experimenteller Leg-Grenzwert, kein kalibrierter Produktwert und kein Speeding-Limit. Begründe die kleinste geeignete Regel und prüfe Einzel-, alternierende und anhaltende Sprünge, verschiedene Zeitabstände, moderate Artefakte, echte hohe Geschwindigkeit, starke Beschleunigung/Bremsung, Lücken und Rückkehr in plausible Bewegung. Keine festen Trip-IDs, Koordinaten oder Uhrzeiten in der Produktlogik.

Akzeptanz auf dieser Fixture für den isolierten GPS-Fix: falsches Ereignis entfällt; übrige 20 Events und 12 Stop-Episoden bleiben erhalten. Abweichungen einzeln erklären. Ein besserer Fehlerwert durch weniger ausgegebene Werte muss als Abdeckungsverlust sichtbar bleiben.

4. OBD-Zeitbeleg und Schleichfahrt behandeln

Alle 560 Sparse-OBD-Samples dieser Fahrt haben measurementTimeUtc=null und arrivalTimestampUtc=null. Trotzdem gelangen Aggregationslabels als zeitgleiche Geschwindigkeit in die FSM. Bei 18:47:58 UTC steht der Videotacho auf 0, während OBD 84 km/h STARTING unterstützt; bei 18:58:53 UTC stehen Tacho 0 und C4 2,28 km/h einem OBD-Wert von 63 km/h mit MOVING gegenüber.

Prüfe di-v0-motion-core-shadow-evidence.adapter.ts, Payload-Vertrag und motion-fsm.ts. Implementiere eine explizite, testbare Eignungsregel für punktgenaue OBD-Evidenz. Aggregationszeit, Ankunftszeit, Messzeit und Verarbeitungszeit dürfen nicht gleichgesetzt werden. Keine erfundenen Messzeiten oder pauschalen Clock-Shifts. Dokumentiere Eignung, Ablehnungsgrund und Konflikte gemäß bestehenden Verträgen; zeitlich belegte und qualitativ geeignete OBD-Messungen müssen weiterhin berücksichtigt werden.

Das vollständige Weglassen dieser unbelegten OBD-Werte ist nur Ablation B: 85 statt 53 von 96 Tacho-Nullsekunden werden STATIONARY; zugleich entstehen 6 statt 1 STATIONARY-Zuordnungen bei positiver Anzeige, darunter 4–5 km/h. Analysiere diese sechs Sekunden mit Nachbarfenster und Support/Hysterese. Übernimm den Kandidaten nicht allein wegen 85/96. Behebe belegbare Regressionen möglichst lokal; falls der Zielkonflikt mit vorhandener Evidenz nicht lösbar ist, dokumentiere ihn ausdrücklich als offenen Freigabepunkt. Keine ausgedachte Stop-Wahrheit und kein generelles Abschalten aller OBD-Quellen.

5. Vergleich und Regressionen

Vergleiche eingefrorene Baseline, aktuelle Main-Baseline und die Varianten GPS-only, Zeitbeleg-only, kombiniert. Liefere reproduzierbare JSON-/CSV-Ergebnisse mit Abdeckung, null/UNKNOWN, unveränderten gemeinsamen Vergleichszeilen, MAE/Median/RMSE/Bias/P95 sowie Qualitätsgründen. Primärversatz bleibt 0 s; ±1/±2 s nur als Sensitivität. Keine Auswahl des besten Shifts oder Trimmen großer Fehler in den Primärmetriken. Zeige Stillstand, Anfahren und positive Geschwindigkeiten getrennt; STOP_CANDIDATE zählt nicht als bestätigter Stillstand.

Prüfe alle 11 sichtbaren Nullfolgen und 9 Manöverfenster einzeln, inklusive Zeitgrenzen, Lücken und Mehrfachereignissen. Es gibt 21 Events in der ganzen Fahrt, 13 im Videofenster. Sieben ausgewählte Fenster mit passender Ereignisrichtung sind kein globaler Precision/Recall-Nachweis. Bei den zwei fehlenden Bremsereignissen Datenlücke und Schwellenrand getrennt behandeln; daraus keine pauschale Schwellenänderung ableiten. Tachoanzeige/Telefonzeit bleiben eine begrenzte Videoreferenz, keine kalibrierte Ground Truth.

Nutze die enthaltene Tiguan-Fixture vom 19.10. als zusätzliche Regression. Prüfe vorhandene Tesla-/Stop-and-go-Fixtures, soweit verfügbar. Fehlende Dateien niemals per stillem return als PASS zählen; als NOT_RUN/SKIPPED mit Grund berichten. Neue Pflichtregressionen müssen aus versionierten Fixtures laufen, ohne absolute /opt/cursor/artifacts-Abhängigkeit.

Ergänze gezielte Projekt-Tests für gültigen, fehlenden, alten und zukünftigen Messzeitbeleg, reine Bucket-/Ankunftszeiten, widersprüchliche Quellen, Kriechen, Stop-and-go und Datenlücken. Tests müssen die tatsächlichen Adapter-/Core-Pfade prüfen. Zeige mindestens die beiden ursprünglichen Fehler vor dem Fix rot und danach grün.

6. Versionierung, PR und Abschluss

Prüfe Algorithmusversion/Fingerprint sowie Run-Intent-/Cache-Bindung: eine Verhaltensänderung darf nicht unter einer unveränderten Identität alte Ergebnisse wiederverwenden. Nutze den vorhandenen Mechanismus; kein historisches Reprocessing und kein ungefragter Schema-Umbau. Persistierte alte Runs bleiben unverändert.

Führe die relevanten Backend-/Motion-/Adapter-Tests, Build und erforderlichen Governance-/CI-Checks auf dem tatsächlichen finalen PR-HEAD aus. Keine Gate-Umgehung und keine Änderungen an fremden Workflows nur zum Grünmachen. Unverfügbare Prüfungen ehrlich ausweisen.

Erstelle einen fokussierten Draft-PR auf main. Bewahre Referenzen, Hashes, Reproduktionsanleitung und Vorher/Nachher-Ergebnisse im Repository an passender Stelle; keine Videos/Bilder oder Kopie des gesamten eingefrorenen backend/-Baums committen. Eventuelle bereits vorhandene PR-2133-Artefakte gezielt wiederverwenden, ohne dessen alte Branch-Historie zu übernehmen.

Berichte am Ende kurz: PR/HEAD/BASE; reproduzierte Ursachen; konkrete Änderungen; Vorher/Nachher einschließlich Abdeckungsverlust und Schleichfahrt; Regressionsergebnisse; erforderliche CI auf genau diesem HEAD; verbleibende Grenzen; technische Merge-Bereitschaft. Bestätige: kein Merge/Deploy/Reprocessing/Flag-Wechsel; M7A, Mapbox, Scoring und andere Workstreams unverändert. Arbeite bis zum reviewbaren Ergebnis, nicht nur bis zu einem Plan.
