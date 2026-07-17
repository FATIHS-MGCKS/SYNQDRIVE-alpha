# Battery Start-Proxy Diagnostic Wiring

**Prompt:** 40/78  
**Feature flag:** `BATTERY_V2_START_PROXY_ENABLED` (`batteryV2StartProxyEnabled`)

## Zweck

Start-Proxy-Ergebnisse sind **ausschließlich diagnostisch** — keine operativen Nebenwirkungen.

## Regeln

| Bereich | Verhalten |
|---------|-----------|
| Score-Gewicht | **0 %** (`LV_START_PROXY_SCORE_WEIGHT_PERCENT`) |
| Rental Readiness | Kein Effekt |
| Alerts / Tasks | Kein Effekt |
| WARNING/CRITICAL | Nie allein aus Proxy-Werten |
| BEV | `availability: UNSUPPORTED`, Label „Nicht unterstützt“ |
| PHEV ohne ICE-Start | `availability: NOT_EVALUABLE`, Label „Nicht auswertbar“ |
| API-Klassifikation | `PROXY` oder `EXPERIMENTAL` (PRE_START) |
| UI-Label | „Startverhalten (geschätzt)“ |

## API

- `GET …/battery-health/lv-start-proxy-diagnostic` — interne Diagnoseansicht
- `CanonicalBatteryHealthService.getSummary` → `lv.telemetry.startProxy`

## Implementierung

- `lv-start-proxy-diagnostic.policy.ts` — Side-Effect-Guards
- `lv-start-proxy-diagnostic.resolver.ts` — Read-Model aus Measurements
- Measurements tragen `diagnosticOnly` + `buildLvStartProxyDiagnosticProvenance()`

## Tests

- Policy: 0 % Score, keine operational classification
- Resolver: PROXY/EXPERIMENTAL, Alter, Zielabweichung
- `BatteryCriticalDetector`: starker `crankDrop` ohne Legacy-Assessment → kein Alert
