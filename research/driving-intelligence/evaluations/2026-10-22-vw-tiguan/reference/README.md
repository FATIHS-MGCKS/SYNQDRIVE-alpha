# VW Tiguan – Videoreferenz vom 22.10.2026

Die neun Originalvideos wurden in Dateireihenfolge TC_00077.MOV bis TC_00085.MOV geprüft. Die Tabelle enthält eine Ablesung pro Videosekunde, insgesamt 1.464 Zeilen. 1.417 Tachowerte und 1.419 grobe Drehzahlablesungen sind vorhanden. Fehlende Ablesungen bleiben leer; es wurden keine Geschwindigkeiten oder Drehzahlen interpoliert.

## Zeit und Abdeckung

- Nutzerangabe zur gesamten Fahrt: ungefähr 20:30–21:04 Uhr.
- Nominales Fenster der Tabellenzeilen: 20:38:34–21:03:02 Uhr, Europe/Berlin (UTC+02:00).
- Gesamtlänge der Medien: 1.463,435 Sekunden, etwa 24 Minuten 23 Sekunden.
- Der Fahrtanfang und ungefähr die letzte Minute des angegebenen Fahrtfensters sind nicht vollständig belegt. Der letzte sichtbare Tacho steht auf null; das beweist nicht den exakten SynqDrive-Fahrtabschluss.
- Zwischen TC_00079 und TC_00080 liegt eine Aufnahmelücke von ungefähr vier Sekunden. An anderen Clipgrenzen sind zusätzlich Abweichungen bis ungefähr einer Sekunde möglich. Die Dateien wurden nicht lückenlos aneinandergehängt.
- Der sichtbare Kamera-Zeitstempel wurde gegen QuickTime-Metadaten geprüft. TC_00077 hat einen modalen Overlay-Versatz von +1 Sekunde zur Metadatenzeit, die übrigen Clips von 0 Sekunden. Einzelne eingeblendete Sekunden können an Anzeigewechseln um eine Sekunde abweichen.
- `time_local_estimated` und `time_utc_estimated` sind nominale Zuordnungen zum jeweiligen Clipanker, keine extern kalibrierten Messzeitpunkte. Für die Bild-/Zeitzuordnung etwa ±1 Sekunde berücksichtigen; ein zusätzlicher unbekannter Versatz der Telefonuhr ist nicht ausgeschlossen. Der Fahrzeug-Uhrzeit im Cockpit wurde keine Zeitautorität gegeben.
- `video_second` beginnt je Datei bei 0. `video_pts_s` enthält den tatsächlich ausgewählten Frame-Zeitpunkt. Es wurde jeweils der erste Frame bei oder unmittelbar nach der nächsten ganzen Videosekunde ausgewählt.

## Was die Werte bedeuten

`speed_display_kmh` ist die große digitale Geschwindigkeitsanzeige des Fahrzeugs. Die Ablesungen wurden nach automatischer Vorlesung bildlich geprüft und korrigiert. Sie sind eine Referenz für die angezeigte Geschwindigkeit; die tatsächliche physikalische Geschwindigkeit wurde damit nicht kalibriert.

Die Kamera blendet zusätzlich eine GPS-Geschwindigkeit ein. Diese wurde nicht als Ersatz für den Tacho übernommen. Sie liegt während der Fahrt oft darunter und bleibt bei manchen sichtbaren Halten über null stehen, beispielsweise bei Tacho 0 und eingeblendeten 11,6 km/h. Deshalb ist die GPS-Einblendung nicht Teil der freigegebenen Zahlenspalten.

`rpm_estimate` ist eine visuelle Näherung am Drehzahlzeiger, auf 250 U/min gerundet, mit grob ±500 U/min Unsicherheit. Die Rundung ist keine Genauigkeitszusage. Ein Wert von 0 bedeutet einen Zeiger nahe null; daraus nicht ohne weitere Evidenz einen gesicherten Motorzustand ableiten. Auch bei fahrendem Fahrzeug kann der Zeiger nahe null stehen.

Es wurden keine SynqDrive-, DIMO- oder OBD-Werte zur Ergänzung oder Korrektur dieser Videoreferenz verwendet. Die Fahrzeugzuordnung stammt vom Nutzer; die produktive Fahrzeug-ID/VIN wurde in dieser Analyse nicht geprüft.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `TIGUAN_2026-10-22_Referenztabelle.xlsx` | Lesbare Tabellen mit Messwerten, neun Analysefenstern, sichtbaren Nullfolgen und Quellen. |
| `TIGUAN_2026-10-22_1Hz.csv` | Maßgebliche maschinenlesbare Ablesungen mit Clip, Videosekunde, PTS, Zeitankern, Tacho, Drehzahl und Qualitätskennzeichen. |
| `TIGUAN_2026-10-22_display_trends.csv` | Aus aufeinanderfolgenden Tachowerten abgeleitete Geschwindigkeitsänderung pro Sekunde. |
| `TIGUAN_2026-10-22_analysis_windows.csv` | Neun vollständig ablesbare Beschleunigungs-/Verzögerungsfenster mit Start- und Endwerten. |
| `TIGUAN_2026-10-22_visible_stops.csv` | Elf zusammenhängende Folgen mit mindestens zwei sichtbaren 0-km/h-Ablesungen. |
| `TIGUAN_2026-10-22_reading_gaps.csv` | Nicht ablesbare Bereiche für Tacho und Drehzahl getrennt. |
| `manifest.json` | Quellenlinks, Originaldatei-Hashes, Dateilängen, Zeitanker und Umfang. |
| `CURSOR_AUFTRAG.md` | Begrenzter Auftrag zur Gegenprüfung mit vorhandenen S4-/DS4-Daten. |

CSV: UTF-8, Komma als Feldtrenner, Punkt als Dezimalzeichen, leeres Feld = fehlender Wert. Schlüssel: `(source_clip, video_second)`. Zeitstempel allein sind nicht der Datensatzschlüssel. Relative Sekunden des Gesamtfensters behalten Clipabstände bei.

## Verwendung für Beschleunigen, Bremsen und Stillstand

`accel_from_display_mps2` wird als `(Tacho_neu − Tacho_alt) / 3,6 / ΔPTS` berechnet, ausschließlich innerhalb desselben Clips und ohne fehlenden Zwischenwert. Es ist eine Ableitung der Anzeige mit ihrer Quantisierung und Aktualisierungsverzögerung, kein direkt gemessenes Beschleunigungssignal. Ein-Sekunden-Spitzen sind deshalb keine kalibrierte Grundlage für einen Harsh-Event-Grenzwert.

Die neun Analysefenster beschreiben beobachtete Beschleunigung oder Verzögerung. Brems- und Gaspedalbetätigung sind im Bild nicht direkt belegt. Eine Verzögerung kann auch durch Ausrollen oder andere Fahrzeugeingriffe entstehen. `pedal_ground_truth=NOT_OBSERVED` bleibt deshalb ausdrücklich erhalten.

Die elf Nullfolgen sind keine gesicherte Anzahl verschiedener physischer Halte. Ein Halt kann durch einen Clipwechsel oder eine Sichtlücke in mehrere Folgen zerfallen. Die angegebene Mindestdauer ist der Abstand zwischen erster und letzter Null-Ablesung; Beginn und Ende des physischen Halts können außerhalb dieses Bereichs liegen. Aus Lücken weder Bewegung noch Stillstand ableiten.

Die fehlenden Anfangs- und Endbereiche eignen sich nicht zur Bewertung der vollständigen Trip-FSM-Grenzen. Dies ist eine Referenz für das tatsächlich aufgenommene Teilstück.
