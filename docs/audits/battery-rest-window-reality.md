# Battery Health — Rest Window Reality Audit (Prompt 3/8)

| Feld | Wert |
|------|------|
| **Audit-Zeitpunkt (UTC)** | 2026-07-16T10:45:00Z |
| **Repository-Git-Commit (lokal)** | `a357c96638ea29aed405484702fdd34416663d21` |
| **VPS-deployed Commit** | `2cd57c8` (zum Analysezeitpunkt) |
| **Basis-Dokumente** | [`battery-runtime-topology.md`](./battery-runtime-topology.md), [`battery-signal-cadence-reality.md`](./battery-signal-cadence-reality.md) |
| **Methodik** | Read-only PostgreSQL + ClickHouse + PM2-Logs auf Produktion |
| **Untersuchte Umgebung** | **Produktion** (`app.synqdrive.eu` / VPS) |

---

## Executive Summary

**Kernbefund:** Die Battery-V2-Ruhelogik **feuert opportunistisch** auf dem **ersten frischen LV-Sample** nach Überschreiten von 60 min / 6 h Ruhe (gemessen als `observedAt − lastActivityAt`), nicht auf einer **zeitnahen Messung** exakt bei 60 min / 6 h nach Abstellen. In der Produktion werden **nur ~13 %** der ICE-Ruhefenster ≥60 min mit einer Ruhespannung belegt; **~31 %** der gespeicherten Ruhespannungen liegen **> 13,2 V** (Alternator/Ladekontamination). **REST_60M** und **REST_6H** sind in der aktuellen Form **nicht production-ready** für belastbare Ruhespannungs-Health.

| Metrik | ICE (Produktion, ~30 d) | Beleg |
|--------|-------------------------|-------|
| Ruhefenster ≥ 60 min | **148** | Trip-Gap-Methode |
| Ruhefenster ≥ 6 h | **84** | Trip-Gap-Methode |
| **60m-Capture-Rate** (Fenster mit ≥1 `restingVoltage`-Snapshot) | **12,8 %** (19/148) | `battery_health_snapshots` |
| **6h-Capture-Rate** | **21,4 %** (18/84) | `battery_health_snapshots` |
| Gespeicherte Ruhespannungen > 13,2 V | **27 / 87** (31 %) | Snapshots |
| Davon plausibel valide (12,0–13,2 V, nahe 60m/6h) | **3 / 87** (3,4 %) | Stichproben-Klassifikation |
| BEV-Ruhefenster ≥ 60 min | **51** | Trip-Gap; **0** LV-Captures |

**Antwort Leitfrage:** Wake-up-, Alternator- und DC/DC-Spannungen **können und werden** fälschlich als Ruhespannung gespeichert — **durch Produktionsdaten belegt** (27 Fälle > 13,2 V, viele morgendliche 14,3–14,7 V bei `speed=0`, `ignition=false`).

---

## 1. Zeitraum und Stichprobe

| Parameter | Wert | Klassifikation |
|-----------|------|----------------|
| **Zielzeitraum** | 2026-06-16 – 2026-07-16 (30 d) | Beabsichtigt |
| **Effektive Auswertung** | ~25–30 d (Poll-Logs ab 2026-06-21; Snapshots ab 2026-06-22) | **durch Produktionsdaten belegt** |
| **DIMO-Fahrzeuge** | 6 (5 ICE, 1 BEV) | PG |
| **Abgeschlossene Fahrten** | **338** | PG |
| **ICE-Ruhefenster ≥ 60 min** | **148** (Ziel ≥20: **erfüllt**) | Trip-Gap |
| **BEV-Ruhefenster ≥ 60 min** | **51** (Ziel ≥20: **erfüllt**) | Trip-Gap |
| **PHEV/HEV** | 0 | **durch Produktionsdaten belegt** |

### Fahrzeugprofile

| Label | Profil | Ruhefenster ≥60m | Ruhe-Snapshots (30d) | `restObservationCount` |
|-------|--------|------------------:|---------------------:|-------------------------:|
| **veh-c10351f8** | ICE (Audi A4) | ~40+ | **39** | 98 |
| **veh-a60c0749** | ICE (AMG C63) | ~25+ | **12** | 27 |
| **veh-19fedd4b** | ICE (Tiguan) | ~20+ | **14** | 16 |
| **veh-8c850ff1** | ICE (Arteon) | ~15+ | **10** | 11 |
| **veh-c43c3b45** | ICE (Golf) | ~10+ | **10** | 10 |
| **KS FH 660E** | BEV (Tesla Model 3) | 51 | **0** (kein LV) | — |

**KS FH 660E** gezielt geprüft: 51 Ruhefenster, **kein** `lvBatteryVoltage`, **kein** LV-Rest-Capture (**durch Produktionsdaten belegt**).

---

## 2. Methodik zur Erkennung von Ruhefenstern

### Primäre Fensterdefinition (Audit)

| Signal | Verfügbarkeit | Verwendung |
|--------|---------------|------------|
| **Trip-Ende (`vehicle_trips.endTime`)** | **belastbar** | Ruhebeginn-Proxy für Auswertung |
| **Nächster Trip-Start** | **belastbar** | Ruheende |
| **Speed = 0 (CH)** | **grob** | 98 %+ der BEV-CH-Zeilen Stillstand; Provider-Timestamp oft stale |
| **Ignition off (ICE CH)** | **belastbar** wenn online | 100 % ICE-CH-Abdeckung |
| **engineRunning** | **nicht verfügbar** | Immer `false` in Snapshots (**Prompt 2**) |
| **lastActivityAt (Trip Detection)** | **belastbar** (aktuell); **nicht historisch** | Battery-V2-Gate — **durch Code belegt** |
| **Provider-Timestamp (`recorded_at` / `lastSeen`)** | **grob** | 94–99 % Wiederholungen während Ruhe |
| **exteriorAirTemperature** | **nicht verfügbar** im Poll-Pfad | Nur sporadisch `outsideTemperatureStartC` an Trips |
| **chargingStatus (EV)** | **grob** | VLS `tractionBatteryIsCharging`; nicht in CH-Historie |

### Implementierte Battery-V2-Definition (**durch Code belegt**)

```97:140:backend/src/modules/vehicle-intelligence/battery-health/battery-v2.service.ts
  async onSnapshot(
    vehicleId: string,
    lvBatteryVoltage: number | null,
    observedAt: Date | null = null,
  ): Promise<void> {
    // ...
    if (sampleAgeMs > BATTERY_MAX_SAMPLE_AGE_MS) return; // 5 min stale guard
    const detState = await this.prisma.vehicleTripDetectionState.findUnique(/*...*/);
    if (detState.state !== TripDetectionState.RESTING || !detState.lastActivityAt) return;
    const restDurationMs = sampleAt.getTime() - detState.lastActivityAt.getTime();
    if (restDurationMs < REST_60M_MS) return;
```

**Wichtige Abweichung Audit vs. Code:**

| Dimension | Audit-Fenster (Trip-Gap) | Battery V2 (Ist) |
|-----------|--------------------------|------------------|
| Ruhebeginn | `trip.endTime` | `vehicle_trip_detection_states.lastActivityAt` |
| Messzeitpunkt | Poll-Wanduhr | `observedAt` = Provider `lastSeen` / LV-Signal-Timestamp |
| Capture-Zeitpunkt | ~60 min / ~6 h nach Abstellen | **Erster frischer Sample** nach Schwellwert |

**Klassifikation:** Viele Captures fallen **nicht** in das 58–90-min-Fenster nach Trip-Ende → **CURRENT_IMPLEMENTATION_MISCLASSIFIED** (57/87 Snapshots, **aus Stichprobe abgeleitet**).

---

## 3. Reales Providerverhalten nach Fahrtende

### Fragen 1–3 (pro Ruhefenster, Flottenmuster)

| Frage | Befund | Beleg |
|-------|--------|-------|
| **1. Neue Provider-Timestamps während Ruhe?** | **Selten.** Median Polls/Fenster ≈ **665** (~5,5 h @ 30 s), aber unique Provider-Timestamps nur bei Datenlieferung / Wake | CH + Prompt 2 |
| **2. Wann endet reale Telemetrie?** | Provider liefert oft **letzten Zustand** stundenlang weiter (Repeat-Rate ~97 %); BEV KS FH 660E: **~30 h** stale | Prompt 2 |
| **3. `signalsLatest` unverändert trotz Poll?** | **Ja**, dominantes Muster | Prompt 2 |

### Zeitpunkte nach Fahrtende (Proxy über CH `recorded_at` + Poll-Logs)

| Offset | Typisches Verhalten | Klassifikation |
|--------|---------------------|----------------|
| **Sofort / 5 min** | Letzter Fahrt-/Stillstandswert; oft **identischer** `recorded_at` | Stale-Repeat |
| **30–60 min** | Meist **kein** neuer Provider-Timestamp; Polls laufen weiter | **durch Produktionsdaten belegt** |
| **6–12 h** | Wenn Fahrzeug offline: **kein** frisches LV (`BATTERY_MAX_SAMPLE_AGE_MS` blockiert) | Code + Prompt 2 |
| **Nächster Wake** | Erster **frischer** `observedAt` — oft **14+ V** (Laden/Alternator) | Snapshots + Logs |

---

## 4. Capture-Rate 60 Minuten

| Metrik | Wert | Beleg |
|--------|------|-------|
| ICE-Ruhefenster ≥ 60 min | **148** | Trip-Gap |
| Fenster mit ≥1 `battery_health_snapshots.restingVoltage` | **19** | PG |
| **Reale 60m-Capture-Rate** | **12,8 %** (19/148) | PG |
| PM2-Log `Battery 60m rest captured` (Zeitraum Jun–Jul 2026) | **69** Events | Logs (mehrere pro Fahrzeug/Fenster möglich) |
| Fenster mit Capture **und** Snapshot 30–90 min nach Trip-Ende | **19** (relaxiert) | PG |

**Interpretation:** Capture ist **opportunistisch**, nicht zeitgenau. Ein Fenster kann mehrfach capturen (neues Rest-Fenster), daher Logs (69) > Fenster mit Snapshot (19).

---

## 5. Capture-Rate 6 Stunden

| Metrik | Wert | Beleg |
|--------|------|-------|
| ICE-Ruhefenster ≥ 6 h | **84** | Trip-Gap |
| Fenster mit 6h-Snapshot (relaxiert: ≥5 h nach Trip-Ende) | **18** | PG |
| **Reale 6h-Capture-Rate** | **21,4 %** (18/84) | PG |
| PM2-Log `Battery 6h rest captured` | **44** Events | Logs |

**Blocker:** Offline-Ruhe > 5 min → `onSnapshot` verwirft Sample (**durch Code belegt**). Capture erfolgt oft erst beim **morgendlichen Wake** mit Ladespannung.

---

## 6. Zeitverteilung des letzten echten Ruhewerts

**Datenlimit:** Keine historische LV-Zeitreihe in ClickHouse (**durch Code belegt**). Nur Momentaufnahmen aus Snapshots.

| Muster | Anteil (87 Snapshots) | Beleg |
|--------|----------------------|-------|
| **LATE_OR_MISALIGNED** (nicht nahe 60m/6h nach Trip-Ende) | **83** (95 %) | Stichproben-Klassifikation |
| **NEAR_60M** (58–90 min nach Trip-Ende) | **1** | PG |
| **NEAR_6H** (350–390 min) | **3** | PG |

**Klassifikation:** Ein **echter** Ruhewert nahe 60 min / 6 h nach Abstellen ist **selten** messbar (**aus Stichprobe abgeleitet**).

---

## 7. Zeitverteilung des ersten Wake-up-Werts

Aus PM2-Logs und Snapshots (**durch Produktionsdaten belegt**):

| Muster | Beispiel | Spannung | CH-Kontext |
|--------|----------|----------|------------|
| **Morgendlicher Wake** | veh-c10351f8, ~05:30–08:50 UTC wiederholt | **14,3–14,7 V** | speed=0, ignition=false |
| **Abendlicher Capture** | veh-a60c0749, 2026-07-13 20:35 | **14,756 V** | 60m+6h gleicher Poll |
| **Plausibler Wake** | veh-19fedd4b, 2026-07-07 14:56 | **12,47 V** | 60m+6h zusammen |

**Erster neuer Wert nach langer Ruhe:** häufig **Ladespannung**, nicht Ruhespannung — trotz `engineRunning=false` im Snapshot (**durch Code belegt**: Feld nicht provider-gestützt).

---

## 8. Verdächtige Ruhespannungen > 13,2 V

| Kategorie | Anzahl | Beleg |
|-----------|-------:|-------|
| **Snapshots `restingVoltage` > 13,2 V** | **27 / 87** (31 %) | PG |
| **PM2 60m-Captures > 13,2 V** | **25 / 69** (36 %) | Logs |
| **Höchste Werte** | bis **14,756 V** (veh-a60c0749) | PG |

### Beispiele (sanitized)

| Fahrzeug | `recordedAt` (UTC) | V | Klassifikation |
|----------|-------------------|-----|----------------|
| veh-c10351f8 | 2026-06-24T08:49:27 | **14,705** | CHARGING_CONTAMINATED |
| veh-c10351f8 | 2026-07-16T08:49:35 | **14,428** | CHARGING_CONTAMINATED (aktuell in `battery_features.vOff60m`) |
| veh-a60c0749 | 2026-07-13T20:35:24 | **14,756** | CHARGING_CONTAMINATED |
| veh-a60c0749 | 2026-07-05T09:55:12 | **14,742** | CHARGING_CONTAMINATED |

**Hinweis:** CH zeigt bei diesen Zeitpunkten oft `speed=0`, `ignition=false` — **Alternator/DC-DC nicht über ignition/speed filterbar** (**durch Produktionsdaten belegt**).

---

## 9. Identische 60m-/6h-Timestamps

| Mechanismus | Anzahl | Beleg |
|-------------|-------:|-------|
| **Gleicher Poll: 60m + 6h** (Code setzt beides wenn `needs60m && needs6h`) | Häufig in Logs (gleiche Sekunde) | Code + PM2 |
| **`battery_features` identisches `rest60mCapturedAt` = `rest6hCapturedAt`** | **3 / 5** ICE-Fahrzeuge mit Features | PG |
| **Snapshot-Paare gleiche `recordedAt`** | In Features: z. B. veh-a60c0749 @ 2026-07-14T21:04:50, v=12,267 | PG |

**Klassifikation:** 60m und 6h sind oft **dieselbe Messung**, nicht zwei unabhängige Ruhepunkte (**durch Produktionsdaten belegt**).

---

## 10. Wake-up-Fehlklassifikation — Belege

### Für Fehlklassifikation

| Beleg | Detail | Klassifikation |
|-------|--------|----------------|
| **E-01** | 27 Snapshots > 13,2 V als `restingVoltage` | **durch Produktionsdaten belegt** |
| **E-02** | Capture-Zeitpunkte korrelieren mit Morgenstunden (05:30–09:00 UTC) | **aus Stichprobe abgeleitet** |
| **E-03** | `engineRunning` immer `false` — kein Schutz | PG + Code |
| **E-04** | Kein RPM-/Ladestatus-Gate in `onSnapshot` | **durch Code belegt** |
| **E-05** | `observedAt` = Provider-Zeit, nicht Poll-Zeit → Schwellwert bei Wake sofort erfüllt | Code |

### Gegen vollständige Wake-Kontamination

| Beleg | Detail |
|-------|--------|
| **G-01** | 3 Snapshots im Bereich 12,0–13,2 V nahe 60m/6h mit speed=0 |
| **G-02** | `onSnapshot` läuft **vor** Trip-Start-Detection im selben Poll (**durch Code belegt**) — schützt aber nicht vor altem `observedAt` beim Wake |

---

## 11. ICE vs. EV

| Aspekt | ICE | BEV (KS FH 660E) |
|--------|-----|------------------|
| LV-Ruhe-Capture | **Ja** (opportunistisch) | **Nein** (`lvBatteryVoltage` null) |
| Ruhefenster ≥ 60 min | 148 | 51 |
| REST_60M / REST_6H LV | Betroffen | **Nicht anwendbar** |
| HV-Ruhe / SOC | n/a | HV-Snapshots bei jedem Poll; SOC-Wiederholungen ~97 % |
| Ignition-Gate | Verfügbar in CH | **0 %** ignition in CH |

---

## 12. Außentemperatur

| Datenquelle | Verfügbarkeit |
|-------------|---------------|
| `vehicle_trips.outsideTemperatureStartC` | Sporadisch an Fahrten |
| `exteriorAirTemperature` im Snapshot-Pfad | **Nicht persistiert** |

**Klassifikation:** Temperatur-Stratifizierung der Ruhespannungs-Qualität **nicht verifizierbar** mit ausreichender Datenmenge (**nicht verifizierbar**).

---

## 13. Bewertung REST_60M / REST_6H

| Frage | Antwort | Klassifikation |
|-------|---------|----------------|
| **Ist REST_60M real messbar?** | **Nur opportunistisch** — ~13 % Fenster mit Capture; ~3 % valide | Produktionsdaten |
| **Ist REST_6H real messbar?** | **Nur opportunistisch** — ~21 % Fenster; oft = 60m-Wert | Produktionsdaten |
| **Exakte zeitnahe Messung?** | **Nein** | Code + Daten |
| **Erster Wert nach Schwelle?** | **Ja** — dominantes Implementierungsmuster | Code |
| **Alter wiederholter Providerwert?** | Während Offline: Capture **blockiert** (5-min-Guard) | Code |
| **Wake-/Ladewert?** | **Häufig** bei tatsächlichem Capture | Produktionsdaten |
| **Production-ready?** | **Nein** für belastbare Ruhespannungs-Health | Gesamtbewertung |

---

## 14. Architektur-Empfehlung (ohne Codeänderung)

1. **Ruhebeginn kanonisieren:** `lastActivityAt` aus Trip Detection als einzige Ruhe-Ankerquelle dokumentieren; Trip-`endTime` allein reicht nicht für V2-Alignment.
2. **Capture-Zeitbasis:** Poll-Wanduhr (`providerFetchedAt`) für Schwellwert; Provider-`observedAt` nur für Wertplausibilität — trennt „60 min Ruhe“ von „alter Timestamp“.
3. **Kontaminations-Gates vor Persist:** Spannung > 13,2 V, RPM > 0, `engineRunning`, Ladeleistung, Ignition-on-Fenster nach Wake **ausschließen** (sobald Signale verfügbar).
4. **60m und 6h entkoppeln:** Separate Polls/Fenster; identischer Timestamp verbieten.
5. **Offline-Strategie:** Explizit `NO_PROVIDER_DATA` statt Wake-Capture als Ruhewert; ggf. separater „post-wake stabilization“-Pfad (z. B. 10 min nach Ignition-off).
6. **EV:** LV-REST-Pfad nicht auf BEV anwenden; HV-Ruhe/SOC eigene Architektur.
7. **Historie:** LV-Spannung in CH oder `battery_rest_observations`-Tabelle für nachträgliche Auditierbarkeit.

---

## 15. P0 / P1 / P2 Findings

| ID | Prio | Finding | Klassifikation |
|----|------|---------|----------------|
| **R-W01** | **P0** | Nur **12,8 %** 60m-Capture-Rate bei **148** realen Ruhefenstern — Health-SOH basiert auf zu wenigen Events | **durch Produktionsdaten belegt** |
| **R-W02** | **P0** | **31 %** der Ruhespannungen **> 13,2 V** — Alternator/Lade verfälscht REST | **durch Produktionsdaten belegt** |
| **R-W03** | **P1** | 60m und 6h oft **identischer** Timestamp/Wert — keine echte 6h-Ruhekurve | PG + Code |
| **R-W04** | **P1** | `BATTERY_MAX_SAMPLE_AGE_MS` (5 min) verhindert Capture während Offline-Ruhe; Wake-Capture übernimmt | **durch Code belegt** |
| **R-W05** | **P1** | `observedAt` vs. `lastActivityAt` misalign zu Trip-Ende → **95 %** Snapshots zeitlich falsch klassifiziert | **aus Stichprobe abgeleitet** |
| **R-W06** | **P2** | `engineRunning` nicht provider-gestützt — kein Kontaminationsfilter | PG + Code |
| **R-W07** | **P2** | BEV: 51 Ruhefenster ohne LV-Pfad | **durch Produktionsdaten belegt** |
| **R-W08** | **P2** | Keine historische Trip-Detection-State-Zeitreihe — Fenster-Rekonstruktion nur über Trip-Gaps | Architektur-Lücke |

---

## 16. Pipeline-Reihenfolge (Ist)

Aus `dimo-snapshot.processor.ts` (**durch Code belegt**):

```
signalsLatest → vehicle_latest_states upsert
             → ClickHouse mirror (async)
             → BatteryV2Service.onSnapshot (async)  ← REST capture
             → HvBatteryHealthService (async, if evSoc)
             → TripDetection evaluateSnapshot (await) ← POSSIBLE_START
             → (später) onTripStart → Crank extraction
```

**Konsequenz:** Rest-Capture auf Poll N **vor** Trip-State-Wechsel; schützt nicht, wenn Provider-`observedAt` bereits Wake-/Ladezustand reflektiert und Ruhedauer-Schwelle erfüllt ist.

---

## 17. Fenster-Klassifikation (Zusammenfassung)

| Klasse | ICE-Fenster (geschätzt) | Snapshots (87) |
|--------|-------------------------|----------------|
| **NO_PROVIDER_DATA** / Stale-Dominanz | ~129 Fenster ohne nutzbaren neuen TS | — |
| **STALE_REPEATED_SAMPLE** | Mehrheit während Ruhe | — |
| **CHARGING_CONTAMINATED** | — | **27** |
| **CURRENT_IMPLEMENTATION_MISCLASSIFIED** | ~129 ohne zeitgenauen Capture | **57** |
| **VALID_REST_SAMPLE** | ~19 Fenster mit Capture (nicht alle valide) | **3** |
| **NOT_ASSESSABLE** | BEV-Fenster (kein LV) | — |

---

## 18. Auswirkungen auf Battery-Pfade

| Pfad | Auswirkung |
|------|------------|
| **Live Voltage** | VLS nutzbar; nicht gleich Ruhespannung |
| **Rest 60m** | **Opportunistisch**, oft Ladewert; `vOff60m` z. B. 14,428 V (veh-c10351f8) |
| **Rest 6h** | Oft = 60m; wenig zusätzliche Information |
| **Crank** | Separater Pfad bei Trip-Start; nicht betroffen |
| **EV Wake / HV** | BEV ohne LV; HV-SOC bei Wake wiederholt |
| **Health Evidence** | 87 `RESTING_VOLTAGE_V`-Evidences, viele kontaminiert |

---

## 19. Sanitized Queries und Befehle

### Ruhefenster zählen (Trip-Gap)

```sql
-- PostgreSQL (read-only): ICE-Ruhefenster >= 60 min im 30d-Fenster
-- Implementiert als Node/Prisma-Auswertung auf VPS:
-- Fenster = endTime(trip_i) .. startTime(trip_{i+1}), Dauer >= 3600000 ms
```

### Ruhe-Snapshots

```sql
SELECT vehicle_id, recorded_at, resting_voltage, engine_running
FROM battery_health_snapshots
WHERE recorded_at >= NOW() - INTERVAL '30 days'
  AND resting_voltage IS NOT NULL
ORDER BY recorded_at;
```

### battery_features (aktueller Zustand)

```sql
SELECT vehicle_id, rest_window_started_at, rest_60m_captured_at, rest_6h_captured_at,
       v_off_60m, v_off_6h, rest_observation_count
FROM battery_features
WHERE rest_60m_captured_at IS NOT NULL;
```

### ClickHouse — Ruhe-Stillstand

```sql
SELECT vehicle_id,
       count() AS rows,
       countDistinct(recorded_at) AS unique_provider_ts,
       avg(speed_kmh) AS avg_speed
FROM telemetry_snapshots
WHERE recorded_at >= now() - INTERVAL 30 DAY
  AND speed_kmh <= 5
GROUP BY vehicle_id;
```

### PM2-Logs (read-only grep)

```bash
grep -h "Battery 60m rest captured\|Battery 6h rest captured\|Skipping stale LV sample" \
  /root/.pm2/logs/synqdrive-out*.log | tail -100
```

---

## 20. Nicht verifizierbare Punkte

| Punkt | Grund |
|-------|-------|
| Historische `lastActivityAt`-Zeitreihe pro Fenster | Nur aktueller `vehicle_trip_detection_states`-Stand |
| RPM zum Capture-Zeitpunkt | Nicht im Snapshot-Normalizer persistiert |
| Exakte Alternator-vs.-DC/DC-Unterscheidung | Kein dediziertes Signal |
| Außentemperatur-Korrelation | Zu wenig strukturierte Temperaturdaten |
| Crank-Fenster vs. Rest-Capture-Kollision | Keine joint-Analyse in diesem Audit |
| Vollständige 30-Tage-CH-Abdeckung für alle Fenster | CH-Mirror ab ~2026-06-22 |

---

## 21. Klassifikations-Legende (pro Aussage)

- **durch Produktionsdaten belegt** — VPS PostgreSQL, ClickHouse oder PM2-Logs
- **durch Code belegt** — Repository-Inspektion
- **aus Stichprobe abgeleitet** — analytische Klassifikation über 87 Snapshots / 148 Fenster
- **nicht verifizierbar** — Daten oder Historie fehlen

---

**Changes / Architektur:** Nicht aktualisiert — reine read-only Audit-Dokumentation.
