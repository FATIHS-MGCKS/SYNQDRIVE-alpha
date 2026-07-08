# HF Mirror — Extended Signal Evidence (2026-07-08)

## Scope (V4.9.260)

Post-trip HF mirror (`HF_MIRROR_ENABLED`) now maps additional DIMO fields from
`fetchHighFrequency` into `telemetry_hf_points` when the provider returns them.

PostgreSQL remains canonical. ClickHouse is analytics evidence only.

## Newly mirrored signals (when present in HF query response)

| Canonical signal | Group | Unit |
|------------------|-------|------|
| `currentLocationLatitude` / `currentLocationLongitude` | gps | deg |
| `powertrainTransmissionTravelledDistance` | powertrain | km |
| `powertrainTractionBatteryStateOfChargeCurrent` | battery | % |
| `powertrainTractionBatteryStateOfChargeCurrentEnergy` | battery | kWh |
| `powertrainTractionBatteryRange` | battery | km |
| `powertrainTractionBatteryCurrentVoltage` | battery | V |
| `exteriorAirTemperature` | environment | °C |
| `isIgnitionOn` | powertrain | bool |
| `chassisAxleRow1WheelLeftTirePressure` (+ 3 wheels) | tire | bar |
| `powertrainTractionBatteryChargingIsCharging` | charging | bool |
| `powertrainTractionBatteryChargingPower` | charging | kW |

Previously mirrored: speed, RPM, ECT, throttle, engine load, traction power.

**Not mirrored:** brake pad / health signals — not available on DIMO `signals()` HF path (snapshot-only).

## Volume controls

- **GPS:** max one lat/lng pair per 30s (`HF_MIRROR_GPS_MIN_INTERVAL_MS`) per trip mirror pass.
- **Tire pressure:** skip consecutive identical values (provider often repeats for minutes).
- **Missing fields:** skipped silently — no invented values.

## Code

- `high-frequency.query.ts` — extended GraphQL fields (same 1s post-trip window).
- `hf-mirror-signals.ts` — pure `buildHfMirrorPoints()` for mapping + guards.
- `hf-signal-map.ts` — extended exact mappings.
