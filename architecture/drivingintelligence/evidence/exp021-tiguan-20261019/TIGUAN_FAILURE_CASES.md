# Tiguan EXP021 — Failure Cases & Variantendifferenzen

Algorithmus-Stand: `9f0693bef` (PR #2084 Research-Head, Route-Aware **R4.1**). Identische GPS- und OSM-Eingaben für A–E.

## Decoder-Differenzen (nachweisbar, Video-Fenster)

| Zeit (UTC) | A/C | B/D | E | Kontext |
|------------|-----|-----|---|---------|
| 10:34:46, 10:34:51, 10:34:54 | 737508498 | **737508499** | 737508498 | Parallele Ways nach Aufnahmelücke; **Backtrack R1** wechselt gegenüber Forward |
| 10:30:13 – 10:30:39 (mehrere s) | 382929735 | 382929735 | **401665362** | B-3-Standphase / parallele Fahrbahnen; **Route-Aware R4.1** abweichend von A–D |

Strict Node-ID (C/D) vs gerundete Geometrie (A/B): **keine** Way-Unterschiede im Video-Fenster (13 Diff-Buckets gesamt, alle A=C, B=D).

## Priorisierte Prüfstellen (Referenzgestützt)

### C01 Hebbelstraße vs Schwabstraße (TC_00071 ~109–164 s)

- Referenz stützt **Hebbelstraße** (Way **25932713**); benachbarter Name Schwabstraße explizit als Falle markiert.
- **A–E:** Way **25932713** wenn referenzseitig Way-ID gesetzt; bei `road_name_verified=UNKNOWN` ohne Way-Liste: **NOT_DECIDABLE** (kein erzwungener Konflikt).
- **Kein Nachweis**, dass Backtracking, Strict Node-ID oder R4.1 hier Schwabstraße statt Hebbel wählen — alle gleich 25932713.

### C02 B-3-Unterführung (E002, ~10:29:49–52Z)

- Referenz: Manöver UNDERPASS, Way-Menge B-3-Korridor.
- **Alle Varianten:** `DECODER_UNKNOWN` (kein Way) trotz `PRESENT` GPS — **fehlende Zuordnung**, kein referenzgestützter Way-Konflikt.

### C03 Parallele B-3-Fahrbahnen / Standphase (E003/E004)

- Referenz-Way-Listen breit; viele Sekunden **DECODER_UNKNOWN** unter Brücke/engem Korridor.
- Ab ~10:29:54Z teils Match auf Way **4321532** in Referenzliste.
- **E** wählt in Standphase häufiger **401665362** statt **382929735** (A–D) — Differenz **ohne** eindeutigen Referenz-Widerspruch (Mehrfach-Way-Listen).

### Gleichnamige Äste (Ziegelei, Bergmannsstraße)

- Way-Vergleich nur wo `osm_way_ids` gesetzt; sonst NOT_DECIDABLE.
- Keine zusätzlichen Varianten-Differenzen gegenüber A außer Backtrack/E oben.

### Aufnahmelücke / Zufahrt

- 76 Referenz-GAP-Sekunden: Vergleich **skipped**; DIMO-GPS im Replay unverändert.
- Backtrack-Differenz **nach** Lücke (parallele Ways) — Referenz dort GAP/UNKNOWN-dominiert.

## Aggregierte Way-Metrik (Nenner beachten)

Siehe `TIGUAN_VARIANT_METRICS.csv`:

- Video-Sekunden mit Beleg: **470**; Referenz-GAP: **76**.
- Way-vergleichbar (Referenz mit numerischer Way-ID): **373** / 546.
- Treffer/Konflikt zählen nur bei gesetzter Referenz-Way-ID; A/B/C/D identisch; **E:** 9 weniger Konflikte, 9 mehr UNKNOWN vs A.

## OSM-Extract-Grenzen

- Live-Overpass 2026-10-19, 75 m Korridor — Turn-Restrictions/Layer können unvollständig sein.
- `ROUTE_NOT_FOUND_IN_EXTRACT` / UNKNOWN nicht als „falsche Straße“ gewertet.
