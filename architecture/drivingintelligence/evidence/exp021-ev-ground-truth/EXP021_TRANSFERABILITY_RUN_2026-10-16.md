# EXP021 — Übertragbarkeitslauf v0_2 (2026-10-16)

**Artefakte:** `forensic-readonly-exports-2026-10-16-retrospective-halt-transferability/`  
**Befehl:** `npm run exp021:retrospective-halt-transferability -- --out-dir <dir>`

## ABC-Korrektur (nur Bewertung)

`GAP_EVT_008`: Achse **B** = **NO** (1× Tacho >5 km/h gelabelt); Achse **A** unverändert **YES**.  
Regeneriert in `retrospective-halt-v2-freeze/VIDEO_ABC_005_008.*`.

## Verwendbare Fahrten (11)

| Integration | Fahrten | Rolle |
|-------------|---------|--------|
| **TESLA_SOFTWARE_DIMO** | Referenz `358d0158…` + Manifest `0effed9d…`, `c069cc9b…` | Referenz mit partiellem Video; 2× Robustheit ohne Video |
| **RUPTELA_LTE_R1** | 8 Manifest-Trips (`f502a4a0…` … `c65e7b49…`) | Robustheit / Datenqualität (Present 32–100 %) |

Keine Provider-Abrufe, keine Produktionsmutationen, Detektor-Parameter unverändert (`dc4339e7…`).

## Nachvollziehbar vs. auffällig (ohne Trefferquote)

**Tesla Referenz (Entwicklungsmaterial):**

- 10 Lücken ≥3 s: 6× `LIKELY_HALT`, 1× slow-roll, 3× nicht unterscheidbar — konsistent mit Freeze-Review.
- `GAP_EVT_002` / `003`: `LIKELY_HALT` **vor** Video-Anker — nur Plausibilität, kein Video-GT.
- LONG_HALT-Overlap bleibt getrennt von ABC-B.

**Ruptela (Robustheit):**

- `533b2bf8…`: 23 Lücken, 37 % Present — viele `NOT_DISTINGUISHABLE` (9) und 14× `LIKELY_HALT` (uplink/sparse risk).
- `f502a4a0…` / `c65e7b49…`: je 1 kurze Lücke, beide nicht unterscheidbar.
- `24deb8af…`: 52 % Present, 2× Halt + 1× unklar — mittlere Abdeckung.

**Tesla ohne Video (`c069cc9b…`):**

- 22 Lücken, 17× `LIKELY_HALT` — hohe Halt-Dichte; **kein** unabhängiger Nachweis.

## Nächster Qualitätsnachweis (Video fehlt)

Priorität für **neue** Aufnahmen entlang `EXP021_TRANSFERABILITY_CRITERIA.md`:

1. Halt ohne Ampel  
2. Langsames Durchrollen ohne Halt  
3. Stop-and-go  
4. Weiterfahrt mit Datenlücke  
5. Rangieren / Rückkehr gleicher Ort  

RD003 (segmentiertes GT) als Kandidat für Stop-and-go / Lücken — noch nicht an v0_2-P21-Loader angebunden.
