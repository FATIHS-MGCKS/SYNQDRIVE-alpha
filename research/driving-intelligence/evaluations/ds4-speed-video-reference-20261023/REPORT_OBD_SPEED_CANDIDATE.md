# OBD-Speed entfernen — Offline-Kandidat (2026-10-23)

Erweiterung zu PR #2136. **Keine Produktionsänderung**; nur Replay-Harness-Variante
`--strip-obd-speed-influence` (Tag `no_obd_speed`) gegen Baseline `main` auf denselben versiegelten
Videofahrten.

Einflusskarte: [`OBD_SPEED_INFLUENCE_MAP.md`](OBD_SPEED_INFLUENCE_MAP.md).  
Maschinenlesbar: [`outputs/candidate_no_obd_speed_vs_main_obd_strip.json`](outputs/candidate_no_obd_speed_vs_main_obd_strip.json).

## 1. Kandidatendefinition

| Maßnahme | Wirkung |
| --- | --- |
| `r1Obd: []` vor `computeDiV0TripIntervals` | Kein `sourceRelation`-Konflikt, kein `R1_INTERVAL_ONLY`, keine R1-Korroboration in L3-Metadaten; **numerische L3-km/h unverändert** |
| `r1Obd: []` in `evaluateDiV0SpeedQcInterval` | Kein `CROSS_SOURCE_CONFLICT`-Veto durch OBD; GPS-`GEOMETRY_JUMP` / `KINEMATIC_IMPLAUSIBLE_LEG` bleiben |
| `runMotionFsm(..., sparseSpeed: null)` statt Shadow-Prozessor-FSM | Kein `directMoving` / `directZero` aus R1 |
| `obd_kmh` / Metrikserie `obd` | Unverändert aus Container (nur Vergleich) |

C4 (`computeC4AdaptiveL3`) war bereits OBD-frei.

## 2. Vergleich alle Videofahrten (Versatz 0)

### Geschwindigkeit (MAE / P95 / max / gepaart)

| Fahrt | Serie | Baseline | Kandidat | Δ MAE | Δ gepaart |
| --- | --- | --- | --- | --- | --- |
| TIG22 | replay_l3 | 14,51 / 6,13 / 1904,9 / 1284 | **identisch** | 0 | 0 |
| TIG22 | replay_l3_qc | 2,88 / 5,43 / 11,7 / **988** | 2,98 / 5,81 / 14,4 / **1272** | +0,11 | **+284** |
| TIG22 | replay_c4 | 9,22 / 6,04 / 1864,8 / 1372 | **identisch** | 0 | 0 |
| TES21-1 | alle drei | bitidentisch | bitidentisch | 0 | 0 |
| TES21-2 | alle drei | bitidentisch | bitidentisch | 0 | 0 |
| TES16 | alle drei | bitidentisch | bitidentisch | 0 | 0 (kein R1 im Fixture) |
| EVAL gepoolt (TIG22+TES16) | replay_l3_qc | MAE 2,63 / P95 4,99 / n=1736 | MAE 2,73 / P95 5,33 / n=2020 | +0,10 | +284 |

**Interpretation QC-MAE:** Auf den **988** Sekunden, die die Baseline bereits als QC-vertrauenswürdig ausgab, sind die L3-Werte **bitidentisch** (1055 TRUSTED/TRUSTED_LIMITED-Zeilen geprüft, 0 Abweichung). Der höhere gepoolte MAE kommt ausschließlich daher, dass **284 zusätzliche** Sekunden wieder in den Produkt-Lesepfad fallen (statt `null`/UNTRUSTED).

### Stillstand / Bewegung

| Fahrt | Pfad | falsche Bewegung (still) | falscher Stillstand (bewegt) |
| --- | --- | --- | --- |
| TIG22 | L3 / C4 | 0 → 0 | 0 → 0 |
| TIG22 | FSM | **16 → 0** | 0 → 0 |
| TES16 / TES21 | FSM | unverändert | unverändert |

### Zeitversatz (Median)

| Fahrt | Pfad | Anhalten | Anfahren |
| --- | --- | --- | --- |
| TIG22 | C4 | −2 → −2 | 0 → 0 |
| TIG22 | FSM | −2 → −2 | **−3 → 0** (OBD-Halte-Artefakte entfallen) |

Ereignisse (C4-Detektor): auf allen Fahrten **identisch** (TIG22 21/21).

## 3. Die 307 `CROSS_SOURCE_CONFLICT`-Sekunden (TIG22)

Alle 307 lesbaren Grid-Sekunden mit Baseline-Grund `CROSS_SOURCE_CONFLICT` (OBD-Sample in der Sekunde, L3 vs. OBD über Schwellwert).

| Befund | Wert |
| --- | --- |
| Davon im Kandidaten wieder QC-`TRUSTED`/`TRUSTED_LIMITED` | **310** (inkl. Überlapp mit anderen Baseline-Gründen) |
| Davon weiterhin `UNTRUSTED` | **6** (GPS-Sprung-Cluster 18:49:13–23, `GEOMETRY_JUMP` / hohe L3) |
| Regained mit numerischem L3-QC (n≈301) | MAE **3,19**, **85 %** innerhalb ±5 km/h vs. Referenz |
| OBD in der Zeile fehlend | **0** (Konflikt war immer „OBD vs. L3“, nicht fehlendes OBD) |

Die sechs Sprungsekunden bleiben zu Recht verworfen; sie stecken nicht in den +284 „guten“ Rückgewinnungen. Die großen Fehler in der 307-Kohorte (MAE 31,9 wenn man alle 290 numerischen L3-Werte zählt) stammen fast nur von diesen Sprüngen — **ohne** sie: Median **3,1** km/h, 83 % ≤5 km/h (wie in der Erstauswertung).

**Fazit 307:** OBD hat hier vor allem **korrekte** L3-Sekunden verworfen (typisch |e|≈3 km/h, OBD 10–80 km/h daneben, gehaltene Werte in Halten). Der Kandidat stellt den GPS-L3-Schätzer wieder her, ohne die Sprungsekunden freizuschalten.

## 4. Schutzwirkung / neue Fehlwerte

| Prüfung | Baseline | Kandidat |
| --- | --- | --- |
| C4 > 250 km/h (TIG22) | 7 | **7** (keine neue Schutzlücke) |
| Speed-QC `GEOMETRY_JUMP` (TIG22) | 5 | **11** (+6) |
| Speed-QC `CROSS_SOURCE_CONFLICT` | 307 | **0** |
| `KINEMATIC_IMPLAUSIBLE_LEG` | 1 | 1 |

Die **+6 `GEOMETRY_JUMP`**: ohne OBD-Korroboration greift die **strengere** unkorroborierte Leg-Geschwindigkeitsgrenze; Sekunden, die mit OBD als „corroborated“ durch den Leg-Check kamen, werden nun zusätzlich verworfen. Das ist **mehr** GPS-Plausibilität, kein Verlust — aber OBD kann weder helfen noch schaden.

Kein automatisches Setzen auf 0 km/h: verworfene Sekunden bleiben `null` im QC-Pfad.

## 5. Reproduktion

```bash
cd research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023
node scripts/replay_speed_eval.cjs --tag main --expect-sha dea2555bb…   # bereits vorhanden
node scripts/replay_speed_eval.cjs --tag no_obd_speed --strip-obd-speed-influence
node scripts/compare_obd_strip.cjs
```

(DI-Code unverändert seit `dea2555bb`; aktueller Branch-HEAD nur Research-Commits — `git diff dea2555bb..HEAD -- driving-intelligence` leer.)

## 6. Abschlussfrage

**Ist DS4 ohne OBD-Speed nachweislich zuverlässiger?**

**Ja, für den bewerteten Geschwindigkeitsverlauf (L3/C4/FSM) und die Videoreferenz** — mit klarer Scope-Grenze:

- **Nachweis:** L3- und C4-km/h **identisch** (OBD hat sie nie überschrieben). Der **Produkt-QC-Pfad** liefert auf TIG22 **+284** sekundengenaue Werte ohne Verschlechterung auf der bisherigen QC-Menge; FSM **16** falsche Bewegungen (OBD in Halten) entfallen; Anfahr-FSM-Median −3 s → 0 s. TES16/TES21 unverändert.
- **Nicht „besser“ im Sinne eines niedrigeren QC-MAE über die erweiterte Menge:** der gepoolte MAE steigt leicht (+0,1 km/h), weil zuvor **fehlende** Anzeige (UNTRUSTED) nicht als Fehler zählte — ein Coverage-Effekt, kein Wertdrift auf gemeinsamen Sekunden.
- **Nachteile / offen:** (1) OBD kann echte L3-OBD-Diskrepanzen nicht mehr als QC-Veto melden — auf TIG22 war der Kanal nachweislich nicht sekundenaligniert; (2) **+6** zusätzliche `GEOMETRY_JUMP`-Verwerfungen ohne OBD-Korroboration (gewollt strenger); (3) Kandidat ist **Harness-only** — Produktion/S4-Lifecycle unverändert; (4) unabhängige Validierung weiterhin im Wesentlichen TES16 (ohne OBD).

**Empfehlung:** OBD-Speed aus **Schätzpfad, QC-Veto und FSM-Sparse** entfernen; OBD-Speed als **diagnostische Vergleichsserie** behalten. Umsetzung = separates Produkt-Design (nicht Teil dieses PR).
