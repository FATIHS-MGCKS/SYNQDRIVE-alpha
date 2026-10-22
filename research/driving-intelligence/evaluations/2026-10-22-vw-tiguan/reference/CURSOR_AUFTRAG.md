# SYNQDRIVE – VW TIGUAN VIDEOREFERENZ 22.10.2026

Ziel: Die bereits vorhandenen S4-/DS4-Ergebnisse dieser Fahrt unabhängig gegen die beigefügte Videoreferenz prüfen. Fokus: angezeigte Geschwindigkeit, Stillstand/Anfahren, Beschleunigungs- und Verzögerungsphasen. Das Paket reicht für diese Gegenprüfung; die Originalvideos müssen nicht erneut analysiert werden.

## Arbeitsrahmen

Read-only-Auswertung, ohne Produkt-, Datenbank-, Flag-, Scheduler- oder Deploymentänderungen. Keine neue Modellvariante und keine Parameteroptimierung auf diesen Referenzdaten. Parallel laufende S4- und andere Workstreams sowie deren Branches, lokale Änderungen und Forschungsartefakte erhalten. Vorhandene freigegebene Lesezugänge und Snapshots verwenden. Die Auswertung in einem eigenen Ergebnisordner ablegen.

## 1. Referenz einlesen

Lies zuerst README.md, manifest.json und TIGUAN_2026-10-22_1Hz.csv. Prüfe 1.464 eindeutige Schlüssel `(source_clip, video_second)`, davon 1.417 verfügbare Tachowerte und 1.419 grobe Drehzahlen. Leere Felder sind fehlende Evidenz, niemals null. Geschwindigkeit in km/h, Drehzahl in U/min, Videosekunden/PTS in Sekunden. Die Drehzahl ist nur eine visuelle Näherung mit grob ±500 U/min.

Die Zeitanker sind Europe/Berlin, UTC+02:00 am 22.10.2026. Nutzer-Fahrtfenster ungefähr 20:30–21:04 lokal, also 18:30–19:04 UTC. Tabellenfenster ungefähr 20:38:34–21:03:02 lokal. Der Fahrtanfang fehlt; auch der genaue Fahrtabschluss ist nicht durch das Ende der Aufnahme bewiesen. Alle Referenzzeitpunkte sind nominal, mit etwa ±1 Sekunde Bild-/Zeitunsicherheit und nicht extern kalibrierter Telefonuhr.

## 2. Richtige Fahrt und vorhandene Versionen feststellen

VW Tiguan im richtigen Mandanten eindeutig verifizieren; Fahrzeug-ID, DIMO-Zuordnung und verfügbare VIN/Kennzeichenbelege dokumentieren. Nicht allein nach einer ungefähr passenden Uhrzeit oder einem alten Forschungs-Fahrzeugschlüssel zuordnen. Den passenden produktiven Trip anhand des gesamten Nutzerfensters identifizieren. Falls mehrere Trips oder gesplittete Abschnitte dazugehören, transparent auflösen.

Produktions-SHA, relevante S4-/M7A- und DS4-Version, Feature-/Shadow-Status sowie verwendete unveränderte Snapshot-/Artefakt-Hashes protokollieren. Nicht annehmen, dass ein gemergter PR bereits produktiv aktiv ist. Bestehende Produktionsausgaben und, falls schon vorhanden, reproduzierbare Offline-Ausgaben getrennt benennen. Fehlende oder nicht verfügbare Ausgaben als nicht verfügbar ausweisen.

## 3. Zeitlich abgleichen

Die Original-Clipanker und PTS verwenden. Clipabstände, die Lücke zwischen TC_00079 und TC_00080 sowie Ableselücken erhalten. Kein blindes Aneinanderhängen und keine Interpolation fehlender Video- oder Modellwerte.

Primär mit dem unveränderten nominalen Zeitbezug auswerten. Eine etwaige Untersuchung von ±1/±2 Sekunden als gesonderte Sensitivitätsanalyse berichten, nicht heimlich den besten MAE-Versatz als exakte Uhrzeit oder unabhängige Verbesserung darstellen. Einen belegten zusätzlichen Uhrenversatz nur mit unabhängiger Evidenz korrigieren und separat ausweisen.

Den sichtbaren Tacho vergleichen. Kamera-GPS, DIMO und OBD dürfen die Videoreferenz nicht ersetzen oder zur nachträglichen Korrektur der GT-Werte dienen. Die systematische Differenz zwischen Tachoanzeige und anderen Geschwindigkeitsquellen in der Interpretation berücksichtigen.

## 4. Kleine, nachvollziehbare Auswertung

- Eine Vergleichszeile je Referenzsekunde: Schlüssel, UTC/PTS, Tacho, DS4-/S4-Geschwindigkeit, Modellstatus, Differenz und Ausschlussgrund. Unbekannte Modellwerte getrennt von echten 0 km/h führen.
- Für gültige, gepaarte Sekunden: Anzahl, Abdeckung, MAE, P90/P95 des absoluten Fehlers und Bias (Modell minus Tacho). Gleiche Maske verwenden, wenn vorhandene Varianten miteinander verglichen werden.
- Sichtbare Nullfolgen aus visible_stops.csv und anschließendes Anfahren prüfen. Falsche Bewegung, falschen Stillstand, fehlende Ausgabe und zeitliche Verzögerung getrennt berichten. Clip- und Sichtlücken nicht als zusätzliche physische Halte zählen.
- Die neun Fenster aus analysis_windows.csv gegen die bereits vorhandene Beschleunigungs-/Verzögerungserkennung legen. Timing, Richtung und Größenordnung prüfen. Ableitungen aus dem Display nicht als kalibrierte Beschleunigungssensor- oder Brems-/Gaspedal-GT behandeln. Bestehende Ereignisdefinitionen offenlegen; keine neuen Schwellen auf diese Fahrt anpassen.
- Drehzahl nur mit frischer, tatsächlich vorhandener Drehzahl-Telemetrie vergleichen. Wenn eine geeignete Modell-/Providerquelle fehlt: N/A. Aus ungefährer Null-Drehzahl nicht allein einen Motorzustand oder Trip-Ende ableiten.
- Den nicht aufgenommenen Fahrtanfang und nicht belegten vollständigen Abschluss aus Start-/Ende-Recall und aus einer Bewertung der gesamten Trip-FSM-Grenzen ausschließen.

## Abschluss

Ein kompakter Bericht und die Vergleichs-CSV reichen: verifizierte Fahrzeug-/Trip-ID, verwendete Versionen, Referenz-/Modellabdeckung, Geschwindigkeitsfehler, Stillstand/Anfahren, neun Ereignisfenster, verbleibende echte Abweichungen und Grenzen der Evidenz. Klar unterscheiden zwischen Modellfehler, Zeit-/Anzeigeverzögerung, fehlender Telemetrie und nicht ablesbarem Video. Keine weiteren Forschungs- oder Implementierungsarbeiten automatisch starten.
