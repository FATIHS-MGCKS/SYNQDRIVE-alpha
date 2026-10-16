# EXP021 — Stillstandsprototyp Nachschärfung (2026-10-16)

**Branch/PR:** `cursor/exp021-ev-ground-truth-7d78` · #2051  
**Scope:** Bewertung, CREEP-Ursache, Haupthalt-Forensik, **ein** Provider-Vergleichsabruf, nächster Offline-Versuch.  
**Keine** Produktivaktivierung, keine Fahrtgrenzenänderung, eingefrorene `pre-deploy/` unverändert.

**Neue Exporte (additiv):**

| Verzeichnis | Inhalt |
|-------------|--------|
| [`forensic-readonly-exports-2026-10-16-stationary-v2/`](./forensic-readonly-exports-2026-10-16-stationary-v2/) | Prototyp **v0_2**, korrigierte Video-Kreuztabelle, Halt-Forensik |
| [`forensic-readonly-exports-2026-10-16-provider-comparison/`](./forensic-readonly-exports-2026-10-16-provider-comparison/) | Frischer DIMO-Historical-Abruf (getrennt vom Pin) |

**Skripte:** `exp021:stationary-offline-prototype-v2`, `exp021:dimo-provider-position-comparison-fetch` (Provider-Abruf erfordert Produktions-`backend.env` + Nest — im Cloud-Agent typischerweise VPS-Lauf).

---

## 1. Korrigierte Bewertung (v0_2)

Pro Sekunde wird die **Vorhersagekategorie** gegen **Video-Tacho-Buckets** gezählt (`STATIONARY_PROTOTYPE_V2_EXPORT.json` → `videoCrossTabByPrototypeLabel`):

| Prototyp-Label | Video 0 | Video 1–3 | Video >3 | Video unbekannt |
|----------------|--------:|----------:|---------:|----------------:|
| `UNKNOWN_GAP` | **135** | 21 | 33 | 125 |
| `STOP_V2_BAND` | 0 | **11** | 0 | 3 |
| `TRANSITION` | 0 | 7 | 17 | 8 |
| `MOVING` | 0 | 1 | 748 | 27 |
| `STOP_STRICT` / `CREEP` | 0 | 0 | 0 | 0 |

**Semantik:**

- **`STOP_V2_BAND`** = bestehende V2-Slow-Movement-Band (`STATIONARY_BAND` + `TRUSTED_LIMITED`) — **kein** bestätigter absoluter Stillstand.
- **`STOP_STRICT`** = strengere Offline-Aussage (L3-Triplet + Bein-Geometrie &lt; 1,5 km/h) — **0 s** auf dieser Replay.
- **Konflikt Tacho 1–3:** **11 s** `STOP_V2_BAND` mit lesbarem Video-Tacho 1–3 km/h → als **Anzeige-Konflikt** zur strengen Stillstandslesart sichtbar (`v2BandDisplayConflictTacho1to3`), nicht automatisch als physikalischer Fehler.
- **Konflikt Tacho &gt;3 vs. strikter Stop:** **0** (`strictStopConflictVsVideoTachoGt3`).
- **135 s Video-Tacho-0** bleiben überwiegend `UNKNOWN_GAP` (Pin `ROW_ABSENT` / `NO_MOTION_EVIDENCE`), nicht „übersehener V2-Stop“.

v0_1-Bewertung „Falsch-Stillstand nur bei Tacho ≥4“ war für das Ziel **unzureichend**; v0_2 trennt Band vs. Strict und weist 1–3 km/h explizit aus.

---

## 2. Warum CREEP = 0?

| Hypothese | Ergebnis |
|-----------|----------|
| V2-Band blockiert CREEP (Reihenfolge v0_1) | **Teilursache in v0_1** — in v0_2 CREEP **vor** Band; `creepWouldHaveBeenV2BandIfOldOrder` = **0**. |
| Fehlende Eingangsevidenz | **Dominant (CONFIRMED):** Keine Sekunde mit `PRESENT_OK` + vollem Kalender-±1s + Bein-Implied **1,5–5 km/h** ohne vorheriges numerisches L3 ≥5. Band-Sekunden haben `maxLegImpliedKmh` **null** (Hold/Band-Pfad, keine Creep-Geometrie). |
| Video-Halte | **133/135** Tacho-0-Sekunden → `UNKNOWN_GAP`, nicht Creep-Kandidaten. |

Entscheidungsspuren für **11** Band-Sekunden mit Tacho 1–3: [`BAND_TACHO_1_3_DECISION_TRACE.json`](./forensic-readonly-exports-2026-10-16-stationary-v2/BAND_TACHO_1_3_DECISION_TRACE.json).

---

## 3. Befund je Haupthalt (5 Fenster)

Maschinenlesbar: [`MAIN_HALT_FORENSICS.json`](./forensic-readonly-exports-2026-10-16-stationary-v2/MAIN_HALT_FORENSICS.json).

| Halt | Dauer | PRESENT im Halt (Pin) | ROW_ABSENT im Halt | Muster |
|------|------:|----------------------:|-------------------:|--------|
| LONG_HALT_1 | 31 s | 0 | 31 | Roll-in mit ~12→0,7 m/s vor Halt; nach Halt ähnliche Koordinaten (~0,7 m) — **Lücke deckt Video-Stillstand** |
| LONG_HALT_2 | 40 s | 0 | 40 | Analog: letzte PRESENT vor Lücke, erste danach; **kein** V2-Band im Fenster |
| LONG_HALT_3 | 8 s | 1 (Rand `03:42:50Z`) | 7 | Kurzer PRESENT am Fensterstart, Rest Lücke |
| LONG_HALT_4 | 20 s | 0 | 20 | Vollständige Lücke im Kernhalt |
| LONG_HALT_5 | 26 s | 0 | 26 | Vollständige Lücke |

**Gleiche Koordinate vor/nach Lücke** beweist keinen durchgehenden Stillstand (unbeobachtete Bewegung in `ROW_ABSENT` möglich).

---

## 4. Provider-Vergleich (ein Abruf)

**Datei:** [`DIMO_PROVIDER_POSITION_COMPARISON.json`](./forensic-readonly-exports-2026-10-16-provider-comparison/DIMO_PROVIDER_POSITION_COMPARISON.json)  
**Fenster:** `[2026-10-16T03:36:00Z, 2026-10-16T03:54:56Z)`, Token `186946`, `currentLocationCoordinates` 1s AVG, **1** `acquireDiV0HistoricalPositions`, kein Retry.

| Kennzahl | Wert |
|----------|-----|
| Provider-Zeilen / PRESENT / ROW_ABSENT (gesamt) | 867 / 867 / **269** |
| Labels in 5 Haupthalten | 125 |
| Fresh **PRESENT** in Halten | **1** (`03:42:50Z`, Pin ebenfalls PRESENT) |
| Fresh **ROW_ABSENT** in Halten | **124** |
| Pin ROW_ABSENT + Fresh ROW_ABSENT (Halt-Labels) | **124/125** |

**Antwort auf die historische Frage:** Videoannotierte Stopps fehlen im Pin **und** in der jetzt abgerufenen Providerantwort an denselben 1s-Labels — **kein** Nachweis, dass nur die Pin-Verarbeitung die Positionen verworfen hat. Spätere Nachlieferung ≠ damaliger Verarbeitungsfehler (hier: weiterhin ROW_ABSENT).

---

## 5. Nächster Lösungsversuch (messbar)

**Pfad B — `B_MISSING_AT_PROVIDER` (CONFIRMED):**

- **Regel:** Keine Stillstandsfortschreibung über Halt-Lücken; niedriger GPS-/L3-Wert allein beweist keine absolute Ruhe.
- **Messziel:** Auf dieser Referenzfahrt **0** zusätzliche `STOP_STRICT`/`CREEP`-Sekunden allein durch Provider-Replay erwarten, bis eine **andere** Datenquelle (z. B. dichtere Positionsserie, anderes Signal) explizit freigegeben wird.
- **Optionaler A-Pfad** nur wenn künftig Pin ROW_ABSENT ∧ Fresh PRESENT auf Halt-Labels auftaucht (hier: **0** solcher Labels).

**80/20-Holdout:** `holdoutAssessment.verdict` = **nicht belastbar** für Stop-Validierung (nur **4** Video-Tacho-0-s im Holdout ab `03:51:08Z`); bereits eingesehene Präfix-Sekunden nicht als Blindtest verkaufen.

---

## 6. Regenerierung

```bash
cd backend
npm run exp021:stationary-offline-prototype-v2 -- --out-dir ../architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-stationary-v2
# Provider (Produktion):
npm run exp021:dimo-provider-position-comparison-fetch -- --out-dir ../architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-provider-comparison
```

Siehe auch [`EXP021_STATIONARY_CREEP_GAP_FOCUS.md`](./EXP021_STATIONARY_CREEP_GAP_FOCUS.md) (Abschnitt v0_2 ergänzt).

**Vertiefung (Evidenzoberfläche, kein zweiter Provider-Abruf):** [`EXP021_STATIONARY_EVIDENCE_SURFACE_2026-10-16.md`](./EXP021_STATIONARY_EVIDENCE_SURFACE_2026-10-16.md)
