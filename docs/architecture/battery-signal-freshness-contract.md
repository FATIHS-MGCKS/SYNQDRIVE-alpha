# Battery Signal Freshness & Error Contract (Prompt 60/78)

## Goal

Vollständiger signalbezogener Freshness- und Fehlervertrag für Battery-Read-Models. Jeder relevante Live-Wert erhält ein `BatterySignalFreshness`-Envelope; benannte Domain-Slices und strukturierte Fehlercodes ergänzen das kanonische DTO (Prompt 59).

## Signal envelope

```typescript
interface BatterySignalFreshness {
  observedAt: string | null;
  receivedAt: string | null;
  ageMs: number | null;
  freshnessState: 'FRESH' | 'STALE' | 'MISSING_TIMESTAMP' | 'OUT_OF_ORDER' | 'UNAVAILABLE' | 'NO_MEASUREMENT';
  providerDelayMs: number | null; // receivedAt - observedAt when valid
  source: BatterySignalSource;
}
```

Wrapped values:

```typescript
interface BatterySignalEnvelope<T> {
  value: T;
  freshness: BatterySignalFreshness;
  error: BatterySignalError | null;
}
```

## Named freshness slices

`dataQuality.namedFreshnessSlices`:

- `liveVoltageFreshness`
- `restMeasurementFreshness`
- `startProxyFreshness`
- `assessmentFreshness`
- `publicationFreshness`
- `providerSohFreshness`
- `hvSessionFreshness`

`BatteryDomainFreshnessBundle` on LV/HV remains for legacy consumers; `hvSessionFreshness` is now wired from latest `HvChargeSession`.

## Error codes

| Code | Meaning |
|------|---------|
| `PROVIDER_ERROR` | Provider/DIMO query failed |
| `QUERY_TIMEOUT` | Timed out provider fetch |
| `CAPABILITY_UNAVAILABLE` | Capability preflight blocked |
| `UNSUPPORTED` | Profile does not support signal |
| `NO_MEASUREMENT` | No value carrier |
| `STALE` | Value present but observation too old |
| `INTERNAL_ERROR` | Safe generic internal failure |

Rules:

- API/module errors are surfaced as `BatterySignalError[]`, not swallowed to `null`
- Values remain in `signals.*.value` when stale or errored
- Fresh poll (`receivedAt`) does not upgrade stale `observedAt` to `FRESH`
- No stack traces, tokens, or secrets in `labelDe`
- Partial response: module loads use `Promise.allSettled` + fallbacks; failures append errors without aborting summary

## Canonical DTO surface

`canonical.liveState.lv|hv`:

- `values` — unchanged scalar map
- `freshness` — per-field `BatterySignalFreshness`
- `signals` — per-field `BatterySignalEnvelope`

`canonical.dataQuality.errors` — structured `BatterySignalError[]`

## Files

- `battery-signal-freshness.contract.ts` — core contract + builders
- `canonical-battery/canonical-battery-signal-freshness.builder.ts` — canonical mapping
- `canonical-battery-health.service.ts` — wiring, partial module resolution
- Tests: `battery-signal-freshness.contract.spec.ts`, `canonical-battery-signal-freshness.builder.spec.ts`, service integration
