# DIMO Signal-Inventar & Gap-Analyse — KS MX 2024

| Feld | Wert |
|------|------|
| **Dokumenttyp** | DIMO Signal-Inventar + SynqDrive Snapshot Gap-Analyse (historisch + `signalsLatest`) |
| **Auditzeitpunkt (UTC)** | 2026-08-30T19:23:44Z |
| **Umgebung** | Produktion VPS (`srv1374778.hstgr.cloud`), DIMO GraphQL read-only |
| **Fahrzeug** | KS MX 2024 (Mercedes-Benz C 63 AMG 2018) |
| **vehicleId** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| **organizationId** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **DIMO tokenId** | `187336` |
| **Provider binding** | `e2bd6a49-f1fc-4d4f-bd60-e958b15d8142` |
| **Methodik** | Kein Live-Fahrt-Poll — `availableSignals` + `signalsLatest` (letzte Observation) + `signalDataSummary` + historische `signals(1m)` + `events` |
| **SynqDrive Referenz** | `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts` |
| **Vergleichsdokument** | `docs/audits/dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md` |

**Zweck:** Gleiche Auswertungsstruktur wie WOB L 7503, angepasst für KS MX 2024 — Fahrzeug stand zum Auditzeitpunkt (parked, speed 0). Werte stammen aus **letzter DIMO-Observation** (`signalsLatest`) und **historischen Fenstern** (letzte dokumentierte Fahrt / Trip-Tag).

---

## 1. Kurzfassung

| Metrik | Wert |
|--------|------|
| **`availableSignals` (gelistet)** | **29** |
| **`signalsLatest` mit Daten** | **29 / 29** (100 %) |
| **`signals.lastSeen` (DIMO)** | **2026-08-29T22:28:19Z** |
| **SynqDrive VLS `source_timestamp`** | **2026-08-29T22:28:19Z** (aligniert mit DIMO) |
| **Fahrzeugstatus zum Audit** | **Geparkt:** speed **0**, Zündung **AUS**, OBD eingesteckt |
| **Letzte SynqDrive-Fahrt** | **2026-08-28** 22:09–22:24 UTC (6 km) |
| **Forensik-Referenz (Aug 26)** | Letzte große Fahrt 11:33–11:59 UTC; VLS war damals auf 11:58:27 eingefroren — **seitdem Recovery** |
| **Native `behavior.*` Events (30d)** | **34** (21 harshAcceleration, 12 harshCornering, 1 extremeBraking) |
| **SynqDrive Snapshot: in VLS gemappt** | **9 / 29** (31 %) |
| **SynqDrive Snapshot: abgefragt, nur Raw/Nebenpfad** | **2 / 29** (7 %) |
| **Verfügbar, nicht im Snapshot-Poll** | **18 / 29** (62 %) |

**Kernaussage:** KS MX 2024 liefert eine ähnliche ICE-OBD-Palette wie WOB L 7503, aber **ohne Getriebe-Gang-Signale** (`powertrainTransmissionActualGear*`). Zum Auditzeitpunkt nicht unterwegs; DIMO `signalsLatest` zeigt geparkten Zustand vom **29.08.** Historische Abfrage der Fahrt vom **26.08.** (11:30–12:05 UTC) bestätigt RPM, Drossel, Speed, GPS — Signale, die SynqDrive im 30s-Snapshot **nicht** abfragt.

---

## 2. Letzte Observation (`signalsLatest`) — alle Signalwerte

**Hinweis:** Kein Live-Fahrt-Poll. Werte = letzte gespeicherte DIMO-Observation pro Signal (Fahrzeug geparkt).

### 2.1 Aggregate

| Feld | Wert |
|------|------|
| `signals.lastSeen` | **2026-08-29T22:28:19Z** |
| SynqDrive VLS `provider_fetched_at` | 2026-08-30T19:21:22Z (Polling weiter aktiv) |

### 2.2 Bewegung / Position

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `speed` | **0** km/h | 2026-08-29T22:28:19Z |
| `currentLocationCoordinates` | lat **51.335365**, lon **9.50613** (Kassel-Region) | 2026-08-29T22:28:19Z |
| `currentLocationHeading` | **352.7**° | 2026-08-29T22:28:19Z |
| `currentLocationAltitude` | **213.2** m | 2026-08-29T22:28:19Z |

### 2.3 Zündung / Batterie

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `isIgnitionOn` | **0** (AUS) | 2026-08-29T22:28:19Z |
| `lowVoltageBatteryCurrentVoltage` | **12.254** V | 2026-08-29T22:28:19Z |

### 2.4 Klima

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `exteriorAirTemperature` | **20** °C | 2026-08-28T22:24:12Z |

### 2.5 OBD

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `obdBarometricPressure` | **0** | 2026-08-29T22:28:19Z |
| `obdDistanceWithMIL` | **0** | 2026-08-29T22:28:19Z |
| `obdEngineLoad` | **0** % | 2026-08-29T22:28:19Z |
| `obdFuelRailPressure` | **0** | 2026-08-29T22:28:19Z |
| `obdFuelTypeName` | **"GASOLINE"** | 2026-08-29T22:28:19Z |
| `obdIntakeTemp` | **-40** °C | 2026-08-29T22:28:19Z |
| `obdIsPluggedIn` | **1** | 2026-08-29T22:28:19Z |
| `obdLongTermFuelTrim1` | **-100** | 2026-08-29T22:28:19Z |
| `obdLongTermFuelTrim2` | **-100** | 2026-08-29T22:28:19Z |
| `obdMAP` | **0** | 2026-08-29T22:28:19Z |
| `obdMaxMAF` | **0** | 2026-08-29T22:28:19Z |
| `obdOilTemperature` | **-40** °C | 2026-08-29T22:28:19Z |
| `obdRunTime` | **894** s | 2026-08-29T22:28:19Z |
| `obdStatusDTCCount` | **0** | 2026-08-29T22:28:19Z |
| `obdThrottlePosition` | **10.59** % | 2026-08-28T22:24:12Z |

*Hinweis: `-40` bei Intake/Öltemperatur und `0` bei Motorlast im Stand sind typische OBD-Idle-/Sentinel-Werte, nicht zwingend Sensordefekt.*

### 2.6 Antrieb / Kraftstoff

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `powertrainCombustionEngineECT` | **99** °C | 2026-08-28T22:24:12Z |
| `powertrainCombustionEngineSpeed` | **782** rpm | 2026-08-28T22:24:12Z |
| `powertrainCombustionEngineTPS` | **0** % | 2026-08-28T22:23:55Z |
| `powertrainFuelSystemAbsoluteLevel` | **24** L | 2026-08-28T22:24:12Z |
| `powertrainFuelSystemRelativeLevel` | **37.65** % | 2026-08-28T22:24:12Z |
| `powertrainTransmissionTravelledDistance` | **187593** km | 2026-08-29T22:28:19Z |
| `powertrainType` | **"COMBUSTION"** | 2026-08-29T22:28:19Z |

### 2.7 Vollständige `availableSignals`-Liste (29)

```
currentLocationAltitude
currentLocationCoordinates
currentLocationHeading
exteriorAirTemperature
isIgnitionOn
lowVoltageBatteryCurrentVoltage
obdBarometricPressure
obdDistanceWithMIL
obdEngineLoad
obdFuelRailPressure
obdFuelTypeName
obdIntakeTemp
obdIsPluggedIn
obdLongTermFuelTrim1
obdLongTermFuelTrim2
obdMAP
obdMaxMAF
obdOilTemperature
obdRunTime
obdStatusDTCCount
obdThrottlePosition
powertrainCombustionEngineECT
powertrainCombustionEngineSpeed
powertrainCombustionEngineTPS
powertrainFuelSystemAbsoluteLevel
powertrainFuelSystemRelativeLevel
powertrainTransmissionTravelledDistance
powertrainType
speed
```

**Vs. WOB L 7503 fehlen bei KS MX:** `powertrainTransmissionActualGear`, `powertrainTransmissionActualGearRatio` (nicht in `availableSignals`).

---

## 3. Historische Abfrage — letzte Forensik-Fahrt (2026-08-26)

**Fenster:** `2026-08-26T11:30:00Z` – `2026-08-26T12:05:00Z`  
**Query:** `signals(interval: "1m", agg: LAST)` — 29 Buckets, 22 mit Bewegung (speed > 0 oder ignition ON)

### 3.1 Erste Bewegung im Fenster (11:36 UTC)

| Feld | Wert |
|------|------|
| `speed` | 1 km/h |
| `isIgnitionOn` | 1 |
| `odometer` | 187492 km |
| `obdEngineLoad` | 18.04 % |
| `lvBattery` | 14.719 V |
| `rpm` | 664.5 |
| `throttle` | 11.37 % |
| `fuel` | 28.63 % |
| `location` | 51.32449°N, 9.51514°E |

### 3.2 Letzte Bewegung im Fenster (11:57 UTC)

| Feld | Wert |
|------|------|
| `speed` | 2 km/h |
| `isIgnitionOn` | 1 |
| `odometer` | 187508 km |
| `obdEngineLoad` | 16.08 % |
| `lvBattery` | 14.611 V |
| `rpm` | 899 |
| `throttle` | 11.76 % |
| `fuel` | 25.88 % |
| `location` | 51.24957°N, 9.43143°E |

**SynqDrive-Trip dieses Tages:** Start 11:33:06, Ende 11:59:59, 16 km (ICE) — konsistent mit historischen DIMO-Daten.

### 3.3 Native Events am Fahrt-Tag (2026-08-26)

| Zeit (UTC) | Event |
|------------|-------|
| 11:57:05 | `behavior.harshAcceleration` |
| 11:57:24 | `behavior.harshCornering` |

---

## 4. Was DIMO für KS MX 2024 nicht liefert

| Signal (Probe) | Ergebnis |
|----------------|----------|
| `chassisAxleRow1WheelLeftTirePressure` | `null` — kein TPMS |
| `chassisBrakeIsPedalPressed` | `null` — keine Bremsdaten |
| `angularVelocityYaw` | `null` — kein Gierwinkel |
| `powertrainTractionBatteryStateOfChargeCurrent` | `null` — kein EV/HV |
| `chassisTireSystemIsWarningOn` | `null` |

Zusätzlich **nicht in `availableSignals`:** Getriebe-Gang-Felder (im Gegensatz zu WOB L 7503).

---

## 5. Native DIMO Events & Datenhistorie

### 5.1 `dataSummary.eventDataSummary` (gesamt)

| Event | Anzahl | lastSeen |
|-------|--------|----------|
| `behavior.harshAcceleration` | 49 | 2026-08-28T22:16:28Z |
| `behavior.harshCornering` | 25 | 2026-08-27T20:46:14Z |
| `behavior.extremeBraking` | 2 | 2026-08-25T11:50:30Z |

### 5.2 Letzte 30 Tage (zum Audit)

- **34 Events** total (21 / 12 / 1)

### 5.3 `signalDataSummary` (Auszug)

| Feld | Wert |
|------|------|
| `numberOfSignals` (gesamt) | ~1.997.893 |
| `firstSeen` | 2025-11-27T12:31:14Z |
| `lastSeen` | 2026-08-29T22:28:19Z |

| Signal | Samples | lastSeen |
|--------|---------|----------|
| GPS (coords/heading/altitude) | ~417.842 | 2026-08-29 (live) |
| `speed` / `isIgnitionOn` | ~47k | 2026-08-29 |
| `powertrainCombustionEngineSpeed` | ~33.982 | 2026-08-28 |
| `obdThrottlePosition` | ~8.793 | 2026-08-28 |

---

## 6. SynqDrive-Stand zum Audit

| Feld | Wert |
|------|------|
| VLS `source_timestamp` | 2026-08-29T22:28:19Z |
| VLS `odometer_km` | 187593 |
| VLS `speed_kmh` | 0 |
| VLS Position | 51.335365, 9.50613 |
| Letzte Trip (DB) | 2026-08-28 22:09–22:24 UTC, 6 km |

**Forensik-Update:** Gegenüber dem P0-Audit vom 2026-08-27 (eingefroren auf 2026-08-26 11:58:27) hat sich der DIMO-/VLS-Stand **erholt**. `source_timestamp` und Odometer sind wieder aktuell; das Fahrzeug sendet offenbar weiter (mindestens GPS/Odometer/LV im Stand), auch ohne aktuelle Fahrt.

---

## 7. Gap-Analyse: 29 `availableSignals` vs. SynqDrive Snapshot

**Referenz:** `buildLatestSnapshotQuery()` + `normalizeSnapshot()`

### 7.1 Übersicht

| Kategorie | Anzahl | Anteil |
|-----------|--------|--------|
| Im Snapshot abgefragt + in VLS gemappt | **9** | 31 % |
| Im Snapshot abgefragt, nur Nebenpfad / Raw | **2** | 7 % |
| Verfügbar, nicht im Snapshot | **18** | 62 % |
| Gesamt `availableSignals` | **29** | 100 % |

SynqDrive fragt zusätzlich **18 Fleet-Felder** ab (EV, Reifen, Öl, DEF, …), die KS MX nicht liefert.

### 7.2 Abgefragt und in VLS gemappt (9)

| DIMO-Signal | VLS-Feld |
|-------------|----------|
| `currentLocationCoordinates` | `latitude`, `longitude` |
| `speed` | `speed_kmh` |
| `powertrainTransmissionTravelledDistance` | `odometer_km` |
| `powertrainFuelSystemRelativeLevel` | `fuel_level_relative` |
| `powertrainFuelSystemAbsoluteLevel` | `fuel_level_absolute` |
| `powertrainCombustionEngineECT` | `coolant_temp_c` |
| `isIgnitionOn` | `is_ignition_on` |
| `obdEngineLoad` | `engine_load` |
| `lowVoltageBatteryCurrentVoltage` | `lv_battery_voltage` |

### 7.3 Abgefragt, nicht als VLS-Spalte (2)

| Signal | Nutzung |
|--------|---------|
| `obdIsPluggedIn` | Connectivity Episode Resolution |
| `powertrainType` | nur `raw_payload_json` |

### 7.4 Verfügbar, nicht im Snapshot (18)

| Gruppe | Signale |
|--------|---------|
| **Position** | `currentLocationHeading`, `currentLocationAltitude` |
| **Klima** | `exteriorAirTemperature` |
| **OBD erweitert** | `obdThrottlePosition`, `obdOilTemperature`, `obdIntakeTemp`, `obdRunTime`, `obdStatusDTCCount`, `obdBarometricPressure`, `obdMAP`, `obdFuelRailPressure`, `obdMaxMAF`, `obdDistanceWithMIL`, `obdLongTermFuelTrim1/2`, `obdFuelTypeName` |
| **Antrieb** | `powertrainCombustionEngineSpeed`, `powertrainCombustionEngineTPS` |

**Historisch belegt (26.08. Fahrt):** RPM, Drossel, Speed, GPS — alle in Gap-Liste.

### 7.5 Vergleich KS MX vs. WOB L 7503

| Aspekt | KS MX 2024 | WOB L 7503 |
|--------|------------|------------|
| `availableSignals` | 29 | 31 |
| Getriebe-Gang | **Nicht verfügbar** | `ActualGear`, `GearRatio` |
| Gap ungenutzt (Snapshot) | 18 / 29 (62 %) | 20 / 31 (65 %) |
| VLS gemappt | 9 | 9 |
| Native Events (30d) | 34 | 0 |
| Audit-Modus | Historisch + last observation | Live-Fahrt |

---

## 8. Priorisierte Erweiterungs-Empfehlung

Gleiche Priorität wie WOB L — für KS MX besonders relevant wegen vorhandener `behavior.*` Events und historischer RPM/Drossel-Daten:

| Prio | Signale | Begründung KS MX |
|------|---------|------------------|
| **P0** | `powertrainCombustionEngineSpeed`, `obdThrottlePosition` | Historisch in Fahrtfenster vorhanden; Abuse/RPM-Webhooks |
| **P1** | `obdStatusDTCCount` | 0 DTCs — Health-Kontext |
| **P1** | `powertrainCombustionEngineTPS` | Last-Kontext |
| **P2** | `currentLocationHeading`, `exteriorAirTemperature` | Route/Klima |
| **P2** | `obdOilTemperature`, `obdRunTime`, `obdIntakeTemp` | Thermal/Cold-engine |

Getriebe-Gang nicht anwendbar (nicht in `availableSignals`).

---

## 9. Offene Punkte für tiefere Analyse

1. **Recovery nach Aug-26-Stale:** Warum VLS 11:58:27 eingefroren war, obwohl DIMO später (29.08.) wieder sendet — Provider-Gerät vs. SynqDrive-Normalisierung (siehe P0-Forensik).
2. **Odometer-Drift im Stand:** `signalsLatest` Odometer 187593 vs. letzte Fahrt-Ende 26.08. bei 187508 — Klärung ob Stand-Updates oder neue kurze Bewegung.
3. **Mixed per-signal timestamps:** Manche Signale (RPM, fuel) älter (28.08.) als GPS (29.08.) — Auswirkung auf `signals.lastSeen` vs. Einzelsignal-Freshness.
4. **Trip vom 28.08.** in DB (6 km) vs. Forensik-Fokus 26.08. — vollständige Event-/Signal-Korrelation.
5. **Fleet-Preflight:** `DimoAvailableSignalsPreflightService` für KS MX auswerten (DB-Rows).

---

## 10. Reproduktion (read-only)

Ephemeres Node-Script auf Produktions-VPS, `tokenId: 187336`:

1. `availableSignals(tokenId: 187336)`
2. `signalsLatest` — alle 29 Signale batched
3. `dataSummary { signalDataSummary, eventDataSummary }`
4. `signals(from: "2026-08-26T11:30:00Z", to: "2026-08-26T12:05:00Z", interval: "1m")` mit `agg: LAST`
5. `events` — 30d und Fahrt-Tag 2026-08-26
6. SynqDrive VLS + letzter Trip via Prisma (read-only)

Keine DB-Mutation, kein Deploy.

---

*Erstellt: 2026-08-30 — Cursor Agent (read-only DIMO historical poll + Code-Gap-Analyse)*
