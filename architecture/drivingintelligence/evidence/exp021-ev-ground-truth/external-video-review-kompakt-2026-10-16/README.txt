EXP021 – Review V1, 16.10.2026

Bericht.md / Bericht.html: fachliche Auswertung und Grenzen.
Cursor-Prompts.md: kopierbare Read-only-Evidenzaufträge und Experimentdesign.
analysis/results/comparison.csv und comparison.json: 1136 Sekundenzeilen.
analysis/frame-observations.json: alle 1028 ursprünglichen Stichproben, einschließlich doppelter Uhrlabels.
analysis/frames/: die dazugehörigen Originalausschnitte als vollständige extrahierte Einzelbilder.
analysis/results/events.json, zero-display-intervals.json, numeric-gaps.json und five-second-dynamics.json: Ereignisse und Zeitfenster.
PROVENANCE_REVIEW.json: aktuelle Provenienz. EXP021_Video_Inventar.json ist die historische Eingangsinventur und enthält inzwischen überholte Einschränkungen; nicht als aktuellen Analyseumfang lesen.
review-bundle/: unveränderte eingefrorene DI-Quellen aus Commit518fc3dd67.

Reproduktion der Kennzahlen aus den enthaltenen Annotationen:
Python3 mit numpy, im entpackten Hauptordner ausführen:
python analysis/compare.py
python analysis/enrich.py
python analysis/finalize_rows.py
Keine Originalvideos für diese Berechnung nötig. Die Originalvideos verbleiben an den im Manifest angegebenen Drive-Quellen; sie sind wegen Größe nicht dupliziert. Für neue Frame-Extraktion ffmpeg/ffprobe verwenden und Hashes vorher vergleichen. Grafikerstellung benötigt matplotlib/Pillow.

CSV: UTF-8, Kommatrennung; Dezimalpunkt; leere Zahlenfelder sind unbekannt, niemals implizit0. JSON ist die maßgebliche Darstellung für null und Arrays. Uhrzeiten explizit UTC/Berlin. bucketLabelUtc ist kein nachgewiesener Messzeitpunkt.

Geschwindigkeiten km/h. Beschleunigungen m/s². confidence/validation-Felder lesen: Koordinaten und die meisten iPhone-GPS-Werte sind ungeprüfte OCR-Kandidaten. Nur Tacho-Werte aus visueller Prüfung sowie explizit markierte GPS-Stichproben sind visuell bestätigt. Keine Pedal-/Bremspedalbeobachtung und keine kWh-Messung.

Die Auswertung ist eine etwa1-Hz-Frame-Stichprobe mit gezielter Verdichtung, keine Vollannotation aller Videoframes. Keine Flotten- oder Nach-Deploy-Freigabe.
