# EXP021 — Referenzsemantik LONG_HALT_1–5

**Numerische Annotationen unverändert** (`EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC` in Code/Export).

## Was LONG_HALT_* bedeutet

`LONG_HALT_1` … `LONG_HALT_5` sind **fünf zusammenhängend lesbare Tacho-0-Abschnitte** aus dem Video-Overlay (Anzeigeauflösung), **nicht** fünf unabhängig bewiesene physische Haltereignisse.

- Physische Stillstände, Stillstandsdauer und exakte Ereignisgrenzen sind **nicht** aus der Annotation allein abgeleitet.
- Detektor-Lückenkandidaten (z. B. `GAP_EVT_008`) können **breiter** sein als ein einzelnes Tacho-0-Fenster, ohne dass das eine „fehlerhafte Verschmelzung“ von zwei Halten ist — es ist eine **Positionslücke** mit optional **mehreren** annotierten Tacho-0-Teilfenstern.

## LONG_HALT_4 und LONG_HALT_5

| | UTC | Europe/Berlin (CEST, 2026-10-16) |
|--|-----|----------------------------------|
| H4 annotiert | `03:43:43Z` – `03:44:02Z` | **05:43:43** – **05:44:02** |
| H5 annotiert | `03:44:10Z` – `03:44:35Z` | **05:44:10** – **05:44:35** |
| **Annotationslücke** | `03:44:03Z` – `03:44:09Z` | **05:44:03** – **05:44:09** (Tacho **unbekannt**) |

- Aus der **7 s** unbekannter Tacho-Werte allein ist **kein** Wiederanfahren oder zweites physisches Haltende ableitbar.
- **Physische Ereignisanzahl** für H4/H5 (ein Halt, zwei Halte, Rollen in der Lücke): **ungeklärt** — additiv dokumentiert, ohne die Sekundenfenster zu ändern.
- `GAP_EVT_008` (`03:43:43Z`–`03:44:36Z`) überlappt H4 und H5, weil die **gemeinsame Positionslücke** beide annotierten Tacho-0-Abschnitte und die Annotationslücke umfasst — **kein** Bewertungsfehler allein wegen „Zusammenfassung“.

## Zeitlabel

**Europe/Berlin 05:xx = UTC 03:xx** an diesem Fahrtag (CEST, UTC+2).

Video sichtbar ab Anker `03:37:41Z` / **05:37:41** Berlin (`VIDEO_ANCHOR`).

## Videoabdeckung (bestehendes Material)

| Lücke | UTC | Berlin | Mit vorhandenem Video prüfbar? |
|-------|-----|--------|--------------------------------|
| GAP_EVT_002 | 03:36:07–03:36:55 | 05:36:07–05:36:55 | **Nein** — vollständig vor Video-Anker |
| GAP_EVT_003 | 03:36:59–03:37:44 | 05:36:59–05:37:44 | **Teilweise nein** — überwiegend vor Anker; kein weiteres „früheres Video“ anfordern |
