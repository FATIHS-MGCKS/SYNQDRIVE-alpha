# DIMO Signal-Inventar & Gap-Analyse — KS MS 661

| Feld | Wert |
|------|------|
| **Dokumenttyp** | DIMO Signal-Inventar + SynqDrive Snapshot Gap-Analyse (`signalsLatest` + historisch) |
| **Auditzeitpunkt (UTC)** | 2026-08-30T19:27:16Z |
| **Umgebung** | Produktion VPS (`srv1374778.hstgr.cloud`), DIMO GraphQL read-only |
| **Fahrzeug** | KS MS 661 |
| **vehicleId** | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| **organizationId** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **DIMO tokenId** | `187361` |
| **Methodik** | `availableSignals` + `signalsLatest` (letzte Observation) + `signalDataSummary` + historische `signals(1m)` um letzte Fahrt + `events` (30d) |
| **SynqDrive Referenz** | `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts` |
| **Vergleichsdokumente** | `dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md`, `dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md` |

**Zweck:** Gleiche Auswertungsstruktur wie KS MX 2024 / WOB L 7503. Zum Auditzeitpunkt geparkt (speed 0); Werte aus letzter DIMO-Observation und historischem Fenster der letzten Fahrt am selben Tag.

---

## 1. Kurzfassung

| Metrik | Wert |
|--------|------|
| **`availableSignals` (gelistet)** | **30** |
| **`signalsLatest` mit Daten** | **30 / 30** (100 %) |
| **`signals.lastSeen` (DIMO)** | **2026-08-30T13:58:25Z** |
| **SynqDrive VLS `source_timestamp`** | **2026-08-30T13:58:25Z** (aligniert) |
| **Kraftstofftyp** | **DIESEL** (`obdFuelTypeName`) |
| **Fahrzeugstatus zum Audit** | **Geparkt:** speed **0**, Zündung **AUS**, OBD eingesteckt |
| **Aktiver DTC** | **P0675** (`obdDTCList`), `obdStatusDTCCount` = **1** |
| **Letzte SynqDrive-Fahrt** | **2026-08-30** 13:39–13:57 UTC (4,4 km) |
| **Native `behavior.*` Events (30d)** | **0** |
| **SynqDrive Snapshot: in VLS gemappt** | **9 / 30** (30 %) |
| **SynqDrive Snapshot: abgefragt, nur Raw/Nebenpfad** | **2 / 30** (7 %) |
| **Verfügbar, nicht im Snapshot** | **19 / 30** (63 %) |

**Kernaussage:** KS MS 661 ist ein **Diesel** mit DEF-Signal, DTC-Liste und ohne relatives Kraftstoff-Signal. SynqDrive nutzt im 30s-Snapshot nur ~⅓ der verfügbaren Signale. DEF ist bereits im Snapshot gemappt (`def_level`); RPM, Drossel und **DTC-Liste** sind verfügbar, werden aber nicht im Snapshot abgefragt.

---

## 2. Letzte Observation (`signalsLatest`) — alle Signalwerte

**Zeitstempel:** letzte Observation **2026-08-30T13:58:24Z** (DTC-Liste 13:58:25Z)  
**Fahrzeug geparkt** nach letzter Fahrt.

### 2.1 Aggregate

| Feld | Wert |
|------|------|
| `signals.lastSeen` | **2026-08-30T13:58:25Z** |
| SynqDrive VLS `provider_fetched_at` | 2026-08-30T19:23:41Z |

### 2.2 Bewegung / Position

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `speed` | **0** km/h | 2026-08-30T13:58:24Z |
| `currentLocationCoordinates` | lat **51.3353083**, lon **9.506055** | 2026-08-30T13:58:24Z |
| `currentLocationHeading` | **64.1**° | 2026-08-30T13:58:24Z |
| `currentLocationAltitude` | **189.6** m | 2026-08-30T13:58:24Z |

### 2.3 Zündung / Batterie

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `isIgnitionOn` | **0** (AUS) | 2026-08-30T13:58:24Z |
| `lowVoltageBatteryCurrentVoltage` | **13.582** V | 2026-08-30T13:58:24Z |

### 2.4 Klima

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `exteriorAirTemperature` | **28** °C | 2026-08-30T13:58:24Z |

### 2.5 OBD / DTC

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `obdDTCList` | **`["P0675"]`** | 2026-08-30T13:58:25Z |
| `obdStatusDTCCount` | **1** | 2026-08-30T13:58:24Z |
| `obdDistanceWithMIL` | **3426** km | 2026-08-30T13:58:24Z |
| `obdBarometricPressure` | **99** | 2026-08-30T13:58:24Z |
| `obdEngineLoad` | **27.45** % | 2026-08-30T13:58:24Z |
| `obdFuelRailPressure` | **0** | 2026-08-30T13:58:24Z |
| `obdFuelTypeName` | **"DIESEL"** | 2026-08-30T13:58:24Z |
| `obdIntakeTemp` | **35** °C | 2026-08-30T13:58:24Z |
| `obdIsPluggedIn` | **1** | 2026-08-30T13:58:24Z |
| `obdLongTermFuelTrim1` | **-100** | 2026-08-30T13:58:24Z |
| `obdLongTermFuelTrim2` | **-100** | 2026-08-30T13:58:24Z |
| `obdMAP` | **0** | 2026-08-30T13:58:24Z |
| `obdMaxMAF` | **11.61** | 2026-08-30T13:58:24Z |
| `obdOilTemperature` | **94** °C | 2026-08-30T13:58:24Z |
| `obdRunTime` | **1128** s | 2026-08-30T13:58:24Z |
| `obdThrottlePosition` | **22.35** % | 2026-08-30T13:58:24Z |

### 2.6 Antrieb / Kraftstoff / DEF

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `powertrainCombustionEngineECT` | **94** °C | 2026-08-30T13:58:24Z |
| `powertrainCombustionEngineSpeed` | **600.5** rpm | 2026-08-30T13:58:24Z |
| `powertrainCombustionEngineTPS` | **14.90** % | 2026-08-30T13:58:24Z |
| `powertrainFuelSystemAbsoluteLevel` | **16** L | 2026-08-30T13:58:24Z |
| `powertrainCombustionEngineDieselExhaustFluidLevel` | **88.4** % | 2026-08-30T13:58:24Z |
| `powertrainTransmissionTravelledDistance` | **190716** km | 2026-08-30T13:58:24Z |
| `powertrainType` | **"COMBUSTION"** | 2026-08-30T13:58:24Z |

**Nicht in `availableSignals`:** `powertrainFuelSystemRelativeLevel` (Snapshot-Query fragt es ab → immer `null`).

### 2.7 Vollständige `availableSignals`-Liste (30)

```
currentLocationAltitude
currentLocationCoordinates
currentLocationHeading
exteriorAirTemperature
isIgnitionOn
lowVoltageBatteryCurrentVoltage
obdBarometricPressure
obdDTCList
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
powertrainCombustionEngineDieselExhaustFluidLevel
powertrainCombustionEngineECT
powertrainCombustionEngineSpeed
powertrainCombustionEngineTPS
powertrainFuelSystemAbsoluteLevel
powertrainTransmissionTravelledDistance
powertrainType
speed
```

**Vs. KS MX 2024:** KS MS hat `obdDTCList` + DEF; fehlt `powertrainFuelSystemRelativeLevel`.  
**Vs. WOB L 7503:** fehlen Getriebe-Gang-Signale (`ActualGear`, `GearRatio`).

---

## 3. Historische Abfrage — letzte Fahrt (2026-08-30)

**Fenster:** 13:34–14:02 UTC (±5 min um letzte DB-Fahrt)  
**Query:** `signals(interval: "1m", agg: LAST)` — 19 Buckets, 18 mit Bewegung

### 3.1 Erste Bewegung (13:39 UTC)

| Feld | Wert |
|------|------|
| `speed` | 7 km/h |
| `isIgnitionOn` | 1 |
| `odometer` | 190712 km |
| `rpm` | 653.5 |
| `throttle` | **85.88** % |
| `obdEngineLoad` | 39.61 % |
| `location` | 51.31177°N, 9.51066°E |

### 3.2 Letzte Bewegung (13:56 UTC)

| Feld | Wert |
|------|------|
| `speed` | 0 km/h |
| `isIgnitionOn` | 1 |
| `odometer` | 190716 km |
| `rpm` | 597 |
| `throttle` | 22.35 % |
| `obdEngineLoad` | 36.47 % |
| `location` | 51.33531°N, 9.50606°E |

**SynqDrive-Trip:** Start 13:39:34, Ende 13:57:50, **4,4 km** — konsistent mit DIMO-Odometer (+4 km).

---

## 4. Was DIMO für KS MS 661 nicht liefert

| Signal (Probe) | Ergebnis |
|----------------|----------|
| `chassisAxleRow1WheelLeftTirePressure` | `null` — kein TPMS |
| `chassisBrakeIsPedalPressed` | `null` — keine Bremsdaten |
| `angularVelocityYaw` | `null` — kein Gierwinkel |
| `powertrainTractionBatteryStateOfChargeCurrent` | `null` — kein EV/HV |
| `powertrainTransmissionActualGear` | `null` — kein Gang-Signal |

Zusätzlich **nicht gelistet:** `powertrainFuelSystemRelativeLevel` (relativer Kraftstoff).

---

## 5. Native DIMO Events & Datenhistorie

### 5.1 `dataSummary.eventDataSummary`

- **Leer** — keine historischen `behavior.*` Events in `dataSummary`
- **`events` letzte 30 Tage:** **0**

### 5.2 `signalDataSummary` (Auszug)

| Feld | Wert |
|------|------|
| `numberOfSignals` (gesamt) | ~4.112.952 |
| `firstSeen` | 2025-11-25T12:38:01Z |
| `lastSeen` | 2026-08-30T13:58:25Z |

| Signal | Samples | lastSeen |
|--------|---------|----------|
| GPS (coords/heading/altitude) | ~867.494 | 2026-08-30 (live) |
| `speed` / `isIgnitionOn` | ~85k | 2026-08-30 |
| `powertrainCombustionEngineSpeed` | ~75k | 2026-08-30 |
| `obdDTCList` | **511** | 2026-08-30 |
| `powertrainCombustionEngineDieselExhaustFluidLevel` | ~75k | 2026-08-30 |

---

## 6. SynqDrive-Stand zum Audit

| Feld | Wert |
|------|------|
| VLS `source_timestamp` | 2026-08-30T13:58:25Z |
| VLS `odometer_km` | 190716 |
| VLS `speed_kmh` | 0 |
| VLS Position | 51.3353083, 9.506055 |
| Letzte Trip (DB) | 2026-08-30 13:39–13:57 UTC, 4,4 km |

DIMO und SynqDrive VLS sind **aligniert** — kein Stale-Gap zum Auditzeitpunkt.

---

## 7. Gap-Analyse: 30 `availableSignals` vs. SynqDrive Snapshot

**Referenz:** `buildLatestSnapshotQuery()` + `normalizeSnapshot()`

### 7.1 Übersicht

| Kategorie | Anzahl | Anteil |
|-----------|--------|--------|
| Im Snapshot abgefragt + in VLS gemappt | **9** | 30 % |
| Im Snapshot abgefragt, nur Nebenpfad / Raw | **2** | 7 % |
| Verfügbar, nicht im Snapshot | **19** | 63 % |
| Gesamt `availableSignals` | **30** | 100 % |

SynqDrive fragt zusätzlich **Fleet-Felder** ab, die KS MS nicht liefert (EV, Reifen, relativer Kraftstoff, Motoröl, …).

### 7.2 Abgefragt und in VLS gemappt (9)

| DIMO-Signal | VLS-Feld | Anmerkung |
|-------------|----------|-----------|
| `currentLocationCoordinates` | `latitude`, `longitude` | |
| `speed` | `speed_kmh` | |
| `powertrainTransmissionTravelledDistance` | `odometer_km` | |
| `powertrainFuelSystemAbsoluteLevel` | `fuel_level_absolute` | Nur absolut (Diesel) |
| `powertrainCombustionEngineECT` | `coolant_temp_c` | |
| `powertrainCombustionEngineDieselExhaustFluidLevel` | `def_level` | **Diesel-spezifisch, bereits genutzt** |
| `isIgnitionOn` | `is_ignition_on` | |
| `obdEngineLoad` | `engine_load` | |
| `lowVoltageBatteryCurrentVoltage` | `lv_battery_voltage` | |

**Nicht gemappt obwohl in Query:** `powertrainFuelSystemRelativeLevel` — Fahrzeug liefert Signal nicht.

### 7.3 Abgefragt, nicht als VLS-Spalte (2)

| Signal | Nutzung |
|--------|---------|
| `obdIsPluggedIn` | Connectivity Episode Resolution |
| `powertrainType` | nur `raw_payload_json` |

### 7.4 Verfügbar, nicht im Snapshot (19)

| Gruppe | Signale |
|--------|---------|
| **Position** | `currentLocationHeading`, `currentLocationAltitude` |
| **Klima** | `exteriorAirTemperature` |
| **OBD / DTC** | `obdDTCList`, `obdStatusDTCCount`, `obdDistanceWithMIL`, `obdThrottlePosition`, `obdOilTemperature`, `obdIntakeTemp`, `obdRunTime`, `obdBarometricPressure`, `obdMAP`, `obdFuelRailPressure`, `obdMaxMAF`, `obdLongTermFuelTrim1`, `obdLongTermFuelTrim2`, `obdFuelTypeName` |
| **Antrieb** | `powertrainCombustionEngineSpeed`, `powertrainCombustionEngineTPS` |

**Historisch belegt (Fahrt 30.08.):** RPM (**653,5**), Drossel (**85,9 %**), Speed, GPS — alle in Gap-Liste.

**Health-kritisch in Gap:** `obdDTCList` (**P0675**), `obdStatusDTCCount` (**1**).

### 7.5 SynqDrive fragt ab, KS MS liefert nicht

| Gruppe | Signale |
|--------|---------|
| EV/HV (13) | `powertrainTractionBattery*` |
| Reifen (5) | `chassisAxleRow* TirePressure`, `chassisTireSystemIsWarningOn` |
| Sonstiges | `powertrainCombustionEngineEngineOilRelativeLevel`, `powertrainFuelSystemRelativeLevel`, `connectivityCellularIsJammingDetected` |

---

## 8. Drei-Fahrzeug-Vergleich (Gap-Kern)

| | KS MS 661 | KS MX 2024 | WOB L 7503 |
|--|-----------|------------|------------|
| `availableSignals` | **30** | 29 | 31 |
| VLS gemappt | 9 | 9 | 9 |
| Gap ungenutzt | 19 (63 %) | 18 (62 %) | 20 (65 %) |
| Kraftstoff | **Diesel** (abs. only) | Benzin (rel. + abs.) | Benzin |
| DEF im Snapshot | ✅ **gemappt** | ❌ | ❌ |
| `obdDTCList` | ✅ **P0675** | ❌ | ❌ |
| `behavior.*` (30d) | 0 | 34 | 0 |
| Getriebe-Gang | ❌ | ❌ | ✅ |
| VLS stale (Audit) | ❌ aligniert | Recovery nach 26.08. | live 30.08. |

---

## 9. Priorisierte Erweiterungs-Empfehlung

| Prio | Signale | Begründung KS MS |
|------|---------|------------------|
| **P0** | `obdDTCList`, `obdStatusDTCCount` | Aktiver **P0675** — Health/Error-Codes |
| **P0** | `powertrainCombustionEngineSpeed`, `obdThrottlePosition` | Fahrt heute nachweisbar, nicht im Snapshot |
| **P1** | `powertrainCombustionEngineTPS` | Last-Kontext |
| **P2** | `currentLocationHeading`, `exteriorAirTemperature` | Route/Klima |
| **P2** | `obdOilTemperature`, `obdRunTime`, `obdIntakeTemp` | Thermal |

DEF bereits abgedeckt — **kein Gap**.

---

## 10. Offene Punkte für tiefere Analyse

1. **DTC P0675** — Bedeutung, Korrelation mit `obdDistanceWithMIL` (3426 km), SynqDrive Error-Code-Modul.
2. **Kein relatives Kraftstoff-Signal** — UI/Logik auf `fuel_level_absolute` (16 L) für Diesel validieren.
3. **Keine `behavior.*` Events** trotz Fahrt — DIMO Event-Pipeline vs. LTE_R1 Profil.
4. **RPM im Stand (600.5)** — Idle-Wert vs. echter Motorlauf nach Zündung aus.
5. **Fleet-Preflight** — `DimoAvailableSignalsPreflightService` DB-Rows für KS MS auswerten.

---

## 11. Reproduktion (read-only)

Ephemeres Node-Script auf Produktions-VPS, `tokenId: 187361`:

1. `availableSignals(tokenId: 187361)`
2. `signalsLatest` — alle 30 Signale batched
3. `dataSummary { signalDataSummary, eventDataSummary }`
4. `signals(from/to um letzte Fahrt, interval: "1m")` mit `agg: LAST`
5. `events` — 30d
6. SynqDrive VLS + letzter Trip via Prisma (read-only)

Keine DB-Mutation, kein Deploy.

---

*Erstellt: 2026-08-30 — Cursor Agent (read-only DIMO poll + Code-Gap-Analyse)*
