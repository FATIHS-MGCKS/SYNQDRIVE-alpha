# DS4 — Integration OBD-Entkopplung (#2137) + GPS-Ausreißerschutz (#2134)

**Integrationsbranch:** `cursor/ds4-obd-gps-integrate-192d` (neu; **überschreibt nicht** `#2134` / `#2137`).  
**Replay-Tag:** `integrate_obd_gps` @ `98a6e21f3` (+ Test-Fixes im Folgecommit).

| PR | Head (Stand Prüfung) | Inhalt |
| --- | --- | --- |
| [#2134](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2134) | `f95420593` | GPS-1s-Leg-Quarantäne, C4/FSM auf bereinigten Positionen, R1-Punktautorität (non-speed) |
| [#2137](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2137) | `84c155c1e` | `di-v0-r1-vehicle-speed-ds4-boundary` — R1-**Speed** ohne L3/QC/FSM-Einfluss |
| **Integration** | Merge #2137 → #2134 | Ein Konflikt (`evidence.adapter` limitations); beide Marker behalten |

Keine doppelte OBD-Strip-Logik: #2137-Grenzmodul bleibt; #2134 `fsmPointAuthority` gilt nur für **verbleibende** Sparse-Metadaten, FSM erhält weiterhin `null` aus der Grenzschicht.

## Ziele (Integrationsstand)

| Ziel | Status (4 Referenzfahrten) |
| --- | --- |
| OBD-Speed ohne L3/QC/FSM | Wie #2137; vs. #2134 nur OBD-Strip zusätzlich (`integrate` ≡ `pr2134` auf C4 common support) |
| GPS-Sprünge aus C4/Motion | Wie #2134; **keine** km/h >250 auf C4 in TIG22-Sprungfenster |
| Unbekannt ≠ 0 | FSM `UNKNOWN` an Sprungsekunden (z. B. 18:49:18Z); QC `UNTRUSTED` bei absurdem L3 |
| Trip-Lifecycle / andere OBD | Unverändert |

## Replay

```bash
cd research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023
node scripts/replay_speed_eval.cjs --code-root <repo> --tag integrate_obd_gps --expect-sha <integration-sha>
node scripts/compare_tags.cjs --baseline main --candidate integrate_obd_gps --series replay_c4
node scripts/compare_tags.cjs --baseline prod_code --candidate integrate_obd_gps --series replay_c4
node scripts/compare_tags.cjs --baseline pr2134 --candidate integrate_obd_gps --series replay_c4
```

Artefakte: `outputs/integrate_obd_gps/`, `outputs/candidate_integrate_obd_gps_vs_*_replay_c4.json`.

## GPS-Sprung TIG22 (18:49:12–18:49:22Z, TC_00081)

| Sekunde | L3 / QC (Produktpfad) | C4 `main` / `#2137` | C4 + FSM **Integration** |
| --- | --- | --- | --- |
| 18:49:12 | L3 ≈67, QC TRUSTED | C4 ≈67 | **C4 leer** (Leg-Quarantäne); FSM MOVING |
| 18:49:18 | L3 ≈**1930**, QC **UNTRUSTED** (GEOMETRY_JUMP) | C4 ≈**1930** | **C4 leer**; FSM **UNKNOWN** |
| 18:49:22 | L3 ≈1971, QC UNTRUSTED | C4 leer | C4 leer; FSM UNKNOWN |

**Befund:** Bekannte GPS-Sprünge erreichen **nicht** die vertrauenswürdige Produkt-Geschwindigkeit (QC blockiert). **Roh-L3** kann weiterhin absurd numerisch sein — das ist L3-Schätzung, nicht QC-Freigabe. **C4/Motion:** Integration wie #2134 — Sprungwerte erscheinen **nicht** auf C4; ein C4-Beschleunigungsereignis (`18:49:12–18:49:18`) entfällt vs. `main`/`#2137`.

### Verlorene plausible C4-Werte (vs. `main` / `#2137` nur GPS)

Auf TIG22 **8** C4-Sekunden weniger gepaart: **7** mit >250 km/h (Sprungkaskade), **1** plausibel (**18:49:12Z**, ref 71 km/h, C4 ≈67) — Kollateralschaden der Leg-Quarantäne am Sprungfenster.

### Abdeckung / Motion (TIG22, vs. Baseline `main`)

| Metrik | main → integrate |
| --- | --- |
| C4 gepaart | 1372 → 1364 |
| FSM falsche Bewegung (still) | 16 → **0** (#2137) |
| FSM Anfahren Median | −3 s → **0 s** |
| C4 motionNoClaim | 14 → 22 (mehr „kein Claim“ statt Phantom-C4) |
| Motion-Events | 21 → 20 (−1 ACCELERATION am Sprung) |

`TES16` (EVAL, unabhängig): C4/FSM/Events **unverändert** vs. Integration. `TES21`: DEV-only, numerisch unverändert.

### Integrate vs. #2137 allein (`prod_code`)

Nur **GPS**-Effekt: 8 C4-Sekunden weniger auf TIG22; FSM/Motion an Sprung wie #2134. OBD-/QC-/FSM-Strip identisch zu #2137.

### Integrate vs. #2134 allein

**Bitidentisch** auf C4 common support (1364 s) — Integration fügt nur OBD-Entkopplung hinzu (L3/QC/FSM-Strip ohne Änderung an C4-Zahlen).

## Regressionstests (Integrations-HEAD)

```bash
cd backend
npx jest --testPathPatterns='di-v0-r1-vehicle-speed-ds4-boundary|motion-core-shadow|motion-core-review|tiguan-20261022|leg-consistency|speed-qc'
```

**108/108** bestanden (inkl. Tiguan-Hardening aus #2134 + angepasste Erwartungen für OBD-FSM-Strip).

## Empfohlene PR-/Merge-Reihenfolge

1. **Review #2134** (GPS/C4/FSM-Fundament) und **#2137** (OBD-Speed-Grenze) parallel — keine Voraussetzung „andere bereits gemergt“.
2. **Merge-Reihenfolge auf `main`:** zuerst **#2134**, danach **#2137** (minimale Konfliktfläche; ein Adapter-Konflikt bereits in Integration gelöst).
3. **Alternativ:** einen **Integrations-Draft-PR** von `cursor/ds4-obd-gps-integrate-192d` statt zweier sequentieller Merges — gleicher Code-Stand, eine Review-Runde.
4. **#2136** (Forschung/Replay) bleibt getrennt; nach Produkt-Merge Replay-Tags `integrate_obd_gps` mit neuem `main`-SHA aktualisieren.

**Nicht in diesem Workstream:** Merge, Deploy, neue Beschleunigungs-/Bremsdetektoren.

## Offene Punkte

- L3-Rohschätzung bei GEOMETRY_JUMP weiterhin numerisch absurd — QC hält Produktpfad; separates L3-Thema (nicht #2134/#2137).
- Leg-Quarantäne kann **eine** plausible C4-Sekunde am Sprungrand mitnehmen (TIG22 18:49:12).
- OBD-Speed-Stichprobe weiterhin eng (RUPTELA TIG22).
