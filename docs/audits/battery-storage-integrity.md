# Battery Health — Storage Integrity Audit (Prompt 5/8)

| Feld | Wert |
|------|------|
| **Audit-Zeitpunkt (UTC)** | 2026-07-16T11:00:00Z |
| **Repository-Git-Commit (lokal)** | `cca8658` (`battery-crank-feasibility`) |
| **VPS-deployed Commit** | `2cd57c8` (zum Analysezeitpunkt) |
| **Basis-Dokumente** | [`battery-runtime-topology.md`](./battery-runtime-topology.md), [`battery-signal-cadence-reality.md`](./battery-signal-cadence-reality.md), [`battery-rest-window-reality.md`](./battery-rest-window-reality.md), [`battery-crank-feasibility.md`](./battery-crank-feasibility.md) |
| **Methodik** | Read-only PostgreSQL SELECTs + PM2-Log-Grep; keine Writes/Backfills |
| **Untersuchte Umgebung** | **Produktion** (`app.synqdrive.eu` / VPS) |

---

## Executive Summary

**Kernbefund:** Die gespeicherten Battery-Health-Daten sind **teilweise konsistent geschrieben** (keine dedup-Kollisionen, keine PM2-Fehler-Logs), aber **fachlich nur eingeschränkt belastbar**. Ruhespannungen sind zu **~31 %** kontaminiert (> 13,2 V); Crank-Daten sind in **> 91 %** der Hook-Läufe nicht messbar; LV-SOH-Evidence ist **semantisch falsch etikettiert** (Verhaltensscore als `SOH_PERCENT`). **Alle 5 ICE-Fahrzeuge** stehen auf `STABLE` mit veröffentlichten SOH-Werten (71–93 %), obwohl Inputs aus Prompts 2–4 als **opportunistisch/kontaminiert** gelten.

| Metrik | Wert | Beleg |
|--------|------|-------|
| **Verdächtige Ruhespannungen** (> 13,2 V) | **28** (27 Snapshots + 1 Feature) | PG |
| **Unzuverlässige Crank-Messungen** | **122** Hook-Läufe ohne Drop + **4/5** Features mit `crankObservationCount>0` aber `crankDrop=null` | Logs + PG |
| **Semantisch falsche SOH-Evidence (30d)** | **362** Zeilen | PG |
| **Semantisch falsche SOH-Evidence (gesamt)** | **522** Zeilen | PG |
| **LV-Scores gesamt belastbar?** | **Nein** (nur diagnostisch/teilweise) | Gesamtbewertung |

---

## 1. Audit-Zeitraum

| Parameter | Wert |
|-----------|------|
| **Primärfenster** | Letzte **30 Tage** (`observedAt` / `recordedAt ≥ 2026-06-16`) |
| **Gesamtbestand** | `battery_features`, `battery_evidence` (vollständig), `hv_battery_health_current` (vollständig) |
| **Klassifikation** | Prompts 2–4 liefern Kontext; diese Prüfung validiert **Persistenzschicht** |

---

## 2. Datenquellen und Tabellen

| Tabelle / Quelle | Rolle | Datensätze (Stichprobe) |
|------------------|-------|------------------------:|
| `battery_features` | LV-Features, Scores, Publication | **5** (ICE) |
| `battery_health_snapshots` | LV-Rohsnapshots | **87** (30d) |
| `battery_evidence` | Kanonische Evidence | **13 724** (30d) / **71 903** (gesamt) |
| `hv_battery_health_snapshots` | HV-Zeitreihe | **69 795** (30d) |
| `hv_battery_health_current` | HV-Publication | **1** (KS FH 660E) |
| `vehicle_latest_states` | Live-LV/HV-Spiegel | **6** |
| `vehicle_battery_specs` | Chemie/Spec | **5** |
| `vehicle_trips` | Start-Kontext Ruhe | **338** (30d) |
| PM2-Logs | Partielle Writes / Hook-Fehler | read-only grep |

**Nicht vorhanden:** Werkstatt-/Dokument-Evidence (`documentExtractionId` / `serviceEventId` = **0**).

---

## 3. Analysierte Entitäten

| Entität | Anzahl |
|---------|-------:|
| DIMO-Fahrzeuge | **6** (5 ICE, 1 BEV) |
| `battery_features`-Zeilen | **5** |
| `battery_health_snapshots` (30d) | **87** |
| `battery_evidence` (30d) | **13 724** |
| Integritäts-Befunde (klassifiziert) | **479** |

---

## 4. Befunde je Klasse

| Klasse | Anzahl | Anteil (an 479) |
|--------|-------:|----------------:|
| **SEMANTICALLY_MISLABELED** | **362** | 75,6 % |
| **SUSPECT** | **116** | 24,2 % |
| **INVALID** | **1** | 0,2 % |
| VALID | 0 | — |
| PARTIAL_WRITE | 0 | — |
| DUPLICATE | 0 | — |
| UNSUPPORTED_PROFILE | 0 | — |
| LEGACY_UNVERIFIABLE | 0 | — |

*Hinweis:* Viele Befunde sind **pro Evidence-Zeile** gezählt (362 SOH-Evidence-Einträge), nicht pro Fahrzeug.

---

## 5. Ruhespannungsprobleme

### 5.1 Features (`battery_features`)

| Befund | Anzahl | Beispiel | Klassifikation |
|--------|-------:|----------|----------------|
| `vOff60m` oder `vOff6h` **> 13,2 V** | **1** | veh-c10351f8: `vOff60m=14,428 V` | **SUSPECT** |
| `rest60mCapturedAt` = `rest6hCapturedAt` | **3** | veh-a60c0749, veh-c43c3b45, veh-8c850ff1 | **SUSPECT** |
| Wert außerhalb 9–16 V | **0** | — | — |

### 5.2 Snapshots (`battery_health_snapshots`, 30d)

| Befund | Anzahl | Rate |
|--------|-------:|-----:|
| `restingVoltage` **> 13,2 V** | **27** | **31,0 %** (27/87) |
| Plausibel 9–16 V, ≤ 13,2 V | **60** | 69,0 % |
| `engineRunning=true` | **0** | Feld immer `false` (Prompt 2) |

### 5.3 Kontextwidersprüche

| Befund | Anzahl | Beleg |
|--------|-------:|-------|
| Ruhe-Snapshot **±15 min** um Trip-Start | **75** | PG + Trips |
| Alter wiederholter Provider-Timestamp | Indirekt (Prompt 2) | Nicht pro Snapshot rekonstruierbar |

**Verteilung Ruhespannungen (30d):** min **12,09 V**, median **12,65 V**, max **14,76 V** (**durch Produktionsdaten belegt**).

---

## 6. Crank-Probleme

| Befund | Anzahl | Klassifikation |
|--------|-------:|----------------|
| Crank-Log **ohne** messbaren Drop (`drop=—`) | **122** / 134 | **SUSPECT** |
| Crank-Log **mit** Drop | **12** | teils VALID/PROXY |
| Features: `crankObservationCount > 0`, `crankDrop = null` | **4** / 5 | **SUSPECT** |
| `vRecovery5s` = `vRecovery30s` | **4** / 5 | **SUSPECT** |
| `crankDrop < 0,1 V` (vernachlässigbar) | **1** | veh-19fedd4b: 0,048 V |
| Gleicher Trip mehrfach in Logs | **0** | — |
| EV mit ICE-Crank-Score | **0** | BEV ohne LV-Features |

**Aktueller Bestand `crankDrop` in Features:** Nur **1** Fahrzeug mit Wert ≠ null (0,048 V); **4** mit `null` trotz `crankObservationCount` 2–8.

---

## 7. Lebenszyklus-Mixe

`battery_features` speichert **nur den letzten** Crank-/Rest-Zustand pro Fahrzeug (**durch Code belegt**). Dadurch mischen Scores faktisch **verschiedene Lebenszyklen**:

| Muster | Beispiel | Klassifikation |
|--------|----------|----------------|
| Neuer Rest + alter Crank | veh-c10351f8: Rest 2026-07-16, Crank 2026-07-16 05:39 | **SUSPECT** (gleicher Tag, unterschiedliche Events) |
| Rest/Crank **> 14 Tage** auseinander | veh-a60c0749: crankAt 2026-07-13, rest 2026-07-14 | Grenzwertig |
| `qualifiedEventCount` hoch, aktuelle Inputs stale | veh-c10351f8: 106 Events, `vOff60m` kontaminiert | **SUSPECT** |
| Score `scoredAt` vs. `firstUsableMeasurementAt` | Alle ICE STABLE nach ≥ 5 Tagen | Regelwerk formal erfüllt |

**Publication vs. Evidence-Alter:** HV `lastPublishedAt` 2026-06-09, `updatedAt` 2026-06-21 — Publication **älter** als letzter HV-Update (**durch Produktionsdaten belegt**).

---

## 8. Evidence-Probleme

### 8.1 Semantik

| `valueType` | `sourceType` | Anzahl (30d) | Problem |
|-------------|--------------|-------------:|---------|
| `SOH_PERCENT` | `MODEL_DERIVED` | **197** | LV-**Verhaltensscore**, nicht Provider-SOH |
| `SOH_PERCENT` | `TELEMETRY_DERIVED` | **165** | Veröffentlichter SynqDrive-Score, nicht gemessene SOH |
| **Gesamt SOH (30d)** | — | **362** | **SEMANTICALLY_MISLABELED** |
| **Gesamt SOH (all-time)** | — | **522** | PG |

Provider-SOH, Werkstatt-SOH und Modellscore sind in der Evidence-Schicht **nicht unterscheidbar** über `valueType=SOH_PERCENT` (**durch Code belegt**, `battery-v2.service.ts` `recomputeHealth`).

### 8.2 Duplikate / Lücken

| Prüfung | Ergebnis |
|---------|----------|
| Dedup-Key-Kollisionen (`battery_evidence_dedup_key`) | **0** |
| Snapshots ohne passende `RESTING_VOLTAGE_V`-Evidence | **0** im 30d-Fenster |
| Dokument-/Service-Evidence | **0** Zeilen |
| HV-Snapshots ohne HV-Evidence | **Nein** — Evidence parallel vorhanden |

### 8.3 Evidence nach Typ (30d, Auszug)

| Scope | valueType | sourceType | Zeilen |
|-------|-----------|------------|-------:|
| HV | SOC_PERCENT | TELEMETRY_DERIVED | 4 396 |
| LV | SOH_PERCENT | MODEL_DERIVED | 197 |
| LV | RESTING_VOLTAGE_V | TELEMETRY_DERIVED | 87 |
| LV | VOLTAGE_V | TELEMETRY_DERIVED | 87 |

---

## 9. Partielle Writes

| Prüfung | Ergebnis | Klassifikation |
|---------|----------|----------------|
| `battery_features.scoredAt` ohne `rawSohPct` | **0** | — |
| `publishedSohPct` ohne `rawSohPct` | **0** | — |
| Features mit Rest/Crank aber ohne `scoredAt` | **0** | — |
| HV-Snapshots ohne Evidence | **Nein** | — |
| PM2 `Battery V2 onSnapshot failed` | **0** | Logs |
| PM2 `Battery V2 crank capture failed` | **0** | Logs |

**Bewertung:** Keine klassischen **PARTIAL_WRITE**-Indizien in PG/Logs. Fire-and-forget-Fehler könnten **ohne Log** verloren gehen (Architektur-Risiko, Prompt 1) — **nicht verifizierbar** als fehlende Zeilen.

---

## 10. Publication-Probleme

### 10.1 LV (ICE) — alle 5 Fahrzeuge `STABLE`

| Fahrzeug | `publishedSohPct` | `rawSohPct` | `qualifiedEventCount` | `vOff60m` | `crankDrop` | Spec |
|----------|------------------:|------------:|----------------------:|----------:|------------:|------|
| veh-c10351f8 | **92** | 100 | 106 | **14,428** ⚠ | null | AGM |
| veh-a60c0749 | 71 | 62 | 30 | 12,267 | null | AGM |
| veh-c43c3b45 | 93 | 49 | 12 | 12,088 | null | Lead-Acid |
| veh-8c850ff1 | 89 | 86 | 13 | 12,574 | null | **null** ⚠ |
| veh-19fedd4b | 89 | 97 | 21 | 12,658 | 0,048 | Lead-Acid |

| Befund | Anzahl | Klassifikation |
|--------|-------:|----------------|
| `STABLE` ohne `batteryType` | **1** | **SUSPECT** |
| `STABLE` mit `vOff60m > 13,2 V` | **1** | **SUSPECT** / fachlich **INVALID** |
| `STABLE` ohne verwertbaren `crankDrop` | **4** | **SUSPECT** |
| `publishedSohPct` bei `INITIAL_CALIBRATION` (LV) | **0** | LV korrekt gated |

**Problem:** `qualifiedEventCount` zählt **jede** Rest-/Crank-Beobachtung mit `crankDrop != null` bzw. Rest-Capture — **auch kontaminierte** Ruhemessungen erhöhen den Zähler (**durch Code belegt**). veh-c10351f8 mit **98** `restObservationCount` und **STABLE** bei **14,43 V** Ruhespannung ist **fachlich nicht belastbar**.

### 10.2 HV (KS FH 660E)

| Feld | Wert | Problem |
|------|------|---------|
| `publicationState` | **INITIAL_CALIBRATION** | — |
| `publishedSohPct` | **85** | **INVALID** — Published während Calibration |
| `validEstimateCount` | **2** | Unter STABLE-Schwelle (Code: ≥ 6) |
| `lastPublishedAt` | 2026-06-09 | Veraltet vs. Betrieb |

---

## 11. Zähler- / Race-Indizien

| Prüfung | Ergebnis |
|---------|----------|
| Doppelte `crankObservationCount` vs. unique Trips | Kein globaler Überzähler nachweisbar |
| Parallele Updates / Lost Update | **Nicht verifizierbar** ohne Row-Versioning |
| `restObservationCount` >> unique Rest-Fenster | **Ja** — z. B. 98 vs. ~39 Snapshots (veh-c10351f8) |
| Snapshot-Job SUCCESS, Battery silent fail | **0** Log-Treffer; Architektur-Risiko bleibt |

**Indiz:** Hohe `restObservationCount` bei wiederholten/kontaminierten Captures deutet auf **Zähler-Inflation ohne Qualitätsgate** (**aus Stichprobe abgeleitet**).

---

## 12. ICE / EV / PHEV

| Profil | Features | LV Publication | HV Publication | Hauptprobleme |
|--------|----------|----------------|----------------|---------------|
| **ICE** (5) | 5 Zeilen | **5× STABLE**, SOH 71–93 % | n/a | Kontaminierte Ruhe, leerer Crank, SOH-Evidence-Semantik |
| **BEV** (KS FH 660E) | **0** LV | n/a | **INITIAL_CALIBRATION** + `publishedSohPct=85` | HV-Publication-Widerspruch; kein LV |
| **PHEV/HEV** | 0 | — | — | Nicht in Flotte |

---

## 13. Beispiele (anonymisiert / bekannter Testkontext)

### Ruhespannung kontaminiert

| Fahrzeug | `recordedAt` (UTC) | V | Klasse |
|----------|-------------------|-----|--------|
| veh-c10351f8 | 2026-06-24T08:49:27 | **14,705** | SUSPECT |
| veh-a60c0749 | 2026-07-13T20:35:24 | **14,756** | SUSPECT |
| **KS FH 660E** | — | kein LV | UNSUPPORTED_PROFILE |

### Publication vs. Input

| Fahrzeug | Published SOH | `vOff60m` | Bewertung |
|----------|-------------:|----------:|-----------|
| veh-c10351f8 | **92 %** | **14,43 V** | Score **nicht belastbar** |

### HV-Widerspruch

| Fahrzeug | State | Published | Bewertung |
|----------|-------|----------:|-----------|
| KS FH 660E | INITIAL_CALIBRATION | **85 %** | **INVALID** |

---

## 14. Bewertung Bestandsdaten

| Kategorie | Daten | Empfehlung für spätere Nutzung |
|-----------|-------|------------------------------|
| **Weiterverwendbar (mit Gate)** | LV-Snapshots **≤ 13,2 V**, nicht nahe Trip-Start; einzelne Crank-Drops ≥ 0,3 V | Nach Qualitätsklassifikation |
| **Nur diagnostisch** | Veröffentlichte SOH 71–93 %; Recovery-Spannungen; HV-SOC-Zeitreihe | UI-Trend, nicht als absolute SOH |
| **Zu superseden** | `vOff60m=14,428` (veh-c10351f8); alle Snapshots > 13,2 V; identische 60m/6h-Paare als zwei Messungen | Bei künftiger Pipeline |
| **Nicht belastbar** | **31 %** Ruhe-Snapshots; **91 %** Crank-Hooks; **522** LV-SOH-Evidence-Zeilen; HV `publishedSohPct` unter Calibration | Nicht für Compliance/Audit ohne Neuklassifikation |

---

## 15. P0 / P1 / P2 Findings

| ID | Prio | Finding | Klassifikation |
|----|------|---------|----------------|
| **R-I01** | **P0** | **27+1** Ruhespannungen > 13,2 V persistiert; veh-c10351f8 **STABLE 92 %** mit `vOff60m=14,43 V` | **durch Produktionsdaten belegt** |
| **R-I02** | **P0** | **362** LV-`SOH_PERCENT`-Evidence-Zeilen = Verhaltensscore, nicht echte SOH | Code + PG |
| **R-I03** | **P1** | **4/5** ICE: `crankDrop=null` trotz `crankObservationCount>0` — Crank-Komponente im Score faktisch leer | PG |
| **R-I04** | **P1** | **75** Ruhe-Snapshots nahe Trip-Start — Wake/Start-Kontamination | PG |
| **R-I05** | **P1** | HV: `publishedSohPct=85` bei `INITIAL_CALIBRATION` | **INVALID** |
| **R-I06** | **P2** | **3/5** identische `rest60m`/`rest6h`-Timestamps — doppelte Zählung | PG |
| **R-I07** | **P2** | **0** Dokument-/Werkstatt-Evidence — keine unabhängige SOH-Quelle | PG |
| **R-I08** | **P2** | `qualifiedEventCount` inflatiert durch kontaminierte Rest-Captures | Code + PG |
| **R-I09** | **P2** | veh-8c850ff1 **STABLE** ohne `batteryType` | PG |

---

## 16. Sichere read-only Queries

### Ruhespannungen > 13,2 V

```sql
SELECT vehicle_id, recorded_at, resting_voltage, voltage_v
FROM battery_health_snapshots
WHERE resting_voltage > 13.2
ORDER BY recorded_at DESC;

SELECT vehicle_id, v_off_60m, v_off_6h, rest_60m_captured_at, rest_6h_captured_at
FROM battery_features
WHERE v_off_60m > 13.2 OR v_off_6h > 13.2;
```

### Semantisch falsche SOH-Evidence

```sql
SELECT scope, source_type, value_type, count(*) AS n
FROM battery_evidence
WHERE value_type = 'SOH_PERCENT'
  AND scope = 'LV'
  AND provider = 'SynqDrive'
GROUP BY scope, source_type, value_type;
```

### Publication vs. Inputs

```sql
SELECT vehicle_id, publication_state, published_soh_pct, raw_soh_pct,
       qualified_event_count, rest_observation_count, crank_observation_count,
       v_off_60m, v_off_6h, crank_drop
FROM battery_features;
```

### HV-Publication-Widerspruch

```sql
SELECT vehicle_id, publication_state, published_soh_pct, valid_estimate_count, last_published_at
FROM hv_battery_health_current
WHERE published_soh_pct IS NOT NULL
  AND publication_state = 'INITIAL_CALIBRATION';
```

### Ruhe nahe Trip-Start

```sql
SELECT s.vehicle_id, s.recorded_at, s.resting_voltage, t.start_time
FROM battery_health_snapshots s
JOIN vehicle_trips t ON t.vehicle_id = s.vehicle_id
WHERE s.resting_voltage IS NOT NULL
  AND abs(extract(epoch FROM (s.recorded_at - t.start_time))) < 900;
```

### PM2 (read-only)

```bash
grep -hc "Battery V2 onSnapshot failed\|Battery V2 crank capture failed" \
  /root/.pm2/logs/synqdrive-out*.log
grep -h "Crank features captured" /root/.pm2/logs/synqdrive-out*.log | grep -c "drop=—V"
```

---

## 17. Nicht verifizierbare Punkte

| Punkt | Grund |
|-------|-------|
| Race Conditions / Lost Updates | Kein Optimistic-Locking auf `battery_features` |
| Stille fire-and-forget-Fehler ohne Log | Nicht als fehlende DB-Zeilen nachweisbar |
| Ignition/RPM zum Snapshot-Zeitpunkt (historisch) | Nicht in `battery_health_snapshots` |
| Ob einzelne SOH-Evidence-Zeilen vor Score-Bug entstanden | Keine Versionshistorie |
| PHEV-Datenintegrität | Keine Fahrzeuge |

---

## 18. Gesamtbewertung: Sind Battery-Scores belastbar?

**Nein — nicht als verlässliche absolute 12-V- oder HV-SOH für operative Entscheidungen.**

| Schicht | Belastbarkeit |
|---------|---------------|
| **Veröffentlichte LV-SOH (71–93 %)** | **Nicht belastbar** — basiert auf kontaminierten Ruhemessungen, fehlendem Crank, falschem Evidence-Label |
| **Ruhespannungs-Historie** | **~69 %** plausibel (≤ 13,2 V); **31 %** verworfen |
| **Crank-Features** | **Nicht belastbar** (Prompt 4) |
| **HV Published SOH (85 %)** | **INVALID** unter Calibration-State |
| **Evidence-Stream** | **Diagnostisch** nach Neuklassifikation; SOH-Typ semantisch falsch |
| **Technische Konsistenz (Writes)** | **Gut** — keine Duplikate, keine offenen Partial-Write-Logs |

---

## 19. Klassifikations-Legende

- **durch Produktionsdaten belegt** — VPS PostgreSQL / Logs
- **durch Code belegt** — Repository-Inspektion
- **aus Stichprobe abgeleitet** — analytische Einordnung
- **nicht verifizierbar** — fehlende Historie/Signale

---

**Changes / Architektur:** Nicht aktualisiert — reine read-only Audit-Dokumentation.
