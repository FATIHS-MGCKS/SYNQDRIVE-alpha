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

Strict source advance uses `resolveStrictSourceAdvanceEvidence` with an **independently established** prior aggregated source timestamp. Poll SUCCESS in `dimo_poll_logs` does not establish source advance or scoped telemetry authorization.

Provider catalog status remains `UNKNOWN` unless separate catalog evidence exists — raw snapshot keys are not catalog LISTED proof.

Latest-state attribution requires matching `providerBindingId` and consistent provider identity; null binding with active links does not cross-attribute state.

PostgreSQL integration tests require `VSI03_READONLY_COMPOSER_PG=1`, a **local** database host (`127.0.0.1` / `localhost`), and an explicitly disposable database name matching `vsi03_test_*` (for example `vsi03_test_ci`). Production-like names such as `synqdrive` are rejected even on localhost. See `vsi-readonly-composer.postgres-guard.ts`.

## P2C — per-poll source observations (see `VSI03_P2C_SOURCE_OBSERVATIONS.md`)

- Append-only `vehicle_provider_source_observations` + default-OFF capture/read flags.
- `strictSourceAdvanced` uses consecutive observation pairs — not ClickHouse historical priors.

## P2 legacy note

- P1 keeps `UNKNOWN` when no prior is supplied. Do not use `MAX(CH.recorded_at) < VLS.source` for strict advance (rejected P2B-R1).

## Tenant security

`composeVehicleSignals` requires matching `organizationId` + `vehicleId`. Source links are loaded with `vehicleId` only (max 10). Poll logs bounded (default 5, max 20).

## Tests

```bash
cd backend && npm test -- --testPathPattern=vehicle-signal-intelligence
VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-readonly-composer.postgres.integration --runInBand
```
