# Vehicle & Device Connectivity — Current Semantic Map (Phase 1)

**Scope:** States and labels **actually used in code today** — not target design.

## Telemetry freshness (`TelemetryFreshness`)

| State | Defining code | Inputs | Threshold | Consumers |
|-------|---------------|--------|-----------|-----------|
| `live` | `vehicle-state-interpreter.ts` | `lastSeenAt` age | < 15 min | Runtime builder, fleet API, alerts, AI mapper, frontend |
| `standby` | same | age | 15 min – 24 h | same |
| `signal_delayed` | same | age | 24 h – 48 h | Runtime → `SOFT_OFFLINE` overall; soft-offline alerts |
| `offline` | same | age | ≥ 48 h | Runtime → `OFFLINE`; hard offline alerts |
| `no_signal` | same | null timestamp | — | `NO_ACTIVE_DATA_SOURCE` candidate |

## Legacy fleet `FleetConnectionStatus`

| State | Source | Notes |
|-------|--------|-------|
| `online` | `vehicle-connectivity-runtime-legacy.projection.ts` | Only when `overallState === TELEMETRY_ACTIVE` |
| `standby` | same | From overall `STANDBY` |
| `signal_delayed` | same | From `SOFT_OFFLINE` |
| `offline` | same | From `OFFLINE` |
| `not_connected` | same | Auth / no link |

**Query gap:** API filter DTO omits `signal_delayed` (VDC-GAP-008 related).

## Overall connectivity (`OverallConnectivityState`)

| State | Typical trigger | Provider-specific? |
|-------|-----------------|-------------------|
| `TELEMETRY_ACTIVE` | `telemetryState === live` | No |
| `STANDBY` | `standby` | No |
| `SOFT_OFFLINE` | `signal_delayed` | No |
| `OFFLINE` | `offline` / `no_signal` | No |
| `DEVICE_UNPLUGGED` | Physical evidence / episode | DIMO OBD path |
| `AUTHORIZATION_REQUIRED` | Provider link REAUTH/REVOKED/ERROR | Provider auth |
| `NO_ACTIVE_DATA_SOURCE` | No link / no snapshot | No |
| `INTEGRATION_ERROR` | Processing errors | No |
| `UNKNOWN` | Empty candidate set | No |

## Provider link (`ProviderLinkState`)

`ACTIVE`, `REAUTH_REQUIRED`, `REVOKED`, `NO_LINK`, `ERROR`, `UNKNOWN` — `provider-link-state.builder.ts`

**Tension:** list mapper treats `dimo_vehicles` row presence as linked (`FC-P1-03` regression).

## Physical device (`PhysicalDeviceState`)

`PLUGGED_CONFIRMED`, `PLUGGED_INFERRED`, `UNPLUGGED_CONFIRMED`, `UNKNOWN`, `NOT_APPLICABLE` — `physical-device-evidence.ts`

LTE_R1 + DIMO-linked → `physicalObdApplicable`.

## Data coverage (`DataCoverageState`)

`GOOD` (≥80%), `PARTIAL` (≥50%), `INSUFFICIENT`, `UNKNOWN`, `NOT_APPLICABLE`

## Attention (`AttentionState`)

`NONE`, `WATCH`, `ACTION_REQUIRED`, `CRITICAL`

## Diagnostic (`ConnectivityDiagnosticState`) — master-admin only

`PROVIDER_REACHABLE_DATA_FRESH`, `PROVIDER_REACHABLE_DATA_STALE`, `PROVIDER_UNREACHABLE`, `AUTH_OR_BINDING_ERROR`, `UNKNOWN`

## Legacy `OnlineStatus` (3-state)

`ONLINE` / `STANDBY` / `OFFLINE` — collapses 24h+ to OFFLINE (conflicts with 5-state).

## OBD plug (compact)

`plugged` / `unplugged` / `unknown` — `device-connection-read-model.ts`, frontend `obd-plug-status.ts`

## DIMO `DimoConnectionStatus` (DB)

`CONNECTED`, `DISCONNECTED`, `PENDING`, `ERROR` — used as connectivity anchor in read model

## Master-admin operational `IntegrationConnectivity`

`connected`, `disconnected`, `error`, `none` — `vehicle-attention.util.ts` (coarse, not runtime builder)

## Admin DIMO debug labels

`online` / `standby` / `offline` / `not_connected` — `dimo.controller.ts` (15m/24h only)

## HM health freshness (separate system)

`HmFreshnessStatus` / per-signal-group windows in `high-mobility-signal-usage.service.ts` — **not** canonical VDC runtime

## Duplicate-definition hotspots

| Concept | Definitions | IDs |
|---------|-------------|-----|
| Soft offline | `signal_delayed`, `SOFT_OFFLINE`, `TELEMETRY_SOFT_OFFLINE` alert | aligned |
| Offline at 24h | `onlineStatus OFFLINE` vs `signal_delayed` until 48h | VDC-GAP-008 |
| Provider linked | `ProviderLinkState.ACTIVE` vs `dv != null` vs `hasActiveProviderLink` legacy | FC-P1-03 |
| Provider reachable | `providerFetchedAt` < 15m vs poll log success | diagnostic vs ops |
| Live label | 5 min UI vs 15 min classifier | presentation drift |
