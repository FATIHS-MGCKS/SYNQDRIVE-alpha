# VSI-03 P1 — Read-only vehicle signal composer

## Scope

Internal `VsiReadonlySignalComposerService` projects **four** canonical signals per active source link:

- `lv_voltage`
- `hv_battery_soc`
- `provider_source_timestamp`
- `device_connectivity`

## Non-goals (P1)

- No DIMO/provider HTTP calls
- No new tables or polling jobs
- No APDS shadow decision wiring (`vsi-apds-consumer.adapter.contract.ts` is documentation + pure projection only)
- No Vehicle Onboarding mutations

## Connection identity

Reads `vehicle_data_source_links.metadata.connectionIdentity` via `parseConnectionIdentityFromLinkMetadata`.

**Never** infers physical R1 hardware from `vehicles.hardware_type`. Software integration (Tesla API_SYNTHETIC) and Ruptela HARDWARE_DEVICE remain stratified.

## Temporal semantics

Uses `VehicleLatestState.sourceTimestamp` (provider source), `providerFetchedAt` (reception), `updatedAt` (persistence), and `projectionAsOf` (composer).

Freshness for connectivity uses `classifyTelemetryFreshness` with `TELEMETRY_FRESH_THRESHOLD_MS` documented in descriptor limitations.

Strict source advance uses `evaluateStrictSourceAdvance`; poll SUCCESS in `dimo_poll_logs` does not alone imply advance.

## Tenant security

`composeVehicleSignals` requires matching `organizationId` + `vehicleId`. Source links are loaded with `vehicleId` only (max 10). Poll logs bounded (default 5, max 20).

## Tests

```bash
cd backend && npm test -- --testPathPattern=vehicle-signal-intelligence
VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-readonly-composer.postgres.integration --runInBand
```
