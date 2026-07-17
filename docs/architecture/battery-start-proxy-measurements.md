# Battery Start-Proxy Measurement Plan

**Plan version:** `1.0.0` (`START_PROXY_MEASUREMENT_PLAN_VERSION`)  
**Prompt:** 39/78  
**Depends on:** [`battery-start-proxy-cadence-gate.md`](./battery-start-proxy-cadence-gate.md) (Gate v1.0.0)

## Zweck

Aus **qualifizierten** Startfenstern (`VALID_PROXY` nach Cadence-Gate) werden nur die erlaubten Proxy-Messarten als separate `BatteryMeasurement`-Zeilen erzeugt — eine Session `ICE_START_PROXY`, mehrere idempotente Measurements.

## Messarten

| Messart (Plan) | Prisma `BatteryMeasurementType` | Wert |
|----------------|----------------------------------|------|
| `PRE_START` | `PRE_START_VOLTAGE` | Spannung vor Start |
| `START_DIP_PROXY` | `START_DIP_PROXY` | **Grober Abfall** `vPre − vMin` (kein Starterminimum) |
| `RECOVERY_5S` | `RECOVERY_5S_VOLTAGE` | Spannung bei ±5s um `start + 5s` |
| `RECOVERY_30S` | `RECOVERY_30S_VOLTAGE` | Spannung bei ±5s um `start + 30s` |
| `RECOVERY_PROXY` | `RECOVERY_PROXY_VOLTAGE` | Grobe Recovery wenn Zielabweichung zu groß |

**Nicht erzeugt:** `CRANK_MIN`

## Regeln

- Kadenz, Coverage, Zielabweichung (`offsetFromTargetMs`) und `medianIntervalMs` im Measurement-`context`
- `5s`/`30s`-Labels nur bei echter Nähe (±5s); sonst `RECOVERY_PROXY`
- Bei Gate-Fail: je Messart ein **Status-Measurement** mit Gate-Qualität, **ohne** `numericValue`
- Session: `ICE_START_PROXY`, Status `COMPLETED`
- `evidenceEligible: false`, `publicationEligible: false`, `scoreEffect: false`
- Keine `battery_features`-Zähler / Legacy-Crank-Updates
- Idempotenz: je Trip **und** Messart (`pre-start-voltage:<tripId>`, …)

## Idempotency Keys

| Messart | Key |
|---------|-----|
| PRE_START | `pre-start-voltage:<tripId>` |
| START_DIP_PROXY | `start-dip-proxy:<tripId>` |
| RECOVERY_5S | `recovery-5s-voltage:<tripId>` |
| RECOVERY_30S | `recovery-30s-voltage:<tripId>` |
| RECOVERY_PROXY | `recovery-proxy-voltage:<tripId>` |

Job-Idempotenz prüft `ice-start-proxy:<tripId>` (Session).

## Implementierung

- `battery-start-proxy-measurements.ts` — `buildStartProxyMeasurementPlan()`
- `battery-start-proxy-extract.service.ts` — Session + Plan-Persistenz
- Tests mit 5s-Audit-Kadenz (`battery-start-proxy-measurements.spec.ts`)
