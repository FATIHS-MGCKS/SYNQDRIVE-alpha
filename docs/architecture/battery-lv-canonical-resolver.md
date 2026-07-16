# Battery LV Canonical Resolver

**Prompt:** 45/78  
**Resolver version:** `LV_CANONICAL_RESOLVER_VERSION` 1.0.0

## Zweck

Zentraler Resolver für die kanonische LV-Battery-Antwort während der Übergangsphase Legacy → V2. Rental Health und UI sollen später **ausschließlich** `resolveCanonicalLvBattery()` / `LvCanonicalBatteryResolverService` verwenden.

## Priorität (primaryTruth)

| Rang | Quelle | decisionCapable |
|------|--------|-----------------|
| 1 | Bestätigte Werkstatt-/manuelle Evidence | ja (`VERIFIED`) |
| 2 | Stabile V2-Publication (`STABLE`) | ja (`ESTIMATED`) |
| 3 | Provisorische V2-Publication (`PROVISIONAL`) | ja (`ESTIMATED`) |
| 4 | V2-Shadow diagnostisch | nein (`EXPERIMENTAL`) |
| 5 | Sichere Live-Telemetrie | nein (`PROXY`) |
| 6 | Legacy nur `LEGACY_UNVERIFIED` | nein |
| 7 | `UNSUPPORTED` / `UNAVAILABLE` | nein |

## Output

| Feld | Semantik |
|------|----------|
| `primaryTruth` | Einzige kanonische Wahrheit — nie SOH-Label |
| `liveVoltage` | Live/Ruhe-Spannung (Kontext, kein Publication-Refresh) |
| `latestQualifiedRestMeasurement` | Letzte VALID REST-Messung |
| `latestStartProxy` | Diagnostischer Start-Proxy (immer `diagnosticOnly`) |
| `assessment` | Letztes `LV_ESTIMATED_HEALTH` Assessment |
| `publication` | Aktive V2-Publication |
| `profile` / `chemistry` | Policy-Profil |
| `freshness` | Domain-Freshness-Bundle |
| `quality` | Aggregat + primaryTruth Data Quality |
| `legacyDiagnostic` | Optional — nur wenn Legacy-Daten existieren; `supersededByPrimary` wenn überstimmt |

## Regeln

| Regel | Verhalten |
|-------|-----------|
| Keine doppelte Wahrheit | Genau ein `primaryTruth.source` |
| Legacy-Schwäche | Legacy niemals stärker als Werkstatt/V2 |
| Kein SOH-Label | `semanticType: ESTIMATED_HEALTH_NOT_SOH` |
| Live-Spannung | Ergänzt Kontext, überstimmt keine höherwertige Quelle |
| UI/Readiness | Noch nicht umgestellt — Resolver ist bereit |

## Pipeline

```
DB (Evidence, Measurements, Assessments, Publications, Features, LatestState)
  → LvCanonicalBatteryResolverService.resolveForVehicle()
  → resolveCanonicalLvBattery()
  → CanonicalLvBatteryResponse
```

## Implementierung

- `lv-canonical-battery.types.ts`
- `lv-canonical-battery.resolver.ts`
- `lv-canonical-battery-resolver.service.ts`
- `battery-assessment.repository.ts` — `findLatestLvEstimatedHealth()`
