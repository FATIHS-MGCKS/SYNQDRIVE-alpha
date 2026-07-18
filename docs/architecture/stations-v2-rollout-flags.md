# Stations V2 — Feature-Flag- und Rolloutvertrag

**Version:** 1.0  
**Date:** 2026-07-18  
**Status:** Implementiert (`StationsV2ConfigService` + Env-Resolver)  
**Basis:** [`stations-v2-prisma-migration-rollout-plan.md`](./stations-v2-prisma-migration-rollout-plan.md) §6

**Prinzip:** Bestehende SynqDrive-Flag-Muster (`registerAs` + `parseBooleanEnv`). Kein externes Feature-Flag-SaaS.

---

## Flag-Katalog

| Code-Flag | Environment Variable | Default | Wirkung |
|-----------|---------------------|---------|---------|
| `stationsSchemaV2Enabled` | `STATIONS_V2_SCHEMA_ENABLED` | `false` | Additive Schema / Dual-Read-Pfade |
| `stationsScopeV2Enabled` | `STATIONS_V2_SCOPE_ENABLED` | `false` | Gate-2 Scope + RBAC (`StationScopeGuard`) |
| `stationsLifecycleV2Enabled` | `STATIONS_V2_LIFECYCLE_ENABLED` | `false` | Archive / Restore / Set-Primary / Activate / Deactivate |
| `stationSummaryV2Enabled` | `STATIONS_V2_SUMMARY_READ_MODEL_ENABLED` | `false` | Summary / KPI Read Models |
| `stationDeltaAssignmentEnabled` | `STATIONS_V2_DELTA_ASSIGNMENT_ENABLED` | `false` | Home-Fleet Delta + Assign APIs |
| `stationPositioningV2Enabled` | `STATIONS_V2_POSITIONING_ENABLED` | `false` | Current / Expected / Correct-Current Writers |
| `stationBookingRulesEnabled` | `STATIONS_V2_BOOKING_RULES_ENABLED` | `false` | Booking-Rules Evaluation Pipeline |
| — | `STATIONS_V2_BOOKING_RULES_ENFORCEMENT` | `off` | `off` \| `shadow` \| `warning` \| `enforce` |
| `stationCapacityWarningsEnabled` | `STATIONS_V2_CAPACITY_WARNINGS_ENABLED` | `false` | Kapazitäts-Warnungen in Rules/Transfers |
| `stationTransfersEnabled` | `STATIONS_V2_TRANSFERS_ENABLED` | `false` | `VehicleStationTransfer` Lifecycle |
| `stationAuditTrailEnabled` | `STATIONS_V2_AUDIT_TRAIL_ENABLED` | `false` | Domain-Audit in `ActivityLog` |
| `stationGeofenceShadowEnabled` | `STATIONS_V2_GEOFENCE_SHADOW_ENABLED` | `false` | Geofence Shadow (keine `currentStationId`-Writes) |
| `stationsUiV2Enabled` | `STATIONS_V2_UI_ENABLED` | `false` | Stations V2 UI Surfaces |
| `legacySetVehiclesEndpointDisabled` | `STATIONS_V2_SET_VEHICLES_DISABLED` | `false` | `PUT …/vehicles` → HTTP 410 |

### Org-Canary

`STATIONS_V2_ORG_ALLOWLIST` — comma-separated UUIDs. Wenn gesetzt, erhalten **nur** gelistete Orgs die global aktivierten Flags; alle anderen Orgs: alle Flags `false`.

### Abhängigkeiten

Siehe `STATIONS_V2_FEATURE_FLAG_DEPENDENCIES` in `stations-v2-feature-flags.contract.ts`. Ein Flag ohne erfüllte Parents wird automatisch auf `false` gesetzt.

### Booking-Rules Enforcement

| Modus | Evaluate | Snapshot | Blockiert Persistenz |
|-------|----------|----------|----------------------|
| `off` | Nein | Nein | — |
| `shadow` | Ja | Nein | Nein |
| `warning` | Ja | Ja | Nein (BLOCKED → erlaubt) |
| `enforce` | Ja | Ja | Ja |

---

## API

| Endpoint | Beschreibung |
|----------|--------------|
| `GET /organizations/:orgId/stations/feature-flags` | Effektive Flags für Tenant |
| `GET /organizations/:orgId/stations/feature-flags/contract` | Env-Key-Mapping + Dependencies |

Frontend: `useStationsV2FeatureFlags()` + `api.stations.featureFlags(orgId)`.

---

## Tests

`NODE_ENV=test` aktiviert alle Flags standardmäßig (`STATIONS_V2_FLAGS_TEST_DEFAULT` ≠ `off`). Produktion: alles `false`.

---

## Referenzen

- Deployment: [`../runbooks/stations-v2-deployment.md`](../runbooks/stations-v2-deployment.md)
- Shadow Validation: [`../runbooks/stations-v2-shadow-validation.md`](../runbooks/stations-v2-shadow-validation.md)
- Code: `backend/src/config/stations-v2.config.ts`, `backend/src/shared/stations/stations-v2-feature-flags.resolver.ts`
