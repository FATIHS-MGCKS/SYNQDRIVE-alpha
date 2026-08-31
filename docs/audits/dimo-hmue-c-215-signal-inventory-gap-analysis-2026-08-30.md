# DIMO Signal-Inventar & Gap-Analyse — HMÜ C 215

| Feld | Wert |
|------|------|
| **Dokumenttyp** | DIMO Signal-Inventar + SynqDrive Snapshot Gap-Analyse (`signalsLatest` + historisch) |
| **Auditzeitpunkt (UTC)** | 2026-08-30T19:54:30Z |
| **Umgebung** | Produktion VPS (`srv1374778.hstgr.cloud`), DIMO GraphQL read-only |
| **Fahrzeug** | HMÜ C 215 (Volkswagen Arteon 2020) |
| **vehicleId** | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |
| **organizationId** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **DIMO tokenId** | `187784` |
| **DIMO vehicleId** | `623a3934-d75a-4b23-9830-ae970f49d55a` |
| **Hardware** | `LTE_R1` |
| **Methodik** | `availableSignals` + `signalsLatest` (letzte Observation) + `signalDataSummary` / `eventDataSummary` + historische `signals(1m)` um letzte Fahrt + `events` (30d) |
| **SynqDrive Referenz** | `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts` |
| **Vergleichsdokumente** | `dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md`, `dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md`, `connectivity-hmue-c-215-forensic-verification-2026-08.md` |

**Zweck:** Gleiche Auswertungsstruktur wie KS MX 2024 / WOB L 7503. Zum Auditzeitpunkt geparkt (speed 0); Werte aus letzter DIMO-Observation und historischem Fenster der letzten Fahrt am **29.08.2026**.

**Forensik-Kontext:** HMÜ C 215 ist ein historischer Connectivity-Referenzfall (Juli-2026-Unplug + Recovery). Zum Auditzeitpunkt sendet das Fahrzeug wieder frische Telemetrie; VLS ist mit DIMO `signals.lastSeen` aligniert (Recovery gegenüber früherer Fleet-Stale-Phase ~2026-08-25).

---

## 1. Kurzfassung

| Metrik | Wert |
|--------|------|
| **`availableSignals` (gelistet)** | **29** |
| **`signalsLatest` mit Daten** | **29 / 29** (100 %) |
| **`signals.lastSeen` (DIMO)** | **2026-08-29T21:32:35Z** |
| **SynqDrive VLS `source_timestamp`** | **2026-08-29T21:32:35Z** (aligniert) |
| **Kraftstofftyp** | **GASOLINE** (`obdFuelTypeName`) |
| **Fahrzeugstatus zum Audit** | **Geparkt:** speed **0**, Zündung **AUS**, OBD eingesteckt |
| **Aktiver DTC** | **Keiner** (`obdStatusDTCCount` = 0, kein `obdDTCList`) |
| **Letzte dokumentierte Fahrt (DIMO historisch)** | **2026-08-29** 20:52–21:31 UTC (~32 km Odometer-Delta) |
| **Native `behavior.*` Events (30d)** | **50** (46 harshCornering, 1 harshAcceleration, 3 extremeBraking) |
| **SynqDrive Snapshot: in VLS gemappt** | **9 / 29** (31 %) |
| **SynqDrive Snapshot: abgefragt, nur Raw/Nebenpfad** | **2 / 29** (7 %) |
| **Verfügbar, nicht im Snapshot-Poll** | **18 / 29** (62 %) |

**Kernaussage:** HMÜ C 215 liefert eine ICE-OBD-Palette vergleichbar mit KS MX 2024 (29 Signale, **ohne** Getriebe-Gang-Felder). SynqDrive nutzt im 30s-Snapshot nur ~⅓ der verfügbaren Signale. Besonders relevant: **50 native `behavior.*` Events** in 30 Tagen und historisch belegte RPM/Drossel/Speed — alles in der Gap-Liste. Kraftstoff relativ + absolut vorhanden; kein DEF, kein `obdDTCList`.

---

## 2. Letzte Observation (`signalsLatest`) — alle Signalwerte

**Hinweis:** Kein Live-Fahrt-Poll. Werte = letzte gespeicherte DIMO-Observation (Fahrzeug geparkt nach Fahrt vom 29.08.).

### 2.1 Aggregate

| Feld | Wert |
|------|------|
| `signals.lastSeen` | **2026-08-29T21:32:35Z** |
| SynqDrive VLS `provider_fetched_at` | 2026-08-30T19:49:52Z (Polling weiter aktiv) |

### 2.2 Bewegung / Position

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `speed` | **0** km/h | 2026-08-29T21:32:35Z |
| `currentLocationCoordinates` | lat **51.407995**, lon **9.6681383** (Kassel-Region / HMÜ Filiale) | 2026-08-29T21:32:35Z |
| `currentLocationHeading` | **152.4**° | 2026-08-29T21:32:35Z |
| `currentLocationAltitude` | **260.9** m | 2026-08-29T21:32:35Z |

### 2.3 Zündung / Batterie

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `isIgnitionOn` | **0** (AUS) | 2026-08-29T21:32:35Z |
| `lowVoltageBatteryCurrentVoltage` | **12.876** V | 2026-08-29T21:32:35Z |

### 2.4 Klima

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `exteriorAirTemperature` | **20** °C | 2026-08-29T21:32:35Z |

### 2.5 OBD

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `obdBarometricPressure` | **98** | 2026-08-29T21:32:35Z |
| `obdDistanceWithMIL` | **0** | 2026-08-29T21:32:35Z |
| `obdEngineLoad` | **2.75** % | 2026-08-29T21:32:35Z |
| `obdFuelRailPressure` | **2015.21** | 2026-08-29T21:32:35Z |
| `obdFuelTypeName` | **"GASOLINE"** | 2026-08-29T21:32:35Z |
| `obdIntakeTemp` | **38** °C | 2026-08-29T21:32:35Z |
| `obdIsPluggedIn` | **1** | 2026-08-29T21:32:35Z |
| `obdLongTermFuelTrim1` | **0.78** | 2026-08-29T21:32:35Z |
| `obdLongTermFuelTrim2` | **-100** | 2026-08-29T21:32:35Z |
| `obdMAP` | **32** | 2026-08-29T21:32:35Z |
| `obdMaxMAF` | **2.83** | 2026-08-29T21:32:35Z |
| `obdOilTemperature` | **-40** °C | 2026-08-29T21:32:35Z |
| `obdRunTime` | **2466** s | 2026-08-29T21:32:35Z |
| `obdStatusDTCCount` | **0** | 2026-08-29T21:32:35Z |
| `obdThrottlePosition` | **12.16** % | 2026-08-29T21:32:35Z |

*Hinweis: `-40` bei Öltemperatur im Stand ist typischer OBD-Sentinel, nicht zwingend Sensordefekt.*

### 2.6 Antrieb / Kraftstoff

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `powertrainCombustionEngineECT` | **92** °C | 2026-08-29T21:32:35Z |
| `powertrainCombustionEngineSpeed` | **805.5** rpm | 2026-08-29T21:32:35Z |
| `powertrainCombustionEngineTPS` | **14.51** % | 2026-08-29T21:32:35Z |
| `powertrainFuelSystemAbsoluteLevel` | **46** L | 2026-08-29T21:32:35Z |
| `powertrainFuelSystemRelativeLevel` | **71.76** % | 2026-08-29T21:32:35Z |
| `powertrainTransmissionTravelledDistance` | **121884** km | 2026-08-29T21:32:35Z |
| `powertrainType` | **"COMBUSTION"** | 2026-08-29T21:32:35Z |

**Nicht in `availableSignals`:** `obdDTCList`, `powertrainCombustionEngineDieselExhaustFluidLevel`, Getriebe-Gang-Felder.

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

**Vs. WOB L 7503 fehlen bei HMÜ C 215:** `powertrainTransmissionActualGear`, `powertrainTransmissionActualGearRatio`.

---

## 3. Historische Abfrage — letzte Fahrt (2026-08-29)

**Fenster:** `2026-08-29T20:45:00Z` – `2026-08-29T21:40:00Z`  
**Query:** `signals(interval: "1m")` mit `agg: LAST` — 42 Buckets, 33 mit Bewegung (speed > 0 oder ignition ON)

### 3.1 Peak-Werte im Fenster

| Feld | Max |
|------|-----|
| `speed` | **97** km/h |
| `powertrainCombustionEngineSpeed` | **2157** rpm |
| `obdThrottlePosition` | **45.10** % |

### 3.2 Erste Bewegung im Fenster (20:52 UTC)

| Feld | Wert |
|------|------|
| `speed` | 39 km/h |
| `isIgnitionOn` | 1 |
| `odometer` | 121852 km |
| `obdEngineLoad` | 10.98 % |
| `lvBattery` | 13.047 V |
| `rpm` | 1354 |
| `throttle` | 12.55 % |
| `fuel` | 75.69 % |
| `location` | 51.41176°N, 9.39132°E |

### 3.3 Letzte Bewegung im Fenster (21:31 UTC)

| Feld | Wert |
|------|------|
| `speed` | 15 km/h |
| `isIgnitionOn` | 1 |
| `odometer` | 121884 km |
| `obdEngineLoad` | 10.59 % |
| `lvBattery` | 13.08 V |
| `rpm` | 1422.5 |
| `throttle` | 17.25 % |
| `fuel` | 72.16 % |
| `location` | 51.40808°N, 9.66705°E |

**Odometer-Delta:** 121884 − 121852 = **32 km** — konsistent mit letzter dokumentierter Fahrt (~40 min).

---

## 4. Was DIMO für HMÜ C 215 nicht liefert

| Signal (Probe) | Ergebnis |
|----------------|----------|
| `chassisAxleRow1WheelLeftTirePressure` | `null` — kein TPMS |
| `chassisBrakeIsPedalPressed` | `null` — keine Bremsdaten |
| `angularVelocityYaw` | `null` — kein Gierwinkel |
| `powertrainTractionBatteryStateOfChargeCurrent` | `null` — kein EV/HV |
| `chassisTireSystemIsWarningOn` | `null` |
| `obdDTCList` | nicht in `availableSignals` |
| `powertrainCombustionEngineDieselExhaustFluidLevel` | nicht verfügbar (Benziner) |

Zusätzlich **nicht in `availableSignals`:** Getriebe-Gang-Felder (im Gegensatz zu WOB L 7503).

---

## 5. Native DIMO Events & Datenhistorie

### 5.1 `dataSummary.eventDataSummary` (gesamt)

| Event | Anzahl | lastSeen |
|-------|--------|----------|
| `behavior.harshCornering` | 3142 | 2026-08-29T15:14:50Z |
| `behavior.harshBraking` | 721 | 2026-05-26T17:12:52Z |
| `behavior.extremeBraking` | 140 | 2026-08-08T09:30:20Z |
| `behavior.harshAcceleration` | 71 | 2026-08-08T11:59:19Z |

### 5.2 Letzte 30 Tage (zum Audit)

- **50 Events** total (46 / 1 / 3)

### 5.3 `signalDataSummary` (Aggregate)

| Feld | Wert |
|------|------|
| `numberOfSignals` (gesamt) | **4.809.939** |
| `firstSeen` | 2025-12-02T19:11:55Z |
| `lastSeen` | 2026-08-29T21:32:35Z |

| Signal | Samples | lastSeen |
|--------|---------|----------|
| GPS (coords/heading/altitude) | ~845.577 | 2026-08-29 |
| `speed` / `isIgnitionOn` | ~124.7k | 2026-08-29 |
| `powertrainCombustionEngineSpeed` | ~112.611 | 2026-08-29 |
| `obdThrottlePosition` | ~35.005 | 2026-08-29 |

---

## 6. SynqDrive-Stand zum Audit

| Feld | Wert |
|------|------|
| VLS `source_timestamp` | 2026-08-29T21:32:35Z |
| VLS `odometer_km` | 121884 |
| VLS `speed_kmh` | 0 |
| VLS Position | 51.407995, 9.6681383 |
| VLS `fuel_level_relative` | 71.76 % |
| VLS `fuel_level_absolute` | 46 L |
| VLS `lv_battery_voltage` | 12.876 V |
| VLS `coolant_temp_c` | 92 °C |
| VLS `is_ignition_on` | false |

**Recovery-Update:** Gegenüber früherer Fleet-Stale-Phase (~2026-08-25) und dem historischen Connectivity-Fall (Juli-2026-Unplug) ist der aktuelle DIMO-/VLS-Stand **frisch und aligniert**. `obdIsPluggedIn=1`; Polling aktiv (`provider_fetched_at` 2026-08-30).

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

SynqDrive fragt zusätzlich **18 Fleet-Felder** ab (EV, Reifen, Öl, DEF, …), die HMÜ C 215 nicht liefert.

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

**Historisch belegt (29.08. Fahrt):** RPM bis 2157, Drossel bis 45 %, Speed bis 97 km/h — alle in Gap-Liste.

### 7.5 Vergleich HMÜ C 215 vs. Fleet-Referenzfahrzeuge

| Aspekt | HMÜ C 215 | KS MX 2024 | WOB L 7503 | KS MS 661 |
|--------|-----------|------------|------------|-----------|
| `availableSignals` | 29 | 29 | 31 | 30 |
| Kraftstoff | Benzin, rel + abs | Benzin, rel + abs | Benzin, rel + abs | Diesel, nur abs + DEF |
| Getriebe-Gang | **Nicht verfügbar** | Nicht verfügbar | Verfügbar | Nicht verfügbar |
| DTC-Liste | Nein (`count` only) | Nein | Nein | Ja (`P0675`) |
| Gap ungenutzt (Snapshot) | 18 / 29 (62 %) | 18 / 29 (62 %) | 20 / 31 (65 %) | 19 / 30 (63 %) |
| VLS gemappt | 9 | 9 | 9 | 9 |
| Native Events (30d) | **50** | 34 | 0 | 0 |
| Audit-Modus | Historisch + last obs. | Historisch + last obs. | Live-Fahrt | Historisch + last obs. |

---

## 8. Priorisierte Erweiterungs-Empfehlung

| Prio | Signale | Begründung HMÜ C 215 |
|------|---------|----------------------|
| **P0** | `powertrainCombustionEngineSpeed`, `obdThrottlePosition` | Historisch in Fahrtfenster vorhanden (RPM/Drossel); Abuse/RPM-Webhooks; 50 `behavior.*` Events in 30d |
| **P1** | `obdStatusDTCCount` | Health-Kontext (aktuell 0, aber Signal verfügbar) |
| **P1** | `powertrainCombustionEngineTPS` | Last-Kontext, korreliert mit Cornering-Events |
| **P2** | `currentLocationHeading`, `exteriorAirTemperature` | Route/Klima |
| **P2** | `obdOilTemperature`, `obdRunTime`, `obdIntakeTemp` | Thermal/Cold-engine |

Getriebe-Gang nicht anwendbar (nicht in `availableSignals`).

---

## 9. Offene Punkte für tiefere Analyse

1. **Connectivity-Historie vs. aktuelle Frische:** Juli-2026-Unplug-Events vs. aktueller plugged Snapshot — siehe `connectivity-hmue-c-215-forensic-verification-2026-08.md`.
2. **Behavior-Event-Reichtum:** 3142 historische `harshCornering` vs. nur 50 in 30d — Korrelation mit SynqDrive Trip-Enrichment / `lte-r1-behavior-enrichment`.
3. **Post-Stand-RPM 805.5:** `signalsLatest` zeigt 805 rpm bei speed 0 / ignition off — Idle-Sentinel oder echte Nachlauf-Phase klären.
4. **VehicleDataSourceLink:** Früher 0 DIMO-Links in Production — Backfill-Status für HMÜ C 215 prüfen (`provider-link-authority-production-population-2026-08.md`).
5. **Fleet-Preflight:** `DimoAvailableSignalsPreflightService` für tokenId 187784 auswerten.

---

## 10. Reproduktion (read-only)

Ephemeres Node-Script auf Produktions-VPS, `tokenId: 187784`:

1. `availableSignals(tokenId: 187784)`
2. `signalsLatest` — alle 29 Signale batched
3. `dataSummary { signalDataSummary, eventDataSummary }`
4. `signals(from: "2026-08-29T20:45:00Z", to: "2026-08-29T21:40:00Z", interval: "1m")` mit `agg: LAST`
5. `events` — 30d (`name`, nicht `eventName`)
6. SynqDrive VLS via Prisma `vehicleLatestState` (read-only)

Keine DB-Mutation, kein Deploy.

---

*Erstellt: 2026-08-30 — Cursor Agent (read-only DIMO historical poll + Code-Gap-Analyse)*
