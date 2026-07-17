# Battery Start-Proxy Cadence & Coverage Gate

**Gate version:** `1.0.0` (`START_PROXY_CADENCE_GATE_VERSION`)  
**Prompt:** 38/78  
**Status:** Normativ vor jeder `START_DIP_PROXY`-Auswertung in `BatteryStartProxyExtractService`

## Zweck

Verbindliches Qualitäts-Gate vor der numerischen Startdip-Proxy-Auswertung.  
**Kein Wert ohne Gate** — bei Gate-Fail werden Messungen mit Qualitätslabel persistiert, aber ohne `numericValue` und ohne Recovery-Spannungsfelder.

## Eingaben

| Metrik | Beschreibung |
|--------|----------------|
| `pointsBeforeStart` / `pointsAfterStart` | Anzahl Provider-Punkte relativ `tripStartAt` |
| `medianIntervalMs` / `maxIntervalMs` | Abstände in der sortierten Zeitreihe |
| `coverageRatio` | Eindeutige 5s-Buckets im Fenster `[tripStart−30s, tripStart+120s]` |
| `nearestPreStart` | Zeitlich letzter Punkt ≤ Tripstart |
| `recovery5s` / `recovery30s` | Nächster Punkt nach Start zu Zieloffsets +5s / +30s |
| `providerDelayMs` | `evaluatedAt − newestPoint` |
| `duplicateShare` | Anteil doppelter `(timestamp, voltage, rpm)`-Tuples |

## Schwellen (v1.0.0)

| Check | Schwelle | Qualität |
|-------|----------|----------|
| Keine Punkte | `pointCount = 0` | `NO_DATA` |
| Duplikatanteil | `≥ 0.4` | `TIMESTAMP_INCONSISTENT` |
| Nicht-monotone Reihe | — | `TIMESTAMP_INCONSISTENT` |
| Provider-Verzögerung | `> 180s` | `PROVIDER_DELAY` |
| Median-Kadenz | `> 7.5s` | `INSUFFICIENT_CADENCE` |
| Max-Intervall | `> 20s` | `INSUFFICIENT_CADENCE` |
| Coverage | `< 0.15` | `INSUFFICIENT_COVERAGE` |
| Alle Checks OK | — | `VALID_PROXY` |

`UNSUPPORTED_PROFILE` bleibt im Policy-Gate vor dem Fetch (BEV / PHEV ohne ICE-Start) — nicht Teil der Kadenz-Gate-Funktion.

## Recovery-Labels

| Label | Bedingung |
|-------|-----------|
| `RECOVERY_5S` | Nächster Punkt zu `tripStart + 5s` innerhalb **±5s** |
| `RECOVERY_30S` | Nächster Punkt zu `tripStart + 30s` innerhalb **±5s** |
| `RECOVERY_PROXY` | Recovery-Punkt vorhanden, aber außerhalb ±5s Toleranz |

Nur bei `RECOVERY_5S` / `RECOVERY_30S` werden `vRecovery5s` / `vRecovery30s` befüllt.  
Grobe Recovery-Werte erhalten das Label `RECOVERY_PROXY` ohne numerische Recovery-Felder.

## Extrahierte Werte (nur bei `VALID_PROXY`)

- `vPreCrank` — Spannung des `nearestPreStart`-Punkts
- `vMinCrank` — Minimum im Crank-Fenster `[tripStart−30s, tripStart+30s]`
- **Kein `CRANK_MIN`** als separates Messfeld

## Persistenz

`BatteryStartProxyExtractService.persistGateOutcome`:

- Session `ICE_START_PROXY`, Status `COMPLETED`
- Measurement `START_DIP_PROXY` mit Gate-`quality`
- Context/Provenance enthalten `cadenceGateVersion`, `cadenceGate`-Metriken, `reasonCode`/`reasonLabel`
- `evidenceEligible: false`, `scoreEffect: false` (diagnostisch)

## Tests

`battery-start-proxy-cadence-gate.spec.ts` deckt ab:

- 1s / 5s / 20s Kadenz
- Lückenhafte Coverage
- Fehlende Daten (`NO_DATA`)
- Recovery-Label vs. `RECOVERY_PROXY`
- Provider-Delay
- Hoher Duplikatanteil

## Gate-Version bump

`START_PROXY_CADENCE_GATE_VERSION` erhöhen wenn:

- Schwellenwerte ändern
- Entscheidungsreihenfolge ändert
- Metrikdefinitionen ändern

## Nachgelagerte Messarten (Prompt 39/78)

Nach `VALID_PROXY` erzeugt `buildStartProxyMeasurementPlan()` die erlaubten Proxy-Messarten — siehe [`battery-start-proxy-measurements.md`](./battery-start-proxy-measurements.md).
