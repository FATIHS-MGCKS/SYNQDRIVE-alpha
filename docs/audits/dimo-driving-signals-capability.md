# DIMO Driving Signals — Capability Audit (Read-Only)

| Feld | Wert |
|------|------|
| **Dokumenttyp** | Read-only DIMO Driving Signals Capability Audit |
| **Auditzeitpunkt (UTC)** | 2026-07-16T17:52:46Z |
| **Repository-Commit (Erstellung)** | `9be93a84` |
| **VPS-Deploy-Commit (Laufzeit)** | `2cd57c8` |
| **Umgebung** | Produktion VPS; DIMO GraphQL read-only + Postgres-SELECT |
| **Fleet** | Org-A (`faa710c9-…`), **6× LTE_R1** (kein SMART5 in Produktion) |
| **DIMO MCP** | Nicht verfügbar in Cloud-Agent-Laufzeit — Verifikation via offizielle DIMO-Docs + Live-GraphQL |

**Bezug:** `docs/audits/driving-analysis-production-reality.md`, `docs/audits/dimo-tesla-hv-signal-capability.md` (Tesla HV-Detail), `architecture/HF_WINDOWS_SIGNAL_QUALITY_2026-07-08.md`

---

## 1. Executive Summary

Dieses Audit vergleicht **aktuelle offizielle DIMO-Telemetry-Dokumentation** mit **Live-`availableSignals`**, **Native Events**, **Segmenten** und **historischen Zeitreihen** auf der realen SynqDrive-Flotte.

**Kernbefunde:**

1. **Kein SMART5 in Produktion** — alle 6 Fahrzeuge sind `hardware_type=LTE_R1` (DIMO LTE Macaron / ähnliche Pipeline). SMART5-spezifische Capability ist **nicht empirisch belegt**.
2. **Native `behavior.*` Events sind der belastbarste Verhaltenskanal** — aber **stark fahrzeugabhängig** (Tiguan: fast nur `harshAcceleration`; Arteon historisch volles Set inkl. `extremeBraking`/`harshBraking`; Audi/Tesla: **keine** Events in 30d).
3. **HF-Zeitreihen sind nicht 1 Hz** — trotz `interval: "1s"` liegt die **effektive Median-Kadenz bei 3–10 s** (P95 bis 22–40 s, Max-Lücken bis mehrere Minuten). Viele HF-Detektoren sind daher **INSUFFICIENT_CADENCE** oder höchstens **SHADOW_CANDIDATE**.
4. **Brems-/Rad-/Getriebe-Rohsignale fehlen fleet-weit** — `chassisBrake*`, `chassisAxle*Wheel*Speed`, `angularVelocityYaw`, Getriebe-Temperatur/Gang sind auf **keinem** Stichprobenfahrzeug in `availableSignals`.
5. **Dokumentations-Delta bestätigt** — `availableSignals` ist **Root-Query** (nicht Unterfeld von `signalsLatest`); Events kommen über `events(...)`, nicht über nicht existierende `safetySystem*` Signal-Felder (SynqDrive-Migration in `driving-events.query.ts` korrekt).

**Empfehlung neue Fahranalyse-Architektur:** **Capability-first, per Fahrzeug (tokenId)** — Native DIMO Events als Primary Path für LTE_R1; HF nur als Kontext/Shadow; Detektor-Gates aus `availableSignals` + `dataSummary.eventDataSummary` + empirischer Kadenz; keine fleet-weiten Detektor-Annahmen.

---

## 2. Auditzeitpunkt und Commit

- **Live-Audit:** 2026-07-16T17:52:46Z (ephemeres VPS-Script, nicht im Repo)
- **Repo bei Dokumenterstellung:** `9be93a84`
- **VPS deployed:** `2cd57c8` (`app.synqdrive.eu`)
- **Methodik:** DIMO Docs (Signals, Segments, Events, Playground) + `DimoAuthService`-kompatibler JWT-Flow + begrenzte GraphQL-Queries (max. 2 Trips/Fahrzeug, 7d Segmente, 30d Events)

---

## 3. DIMO-Dokumentations-Delta (Teil A)

### 3.1 API-Struktur (gegenüber älteren SynqDrive-Annahmen)

| Thema | Alt / Code-Legacy | Aktuell (DIMO Docs 2026-07) |
|-------|-------------------|-----------------------------|
| Verfügbare Signale | Teilweise unter `signalsLatest` erwartet | **`query { availableSignals(tokenId) }`** (Root) |
| Fahrverhaltens-Events | `safetySystemBraking*` etc. auf `signals` | **`events(tokenId, from, to, filter)`** mit `name` z. B. `behavior.harshBraking` |
| Segmente | Nur Trips | `mechanism`: `ignitionDetection`, `frequencyAnalysis`, `changePointDetection`, `idling`, `refuel`, `recharge` |
| Aggregation | `interval` Pflicht auf `signals` | `FloatAggregation`: AVG, MAX, MIN, MED, FIRST, LAST, RAND |
| Event-Filter | — | `EventFilter { name: { in: [...] } }` |
| Datenübersicht | — | `dataSummary { signalDataSummary, eventDataSummary }` |

### 3.2 Fahranalyse-relevante Signale — Dokumentationsmatrix (Auszug)

| Signal | Einheit (DIMO) | Semantik | Latest | Historical | Agg. | Triggerfähig | Mögliche Detektoren | Risiken |
|--------|----------------|----------|--------|------------|------|--------------|---------------------|---------|
| `speed` | km/h | Fahrzeuggeschwindigkeit | `signalsLatest` | `signals` | Float | Ja (Threshold) | Harsh/Extreme Proxy, Stop-Go | Kadenz ≠ 1 Hz |
| `isIgnitionOn` | 0/1 | Zündung | Ja | Ja | Float | Ja | Trip-Grenzen, Idle | EV oft null |
| `angularVelocityYaw` | °/s | Gierwinkelgeschw. | Ja | Ja | Float | Ja | Cornering HF | **Fleet: NOT_LISTED** |
| `currentLocationAltitude` | m | Höhe | Ja | Ja | Float | Nein | Grade Context | Präzision/GPS |
| `currentLocationHeading` | ° | Richtung | Ja | Ja | Float | Nein | Cornering-Kontext | — |
| `powertrainTransmissionTravelledDistance` | km | Kilometerstand | Ja | Ja | Float | Nein | Distanz, Trip-Validierung | — |
| `powertrainCombustionEngineSpeed` | rpm | Motordrehzahl | Ja | Ja | Float | Ja (RPM Webhook existiert in SynqDrive) | Rev Abuse, Cold RPM, Kickdown-Kontext | Kadenz |
| `powertrainCombustionEngineTPS` | % | Drosselklappenstellung | Ja | Ja | Float | Ja | Kickdown, Cold Throttle | Oft korreliert mit `obdThrottlePosition` |
| `obdThrottlePosition` | % | OBD-Drossel | Ja | Ja | Float | Ja | Kickdown HF | — |
| `obdEngineLoad` | % | Motorlast | Ja | Ja | Float | Ja | Load Abuse, Grade-adjusted | — |
| `powertrainCombustionEngineECT` | °C | Kühlmitteltemp. | Ja | Ja | Float | Ja | Cold Engine Abuse | Warm-up-Kontext nötig |
| `powertrainCombustionEngineEOT` | °C | Öltemperatur | Ja | Ja | Float | Ja | Thermal | **Fleet: NOT_LISTED** |
| `obdRunTime` | s | Motorlaufzeit seit Start | Ja | Ja | Float | Nein | Cold-engine Zeitfenster | — |
| `exteriorAirTemperature` | °C | Außentemperatur | Ja | Ja | Float | Nein | Cold-start Kontext | — |
| `powertrainTransmissionCurrentGear` | — | Aktueller Gang | Ja | Ja | Float | Nein | Gear Stress, Overrev | **Fleet: NOT_LISTED** |
| `chassisBrakeIsPedalPressed` | 0/1 | Bremspedal | Ja | Ja | Float | Ja | Full Braking, Brake Abuse | **Fleet: NOT_LISTED** |
| `chassisBrakePedalPosition` | % | Pedalstellung | Ja | Ja | Float | Ja | Brake Stress | **Fleet: NOT_LISTED** |
| `chassisAxleRow1WheelLeftSpeed` | km/h | Radgeschw. VL | Ja | Ja | Float | Nein | Slip, Brake Validation | **Fleet: NOT_LISTED** |
| `powertrainTractionBatteryCurrentPower` | W | Pack-Leistung ± | Ja | Ja | Float | Ja | EV Aggression, Regen | Tesla: verfügbar, oft ~0 im Stand |
| `powertrainTractionBatteryStateOfChargeCurrent` | % | SOC (physikalisch) | Ja | Ja | Float | Nein | EV Load | — |
| `powertrainTractionBatteryTemperatureAverage` | °C | Packtemp. | Ja | Ja | Float | Ja | Battery Thermal | **Tesla: NOT_LISTED** |

Vollständige DIMO-Referenz: [Vehicle Signals](https://www.dimo.org/docs/api-references/telemetry-api/signals), [Segments](https://www.dimo.org/docs/api-references/telemetry-api/segments), [Additional Queries / dataSummary](https://www.dimo.org/docs/api-references/telemetry-api/additional-queries).

---

## 4. Fahrzeugstichprobe (Teil B — Stichprobe)

| Label | Hardware | Powertrain | Make/Model/Year | Plate (mask.) | tokenId (intern) | DIMO Signals (dataSummary) |
|-------|----------|------------|---------------|---------------|------------------|----------------------------|
| VW-Tiguan-ICE | LTE_R1 | ICE | VW Tiguan 2026 | WO*** | 192922 | 268,708 |
| VW-Golf-ICE | LTE_R1 | ICE | VW Golf 2026 | WO*** | 190497 | 509,345 |
| VW-Arteon-ICE | LTE_R1 | ICE | VW Arteon 2020 | HM*** | 187784 | 3,178,128 |
| Audi-A4-ICE | LTE_R1 | ICE | Audi A4 2016 | KS*** | 187361 | 3,445,432 |
| MB-C63-ICE | LTE_R1 | ICE | Mercedes C 63 AMG 2018 | KS*** | 187336 | 1,833,878 |
| Tesla-M3-EV | LTE_R1 | EV | Tesla Model 3 2023 | KS*** (KS FH 660E) | 186946 | 6,658,060 |

**Nicht vorhanden in Produktion:** SMART5, PHEV/HEV als eigene Hardware-Klasse, weiteres Baujahr-Spektrum außerhalb obiger 6.

---

## 5. Available-Signals-Matrix (Teil B)

Klassifikation: **`AVAILABLE_WITH_DATA`** nur wenn historische Trip-Stichprobe nicht-null Werte zeigt; **`AVAILABLE_BUT_NULL`** = in `availableSignals`, aber `signalsLatest` null (typisch bei stehendem Fahrzeug); **`NOT_LISTED`** = nicht in `availableSignals`.

### 5.1 ICE (5 Fahrzeuge) — gemeinsame 14 Signale in `availableSignals`

`speed`, `isIgnitionOn`, `currentLocationAltitude`, `currentLocationHeading`, `powertrainTransmissionTravelledDistance`, `powertrainCombustionEngineSpeed`, `powertrainCombustionEngineTPS`, `powertrainCombustionEngineECT`, `obdEngineLoad`, `obdRunTime`, `obdIntakeTemp`, `obdMAP`, `obdThrottlePosition`, `exteriorAirTemperature`

| Signal | Fleet-Klassifikation | Dynamik | Anmerkung |
|--------|---------------------|---------|-----------|
| `speed` | AVAILABLE_WITH_DATA (in Fahrt) | DYNAMIC | Median-Lücke 2–9 s auf `interval:"1s"` |
| `isIgnitionOn` | AVAILABLE_BUT_NULL (latest) / WITH_DATA in Fahrt | DYNAMIC | Trip-Detection-Core nutzt es |
| `powertrainCombustionEngineSpeed` | WITH_DATA in Fahrt | DYNAMIC | ~80–95 % der Speed-Samples auf aktiven Trips |
| `powertrainCombustionEngineECT` | WITH_DATA in Fahrt | DYNAMIC | Cold-engine Kontext möglich |
| `obdEngineLoad` | WITH_DATA in Fahrt | DYNAMIC | HF-Abuse-Pfad in SynqDrive |
| `obdThrottlePosition` | WITH_DATA in Fahrt | DYNAMIC | Kickdown-Kandidat (Shadow) |
| `powertrainCombustionEngineTPS` | WITH_DATA in Fahrt | DYNAMIC | Redundant zu OBD-Throttle |
| `obdRunTime`, `obdIntakeTemp`, `obdMAP` | listed, weniger Trip-Stichproben | DYNAMIC/STATIC | Kontext |
| `currentLocationAltitude/Heading` | listed | DYNAMIC | Grade/Cornering Kontext begrenzt ohne Yaw |
| `exteriorAirTemperature` | listed | slow DYNAMIC | Umgebungskontext |

### 5.2 ICE — fleet-weit NOT_LISTED (24 Audit-Signale)

`angularVelocityYaw`, alle `chassisBrake*`, alle `chassisAxle*Wheel*Speed`, `powertrainCombustionEngineMAF/Torque/TorquePercent/EOP/EOT`, alle `powertrainTransmission*` (Gang, Temp., Kupplung, Retarder), `obdFuelRate`

### 5.3 Tesla Model 3 (KS FH 660E) — 6 Signale

`speed`, `powertrainTransmissionTravelledDistance`, `exteriorAirTemperature`, `powertrainTractionBatteryCurrentPower`, `powertrainTractionBatteryStateOfChargeCurrent`, `powertrainTractionBatteryStateOfChargeCurrentEnergy`

Kein `isIgnitionOn`, kein Motor-OBD, **keine** `behavior.*` Events in 30d. Detail: `docs/audits/dimo-tesla-hv-signal-capability.md`.

### 5.4 Abdeckung nach Dimension

| Dimension | Befund |
|-----------|--------|
| Hardware | Nur **LTE_R1** belegt |
| Provider | DIMO LTE-Gerät (Wallet-`source` auf Events) |
| Powertrain ICE | 14-Signal-Basis-Set konsistent |
| Powertrain EV | 6-Signal-Subset |
| Modell | **Arteon** reichstes Event-Profil; **Audi A4** Events absent trotz hoher Signalzahl |

---

## 6. Native-Event-Matrix (Teil C)

### 6.1 Abfragemethode

- GraphQL: `events(tokenId, from, to)` und `dataSummary.eventDataSummary`
- SynqDrive-Mapper: `buildDrivingEventsQuery` / `LteR1BehaviorEnrichmentService.mapDimoEventName`

### 6.2 Beobachtete Event-Namen (Produktion)

| DIMO `name` | 30d Live (events query) | dataSummary (lifetime) | SynqDrive `DrivingEventType` | In Mapper |
|-------------|-------------------------|------------------------|------------------------------|-----------|
| `behavior.harshAcceleration` | Tiguan, Golf, MB | alle ICE außer Audi | `HARSH_ACCELERATION` | Ja |
| `behavior.harshCornering` | Tiguan, Golf, Arteon, MB | Arteon, MB, Golf, Tiguan | `HARSH_CORNERING` | Ja |
| `behavior.harshBraking` | — (30d) | **Arteon** (721 total) | `HARSH_BRAKING` | Ja |
| `behavior.extremeBraking` | — (30d) | **Arteon**, MB (1) | `EXTREME_BRAKING` | Ja |
| `behavior.extremeAcceleration` | — | nicht in 30d-Stichprobe | `HARSH_ACCELERATION` + metadata EXTREME | Ja |
| `behavior.extremeEmergency*` | — | nicht beobachtet | `EXTREME_BRAKING` | Ja |
| `safety.collision` | — | nicht beobachtet | nicht → `DrivingEvent` | Separater Safety-Pfad |

**30d-Gesamt (events query):** 445 Events — fast ausschließlich `harshAcceleration` (410) + `harshCornering` (37).

### 6.3 Persistenz-Abgleich (Stichprobe)

| Fahrzeug | Trip | DIMO Events im Tripfenster | Gespeicherte `DrivingEvent` | Übereinstimmung |
|----------|------|----------------------------|----------------------------|-----------------|
| Tiguan | f2b693bb… | 1× harshAcceleration | 1× HARSH_ACCELERATION | Ja |
| MB C63 | b8826c7a… | 2× harshAcceleration | 2× HARSH_ACCELERATION | Ja |
| Golf | 129a5964… | 1× harshCornering | 1× HARSH_CORNERING | Ja |
| MB C63 | fa861c82… | 1× harshCornering | 1× HARSH_CORNERING | Ja |
| Arteon/Audi/Tesla | diverse | oft 0 im 30d-Fenster | 0 | Provider liefert nicht / außerhalb Fenster |

**Ignorierte Mapper-Events:** Keine unbekannten Namen in 30d — Arteon-`harshBraking`/`extremeBraking` **letztmals Mai 2026**, daher außerhalb 30d-Query.

**Duplikate:** Keine exakten Trip-Typ-Timestamp-Duplikate in DB (vgl. Production-Reality-Audit).

**Tags vs. Names:** DIMO liefert `name` String; SynqDrive speichert `metadataJson.dimoEventName`.

---

## 7. Segmentergebnisse (Teil D)

7-Tage-Fenster, `limit: 5` je Mechanismus:

| Fahrzeug | ignitionDetection | frequencyAnalysis | idling | recharge (EV) |
|----------|-------------------|-------------------|--------|---------------|
| ICE (5) | 2–5 Segmente | 2–5 Segmente | 0–2 | — |
| Tesla | — | 5 Segmente | — | 1 Segment |

**Bewertung vs. `VehicleTrip`:**

- DIMO `ignitionDetection` / `frequencyAnalysis` liefern **vergleichbare Fahrzeitfenster** zur Validierung von SynqDrive V2-Trips (DIMO Segments = kanonische Grenzen laut Architektur).
- `changePointDetection` — dokumentiert, **nicht** in dieser Stichprobe abgefragt (empfohlen für Repair-Pfad laut `trip-segments.query.ts`).
- `idling` nur sporadisch (Tiguan: 2) — für Excessive-Idle **SHADOW_CANDIDATE**.
- Arteon-Events in Segment-`eventCounts` nicht in Kurzabfrage enthalten — erweiterter Realtest mit `eventRequests` empfohlen.

---

## 8. Signalkadenz je Hardware/Fahrzeug (Teil E)

Abfrage: Trip ± 5 min, `interval: "1s"` (ICE) bzw. `"5s"` (Tesla).

| Fahrzeug | Speed median gap | RPM median gap | Engine load median gap | Effektive Hz (Speed) |
|----------|------------------|----------------|------------------------|----------------------|
| VW Tiguan | 3–5 s | 8–10 s | 3–5 s | ~0.2–0.33 Hz |
| VW Golf | 4–9 s | 4–10 s | 4–9 s | ~0.11–0.25 Hz |
| VW Arteon | 2–8 s | 3–8 s | 2–8 s | ~0.12–0.5 Hz |
| Audi A4 | 3–4 s | 3–4 s | 3–4 s | ~0.25–0.33 Hz |
| MB C63 | 2–3 s | 2–3 s | 2–3 s | ~0.33–0.5 Hz |
| Tesla M3 | 20 s (5s bucket) | — | — | ~0.05 Hz |

**P95-Lücken:** typisch **20–22 s**, Max bis **234–316 s** (einzelne Trips).

**Fazit:** SynqDrive-Kommentar „effective cadence ≠ 1 Hz“ (**bestätigt**). `HF_MIRROR`/ClickHouse auf VPS **unavailable** — keine verbesserte HF-Speicherung.

---

## 9. Coverage / Freshness (Teil E)

| Fahrzeug | dataSummary.lastSeen | Events lastSeen (max) | Native Events 30d |
|----------|---------------------|------------------------|-------------------|
| Tiguan | 2026-07-16T15:04Z | harshCornering aktiv | 407 |
| Golf | 2026-07-16T12:00Z | 2026-07-10 | 7 |
| Arteon | 2026-07-16T13:38Z | cornering 2026-07-10; braking Mai | 9 (30d query) |
| Audi A4 | 2026-07-16T16:42Z | **keine Events** | 0 |
| MB C63 | 2026-07-15T21:08Z | 2026-06+ | 22 |
| Tesla | 2026-07-16T17:52Z | keine | 0 |

**Duplikatanteil:** nicht systematisch erhoben; Speed-Timestamps unique pro Bucket.

**Synchronität Speed ↔ RPM:** RPM-Samples ≈ 5–15 % weniger als Speed auf gleichen Trips.

---

## 10. Detektor-Feasibility (Teil F)

Legende: **PRODUCTION_CANDIDATE** | **SHADOW_CANDIDATE** | **CONTEXT_ONLY** | **INSUFFICIENT_CADENCE** | **PROVIDER_DEPENDENT** | **UNSUPPORTED** | **REJECTED**

| # | Detektor | LTE_R1 ICE (Fleet) | Tesla EV | Begründung |
|---|----------|-------------------|----------|------------|
| 1 | Harsh Acceleration | **PROVIDER_DEPENDENT** → PRODUCTION auf Tiguan/MB | UNSUPPORTED | Native `behavior.harshAcceleration` wo geliefert |
| 2 | Extreme Acceleration | **PROVIDER_DEPENDENT** | UNSUPPORTED | Mapper bereit; selten beobachtet |
| 3 | Harsh Braking | **PROVIDER_DEPENDENT** (Arteon) | UNSUPPORTED | Nur Arteon lifetime |
| 4 | Extreme Braking | **PROVIDER_DEPENDENT** (Arteon) | UNSUPPORTED | DB 0× 30d fleet-wide |
| 5 | Full Braking | **UNSUPPORTED** | UNSUPPORTED | Kein Bremspedal-Signal |
| 6 | Harsh Cornering | **PROVIDER_DEPENDENT** | UNSUPPORTED | Native Event wo geliefert |
| 7 | Launch-like Start | **SHADOW_CANDIDATE** | **INSUFFICIENT_CADENCE** | RPM+Load+Speed HF, ~3 s gap |
| 8 | Kickdown | **SHADOW_CANDIDATE** | UNSUPPORTED | TPS+Load+Gear fehlt |
| 9 | Cold Engine High RPM | **SHADOW_CANDIDATE** | UNSUPPORTED | ECT+RPM+RunTime, Kadenz grenzwertig |
| 10 | Cold Engine Full Throttle/Load | **SHADOW_CANDIDATE** | UNSUPPORTED | ECT+Load+TPS |
| 11 | Sustained High RPM | **SHADOW_CANDIDATE** | UNSUPPORTED | RPM vorhanden, Fenster lang |
| 12 | Sustained High Engine Load | **SHADOW_CANDIDATE** | UNSUPPORTED | obdEngineLoad |
| 13 | Engine Rev in Idle | **INSUFFICIENT_CADENCE** | UNSUPPORTED | Speed≈0 + RPM — Lücken zu groß |
| 14 | Overheating | **UNSUPPORTED** | UNSUPPORTED | EOT nicht gelistet |
| 15 | Gear Hunting | **UNSUPPORTED** | UNSUPPORTED | Kein Gear-Signal |
| 16 | High RPM Low Gear | **UNSUPPORTED** | UNSUPPORTED | Kein Gear |
| 17 | Manual Overrev | **UNSUPPORTED** | UNSUPPORTED | Kein Gear |
| 18 | Clutch Misuse | **UNSUPPORTED** | UNSUPPORTED | Kein Kupplungsschalter |
| 19 | Transmission Thermal Stress | **UNSUPPORTED** | UNSUPPORTED | Kein Getriebetemp. |
| 20 | Brake Pedal vs Decel | **UNSUPPORTED** | UNSUPPORTED | — |
| 21 | Brake Pressure vs Decel | **UNSUPPORTED** | UNSUPPORTED | — |
| 22 | EV Regen vs Friction | **UNSUPPORTED** | **SHADOW_CANDIDATE** | Nur Battery Power; kein Pedal |
| 23 | Aggressive EV Power Demand | UNSUPPORTED | **SHADOW_CANDIDATE** | `powertrainTractionBatteryCurrentPower` |
| 24 | Possible Impact | **PROVIDER_DEPENDENT** | **PROVIDER_DEPENDENT** | Kein Event in Stichprobe |
| 25 | DIMO Collision | **PROVIDER_DEPENDENT** | **PROVIDER_DEPENDENT** | `safety.collision` nicht gesehen |
| 26 | Excessive Idling | **SHADOW_CANDIDATE** | **CONTEXT_ONLY** | DIMO `idling` Segmente + RPM HF |
| 27 | Short-trip thermal burden | **CONTEXT_ONLY** | **CONTEXT_ONLY** | ECT/SoC Kontext |
| 28 | Downhill braking context | **CONTEXT_ONLY** | **CONTEXT_ONLY** | Altitude + Brake Events |
| 29 | Road-grade-adjusted load | **CONTEXT_ONLY** | **CONTEXT_ONLY** | Altitude+Load, kein Yaw |
| 30 | Tire/wheel-slip context | **UNSUPPORTED** | **UNSUPPORTED** | Keine Wheel-Speeds |

---

## 11. Offline-Kandidatenvergleich (Teil G)

Offline auf historischen Trip-Fenstern (keine DB-Writes):

| Kandidat | Trigger vs Native | Zusätzliche Treffer | False-Positive-Risiko | Min. Kadenz |
|----------|-------------------|---------------------|----------------------|-------------|
| HF Harsh Accel (Speed-Delta) | Unterdetektion vs native | viele | hoch ohne Kontext | ≤1 s ideal, **haben ~3–10 s** |
| Native harshAcceleration | Referenz | — | niedrig | Ereignis-basiert |
| HF Kickdown (TPS>80, Load↑) | keine Native-Entsprechung | ungetestet | mittel | 1–2 s |
| Cold RPM (ECT<50, RPM>3000) | keine 1:1 Native | ungetestet | hoch ohne RunTime | 5–10 s |
| Misuse Aggressive Pattern | nutzt HF+abuse counts | — | siehe Production-Reality-Audit | — |

**Abgleich Misuse/Impact:** Native Events speisen `DrivingEvent` → Impact/Misuse; HF-`TripBehaviorEvent` sparse (70 rows / 345 trips 30d).

---

## 12. ICE-Ergebnisse (Teil H — ICE)

| Methode | Signale vorhanden | Empirisch | Empfehlung |
|---------|-------------------|-----------|------------|
| Kickdown | TPS, Load, RPM (nicht Gear) | nicht offline quantifiziert | **SHADOW** nur mit Capability-Gate |
| Cold Engine Abuse | ECT, RPM, Load, RunTime | Misuse `COLD_ENGINE_ABUSE` in Prod (informational) | **SHADOW** + Event Context (ICE) |
| Cornering | kein Yaw; native `harshCornering` | Native bevorzugen | **PRODUCTION** native |
| Grade Context | Altitude, Speed, Load | begrenzt | **CONTEXT_ONLY** |

---

## 13. Transmission-Ergebnisse

Alle `powertrainTransmission*` Audit-Signale: **NOT_LISTED** auf LTE_R1-Flotte. Getriebe-Stress-Detektoren: **UNSUPPORTED** bis Provider liefert.

---

## 14. Brake/Wheel-Ergebnisse

Alle `chassisBrake*` und `chassisAxle*Wheel*Speed`: **NOT_LISTED**. Brems-intensity muss über **native behavior.\*** oder **Speed-Delta-Proxies** (Shadow) laufen — nicht über Pedaldruck.

---

## 15. EV-Ergebnisse (Tesla KS FH 660E)

| Signal | Status | Detektor |
|--------|--------|----------|
| SOC / Energy | AVAILABLE | Session, Range-Kontext |
| Battery Power | AVAILABLE | Aggressive discharge / regen Shadow |
| Speed | AVAILABLE (sparse) | Trip, grobe Dynamik |
| Native behavior.* | **NOT observed** | Fahrverhalten nur HF/Proxy |
| HV SOH, Pack Temp, Charging Power | NOT_LISTED | siehe Tesla-HV-Audit |

---

## 16. Health-Verwendbarkeit (Teil I)

| Health-Modul | Belastbare Signale | Klassifikation |
|--------------|-------------------|----------------|
| Tire Health | speed, distance, **DrivingImpact** (aggregiert) | gemessen + Proxy |
| Brake Health | **keine** Pedal/Pressure; native extreme brake Events | providerklassifiziert wo vorhanden |
| Engine Health | ECT, RPM, Load | gemessen (Kontext) |
| Transmission Health | — | **nicht belastbar** |
| Thermal Load | ECT, exteriorAirTemp | Kontextsignal |
| Battery/EV | SOC, energy, power | gemessen (Tesla) |

Trennung: **gemessen** (OBD/RPM/Speed) | **providerklassifiziert** (behavior.*) | **rekonstruiert** (Impact aus Events) | **synthetisch** (Stop-density aus HF) | **nicht belastbar** (Brake pressure)

---

## 17. Empfohlene Capability-Architektur (Teil J)

### 17.1 Zielvertrag pro Fahrzeug (`VehicleSignalCapability`)

```json
{
  "tokenId": 192922,
  "hardwareType": "LTE_R1",
  "powertrain": "ICE",
  "availableSignals": ["speed", "..."],
  "effectiveCadenceHz": { "speed": 0.25, "rpm": 0.15 },
  "nativeEvents": ["behavior.harshAcceleration", "behavior.harshCornering"],
  "detectors": {
    "production": ["native.harshAcceleration", "native.harshCornering"],
    "shadow": ["hf.kickdown", "hf.coldEngineAbuse"],
    "unsupported": ["brake.pedalPressure", "transmission.gearStress"]
  },
  "healthInputs": ["tire.stressProxy", "engine.ectContext"],
  "lastCapabilityAuditAt": "2026-07-16T17:52:46Z"
}
```

### 17.2 Architektur-Empfehlung

1. **Preflight:** `availableSignals` + `dataSummary` bei Onboarding und wöchentlich.
2. **Detector Registry:** Detektor nur aktiv wenn Signal + Event + Kadenz-Schwellen erfüllt.
3. **LTE_R1 ICE:** `events(...)` Primary; HF Secondary; `EventContextEnrichment` für ICE-Kontext beibehalten.
4. **LTE_R1 EV (Tesla):** Kein behavior-Pfad; SOC/Power für Energy/Health; Fahrverhalten **nicht** als Produktions-Score ohne neue Signale.
5. **SMART5:** Separates Profil — **nicht** von LTE_R1 ableiten (in Prod nicht testbar).
6. **Segments:** `ignitionDetection` + `frequencyAnalysis` zur Trip-Validierung; `changePointDetection` für Repair.

---

## 18. P0 / P1 / P2 Findings

### P0

| ID | Finding |
|----|---------|
| P0-1 | **Detektor-Annahmen fleet-weit ungültig** — 24/38 Audit-Signale NOT_LISTED; Brems-/Getriebe-Pfade UNSUPPORTED. |
| P0-2 | **HF-Kadenz 3–10 s statt 1 Hz** — bestehende HF-Detektoren systematisch unterversorgt. |
| P0-3 | **Native Events stark fahrzeugabhängig** — Audi/Tesla ohne Events; Tiguan verzerrt (nur Accel). |

### P1

| ID | Finding |
|----|---------|
| P1-1 | **Arteon liefert volles behavior-Set (lifetime), 30d-Query unvollständig** — zeitfensterabhängige Capability dokumentieren. |
| P1-2 | **`signalsLatest` null bei Parkstellung** — Capability nicht nur auf Latest prüfen. |
| P1-3 | **Kein SMART5-Realtest** — Architektur-Docs nicht auf LTE_R1 generalisieren. |
| P1-4 | **angularVelocityYaw / Wheel speeds fehlen** — Cornering/Slip nur providerklassifiziert. |

### P2

| P2-1 | `obdThrottlePosition` vs `powertrainCombustionEngineTPS` redundant — ein Kanal reicht. |
| P2-2 | Segment-`eventRequests` in Audit nicht voll ausgeschöpft. |
| P2-3 | DIMO MCP nicht in Agent verfügbar — manuelle Doc-Abgleiche. |

---

## 19. Production / Shadow / Unsupported Matrix

| Detektor-Klasse | LTE_R1 ICE | LTE_R1 EV (Tesla) | SMART5 (ungetestet) |
|-----------------|------------|-------------------|---------------------|
| Native behavior.* | **PRODUCTION** (wenn Event in dataSummary) | **UNSUPPORTED** | PROVIDER_DEPENDENT |
| HF Abuse (RPM/TPS/Load) | **SHADOW** | **SHADOW** (nur Power) | SHADOW |
| Event Context (ICE) | **PRODUCTION** | N/A | — |
| Brake Pedal/Pressure | **UNSUPPORTED** | **UNSUPPORTED** | UNKNOWN |
| Transmission Stress | **UNSUPPORTED** | N/A | UNKNOWN |
| Trip Segments Validation | **PRODUCTION** | **PRODUCTION** | UNKNOWN |
| Tire/Brake Health via Impact | **SHADOW/PRODUCTION** | **SHADOW** | UNKNOWN |

---

## 20. Sanitisierte Queries & fehlende Daten

### 20.1 Sanitisierte GraphQL-Queries (Beispiele)

```graphql
# Available signals
query Available($tokenId: Int!) {
  availableSignals(tokenId: $tokenId)
}

# Data summary (events + freshness)
query Summary($tokenId: Int!) {
  dataSummary(tokenId: $tokenId) {
    numberOfSignals
    firstSeen
    lastSeen
    eventDataSummary { name numberOfEvents firstSeen lastSeen }
  }
}

# Native behavior events (30d window)
query BehaviorEvents($tokenId: Int!, $from: Time!, $to: Time!) {
  events(tokenId: $tokenId, from: $from, to: $to,
    filter: { name: { in: [
      "behavior.harshBraking", "behavior.extremeBraking",
      "behavior.harshAcceleration", "behavior.extremeAcceleration",
      "behavior.harshCornering", "safety.collision"
    ]}})
  { timestamp name source durationNs metadata }
}

# Trip HF cadence (1s interval — effective cadence empirisch messen)
query HfWindow($tokenId: Int!, $from: Time!, $to: Time!) {
  signals(tokenId: $tokenId, from: $from, to: $to, interval: "1s") {
    timestamp
    speed(agg: AVG)
    powertrainCombustionEngineSpeed(agg: AVG)
    obdEngineLoad(agg: AVG)
    obdThrottlePosition(agg: AVG)
  }
}

# Segments validation
query Segments($tokenId: Int!, $from: Time!, $to: Time!) {
  segments(tokenId: $tokenId, from: $from, to: $to,
    mechanism: ignitionDetection, limit: 10) {
    duration
    start { timestamp }
    end { timestamp }
    signals { name agg value }
  }
}
```

**Variablen:** `tokenId` aus interner `dimo_vehicles`-Zuordnung; Zeitfenster aus `vehicle_trips.start_time/end_time` ± 5 min. Keine Secrets in Queries.

### 20.2 Fehlende Daten / Realtestplan

| Gap | Geplante Maßnahme (read-only) |
|-----|-------------------------------|
| Kein SMART5-Fahrzeug | Onboarding-Testfahrzeug oder Staging-Token |
| `changePointDetection` Segmente | 31d-Fenster auf 2 ICE + Tesla |
| Segment `eventRequests` | Arteon mit `HarshBraking` Counts |
| `safety.collision` | 90d-Fenster, alle Token |
| Wheel/Brake-Signale | Re-Audit wenn DIMO/Device-Firmware updated |
| 1 Hz effektive HF | ClickHouse-Mirror-Verfügbarkeit klären (VPS: unavailable) |
| Offline Kickdown/Cold-RPM Zähler | Erweitertes Audit-Script mit Schwellen |

---

## Anhang: Neu verfügbare / bestätigte Signale (vs. Legacy)

| Signal / API | Status |
|--------------|--------|
| `events(...)` behavior.* | **Bestätigt produktiv** (fahrzeugabhängig) |
| `dataSummary.eventDataSummary` | **Neu nutzbar** für Capability Preflight |
| `availableSignals` Root-Query | **Bestätigt** — 14 ICE / 6 EV Signale |
| `behavior.extremeAcceleration` in Mapper | **Dokumentiert**, fleet-selten |
| `safetySystem*` auf `signals` | **REJECTED** — existiert nicht (422) |
| `angularVelocityYaw`, `chassisBrake*`, Gears | **Nicht geliefert** auf LTE_R1-Stichprobe |

---

*Audit durchgeführt ohne DB-Writes, ohne Webhook-/Trigger-Änderungen, ohne produktive Event-/Score-Erzeugung.*
