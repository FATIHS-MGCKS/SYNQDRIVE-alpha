# EXP021 — Fokus Stillstand, Kriechen, Datenlücken

**Referenz:** PR #2051, Trip `358d0158-b2a9-47ed-af26-33926c5770b4`  
**Scope:** Ursachenanalyse + **Offline-Prototyp** (keine Produktivaktivierung, kein Deploy).  
**Zurückgestellt:** Beschleunigungs-/Dynamik-Auftrag (keine Brems-/Accel-Logik hier).

**Eingefrorene Baseline:** [`pre-deploy/`](./pre-deploy/) unverändert.  
**Maschinenexporte:** [`forensic-readonly-exports-2026-10-16-stationary-prototype/`](./forensic-readonly-exports-2026-10-16-stationary-prototype/)

---

## 1. Bestehende V2-Stillstandserkennung (erweitern, nicht ersetzen)

### Wann erkennt V2 Stillstand?

| Stufe | Bedingung (CONFIRMED, Code) |
|-------|-----------------------------|
| S1 L3 | Kalender-±1s-Support vollständig; `evaluateL3AtCenter` eligible. |
| Motion | `l3SpeedKmh < stopStationaryBandMaxKmh` (**3 km/h**) → `STATIONARY_SUPPORTED`; oder `FROZEN_STOP_SUPPORTED`. |
| Evidence | `speedEvidenceState=STATIONARY_BAND`, **`estimatedSpeedKmh` bleibt null** (kein Auto-0). |
| QC V2 | `TRUSTED_LIMITED` wenn Center-Position `PRESENT` + gültige Koordinaten; QC-intern bis **5 km/h** konsistent (`STATIONARY_MAX_TRUSTED_SPEED_KMH`). |

Eingangssignale: gepinnte **POSITION**-Buckets (1s-Labels), Hold/Release-Klassifikation, optional R1 — **kein Video**.

### Warum videoannotierte Stopps meist nicht erkannt werden

| Ursache | Evidenz |
|---------|---------|
| `ROW_ABSENT` im Pin | **133/135** Tacho-0-Sekunden → `NO_MOTION_EVIDENCE`, nicht `STATIONARY_BAND`. |
| L3-Fenster gebrochen | **45** s mit `PRESENT` am Zentrum, aber Nachbar-`ROW_ABSENT` (Supplement v3, Gruppe A). |
| Semantik | Fehlende Zeile ≠ Beweis für physischen Stillstand; Pipeline füllt nicht auf. |

### Tacho 1–3 km/h unter `STATIONARY_SUPPORTED`

- **Kein Namensfehler allein:** Band bedeutet „niedrige L3/Hold-Stop-Klasse“, nicht „GPS=0“.
- **11/14** `TRUSTED_LIMITED`-Sekunden mit lesbarem Tacho **1–3 km/h** (Bericht) — konsistent mit `CALIBRATION_UNSET_V0` (3/5 km/h) und QC V2.
- **Tacho 0** in Video: Anzeigequantum 1 km/h → **kein Beweis** für absolute Ruhe.

---

## 2. Referenzfälle (Videoannotationen)

Siehe [`REFERENCE_CASES.json`](./forensic-readonly-exports-2026-10-16-stationary-prototype/REFERENCE_CASES.json) — u. a.:

| Kategorie | Fall-IDs |
|-----------|----------|
| Längerer Stillstand | `LONG_HALT_1` … `LONG_HALT_5` |
| Kurzer Halt | `SHORT_HALT_AUTO_*` (aus comparison, 5–25 s Tacho 0 außerhalb Hauptfenster) |
| Langsames Rollen / Rangieren | `END_RANGIER` |
| Anhalten | `STOPPING_DECEL_BERICHT` |
| Wiederanfahren | `TRIP_START_MANEUVER` |
| Lücke im Stopp | `GAP_UNKNOWN_TACHO_05_44` (+ ChatGPT-Rückgabe 7 s) |
| Lücke bei Bewegung | `GAP_ROW_ABSENT_MOVING_PROXY` |
| Datenwüste vor Video | `PRE_VIDEO_PREFIX` |

**ChatGPT-Rückgabe (visuell unklar):** Labels in `chatGptVisualReturnLabels` im Prototyp-JSON (`03:44:03Z`–`03:44:09Z`).

---

## 3. Verfügbare Pipeline-Hinweise

Pro Sekunde (gepinnt, read-only): `positionAvailability`, `positionState` (Fresh/Hold/Release), S1 `motionState` / `abstentionReason`, QC `TRUSTED`/`TRUSTED_LIMITED`, L3-Bein-Implied-Speed (ohne Koordinaten im Export), R1 wo vorhanden.

- **Messzeit:** Bucket-Label UTC (1s-Raster), nicht Sensorzeitstempel.
- **Hold:** Wiederholte Koordinaten in Hold-Runs zählen **nicht** als neue Stillstandsbelege (Prototyp-Regel).
- **Video:** nur Bewertung, **kein** Detektor-Eingang.

**Provider-Vergleich:** **Ausgeführt** (2026-10-16, ein Abruf) — [`forensic-readonly-exports-2026-10-16-provider-comparison/`](./forensic-readonly-exports-2026-10-16-provider-comparison/). Pin unverändert. Zusammenfassung: [`EXP021_STATIONARY_SHARPENING_2026-10-16.md`](./EXP021_STATIONARY_SHARPENING_2026-10-16.md) §4.

---

## 4. Offline-Prototyp `EXP021_STATIONARY_OFFLINE_PROTOTYPE_V0_1` (Baseline)

Code: `backend/scripts/ops/exp021-stationary-offline-prototype.{ts,lib.ts}`  
Regenerieren: `npm run exp021:stationary-offline-prototype`

| Label | Regel |
|-------|--------|
| `STOP_V2_BAND` | Bestehende V2-Zeile (`STATIONARY_SUPPORTED` + `STATIONARY_BAND` + `TRUSTED_LIMITED`) — **Erweiterung**, kein Parallelpfad. |
| `STOP_STRICT` | Volles L3-Triplet + max Bein &lt; **1,5 km/h** — erzeugt **keine** numerische 0. |
| `CREEP` | Beine **1,5–5 km/h** ohne V2-Band — **nie** zu Stillstand hochstufen. |
| `UNKNOWN_GAP` | `ROW_ABSENT`, unvollständiges ±1s, `NO_MOTION_EVIDENCE`. |
| `MOVING` | Numerisches L3 ≥ 5 km/h. |

**Lücken:** keine pauschale Überbrückung &gt; **2 s** ohne frische Positions-Triplet-Evidenz (Parameter dokumentiert, nicht produktiv).

**Gruppe B (Hypothese):** nur bei `CREEP` — in dieser Fahrt **0 s** ausgelöst; Text im Export `groupBExperiment`.

**Dev/Validierung:** 80/20-Zeitsplit nur dokumentiert (`devHoldout`); **keine** Schwellen an dieser Fahrt gefittet.

### v0_2 Nachschärfung

Code: `exp021-stationary-offline-prototype-v2.{ts,lib.ts}`, `exp021-stationary-halt-forensic.lib.ts`  
Export: [`forensic-readonly-exports-2026-10-16-stationary-v2/`](./forensic-readonly-exports-2026-10-16-stationary-v2/) · Doku: [`EXP021_STATIONARY_SHARPENING_2026-10-16.md`](./EXP021_STATIONARY_SHARPENING_2026-10-16.md)

- CREEP **vor** `STOP_V2_BAND`; CREEP bleibt **0** wegen fehlender Bein-Geometrie/L3-Triplets, nicht wegen Band-Reihenfolge.
- Video-Kreuztabelle pro Prototyp-Label (0 / 1–3 / &gt;3 / unbekannt); **11** Band-Sekunden mit Tacho 1–3 als Display-Konflikt sichtbar.
- Fünf Haupthalt-Forensik + Provider-Integration.

---

## 5. Bewertung vs. unveränderte Baseline (v0_1 Snapshot)

Global (Export `2026-10-16T17:00:52Z`):

| Kennzahl | Wert |
|----------|-----|
| Video-annotiert Tacho 0 | **135 s** |
| Baseline V2 Stop (`TRUSTED_LIMITED` Band) | **14 s** |
| Prototyp Stop (`STOP_*`) | **14 s** (alle `STOP_V2_BAND`) |
| Übersehen vs. Video-0 | **135 s** |
| Falsch-Stillstand vs. Tacho ≥ 4 km/h | **0 s** |
| Falsch-Stillstand vs. L3 numerisch ≥ 5 km/h | **0 s** |
| UNKNOWN/Gap-artig | **314 s** |
| `ROW_ABSENT` | **269 s** |
| Numerische Coverage (separat) | 776 numerisch / 775 trusted |

**Erkennungsverzögerung:** Auf Haupt-Haltefenstern misst die Pipeline **keinen** V2-Stop (0/31 … 0/26 s) wegen Lücken — Verzögerung vs. Video nicht als Sekunden-Metrik sinnvoll, eher **vollständiges Ausbleiben** der Band-Akzeptanz.

**Gruppen A/B/C (Stillstandsauftrag):**

- **A (45+135):** Enthaltung/Lücke zwingend — fehlende/kompromittierte Positions-Evidenz.
- **B:** Kein belasteter Fall „verwertbare Geometrie ungenutzt“ in der Kohorte (0 CREEP, 0 zusätzliches `STOP_STRICT`).
- **C:** Übergänge/Rangieren ohne klare Video-Tacho-Zuordnung bleiben `TRANSITION`/`UNKNOWN`.

---

## Grenzfälle (kurz)

1. **14 s STATIONARY_SUPPORTED** mit Video 1–3 km/h — Regelkonform, semantisch ≠ „Parken mit 0 km/h“.  
2. **135 s Video-0** mit `NO_MOTION_EVIDENCE` — korrekte Enthaltung, kein QC-Bug.  
3. **45 s PRESENT + NO_MOTION** — Nachbar-Lücke, nicht „versteckter Stillstand“.  
4. **iPhone-Overlay** bei Tacho 0 zeigt 11–21 km/h — **nicht** als Fahrzeuggeschwindigkeit verwenden.

---

## Nicht-Ziele (dieser Auftrag)

Keine produktive Aktivierung, kein Deploy, keine Admission-Recovery, keine künstlichen Nullen, keine Beschleunigungslogik. Provider-Fetch nur als **separat versionierter** Vergleich (nicht Pin-Überschreibung).
