# Vehicle & Device Connectivity — Freshness Semantics (Phase 1)

**Epistemic:** CONFIRMED from repository code  
**Canonical thresholds:** shared across backend + aligned frontend copy

**Source advance:** Freshness classification uses persisted observation time; it does **not** prove strict source advance on every upsert. Only `incoming > existing` proves a new observation instant. `incoming == existing` still upserts (**VDC-CX-010**). See [SIGNAL_AUTHORITY.md](./SIGNAL_AUTHORITY.md).

## Five-state telemetry freshness

**Classifier:** `classifyTelemetryFreshness()` in `backend/src/modules/vehicles/vehicle-state-interpreter.ts`

| State | Age condition | Product meaning (code comments) |
|-------|---------------|--------------------------------|
| `live` | `< 15 min` | Active transmission / recent observation |
| `standby` | `15 min – 24 h` | Normal idle heartbeat window (DIMO ~1–4h cited in comments) |
| `signal_delayed` | `24 h – 48 h` | Soft offline / delayed signal |
| `offline` | `≥ 48 h` | Hard offline |
| `no_signal` | no usable timestamp | Never seen or unresolvable |

**Constants (re-exported):**

- `TELEMETRY_FRESH_THRESHOLD_MS` = 900_000 (15 min)
- `TELEMETRY_STANDBY_THRESHOLD_MS` = 86_400_000 (24 h)
- `TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS` = 172_800_000 (48 h)

## Timestamp resolution before classification

**Resolver:** `resolveTelemetryFreshness()` in `backend/src/modules/vehicles/telemetry-freshness.resolver.ts`

**Priority:**

1. `providerObservedAt` → `source_timestamp`
2. `lastValidTelemetryAt`
3. `receivedAt` (only if backfill lag ≤ `DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS` = 15 min)
4. `lastSignal` → `dimo_vehicles.last_signal`
5. `latestStateUpdatedAt` → `last_seen_at`

**Future timestamp handling:** resolver returns `offline` with age 0; diagnostic classifier nullifies age > 60s future skew.

## Legacy three-state `onlineStatus`

**File:** `vehicle-state-interpreter.ts` `interpretVehicleState()`

| onlineStatus | Age |
|--------------|-----|
| `ONLINE` | `< 15 min` |
| `STANDBY` | `15 min – 24 h` |
| `OFFLINE` | `≥ 24 h` (includes `signal_delayed` band) |

**Drift:** 24–48h canonical `signal_delayed` maps to legacy `OFFLINE` (VDC-GAP-008).

## Runtime connectivity dimensions (beyond freshness)

**Builder:** `vehicle-connectivity-runtime-state.builder.ts`

| Dimension | Enum | Notes |
|-----------|------|-------|
| `telemetryState` | `TelemetryFreshness` | From `lastTelemetryAt` via assembler |
| `providerLinkState` | `ACTIVE`, `REAUTH_REQUIRED`, … | Consent/auth/mapping chain |
| `physicalDeviceState` | `PLUGGED_*`, `UNPLUGGED_*`, … | OBD evidence ordering |
| `dataCoverageState` | `GOOD` (≥80%), `PARTIAL` (≥50%), … | Signal coverage % |
| `overallState` | `TELEMETRY_ACTIVE`, `STANDBY`, `SOFT_OFFLINE`, … | Priority pick |
| `attentionState` | `NONE`, `WATCH`, `ACTION_REQUIRED`, `CRITICAL` | Operator attention |

**Overall precedence:** `connectivity-domain.priority.ts` — lower rank wins (INTEGRATION_ERROR highest priority).

## Diagnostic dimension (master-admin)

**File:** `connectivity-diagnostic-state.ts`

Separates **provider reachability** (`providerFetchedAt` age < 15 min) from **observation staleness** (`telemetryState` in `signal_delayed` | `offline`).

`providerPollEligible` gate prevents false `PROVIDER_UNREACHABLE` when vehicle not in poll cohort.

## Non-freshness thresholds (related)

| Threshold | Value | File | Purpose |
|-----------|-------|------|---------|
| Pipeline stale | 6 h | `vehicle-attention.util.ts` | Master-admin attention |
| Persistent offline attention | 7 d | same | |
| Fleet UI “Live” label | 5 min | `fleet-connectivity.util.ts` | Presentation only |
| Processor stale metric | 5 min | `dimo-snapshot.processor.ts` | Prometheus counter (≠ freshness) |
| Admin DIMO debug status | 15m / 24h / offline | `dimo.controller.ts` | **No 48h soft band** (VDC-CX-004) |

## AI mapper standby semantics

**File:** `ai-evidence-telemetry.mapper.ts`

Delegates to `resolveTelemetryFreshness` / `classifyTelemetryFreshness`. Documents standby as “15 min .. 24 h — normal DIMO standby heartbeat”. **Presentation/AI evidence only** — not independent runtime threshold.

## Frontend alignment

**File:** `frontend/src/rental/lib/telemetryFreshness.ts`

Mirrors backend 15m / 24h / 48h thresholds and timestamp priority. P1 surfaces (`connectivityRuntime`) are authoritative; legacy client path remains for fleet board without runtime (VDC-GAP-012).

## Alert policy coupling

**File:** `connectivity-alert.policy.ts`

| Freshness | Alert behavior |
|-----------|----------------|
| `live`, `standby` | Resolve telemetry alerts |
| `signal_delayed` | Open `TELEMETRY_SOFT_OFFLINE` |
| `offline`, `no_signal` | Open `TELEMETRY_OFFLINE` |

Policy lives under DIMO module — see VDC-CX-001.
