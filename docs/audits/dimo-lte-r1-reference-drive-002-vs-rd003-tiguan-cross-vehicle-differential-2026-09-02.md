# RD002 C63 vs RD003 Tiguan — Cross-Vehicle Differential

**Evidence ID:** DI-EV-0031

```json
{
  "RD002_vehicle": "KS MX 2024 (Mercedes C63)",
  "RD003_vehicle": "WOB L 7503 (VW Tiguan)",
  "durationSeconds": {
    "RD002": 2073.912,
    "RD003": 2227.291
  },
  "availableSignals": {
    "RD002": 29,
    "RD003": 31
  },
  "observedFields": {
    "RD002": 0,
    "RD003": 31
  },
  "tiguanOnlyFields": [
    "currentLocationAltitude",
    "currentLocationCoordinates",
    "currentLocationHeading",
    "exteriorAirTemperature",
    "isIgnitionOn",
    "lowVoltageBatteryCurrentVoltage",
    "obdBarometricPressure",
    "obdDistanceWithMIL",
    "obdEngineLoad",
    "obdFuelRailPressure",
    "obdFuelTypeName",
    "obdIntakeTemp",
    "obdIsPluggedIn",
    "obdLongTermFuelTrim1",
    "obdLongTermFuelTrim2",
    "obdMAP",
    "obdMaxMAF",
    "obdOilTemperature",
    "obdRunTime",
    "obdStatusDTCCount",
    "obdThrottlePosition",
    "powertrainCombustionEngineECT",
    "powertrainCombustionEngineSpeed",
    "powertrainCombustionEngineTPS",
    "powertrainFuelSystemAbsoluteLevel",
    "powertrainFuelSystemRelativeLevel",
    "powertrainTransmissionActualGear",
    "powertrainTransmissionActualGearRatio",
    "powertrainTransmissionTravelledDistance",
    "powertrainType",
    "speed"
  ],
  "c63OnlyFields": [],
  "sharedFields": [],
  "hfRowsPerMinute": {
    "RD002": 10.270445419092036,
    "RD003": 74.96999718492104
  },
  "nativeEvents": {
    "RD002": 0,
    "RD003": 0
  },
  "signalBehavior": "VEHICLE_SPECIFIC",
  "majorFindings": [
    "Tiguan exposes 31 availableSignals vs C63 29 — Tiguan-only transmission gear fields",
    "HF field set identical (5 fields) but Tiguan HF row density higher per minute under longer drive",
    "Both vehicles: REQUESTED_INTERVAL_1S≠OBSERVED_1HZ on HF aggregate buckets",
    "Zero native events on both motion drives",
    "C63 lacks gear signals; Tiguan enables gear-change timing assessability"
  ]
}
```
