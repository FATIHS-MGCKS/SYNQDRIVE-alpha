# Battery Health — Signal Cadence Reality Audit (Prompt 2/8)

| Feld | Wert |
|------|------|
| **Audit-Zeitpunkt (UTC)** | 2026-07-16T10:30:00Z |
| **Repository-Git-Commit (lokal)** | `cddbda0f0dd757c9e7b6b557e8f9acd697469d9a` |
| **VPS-deployed Commit** | `2cd57c8` (zum Analysezeitpunkt) |
| **Basis-Dokument** | [`battery-runtime-topology.md`](./battery-runtime-topology.md) |
| **Methodik** | Read-only PostgreSQL + ClickHouse SELECTs auf Produktion; keine Writes, keine Job-Auslösung |
| **Untersuchte Umgebung** | **Produktion** (`app.synqdrive.eu` / VPS). Kein separates Staging. |

---

## Executive Summary

**Kernbefund:** SynqDrive pollt DIMO zuverlässig alle **~30 Sekunden** pro verbundenem Fahrzeug (**durch Produktionsdaten belegt**). Der Provider liefert jedoch in der überwiegenden Mehrheit der Polls **denselben `lastSeen`/`recorded_at`-Zeitstempel** erneut zurück — ein 30-Sekunden-Poll bedeutet **nicht** einen neuen Messwert alle 30 Sekunden.

| Kadenz-Typ | Median (Flotte) | P95 (repräsentativ) | Beleg |
|------------|-----------------|---------------------|-------|
| **Request (Poll)** | **30 s** | **~30 s** | `dimo_poll_logs.startedAt` |
| **Persistence (CH-Zeilen)** | **30 s** (≈ Poll) | **~30 s** | `telemetry_snapshots` Zeilen ≈ 95 % der Polls |
| **Unique Provider-Timestamp** | **0 s** (median gap) | **0–19,5 s** | 94–99 % identische `recorded_at` zwischen Folgezeilen |
| **evSoc (KS FH 660E)** | Wert unverändert über **22 011** Folge-Polls (max. Streak) | — | CH + HV-Snapshots |

**Antwort auf die Leitfrage:** Ein 30-Sekunden-Poll liefert **nicht** reale 30-Sekunden-Signalkadenz. Er liefert vor allem **Wiederholungen** des letzten Provider-Zustands; neue Provider-Timestamps sind **selten** (Stichprobe: 0,6–5,5 % unique `recorded_at` pro Fahrzeug).

---

## 1. Audit-Zeitraum

| Quelle | Von (UTC) | Bis (UTC) | Effektive Tage |
|--------|-----------|-----------|----------------|
| **Ziel** | 2026-06-16 | 2026-07-16 | 30 (beabsichtigt) |
| **`dimo_poll_logs` (SNAPSHOT)** | 2026-06-21T21:18:06 | 2026-07-16T10:26:09 | **~25** |
| **ClickHouse `telemetry_snapshots`** | 2026-06-22T18:29:25 | 2026-07-16T09:28:13 | **~24** |
| **`hv_battery_health_snapshots`** | 2026-06-16T12:15:50 | 2026-07-15T04:07:06 | ~29 (nur KS FH 660E) |

**Klassifikation:** Auswertungszeitraum = **~25 Tage** Poll-/CH-Daten (nicht volle 30 Tage — **durch Produktionsdaten belegt**, begrenzt durch `RETENTION_DIMO_POLL_LOGS_DAYS=30` und CH-Mirror-Start).

Gesamt-Polls im Fenster: **366 354** (`dimo_poll_logs`, SNAPSHOT). CH-Zeilen: **341 354**.

---

## 2. Fahrzeugstichprobe

| Label | Profil | Trips | Polls (25d) | CH-Zeilen | Besonderheit |
|-------|--------|------:|------------:|----------:|--------------|
| **veh-c10351f8** | ICE (Audi A4) | 212 | 69 495 | 65 906 | Viele Fahrten; frischeste Daten (~1 h stale) |
| **KS FH 660E** | **BEV** (Tesla Model 3) | 970 | 69 457 | 65 878 | Einziges EV; HV+SOC; **~30 h stale** zum Audit-Zeitpunkt |
| **veh-a60c0749** | ICE (AMG C63) | 108 | 69 461 | 65 880 | Niedrigste unique Provider-Timestamps (0,6 %) |
| **veh-8c850ff1** | ICE (Arteon) | 56 | 44 945 | 39 062 | — |
| **veh-c43c3b45** | ICE (Golf) | 20 | 38 934 | 38 782 | Wenige Fahrten; Rest-Snapshots |
| **veh-19fedd4b** | ICE (Tiguan) | 49 | 27 599 | 27 587 | Kürzeste Poll-Historie im Fenster |

**Nicht vorhanden:** PHEV/HEV (**durch Produktionsdaten belegt** — keine `PLUGIN_HYBRID`/`HYBRID` in DIMO-Flotte).

**KS FH 660E** (bekannter Testkontext): gezielt ausgewertet.

---

## 3. Datenquellen

| Quelle | Inhalt | Battery-Relevanz |
|--------|--------|------------------|
| `dimo_poll_logs` | Poll-Start/Ende, SUCCESS/FAILURE | **Request-Kadenz** |
| `telemetry_snapshots` (ClickHouse) | `recorded_at` (= `lastSeen`), speed, ignition, ev_soc, traction_kw | **Provider-Timestamp-Kadenz**, Fahrzustand |
| `vehicle_latest_states` | Aktueller Spiegel + `sourceTimestamp` / `providerFetchedAt` | **Freshness** (Momentaufnahme) |
| `hv_battery_health_snapshots` | HV SOC/SOH-Zeitreihe (nur EV) | **HV-Persistence-Kadenz** |
| `battery_health_snapshots` | LV nur bei Rest-Capture (60m/6h) | **Persistence-Kadenz LV** (nicht pro Poll) |
| `battery_evidence` (`VOLTAGE_V`) | LV-Evidence bei Rest | Grobe LV-Historie |
| Prometheus | `synqdrive_dimo_snapshot_poll_total` | Aggregat Poll-Erfolg (nicht pro Signal) |

**Nicht historisch persistiert** im Snapshot-Pfad (**durch Code belegt**): `exteriorAirTemperature`, `rpm`, `engineRunning` (als DIMO-Snapshot-Feld), `lvBatteryVoltage` in ClickHouse.

---

## 4. Methodik

1. **Request-Kadenz:** Abstände zwischen `dimo_poll_logs.startedAt` (SNAPSHOT, SUCCESS+FAILURE).
2. **Persistence-Kadenz:** CH-Zeilen pro Poll (`pollVsPersist.ratioPct`).
3. **Provider-Timestamp-Kadenz:** Abstände zwischen aufeinanderfolgenden `telemetry_snapshots.recorded_at`; Zähler identischer Timestamps.
4. **Unique-Signal-Kadenz:** `COUNT(DISTINCT recorded_at)` / Gesamtzeilen; bei HV zusätzlich `COUNT(DISTINCT socPercent)`.
5. **Freshness:** `providerFetchedAt − sourceTimestamp` aus `vehicle_latest_states` (Momentaufnahme); für KS FH 660E **~30,3 h**.
6. **Fahrzustand:** CH `speed_kmh > 5` = Fahrt; sonst Stillstand/Ruhe (Proxy).

Alle Produktionszahlen: Stichprobe über 6 aktive DIMO-Fahrzeuge, **~25 Tage**.

---

## 5. Poll-Kadenz (Request)

### Flottenweit

| Metrik | Wert | Beleg |
|--------|------|-------|
| Median Poll-Abstand | **30 s** | Alle 6 Fahrzeuge |
| P95 Poll-Abstand | **~30,0–30,1 s** | `dimo_poll_logs` |
| Max Poll-Abstand | **~7,7 h** (27 626 s) | Prozess-Gap/Offline (einmalig) |
| Poll-Dauer Median | **265–289 ms** | `finishedAt − startedAt` |
| Poll-Dauer P95 | **675–745 ms** | — |
| Erfolgsrate | **>99,7 %** | z. B. KS FH 660E: 69 315 / 69 457 |

**Klassifikation:** Scheduler-Ziel **30 s** wird eingehalten (**durch Produktionsdaten belegt**). Entspricht Code `@Interval(30000)` in `dimo-snapshot.scheduler.ts` (**durch Code belegt**).

---

## 6. Eindeutige Provider-Signalkadenz

### ClickHouse `recorded_at` (Proxy für `signals.lastSeen`)

| Fahrzeug | CH-Zeilen | Unique `recorded_at` | Unique-Anteil | Repeat-Rate* |
|----------|----------:|---------------------:|--------------:|-------------:|
| veh-a60c0749 (ICE) | 65 880 | 410 | **0,62 %** | **99,38 %** |
| veh-c10351f8 (ICE) | 65 906 | 1 602 | 2,43 % | 97,57 % |
| **KS FH 660E** (BEV) | 65 878 | 3 656 | **5,55 %** | **94,45 %** |
| veh-8c850ff1 (ICE) | 39 062 | 1 267 | 3,24 % | 96,76 % |
| Flotte Median Repeat | — | — | — | **96,8 %** |

\*Anteil aufeinanderfolgender CH-Zeilen mit **identischem** `recorded_at`.

**Median Abstand zwischen unique Timestamps:** Effektiv **0 s** zwischen Folge-CH-Zeilen (median gap = 0), weil Provider-Timestamp in >94 % der Polls unverändert bleibt.

**KS FH 660E evSoc:** **63 986** Polls mit unverändertem SOC vs. Vorgänger; max. Streak **22 011** identische SOC-Werte (**durch Produktionsdaten belegt**).

### HV Postgres (`hv_battery_health_snapshots`, KS FH 660E)

| Metrik | Wert (30d, capped 10k für Gap-Analyse) |
|--------|----------------------------------------|
| Zeilen | 69 778 (gesamt) / 10 000 (Gap-Stichprobe) |
| Unique `recorded_at` (30d) | **4 396** (~6,3 % der HV-Zeilen) |
| Unique SOC-Werte (10k-Stichprobe) | 957 |
| Median Gap `recorded_at` | **0 s** |
| P95 Gap | **46 s** |
| Max Gap | **~70 h** |

---

## 7. Freshness-Verteilung

### Momentaufnahme `vehicle_latest_states` (2026-07-16 ~10:26 UTC)

| Fahrzeug | `sourceTimestamp` Age (h)** | LV (V) | evSoc |
|----------|----------------------------:|-------:|------:|
| **KS FH 660E** | **30,3** | null | 76,1 % |
| veh-c10351f8 | 1,0 | 13,45 | — |
| veh-a60c0749 | 13,3 | 12,25 | — |
| veh-19fedd4b | 14,2 | 12,41 | — |
| veh-8c850ff1 | 19,0 | 12,55 | — |
| veh-c43c3b45 | 24,0 | 12,09 | — |

\*\*`providerFetchedAt − sourceTimestamp` in Stunden.

**KS FH 660E:** Letzter Provider-Timestamp **2026-07-15T04:07:06Z**, letzter Fetch **2026-07-16T10:26:09Z** → Fahrzeug wird weiter gepollt, aber Provider liefert **~30 h alten** Zustand (**durch Produktionsdaten belegt**). Entspricht Offline/Standby-Muster.

### Freshness-Schwellen (aus Stichprobe abgeleitet)

| Schwelle | KS FH 660E (aktuell) | ICE-Flotte (aktuell) |
|----------|----------------------|----------------------|
| > 30 s | **Ja** (~30 h) | Teilweise (1–24 h) |
| > 2 min | **Ja** | Ja (meiste) |
| > 5 min | **Ja** | Ja |
| > 30 min | **Ja** | Ja (4/5 Fahrzeuge) |
| > 1 h | **Ja** | Ja (4/5 Fahrzeuge) |

**Hinweis:** Historische Freshness-Verteilung pro Poll ist in PG **nicht** gespeichert (nur aktueller `vehicle_latest_states`). CH speichert `recorded_at`, nicht `providerFetchedAt` — Altersverteilung über die Zeit nur indirekt über wiederholte `recorded_at` + Wanduhr (**aus Stichprobe abgeleitet**).

`BATTERY_MAX_SAMPLE_AGE_MS` = 5 min (**durch Code belegt**, `battery-v2.service.ts`) würde KS FH 660E-LV-Samples bei Wiederaufnahme verwerfen.

---

## 8. Wiederholte Provider-Timestamps

| Mechanismus | Beobachtung | Beleg |
|-------------|-------------|-------|
| Gleicher `recorded_at` über viele Polls | **94–99 %** der Folge-CH-Zeilen | CH-Analyse |
| Gleicher `evSoc` über Polls | **97 %** der KS-FH-660E-Zeilen (63 986/65 878) | CH |
| Polls vs. CH-Zeilen | **~95 %** (ratio 94,8–100 %) | Jeder erfolgreiche Poll schreibt CH, auch bei gleichem Timestamp |
| Request-Zeit vs. `observedAt` | Systematische Differenz wenn Provider stale; aktuell bis **~30 h** | VLS |

**Klassifikation:** Wiederholte Provider-Werte sind **dominant** (**durch Produktionsdaten belegt**), kein Randphänomen.

---

## 9. Signalverfügbarkeit je Profil

| Signal | ICE (CH) | BEV KS FH 660E | Persistiert | Bewertung |
|--------|----------|----------------|-------------|-----------|
| **speed** | 100 % | 100 % | CH | **belastbar** (wenn Provider online) |
| **isIgnitionOn** | 100 % | **0 %** (null) | CH | ICE: **belastbar**; EV: **nicht verfügbar** |
| **evSoc** | 0 % | 100 % | CH + HV | EV: **belastbar**; ICE: **n/a** |
| **traction_kw** | 0 % | 100 % | CH | EV: **grob** (Spiegel); ICE: **n/a** |
| **lvBatteryVoltage** | VLS vorhanden | **null** | VLS, nicht CH | ICE: **grob**; BEV: **nicht verfügbar** |
| **lvBatteryVoltage (Historie)** | 10–39 Rest-Captures/30d | **0** | `battery_evidence` | ICE: **selten**; BEV: **nicht verfügbar** |
| **engineRunning** | 0 % in Snapshots (immer `false`) | n/a | `battery_health_snapshots` | **nicht verfügbar** als Providerwert (**durch Produktionsdaten belegt**) |
| **rpm** | — | — | Nur HF/Crank-Query | **selten** (Trip-Start-Fenster, **durch Code belegt**) |
| **exteriorAirTemperature** | — | — | Nicht im Snapshot-Normalizer | **nicht verfügbar** im Poll-Pfad (**durch Code belegt**) |
| **chargingStatus** | — | `tractionBatteryIsCharging` in VLS | VLS | EV: **grob** (nicht in CH-Historie) |

---

## 10. Vergleich Fahrzustände (KS FH 660E, CH-Proxy)

| Zustand | Definition | Zeilen | Anteil |
|---------|------------|-------:|-------:|
| **Aktive Fahrt** | `speed_kmh > 5` | 1 255 | **1,9 %** |
| **Stillstand/Ruhe** | `speed_kmh ≤ 5` | 64 623 | **98,1 %** |
| **Offline/Standby** | `sourceTimestamp` > 30 min alt trotz Poll | Aktuell **~30 h** | Momentaufnahme |

**ICE (qualitativ, aus Stichprobe abgeleitet):** Gleiche Poll-Kadenz (30 s), ähnliche Repeat-Raten (95–99 %). Einige ICE-Fahrzeuge zeigen kürzere Staleness (Audi ~1 h) als andere (bis ~24 h).

**Startphase / Crank / RPM:** Keine historische Poll-Speicherung für RPM; Crank nur bei Trip-Start via `DimoSegmentsService.fetchCrankWindow` (**durch Code belegt**, **nicht verifizierbar** in 30d-Stichprobe ohne Trip-Korrelation).

---

## 11. Kadenz-Tabelle (Median / P95 / Max)

### Request vs. Provider vs. Persistence

| Ebene | Median | P95 | Max | KS FH 660E |
|-------|--------|-----|-----|------------|
| **Request (Poll)** | 30 s | 30,1 s | 7,7 h | 30 s / 30,1 s |
| **CH-Zeile (Persistence)** | 30 s* | 30 s* | 7,7 h* | ≈ Poll |
| **Unique Provider-Timestamp-Gap** | **0 s** | 0–19,5 s | ~183 h† | 0 s / 19,5 s |
| **HV-Snapshot-Gap (EV)** | **0 s** | 46 s | ~70 h | siehe §6 |

\*Weil fast jeder Poll eine CH-Zeile erzeugt, auch bei gleichem Timestamp.  
†Ausreißer durch Offline-Lücken in `recorded_at`.

---

## 12. Signal-Bewertung (Zusammenfassung)

| Signal | Bewertung | Begründung |
|--------|-----------|------------|
| speed | **belastbar** | 100 % in CH wenn online |
| lvBatteryVoltage (ICE) | **grob** | Live in VLS; Historie nur Rest-Capture (~0,06 % der Polls) |
| lvBatteryVoltage (BEV) | **nicht verfügbar** | null in VLS |
| evSoc (BEV) | **belastbar** (Wert) / **grob** (Kadenz) | Wert vorhanden, aber 94 %+ Wiederholungen |
| ignition (ICE) | **belastbar** | 100 % CH |
| ignition (EV) | **nicht verfügbar** | 0 % |
| engineRunning | **nicht verfügbar** | Immer `false` in Snapshots |
| rpm | **selten** | Nur Crank-Fenster |
| exteriorAirTemperature | **nicht verfügbar** | Nicht persistiert |
| tractionBatteryPower | **grob** (EV) | CH 100 % bei KS FH 660E |
| chargingStatus | **grob** | VLS-Feld, keine CH-Historie |

---

## 13. Auswirkungen auf Battery-Health-Pfade

| Pfad | Auswirkung | Beleg |
|------|------------|-------|
| **Live Voltage** | ICE: VLS-Wert nutzbar wenn frisch; BEV: kein LV | VLS-Stichprobe |
| **Rest 60m / 6h** | Nur bei `RESTING` + ≥60 min Ruhe; **~39 Rest-Captures/30d** auf Top-ICE (~0,06 % der Polls) | `battery_health_snapshots` + Code-Gate |
| **Crank** | Abhängig von Trip-Start + DIMO Crank-Window; nicht Poll-kadent | Code |
| **EV Wake / HV** | HV-Snapshot bei jedem Poll mit `evSoc`; **unique Provider-Timestamps ~6 %** → SOH/Energy-Throughput rechnet oft mit **wiederholten** SOC-Punkten | HV + CH |
| **Stale Guard** | Samples > 5 min verworfen (`BATTERY_MAX_SAMPLE_AGE_MS`) → bei KS FH 660E aktuell **komplette LV-Pipeline blockiert** | Code + 30 h Staleness |

---

## 14. P0 / P1 / P2 Findings

| ID | Prio | Finding | Klassifikation |
|----|------|---------|----------------|
| R-C01 | **P1** | 94–99 % der Polls liefern **keinen neuen** Provider-Timestamp | **durch Produktionsdaten belegt** |
| R-C02 | **P1** | KS FH 660E: **~30 h** stale trotz 30-s-Poll → Operational State / Battery nutzen veraltete Daten | **durch Produktionsdaten belegt** |
| R-C03 | **P1** | `lvBatteryVoltage` nicht in CH-Historie; LV-Rest nur ~0,06 % Poll-Rate | Code + Produktionsdaten |
| R-C04 | **P2** | `engineRunning` in Snapshots immer `false` — Feld nicht provider-gestützt | **durch Produktionsdaten belegt** |
| R-C05 | **P2** | BEV: `isIgnitionOn` fehlt — Trip/Battery-Gates müssen EV-spezifisch sein | **durch Produktionsdaten belegt** |
| R-C06 | **P2** | Kein PHEV in Flotte — HEV-Pfad nicht empirisch prüfbar | **nicht verifizierbar** |
| R-C07 | **P2** | Historische `providerFetchedAt` pro Poll nicht gespeichert — Freshness-Trends nur indirekt | Architektur-Lücke |

**P0:** Keiner (System pollt zuverlässig; Datenqualität ist das Thema).

---

## 15. Datenlücken & Unsicherheiten

1. **Kein historisches `providerFetchedAt` pro Poll** — nur aktueller VLS-Wert.
2. **`lvBatteryVoltage` nicht in ClickHouse** — LV-Kadenz nur über sparse `battery_health_snapshots` / Evidence.
3. **Auswertungsfenster ~25 Tage**, nicht 30 (Poll-Log-Retention-Grenze).
4. **RPM / exteriorAirTemperature / engineRunning** im Poll-Pfad nicht historisch messbar.
5. **Fahrzustand-Segmentierung** (30–60 min Ruhe vs. 6 h) erfordert Trip-FSM-Korrelation — in diesem Prompt nur Speed-Proxy für KS FH 660E.
6. **PHEV/HEV** fehlen in Produktionsflotte.

---

## 16. Read-only Queries & Befehle

```bash
# VPS — Poll- und CH-Analyse (temporäres Script, nicht im Repo)
cd /opt/synqdrive/current/backend && node audit-battery-signal-cadence-readonly.js

# ClickHouse — Zeitraum
curl -sf -u "<redacted>" "http://127.0.0.1:8123/?database=synqdrive" \
  --data "SELECT min(recorded_at), max(recorded_at), count() FROM telemetry_snapshots WHERE recorded_at >= now() - INTERVAL 30 DAY"

# PostgreSQL — Poll-Range
# Prisma: dimoPollLog.aggregate({ jobType: SNAPSHOT, createdAt: { gte: since } })

# LV Evidence + engine_running + Freshness
# SELECT ... FROM battery_evidence WHERE value_type = 'VOLTAGE_V'
# SELECT engine_running, COUNT(*) FROM battery_health_snapshots GROUP BY vehicle_id, engine_running
# vehicle_latest_states: provider_fetched_at, source_timestamp, lv_battery_voltage
```

Keine Secrets, Kennzeichen (außer KS FH 660E im bekannten Testkontext) oder personenbezogenen Daten in diesem Dokument.

---

## 17. Bezug zur Runtime-Topologie (Prompt 1)

- Poll alle 30 s bestätigt [`battery-runtime-topology.md`](./battery-runtime-topology.md) §4.
- Fire-and-forget Battery-Writes erklären, warum Poll-Erfolg ≠ neue Battery-Daten: bei stale/repeated Provider-Werten werden dennoch CH-Zeilen geschrieben, Battery V2/HV aber ggf. verworfen (Stale-Guard) oder mit gleichen Werten gefüllt.

---

*Ende Battery Signal Cadence Reality Audit — Prompt 2/8. Read-only; keine Produktänderungen.*
