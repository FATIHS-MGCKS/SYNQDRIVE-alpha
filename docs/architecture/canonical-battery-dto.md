# Canonical Battery DTO (Prompt 59/78)

## Goal

Single kanonisches Battery-DTO für alle Produktconsumer. Bestehende API-Felder (`battery-health-summary`, `battery-health-detail`, `battery-health/latest`) bleiben kompatibel, werden aber aus demselben Resolver-Pfad erzeugt — keine parallele Wahrheit.

## Resolver

`CanonicalBatteryHealthService.getSummary()` lädt LV/HV-Kontext, Policy, Method Profile, Assessments und Charge Sessions, berechnet Legacy-Summary-Felder wie bisher und baut anschließend `canonical` via `buildCanonicalBatteryDto()`.

Version: `CANONICAL_BATTERY_RESOLVER_VERSION = 1.0.0`

## Structure

```text
canonical
├── resolverVersion, organizationId, vehicleId, resolvedAt, isEv
├── liveState
│   ├── lv: observedAt, receivedAt, status, values (voltage, temps, engineRunning, …)
│   └── hv: observedAt, receivedAt, status, values (soc, energy, charging, provider SOH, …)
├── lv
│   ├── profile, chemistry
│   ├── latestQualifiedRest, latestStartProxy
│   ├── assessment, publication, liveVoltage
│   └── canonical (full CanonicalLvBatteryResponse)
├── hv (null for non-EV)
│   ├── soc, currentEnergy, chargingState
│   ├── currentChargeSession, lastChargeSession
│   ├── capacityAssessment (HV_CAPACITY_SHADOW cross-session)
│   ├── providerSoh (decision-usable SOH)
│   ├── referenceCapacity (active VehicleBatteryReferenceCapacity)
│   └── sohAssessment (HV_SOH_CAPACITY_ESTIMATE gate)
├── capabilities
│   ├── policy (ResolvedBatteryPolicy)
│   ├── hvMethodProfile
│   ├── supportedMeasurementTypes
│   └── unsupportedMeasurementTypes (+ reason codes)
├── dataQuality
│   ├── aggregate + slices (lv/hv)
│   ├── fetchFreshness, observationFreshness
│   ├── lvFreshnessBundle, hvFreshnessBundle
│   ├── staleReasons, unsupportedReasons, errors
└── legacy (collapsed diagnostic only)
    ├── lvDiagnostic, hvLegacyCapacity, crankDiagnostic, startProxyDiagnostic
    └── v2Features (published/stabilized/raw SOH, publicationState, scoredAt)
```

## Compatibility

- Legacy summary fields (`lv`, `hv`, `currentState`, `dataQuality`, …) bleiben unverändert im Response.
- Neues Feld: `canonical` — bevorzugter Einstieg für neue Consumer.
- `legacy` innerhalb von `canonical` ist nur diagnostisch eingeklappt; keine operative Entscheidungswirkung.

## Files

- `canonical-battery/canonical-battery.types.ts`
- `canonical-battery/canonical-battery.builder.ts`
- `canonical-battery-health.service.ts` (wiring)
- Tests: `canonical-battery.builder.spec.ts`, `canonical-battery-health.service.spec.ts`
