# DIMO Signal-Inventar & Gap-Analyse — WOB L 7503

| Feld | Wert |
|------|------|
| **Dokumenttyp** | Live DIMO Signal-Inventar + SynqDrive Snapshot Gap-Analyse |
| **Auditzeitpunkt (UTC)** | 2026-08-30T18:31:12Z (Live-Poll) |
| **Umgebung** | Produktion VPS (`srv1374778.hstgr.cloud`), DIMO GraphQL read-only |
| **Fahrzeug** | WOB L 7503 |
| **vehicleId** | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| **organizationId** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **DIMO tokenId** | `192922` |
| **Methodik** | `availableSignals` + `signalsLatest` (pro Signal) + `dataSummary` / `signalDataSummary` + `events` (30d) |
| **SynqDrive Referenz** | `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts` |

**Zweck:** Vollständige Auswertung für spätere tiefere Analyse — welche DIMO-Signale WOB L 7503 liefert, mit welchen Werten zum Poll-Zeitpunkt, und welche SynqDrive im 30s-Snapshot-Poll nutzt vs. ungenutzt lässt.

**Hinweis zum Forensik-Kontext:** Im P0-Forensik-Audit vom 2026-08-27 wirkte WOB L 7503 eingefroren (VLS `source_timestamp` seit 2026-07-23). Zum Zeitpunkt **dieses** Audits liefert das Fahrzeug **frische Live-Telemetrie** — die Stale-Phase war temporär / fahrzeug- oder provider-seitig, nicht strukturell „ohne Signale“.

---

## 1. Kurzfassung

| Metrik | Wert |
|--------|------|
| **`availableSignals` (gelistet)** | **31** |
| **`signalsLatest` mit Daten** | **31 / 31** (100 %) |
| **`signals.lastSeen`** | **2026-08-30T18:31:12Z** (live) |
| **Fahrzeugstatus zum Poll** | Fährt: speed **25 km/h**, Zündung **AN**, Motor **2017 rpm**, Gang **2** |
| **Historische `behavior.*` Events (30d)** | **0** (letzte Events im Juli 2026) |
| **SynqDrive Snapshot: in VLS gemappt** | **9 / 31** (29 %) |
| **SynqDrive Snapshot: abgefragt, nur Raw/Nebenpfad** | **2 / 31** (6 %) |
| **Verfügbar, nicht im Snapshot-Poll** | **20 / 31** (65 %) |

**Kernaussage:** DIMO liefert für WOB L 7503 eine solide ICE-OBD-Palette (GPS, Speed, Motor, Kraftstoff, Getriebe, LV-Batterie). SynqDrive nutzt im 30s-Snapshot nur einen Bruchteil; wichtige Fahrverhaltenssignale (RPM, Drossel, Gang) werden live geliefert, aber **nicht** im Snapshot-Poll abgeholt.

---

## 2. Live-Signalwerte zum Poll-Zeitpunkt

**Zeitstempel aller per-Signal-Werte:** `2026-08-30T18:31:12Z`  
**Aggregate `signals.lastSeen`:** `2026-08-30T18:31:12Z`

### 2.1 Bewegung / Position

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `speed` | **25** km/h | 2026-08-30T18:31:12Z |
| `currentLocationCoordinates` | lat **47.3811266**, lon **19.0495916** | 2026-08-30T18:31:12Z |
| `currentLocationHeading` | **95.6**° | 2026-08-30T18:31:12Z |
| `currentLocationAltitude` | **110.4** m | 2026-08-30T18:31:12Z |

### 2.2 Zündung / Batterie

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `isIgnitionOn` | **1** (AN) | 2026-08-30T18:31:12Z |
| `lowVoltageBatteryCurrentVoltage` | **13.749** V | 2026-08-30T18:31:12Z |

### 2.3 Klima

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `exteriorAirTemperature` | **34** °C | 2026-08-30T18:31:12Z |

### 2.4 OBD

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `obdBarometricPressure` | **100** | 2026-08-30T18:31:12Z |
| `obdDistanceWithMIL` | **0** | 2026-08-30T18:31:12Z |
| `obdEngineLoad` | **35.69** % | 2026-08-30T18:31:12Z |
| `obdFuelRailPressure` | **0** | 2026-08-30T18:31:12Z |
| `obdFuelTypeName` | **"GASOLINE"** | 2026-08-30T18:31:12Z |
| `obdIntakeTemp` | **48** °C | 2026-08-30T18:31:12Z |
| `obdIsPluggedIn` | **1** (eingesteckt) | 2026-08-30T18:31:12Z |
| `obdLongTermFuelTrim1` | **0** | 2026-08-30T18:31:12Z |
| `obdLongTermFuelTrim2` | **-100** | 2026-08-30T18:31:12Z |
| `obdMAP` | **92** | 2026-08-30T18:31:12Z |
| `obdMaxMAF` | **0** | 2026-08-30T18:31:12Z |
| `obdOilTemperature` | **97** °C | 2026-08-30T18:31:12Z |
| `obdRunTime` | **20675** s | 2026-08-30T18:31:12Z |
| `obdStatusDTCCount` | **0** | 2026-08-30T18:31:12Z |
| `obdThrottlePosition` | **21.96** % | 2026-08-30T18:31:12Z |

### 2.5 Antrieb / Kraftstoff / Getriebe

| Signal | Wert | Timestamp |
|--------|------|-----------|
| `powertrainCombustionEngineECT` | **93** °C (Kühlmittel) | 2026-08-30T18:31:12Z |
| `powertrainCombustionEngineSpeed` | **2017** rpm | 2026-08-30T18:31:12Z |
| `powertrainCombustionEngineTPS` | **32.94** % | 2026-08-30T18:31:12Z |
| `powertrainFuelSystemAbsoluteLevel` | **30** (L) | 2026-08-30T18:31:12Z |
| `powertrainFuelSystemRelativeLevel` | **55.29** % | 2026-08-30T18:31:12Z |
| `powertrainTransmissionActualGear` | **2** | 2026-08-30T18:31:12Z |
| `powertrainTransmissionActualGearRatio` | **0** | 2026-08-30T18:31:12Z |
| `powertrainTransmissionTravelledDistance` | **6764** km | 2026-08-30T18:31:12Z |
| `powertrainType` | **"COMBUSTION"** | 2026-08-30T18:31:12Z |

### 2.6 Vollständige `availableSignals`-Liste (31)

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
powertrainTransmissionActualGear
powertrainTransmissionActualGearRatio
powertrainTransmissionTravelledDistance
powertrainType
speed
```

---

## 3. Was DIMO für WOB L 7503 nicht liefert

Diese typischen Fleet-/SynqDrive-Signale sind **weder** in `availableSignals` **noch** in `signalsLatest` (Probe `null`):

| Signal (Beispiel) | Bedeutung |
|-------------------|-----------|
| `chassisAxleRow1WheelLeftTirePressure` (+ alle Reifen) | Kein TPMS |
| `chassisBrakeIsPedalPressed` / `chassisBrakePedalPosition` | Keine Bremsdaten |
| `angularVelocityYaw` | Kein Gierwinkel |
| `powertrainTractionBattery*` | Kein EV/HV (ICE) |
| `chassisTireSystemIsWarningOn` | Kein TPMS-Warning |
| `connectivityCellularIsJammingDetected` | Nicht gelistet |

---

## 4. Native DIMO Events

### 4.1 `dataSummary.eventDataSummary` (historisch)

| Event | Anzahl gesamt | Letztes Event |
|-------|---------------|---------------|
| `behavior.harshAcceleration` | 404 | 2026-07-16T15:03:54Z |
| `behavior.harshCornering` | 13 | 2026-07-09T11:26:47Z |

### 4.2 `events(tokenId, last 30d)` zum Auditzeitpunkt

- **Total:** 0 Events
- Verhalten-Events sind historisch (Juli 2026) vorhanden, seitdem nicht mehr geliefert.

---

## 5. Datenhistorie (`signalDataSummary` / `dataSummary`)

| Feld | Wert |
|------|------|
| `numberOfSignals` (gesamt) | ~1.409.230 |
| `firstSeen` | 2026-07-06T13:16:55Z |
| `lastSeen` | 2026-08-30T18:31:25Z |

### 5.1 Kadenz nach Signal (Auszug)

| Signal | Samples | firstSeen | lastSeen |
|--------|---------|-----------|----------|
| `currentLocationCoordinates` | 277.192 | 2026-07-06 | live |
| `currentLocationHeading` | 277.192 | 2026-07-06 | live |
| `currentLocationAltitude` | 277.192 | 2026-07-06 | live |
| `speed` | 21.217 | 2026-07-06 | live |
| `isIgnitionOn` | 21.233 | 2026-07-06 | live |
| `powertrainCombustionEngineSpeed` | 18.539 | 2026-07-06 | live |
| `powertrainFuelSystemRelativeLevel` | 17.025 | 2026-07-06 | live |
| `exteriorAirTemperature` | 20.313 | 2026-07-06 | live |

GPS/Heading/Altitude haben deutlich höhere Sample-Counts als Motor/OBD-Signale (höhere effektive Kadenz).

---

## 6. SynqDrive / DIMO — Code-Referenzen

| Was | Pfad |
|-----|------|
| `availableSignals(tokenId)` | `backend/src/modules/dimo/queries/available-signals.query.ts` |
| Snapshot-Poll (30s) | `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts` |
| Normalisierung → VLS | `backend/src/workers/processors/dimo-snapshot.processor.ts` → `normalizeSnapshot()` |
| Preflight (availableSignals + dataSummary) | `backend/src/modules/vehicle-intelligence/driving-capability/dimo-available-signals-preflight.service.ts` |
| Trip-Enrichment (historische HF) | `backend/src/modules/dimo/queries/high-frequency.query.ts`, `performance.query.ts` |
| DIMO SDK (Repo) | `mcp-dimo-main` → `@dimo-network/data-sdk` |

### 6.1 Architektur-Hinweis

```
30s Snapshot Poll                    Trip Enrichment / HF (separat)
─────────────────                    ────────────────────────────────
latest-vehicle-snapshot.query.ts     high-frequency.query.ts
        │                            performance.query.ts
        ▼                            environment-temperature.query.ts
normalizeSnapshot() → VLS            dimo-segments.service (historisch)
```

Viele der „Gap“-Signale werden **nachträglich** bei Trip-Enrichment über historische `signals(...)`-Queries geholt — **nicht** im Live-Snapshot-Pfad. Deshalb fehlen z.B. RPM und Drosselklappe in VLS/Fleet-Map, obwohl DIMO sie live liefert.

---

## 7. Gap-Analyse: 31 `availableSignals` vs. SynqDrive Snapshot

**Referenz-Query:** `buildLatestSnapshotQuery()` in `latest-vehicle-snapshot.query.ts`  
**Persistenz:** `normalizeSnapshot()` in `dimo-snapshot.processor.ts`

### 7.1 Übersicht

| Kategorie | Anzahl | Anteil |
|-----------|--------|--------|
| Im Snapshot abgefragt + in VLS gemappt | **9** | 29 % |
| Im Snapshot abgefragt, nur Nebenpfad / Raw | **2** | 6 % |
| Verfügbar, nicht im Snapshot | **20** | 65 % |
| Gesamt `availableSignals` | **31** | 100 % |

Zusätzlich fragt SynqDrive **18 weitere Signale** in der Snapshot-Query ab, die WOB L 7503 **nicht** liefert (EV, Reifen, Öl, DEF, …) — die Query ist fleet-weit, nicht fahrzeugspezifisch.

### 7.2 Abgefragt und in `vehicle_latest_states` gemappt (9)

| DIMO-Signal | VLS-Feld | Nutzung |
|-------------|----------|---------|
| `currentLocationCoordinates` | `latitude`, `longitude` | Fleet-Map, Trip Detection, Connectivity |
| `speed` | `speed_kmh` | Trip Detection, UI, ClickHouse |
| `powertrainTransmissionTravelledDistance` | `odometer_km` | Trips, Battery V2 Kontext |
| `powertrainFuelSystemRelativeLevel` | `fuel_level_relative` | Trip Start Evidence |
| `powertrainFuelSystemAbsoluteLevel` | `fuel_level_absolute` | Trip Start Evidence |
| `powertrainCombustionEngineECT` | `coolant_temp_c` | Health (indirekt) |
| `isIgnitionOn` | `is_ignition_on` | Trip Detection |
| `obdEngineLoad` | `engine_load` | Trip Detection |
| `lowVoltageBatteryCurrentVoltage` | `lv_battery_voltage` | Battery V2 LIVE_VOLTAGE |

### 7.3 Abgefragt, aber nicht als eigenes VLS-Feld (2)

| DIMO-Signal | Was passiert damit? |
|-------------|---------------------|
| `obdIsPluggedIn` | Connectivity Episode Resolution (`tryResolveFromSnapshotPlugSignal`) |
| `powertrainType` | Nur in `raw_payload_json` (Spread der Signal-Antwort), keine eigene Spalte |

### 7.4 Verfügbar bei WOB L 7503, aber nicht im Snapshot-Poll (20)

#### Bewegung / Position (2)

| Signal | Poll-Wert | Wo sonst im Code? |
|--------|-----------|-------------------|
| `currentLocationHeading` | 95.6° | `vehicles.service` (Detail), nicht Snapshot |
| `currentLocationAltitude` | 110.4 m | — |

#### Klima (1)

| Signal | Poll-Wert | Wo sonst? |
|--------|-----------|-----------|
| `exteriorAirTemperature` | 34 °C | `high-frequency.query`, `dimo-segments.service` |

#### OBD erweitert (13)

| Signal | Poll-Wert | Relevanz |
|--------|-----------|----------|
| `obdThrottlePosition` | 21.96 % | **Hoch** — Kickdown/HF in `performance.query` |
| `obdOilTemperature` | 97 °C | Motor-Health |
| `obdIntakeTemp` | 48 °C | Cold-engine Kontext |
| `obdRunTime` | 20675 s | Cold-start Fenster |
| `obdStatusDTCCount` | 0 | **Hoch** — Error-Code Kontext |
| `obdBarometricPressure` | 100 | — |
| `obdMAP` | 92 | — |
| `obdFuelRailPressure` | 0 | — |
| `obdMaxMAF` | 0 | — |
| `obdDistanceWithMIL` | 0 | — |
| `obdLongTermFuelTrim1` | 0 | — |
| `obdLongTermFuelTrim2` | -100 | — |
| `obdFuelTypeName` | "GASOLINE" | Powertrain-Klassifikation (String) |

#### Antrieb / Getriebe (4)

| Signal | Poll-Wert | Relevanz |
|--------|-----------|----------|
| `powertrainCombustionEngineSpeed` | 2017 rpm | **Sehr hoch** — RPM-Webhook, HF, Abuse |
| `powertrainCombustionEngineTPS` | 32.94 % | **Hoch** — Fahrverhalten |
| `powertrainTransmissionActualGear` | 2 | Gang-Kontext |
| `powertrainTransmissionActualGearRatio` | 0 | Getriebe |

### 7.5 SynqDrive fragt ab, WOB L 7503 liefert nicht (18 Felder in Snapshot-Query)

| Gruppe | Signale |
|--------|---------|
| EV/HV (13) | `powertrainTractionBatteryStateOfChargeCurrent`, `…CurrentEnergy`, `…StateOfHealth`, `…CurrentPower`, `…CurrentVoltage`, `…TemperatureAverage`, `…ChargingIsCharging`, `…ChargingIsChargingCableConnected`, `…ChargingPower`, `…ChargingChargeLimit`, `…ChargingAddedEnergy`, `…Range`, `…GrossCapacity` |
| Fluids (2) | `powertrainCombustionEngineEngineOilRelativeLevel`, `powertrainCombustionEngineDieselExhaustFluidLevel` |
| Reifen (5) | `chassisAxleRow1WheelLeft/RightTirePressure`, `chassisAxleRow2WheelLeft/RightTirePressure`, `chassisTireSystemIsWarningOn` |
| Connectivity (1) | `connectivityCellularIsJammingDetected` |

Erwartbar für ICE ohne TPMS/EV.

---

## 8. Priorisierte Erweiterungs-Empfehlung (Snapshot-Query)

| Priorität | Signale | Begründung |
|-----------|---------|------------|
| **P0** | `powertrainCombustionEngineSpeed`, `obdThrottlePosition` | Fahrverhalten, Abuse, Trip Evidence — heute nur post-trip |
| **P1** | `powertrainTransmissionActualGear`, `powertrainCombustionEngineTPS` | Gang/Last-Kontext live |
| **P1** | `obdStatusDTCCount` | Health + Connectivity Kontext |
| **P2** | `currentLocationHeading`, `exteriorAirTemperature` | Route-Kontext, Klima |
| **P2** | `obdOilTemperature`, `obdRunTime`, `obdIntakeTemp` | Cold-engine / Thermal |
| **P3** | Restliche OBD-Diagnosewerte | Nice-to-have |

**Minimaler technischer Pfad:** Signale in `latest-vehicle-snapshot.query.ts` ergänzen; in `normalizeSnapshot()` gezielt VLS-Spalten oder strukturiertes `raw_payload_json` — nicht jedes Signal braucht eine eigene DB-Spalte.

---

## 9. Offene Punkte für tiefere Analyse

1. **Warum war VLS am 2026-08-27 eingefroren, obwohl DIMO am 2026-08-30 live liefert?** — Separates Forensik-Thema (KS MX / fleet stale observation); WOB L zeigt Recovery möglich.
2. **Soll Snapshot-Query fahrzeugspezifisch aus `availableSignals` dynamisch gebaut werden?** — Weniger tote GraphQL-Felder, mehr relevante pro Fahrzeug.
3. **Trip Detection auf stale Snapshot-Werten** — Wenn `source_timestamp` nicht mit `signalsLatest` übereinstimmt, kann POSSIBLE_START auf alten speed/ignition-Werten basieren (Forensik WOB L 2026-08-27).
4. **Fleet-Vergleich** — Gleiche Gap-Analyse für KS MX 2024, HMÜ C 215, Tesla-Fahrzeuge wiederholen.
5. **Preflight vs. Snapshot** — `DimoAvailableSignalsPreflightService` kennt `availableSignals`, Snapshot-Query ist statisch decoupled.

---

## 10. Reproduktion (read-only)

Ephemeres Node-Script auf Produktions-VPS mit `SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env`:

1. Vehicle JWT via `DIMO_CLIENT_ID` + Token Exchange (`tokenId: 192922`)
2. `availableSignals(tokenId: 192922)`
3. `signalsLatest` — alle gelisteten Signale batched mit `{ timestamp value }`
4. `dataSummary { signalDataSummary { … } eventDataSummary { … } }`
5. `events(tokenId, from: -30d, to: now)`

Keine DB-Mutation, kein Deploy, keine Feature-Flag-Änderung.

---

*Erstellt: 2026-08-30 — Cursor Agent (read-only DIMO Live-Poll + Code-Gap-Analyse)*
