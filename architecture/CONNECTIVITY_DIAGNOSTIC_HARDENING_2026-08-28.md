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
| `DIAGNOSTIC_MAX_FUTURE_SKEW_MS` | 60 s | Forward clock-skew tolerance, mirroring `battery-provider-observation.policy.ts` |
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

Emitted on **state transitions only**. The runtime is projected whenever a
consumer asks for it, so `ConnectivityDiagnosticTransitionTracker` dedupes to
changes and only for the stale dimension — entering it or leaving it. All other
diagnostic churn stays silent. Logs carry a coarse `observationAgeBucket`
(`lt_24h` / `24h_48h` / `48h_7d` / `gte_7d`) rather than raw per-vehicle ages.

### Demand-driven, best-effort — not an authoritative monitor

`VehicleConnectivityRuntimeProjectionService` runs only when something projects
runtime state: fleet and vehicle-detail reads, the operational projection, and
episode-resolution outbox processing. **No scheduled job evaluates the
diagnostic dimension** — DIMO snapshot polling writes telemetry but never
projects connectivity runtime state.

Consequences, accepted deliberately (option A; this PR adds no polling loop):

- A vehicle nobody looks at emits nothing. Absence of a stale event is **not**
  evidence of health.
- Tracker state is process-local and resets on restart, which re-emits the
  current state once per vehicle (bounded by fleet size).
- Each instance in a multi-instance deployment keeps its own map, so counters
  can double-count the same real-world transition.
- Eviction at 20k vehicles is **LRU** (least recently observed), so actively
  projected vehicles are not forgotten and re-announced.

Treat these signals as leading indicators for investigation, never as an SLO
source.

### Recovery counter semantics

`_recovered_total` increments **only** on a transition to
`PROVIDER_REACHABLE_DATA_FRESH`. Leaving the stale state for
`PROVIDER_UNREACHABLE`, `AUTH_OR_BINDING_ERROR` or `UNKNOWN` is a change of
diagnostic precedence, not the vehicle resuming telemetry, and must never
inflate recovery. Log level follows the same rule: only genuine recovery logs at
info, everything else stays at warn.

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

## Adversarial pre-merge review (PR #1378)

Findings raised against the first implementation and how they were resolved.

### Provider reachability is asymmetric evidence

A **recent** `providerFetchedAt` is confirmed evidence of a successful provider
response: `DimoSnapshotProcessor` computes `fetchedAt` only after the vehicle
JWT, the telemetry fetch and a non-empty `signalsLatest` all succeed, so a
failed or empty poll throws first and leaves the column frozen.

Its **absence** is weaker, because our own polling can pause without the
provider being at fault — `DimoSnapshotScheduler` documents host-level
suspensions (sleep, freeze, GC stall) and treats gaps over 3 min as missed work,
and `canEnqueueQueue` can gate enqueueing entirely. The 30s cadence against a
15 min window leaves ~30 ticks of slack, so jitter, retries and backoff never
trip it, but a fleet-wide worker pause can.

Two corrections, both using existing authoritative evidence and no new
threshold:

1. **Per-vehicle cohort evidence.** `resolveProviderPollEligibility` mirrors the
   scheduler's own filter (`status` ∈ {`AVAILABLE`, `RENTED`}, `dimoVehicleId`
   present, `connectionStatus` = `CONNECTED`, `tokenId` present). A vehicle
   outside that cohort is never enqueued, so a frozen fetch proves nothing — it
   classifies `UNKNOWN` instead of `PROVIDER_UNREACHABLE`. Surfaced to Master
   Admin as `providerPollScheduled`. `null` (status not selected) keeps the
   conservative verdict.
2. **Honest copy.** The `PROVIDER_UNREACHABLE` hint names both possibilities
   (provider side, or our own paused worker/queue) rather than asserting a
   provider outage.

### Clock skew

`ageMs` previously used `Math.max(0, now - parsed)`, so a wildly future
timestamp reported age 0 and could read as "just observed". It now returns
`null` beyond `DIAGNOSTIC_MAX_FUTURE_SKEW_MS` (60s), matching the existing
battery-policy convention. Small forward skew still clamps to 0, since provider
and device clocks drift. Upstream `resolveTelemetryFreshness` already classifies
a future observation as `offline`; the diagnostic no longer contradicts it.

### Binding / consent certainty

`bindingState` previously inferred `ACTIVE` from `deviceBindingId` under
`REAUTH_REQUIRED` / `ERROR`, but that field falls back to the last known
`providerBindingId`, which can reference a deactivated link. It now prefers the
authoritative `diagnostic.bindingActive` (an active DIMO `dataSourceLink`
exists) and otherwise reports `UNKNOWN` rather than fabricating certainty.
`REVOKED` no longer implies `INACTIVE` binding — it describes the grant chain.

`consentState` is unchanged and sound: `ProviderLinkStateBuilder` emits
`LINK_ACTIVE` only when mapping, consent, token and authorization are all
active.

### Master Admin authorization

`GET admin/vehicles/:vehicleId/operational/diagnostics` is guarded by
`JwtAuthGuard` + `RolesGuard` with `@Roles('MASTER_ADMIN')`, and the lookup is
`findFirst({ where: { id, organizationId } })` — org-scoped, so no IDOR. One
gap: a missing `organizationId` query parameter became `undefined`, which Prisma
drops, collapsing the filter to an unscoped vehicle lookup. The controller now
rejects that with `BadRequestException`.

### Tenant isolation

Verified at endpoint level across the real fleet mappers, not just the
serializer unit. `deviceBindingRef` is exposed to tenants on `main` already (a
pre-existing field of `VehicleConnectivityTechnicalEvidence`) and is therefore
not a diagnostic leak introduced here.

## Explicitly unchanged

Canonical telemetry freshness thresholds · `source_timestamp` semantics ·
soft-offline/offline boundaries · `lastTelemetryAt` lineage · Battery V2 Stage 1
flags · Battery V2 publication/readiness · Trip Detection FSM · DIMO polling
cadence · tenant-facing connectivity DTOs and fleet operator UI.
