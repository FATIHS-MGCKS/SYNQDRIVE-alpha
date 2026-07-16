# Battery LV Chemistry Assessment Context

**Prompt:** 42/78  
**Context version:** `LV_CHEMISTRY_ASSESSMENT_CONTEXT_VERSION` 1.0.0  
**Thresholds version:** `LV_ASSESSMENT_THRESHOLDS_VERSION` 1.0.0

## Zweck

Chemiespezifische Bewertungskontexte für LV-Assessments — getrennte Ruhebereiche, SOC-Gates, Temperaturkontext und Confidence ohne Magic Numbers in Services/UI.

## Zentrale Schwellen (`lv-assessment-thresholds.ts`)

| Chemie | goodMinV | watchMinV | warningMinV | maxRestingV |
|--------|----------|-----------|-------------|-------------|
| LEAD_ACID | 12.5 | 12.2 | 12.0 | 12.6 |
| AGM | 12.6 | 12.3 | 12.1 | 12.7 |
| EFB | 12.6 | 12.3 | 12.1 | 12.7 |

`BATTERY_POLICY_CATALOG` importiert dieselben Bänder — keine Duplikate.

## Regeln

| Regel | Verhalten |
|-------|-----------|
| SOC-Schätzung | Nur LEAD_ACID / AGM / EFB wenn `chemicalSocEstimationAllowed` |
| LITHIUM / UNKNOWN | Keine Lead-Acid-SOC-Kurve; Ruhestatus `UNSUPPORTED` |
| Außentemperatur | Messkontext (`EXTERIOR_AMBIENT`), **nie** Batterietemperatur |
| Fehlende Temperatur | Confidence −15 %, Spannung/SOC unverändert |
| Extreme Außentemp. | ≤ −15 °C oder ≥ 35 °C → `temperatureUncertainty` |
| Werkstatt / Load-Test | `WORKSHOP_OVERRIDE` / `LOAD_TEST_OVERRIDE` — höherwertig als Telemetrie |

## API

```typescript
buildLvChemistryAssessmentContext({
  policy: ResolvedBatteryPolicy,
  restingVoltageV?: number | null,
  ambientTemperatureC?: number | null,
  ambientTemperatureSource?: 'EXTERIOR_AIR' | 'TRIP_CONTEXT' | null,
  measurementType?: BatteryMeasurementType | null,
  evidenceStrength?: BatteryEvidenceStrength | null,
})
```

**Output:** `restingBands`, `restingVoltageStatus`, `estimatedSocPercent`, `temperatureContext`, `confidence`, `evidencePriority`, …

## Tests

- Getrennte LEAD_ACID / AGM / EFB Bänder
- LITHIUM + UNKNOWN ohne SOC
- Fehlende vs. vorhandene Außentemperatur (Confidence only)
- Extreme Kälte/Hitze → temperaturbedingt unsicher
- Werkstatt/Load-Test Priorität über Telemetrie
