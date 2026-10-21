# Tiguan EXP021 — Zeitzuordnung

## Ausgangslage

- Referenz: `timestamp_utc_device` = Gerätezeit-Kandidat (Europe/Berlin → UTC), **ohne** externe UTC-Kalibrierung.
- DIMO: `bucketLabelUtc` im S4-Positions-Snapshot (1-Hz-Raster Trip 10:15:00–10:39:39Z).
- `timestamp_utc` / `utc_sync_uncertainty_ms` in der Referenz bewusst leer.

## Gewählte Zuordnung (für alle Varianten A–E identisch)

| Parameter | Wert |
|-----------|------|
| Modell | **0 s Offset** — `timestamp_utc_device` = `timestamp_utc_aligned` = DIMO-`bucketLabelUtc` |
| Status | `DEVICE_UTC_CANDIDATE_ZERO_OFFSET` |
| Unsicherheit | `UNCALIBRATED_DEVICE_CLOCK_1S_DISPLAY` (1-s-Anzeigeauflösung ≠ garantierte UTC-Fehlergrenze) |

**Nicht** durch Decoder-Trefferquote optimiert.

## Anker (Beispiele)

| Anker | Referenz | DIMO (gleiches Label) | Hinweis |
|-------|----------|------------------------|---------|
| Trip-Start Video `global_second=0` | Overlay 51.348983, 9.517009 | 51.3489933, 9.5170166 @ 10:29:19Z | Haversine ~**1,3 m** |
| B-3-Unterführung E002 | 10:29:49–52Z | `PRESENT`, Koordinaten fortgeführt | Ereignisfenster deckt DIMO-Buckets |
| Aufnahmelücke | 12:33:40–12:34:55 lokal (76 s GAP) | DIMO-Buckets weiter vorhanden | Keine visuelle Bewertung; GPS bleibt im Replay |
| Clipgrenze TC_00070→TC_00071 | ~10:33:39 / 10:34:56Z | Lücke in Referenz, nicht in DIMO | Keine erfundene Manöververbindung |

Weitere Anker in `TIGUAN_TIME_ALIGNMENT.csv` (546 Zeilen).

## Widersprüchliche Anker

- Kein systematischer Offset-Sweep durchgeführt (kein externer UTC-Referenztrack).
- Mögliche Verwechslung: **Uhrfehler** vs. **Sensor-/Anzeigelatenz** bei 1-Hz-Raster nicht trennbar ohne Roh-`recorded_at`-Export.

## Sensitivität

Bei ±1 s Bucket-Verschiebung würden Ereignisgrenzen und Way-Vergleiche verschieben; ohne kalibrierte UTC keine exakte sekündliche Way-Accuracy behauptet.

## Empfehlung nächster Schritt

Optional: read-only Export provider-seitiger Messzeitstempel pro Position-Zeile (getrennt von `bucketLabelUtc`) zur Schätzung eines Offset-**bereichs**, ohne Referenz anzupassen.
