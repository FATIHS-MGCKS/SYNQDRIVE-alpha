# Connectivity Diagnostic Hardening (2026-08-28)

Provider reachability vs. vehicle observation freshness.

## Summary

Adds a **Master-Admin-only diagnostic dimension** to the canonical Vehicle
Connectivity Runtime. It makes one previously invisible situation diagnosable:
SynqDrive can talk to the provider while the vehicle itself has stopped
producing telemetry.

Canonical connectivity semantics are unchanged. `telemetryState`,
`lastTelemetryAt` lineage, and the freshness thresholds are untouched, and
`provider_fetched_at` still never feeds freshness.

## The two timestamps — never interchangeable

| Field | Question it answers | Authority |
|-------|--------------------|-----------|
| `VehicleLatestState.sourceTimestamp` → `lastTelemetryAt` | **When was the vehicle telemetry actually observed?** | Sole input to canonical telemetry freshness |
| `VehicleLatestState.providerFetchedAt` → `lastReceivedAt` | **When did SynqDrive last successfully receive a provider response?** | Diagnostic metadata only |

A provider can be reachable while the vehicle observation is stale. That is
expected, correct, and must be diagnosable — not corrected away.

Using `provider_fetched_at` as vehicle freshness would be wrong: it would report
a silent vehicle as live for as long as the provider keeps answering.

### Why the distinction exists in the write path

`DimoSnapshotProcessor` guards telemetry writes with a monotonic check on
`sourceTimestamp` (`shouldApplyVlsTelemetryUpdate`). When DIMO returns a response
whose payload timestamp is not newer, the processor updates **only**
`providerFetchedAt` and `syncJobRef` — telemetry fields, including
`sourceTimestamp`, are deliberately left alone.

That is exactly the state the incident produced: `providerFetchedAt` advancing
every ~30s while `sourceTimestamp` stayed frozen.

## Diagnostic state model

`ConnectivityDiagnosticState` — a separate dimension, **not** a replacement for
`telemetryState`:

| State | Meaning |
|-------|---------|
| `PROVIDER_REACHABLE_DATA_FRESH` | Provider answering, observation within live/standby bands |
| `PROVIDER_REACHABLE_DATA_STALE` | Provider answering, observation stale (≥ 24h) — device/SIM/provider-side inactivity signature |
| `PROVIDER_UNREACHABLE` | Active link, but no recent successful provider response |
| `AUTH_OR_BINDING_ERROR` | Link, consent or binding itself is broken or absent |
| `UNKNOWN` | Not enough evidence to classify |

Derived by `classifyConnectivityDiagnostic` from already-authoritative fields:
`providerLinkState`, canonical `telemetryState`, `lastTelemetryAt`,
`lastReceivedAt`.

### Precedence

Deliberately ordered so a broken grant chain or an unreachable provider always
wins over `PROVIDER_REACHABLE_DATA_STALE`. The stale-observation signal only
fires when the provider path is genuinely healthy:

1. `AUTH_OR_BINDING_ERROR` — link is `REAUTH_REQUIRED` / `REVOKED` / `ERROR` / `NO_LINK`
2. `UNKNOWN` — link state indeterminate, or no provider fetch timestamp recorded
3. `PROVIDER_UNREACHABLE` — active link, provider fetch older than the fresh window
4. `PROVIDER_REACHABLE_DATA_STALE` — provider fetch recent, observation `signal_delayed` / `offline`
5. `PROVIDER_REACHABLE_DATA_FRESH` — provider fetch recent, observation `live` / `standby`

### Thresholds — reused, not reinvented

No new freshness policy. The canonical bands from
`vehicle-state-interpreter.ts` are reused as-is:

| Boundary | Value | Diagnostic use |
|----------|-------|----------------|
| `TELEMETRY_FRESH_THRESHOLD_MS` | 15 min | "Provider fetch is recent" (DIMO polls ~30s, so this is generous) |
| `TELEMETRY_STANDBY_THRESHOLD_MS` | 24 h | Stale boundary for observations |
| `TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS` | 48 h | Soft-offline → offline |

Two exclusions are intentional:

- **`standby` is not stale.** DIMO devices heartbeat every 1–4h, so anything
  under the 24h boundary is normal operation.
- **`no_signal` is not stale.** With no observation timestamp there is no age to
  evaluate; absence of data is not evidence of a stalled device. Classified
  `UNKNOWN` rather than fabricating staleness.

## Surface separation

| Audience | Sees | Path |
|----------|------|------|
| Fleet / org users | Canonical operational states only | `VehicleConnectivityRuntimeStateDto` — diagnostic dimension **excluded** |
| Master Admin | Full diagnostic block | `GET admin/vehicles/:vehicleId/operational/diagnostics` (`@Roles('MASTER_ADMIN')`) |

The domain object carries `diagnostic`; the tenant serializer field-picks and
omits it. A regression test asserts the tenant DTO contains no diagnostic
internals.

Master Admin payload (`ConnectivityDiagnosticAdminDto`): provider, diagnostic
state, provider API reachability, last provider fetch + age, last vehicle
observation + age, observation state, binding, consent, connection status,
binding reference, provider error category.

No secrets: no tokens, JWTs, credentials, or raw provider payloads. A test
asserts the serialized payload contains none of those terms.

## Observability

Two counters, low-cardinality labels only (`provider`, `telemetry_state` — no
vehicle IDs):

- `synqdrive_connectivity_provider_reachable_observation_stale_total`
- `synqdrive_connectivity_provider_reachable_observation_recovered_total`

Emitted on **state transitions only**. The runtime is projected on every fleet
request, so `ConnectivityDiagnosticTransitionTracker` dedupes to changes and
only for the stale dimension — entering it or recovering from it. All other
diagnostic churn stays silent. Logs carry a coarse `observationAgeBucket`
(`lt_24h` / `24h_48h` / `48h_7d` / `gte_7d`) rather than raw per-vehicle ages.

The tracker is process-local and best-effort; a restart re-emits current state
once per affected vehicle, which is bounded by fleet size and useful for
visibility.

## Recovery

Fully automatic, with no operational intervention:

1. Device resumes transmitting; DIMO payload carries a newer timestamp.
2. The monotonic guard passes, so `sourceTimestamp` advances naturally.
3. Canonical `telemetryState` returns to `live` / `standby`.
4. The diagnostic dimension recomputes to `PROVIDER_REACHABLE_DATA_FRESH`.

No manual reset, no DB repair, no synthetic timestamp, and no
`provider_fetched_at` substitution.

## Production incident pattern (2026-08)

Reference: **KS MX 2024**.

| Signal | Value |
|--------|-------|
| DIMO SNAPSHOT polling | succeeding, ~30s cadence |
| `provider_fetched_at` | advancing |
| `source_timestamp` / `last_seen_at` | frozen ~27h |
| Consent / binding / `connection_status` | active / active / `CONNECTED` |
| Canonical telemetry freshness | correctly stale (`signal_delayed`) |

Root cause was provider-side: SIM cards in several DIMO devices had been
disabled, and DIMO reactivated them.

**Interpretation rule:** provider reachable + stale observation *can* indicate
device, SIM, or provider-side telemetry inactivity. It is a symptom, not a
diagnosis. Master Admin copy states the symptom ("Provider antwortet, aber das
Fahrzeuggerät liefert keine neuen Daten.") and never claims SIM failure, because
the provider does not expose SIM state. Do not treat SIM failure as universally
causal for this signature.

## Files

### Backend

| File | Change |
|------|--------|
| `connectivity/domain/connectivity-diagnostic-state.ts` | New — state model + pure classifier |
| `connectivity/domain/connectivity-domain.types.ts` | `diagnostic` on `VehicleConnectivityRuntimeState` |
| `connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` | Wires classifier after canonical `telemetryState` |
| `connectivity/vehicle-connectivity-runtime-state.dto.ts` | Documented tenant exclusion |
| `connectivity/connectivity-diagnostic.admin-dto.ts` | New — Master Admin serializer |
| `vehicles.service.ts` | `getFleetConnectivityAdminDiagnostics`; shared detail builder (single projection) |
| `vehicles-operational.service.ts` | `getDiagnostics` returns the diagnostic block |
| `dimo/connectivity/connectivity-diagnostic-transition.tracker.ts` | New — dedupe + age bucketing |
| `dimo/connectivity/connectivity-observability.service.ts` | `diagnostic_state_transition` event |
| `dimo/connectivity/connectivity-prometheus.metrics.ts` | Two counter recorders |
| `observability/trip-metrics.service.ts` | Counter registration |
| `dimo/device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service.ts` | Transition emission (single + batch) |
| `dimo/dimo.module.ts` | Tracker provider |

### Frontend

| File | Change |
|------|--------|
| `lib/api.ts` | `ConnectivityDiagnosticAdmin` types; typed `operationalDiagnostics` |
| `master/connected-vehicles/connectivity-diagnostic.presentation.ts` | New — German diagnostic copy |
| `master/connected-vehicles/ConnectivityDiagnosticPanel.tsx` | New — Master Admin panel |
| `master/connected-vehicles/ConnectedVehicleDetailDrawer.tsx` | Panel in existing "Technische Diagnostik" section; raw JSON moved behind a disclosure |
| `master/connected-vehicles/useConnectedVehiclesOperational.ts` | Typed diagnostics state |

## Explicitly unchanged

Canonical telemetry freshness thresholds · `source_timestamp` semantics ·
soft-offline/offline boundaries · `lastTelemetryAt` lineage · Battery V2 Stage 1
flags · Battery V2 publication/readiness · Trip Detection FSM · DIMO polling
cadence · tenant-facing connectivity DTOs and fleet operator UI.
