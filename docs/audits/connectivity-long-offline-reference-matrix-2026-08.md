# Connectivity Long-Offline Reference Matrix — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `connectivity-long-offline-reference-matrix-2026-08` |
| **Mode** | Production read-only forensic analysis |
| **Production modified** | **No** (DB read-only; cutover correction tracked separately) |
| **Investigation time (UTC)** | `2026-08-25T08:53Z` |
| **Org scope** | F.S Mobility Service (`faa710c9-…`) |

---

## A. Executive Summary

Production contains **two** DIMO-linked vehicles with **≥30 days** telemetry silence and **no confirmed post-snapshot unplug**. Both exhibit canonical P0.1 runtime:

`telemetryState=offline` · `physicalDeviceState=UNKNOWN` · `overallState=OFFLINE` · `DEVICE_CHECK_REQUIRED`

Yet fleet desk **Availability** remains `AVAILABLE` for both — a cross-surface inconsistency reserved for P0.3/P0.4.

**HMÜ C 215** is included as the recovered-historical-unplug reference (Case C / recovery proxy with `obdIsPluggedIn=true`).

**WOB L 9755 forensic correction (2026-08-25):** The July 18 snapshot is **proven fresh at observation time** but **does not prove physical reconnect** — `obdIsPluggedIn=false` with concurrent speed telemetry (22 km/h). Evidence class: **COMMUNICATION_RECOVERY_ONLY** / conflicting physical signal — **not** “historical unplug recovered by later snapshot.”

**Reference matrix verdict:** **PASS** — four distinct real-world evidence classes documented (including conflicting plug-flag case).

**P0.2 domain design:** **YES** (reference classes sufficient to design conservative projection).

**P0.2 implementation:** **NO** (processing gate still CONDITIONAL; Availability/Health not aligned).

---

## B. Candidate Discovery

Query: DIMO-linked vehicles where `COALESCE(last_seen_at, provider_fetched_at, source_timestamp) < now() - 30 days`.

| Plate | Vehicle ID (redacted prefix) | Snapshot age | Hardware | tokenId | Fleet status |
|-------|------------------------------|--------------|----------|---------|--------------|
| **WOB L 9755** | `c43c3b45-…` | **37.8 d** | LTE_R1 | 190497 | AVAILABLE |
| **WOB L 7503** | `19fedd4b-…` | **32.8 d** | LTE_R1 | 192922 | AVAILABLE |

No additional ≥30d candidates in production at audit time.

---

## C. Vehicle 1 — WOB L 9755 (Case A: silence, conflicting plug-flag evidence)

### Identity
- LTE_R1, DIMO token `190497`, connection status `CONNECTED`
- Latest snapshot: **2026-07-18T13:42:28Z** (`obdIsPluggedIn=false` at same timestamp)
- OBD applicable: **yes**

### Timestamp provenance (forensic)
| Field | Value | Semantics |
|-------|-------|-----------|
| `last_seen_at` | 2026-07-18T13:42:28Z | Provider observation time (canonical snapshot anchor) |
| `source_timestamp` | 2026-07-18T13:42:28Z | Same as `last_seen_at` |
| `provider_fetched_at` | 2026-08-25T09:19:49Z | Persistence/re-fetch only — **not** a fresh observation |
| DIMO `last_signal` | 2026-07-18T13:42:28Z | Aligns with snapshot observation |
| Raw `obdIsPluggedIn` | `{ value: 0, timestamp: "2026-07-18T13:42:28Z" }` | Explicit false at observation time |
| Concurrent telemetry | `speed` = 22 km/h at same timestamp | Communication active; plug flag contradicts motion |

### Device events
| Source | Type | observedAt | processedAt | Notes |
|--------|------|----------|-------------|-------|
| Canonical | `OBD_DEVICE_UNPLUGGED` | 2026-07-11T18:39:45Z | NULL | Pre-snapshot; no OPEN episode |
| Inbox | — | — | — | **0 rows** |

### Episodes
- **0** OPEN / resolved episodes

### Poll / history (Jul 11–20)
- **0** `dimo_poll_logs` between Jul 11–25; poll activity resumes Jul 26+
- Single materialized latest-state row; no fresher telemetry after Jul 18

### Evidence ordering
1. Canonical unplug **2026-07-11**
2. Last valid snapshot **2026-07-18** — **communication resumed** but `obdIsPluggedIn=false`
3. **>30d silence** since 2026-07-18

**Evidence class:** **COMMUNICATION_RECOVERY_ONLY** — snapshot proves telemetry at Jul 18, **not** physical reconnect. Distinct from WOB L 7503 (`obdIsPluggedIn=true`) and HMÜ C 215 (fresh plugged snapshot).

**Classification:** Historical unplug + later communication with **negative OBD plug flag** → physical state **indeterminate** → `UNKNOWN` + `DEVICE_CHECK_REQUIRED` after freshness expiry (not `PLUGGED_INFERRED`, not “recovered plugged”).

### Canonical runtime (P0.1)
| Field | Value |
|-------|-------|
| telemetryState | `offline` |
| physicalDeviceState | `UNKNOWN` |
| overallState | `OFFLINE` |
| attentionState | `ACTION_REQUIRED` |
| reasonCodes | `TELEMETRY_OFFLINE`, `DEVICE_CHECK_REQUIRED`, `DATA_COVERAGE_INSUFFICIENT` |
| activeEpisodeId | null |

### UI projections (inferred from backend contracts)
| Surface | Value | Source |
|---------|-------|--------|
| Fleet Availability | **AVAILABLE** | `vehicles.status` |
| Fleet Health | **unevaluable / stale modules likely** | Rental health cache miss; health is module-based, not freshness-aware |
| Fleet → Connectivity | **OFFLINE** / UNKNOWN device | `mapFleetConnectivityListItem` over canonical runtime |
| Vehicle Detail Connectivity | Same canonical runtime | P0.1 assembler |

**CROSS_SURFACE INCONSISTENCY — EFFECTIVE AVAILABILITY:** canonical OFFLINE + DEVICE_CHECK_REQUIRED vs desk AVAILABLE.

---

## D. Vehicle 2 — WOB L 7503 (Case A: silence, no confirmed unplug)

### Identity
- LTE_R1, DIMO token `192922`, connection status `CONNECTED`
- Latest snapshot: **2026-07-23T14:43:38Z** (`obdIsPluggedIn=1`)

### Device events
| Source | Type | observedAt | processedAt | Notes |
|--------|------|----------|-------------|-------|
| Canonical | `OBD_DEVICE_UNPLUGGED` | 2026-07-08T17:21:19Z | NULL | **Older than last snapshot** |
| Inbox | — | — | — | **0 rows** |

### Episodes
- **0** episodes

### Evidence ordering
Historical unplug **2026-07-08** → recovery snapshot **2026-07-23** with `obdIsPluggedIn=true` → **>30d silence**.

**Classification:** **Case C variant** — historical unplug recovered by later snapshot with **positive plug flag**, then long silence → `UNKNOWN` + `DEVICE_CHECK_REQUIRED`.

### Canonical runtime
| Field | Value |
|-------|-------|
| telemetryState | `offline` |
| physicalDeviceState | `UNKNOWN` |
| overallState | `OFFLINE` |
| attentionState | `ACTION_REQUIRED` |
| reasonCodes | `TELEMETRY_OFFLINE`, `DEVICE_CHECK_REQUIRED`, `DATA_COVERAGE_INSUFFICIENT` |

### UI projections
Same cross-surface pattern as WOB L 9755: **AVAILABLE** desk vs canonical **OFFLINE** + **DEVICE_CHECK_REQUIRED**.

---

## E. Additional Candidates

None beyond the two ≥30d vehicles above.

---

## F. Canonical Evidence Ordering (summary)

| Vehicle | Latest snapshot | Latest canonical unplug | Unplug newer than snapshot? | Recovery after unplug? | Plug flag at recovery |
|---------|-----------------|-------------------------|----------------------------|------------------------|----------------------|
| WOB L 9755 | 2026-07-18 | 2026-07-11 | **No** | Communication only | **false** (not physical recovery) |
| WOB L 7503 | 2026-07-23 | 2026-07-08 | **No** | Yes (positive plug flag) | **true** |
| HMÜ C 215 | 2026-08-24 (fresh) | 2026-07-20 | No (superseded) | Yes (trip proxy ≤15m) | **true** |

---

## G. UI Source Comparison

| Vehicle | Canonical runtime source | Fleet Availability source | Fleet Health source | Fleet Connectivity source |
|---------|-------------------------|---------------------------|---------------------|---------------------------|
| WOB L 9755 | `assembleVehicleConnectivityRuntimeBundle` | `vehicles.status` | `RentalHealthService` (module eval) | `getFleetConnectivity` → runtime mapper |
| WOB L 7503 | same | same | same | same |
| HMÜ C 215 | same | same | same | same |

---

## H. Availability Inconsistency

**2 of 2** long-offline vehicles show `vehicles.status = AVAILABLE` while canonical connectivity requires operator attention (`DEVICE_CHECK_REQUIRED`).

This is expected pre-P0.2/P0.3 — **not fixed in this task**.

---

## I. Health Inconsistency

Rental health Redis cache had **no entries** for audited vehicles at investigation time. Health badges are computed from tires/brakes/DTC/service modules and do **not** currently consume canonical connectivity freshness.

**CROSS_SURFACE INCONSISTENCY — FRESHNESS-AWARE HEALTH:** likely shows non-critical module states despite >30d telemetry silence (inferred; not browser-verified).

---

## J. Fleet Connectivity Inconsistency

Fleet → Connectivity page **does** consume canonical P0.1 runtime and correctly surfaces **OFFLINE** / **ACTION_REQUIRED** for WOB L 9755 and WOB L 7503.

No inconsistency within the Connectivity surface itself.

---

## K. HMÜ C 215 Comparison

| Field | HMÜ C 215 | Long-offline pair |
|-------|-----------|-------------------|
| Snapshot freshness | Fresh (~12h at prior audit) | **>30d stale** |
| physicalDeviceState | `PLUGGED_INFERRED` | `UNKNOWN` |
| overallState | `UNKNOWN` (standby) | `OFFLINE` |
| Historical unplug | July 20, recovered (plug=true) | July 8/11 — mixed recovery evidence |
| Operator label (future) | Standby / inferred plugged | **Device check required** |

HMÜ C 215 audit precision corrections applied in `connectivity-hmue-c-215-forensic-verification-2026-08.md` (recovery proxy wording, SAME_TOKEN_RECOVERY).

---

## L. Reference Matrix

| Vehicle | Latest snapshot | Age | Latest unplug | Later recovery | Telemetry | Physical | Overall | Attention | Availability UI | Health UI | Connectivity UI | Future operator label |
|---------|-----------------|-----|---------------|----------------|-----------|----------|---------|-----------|-----------------|-----------|-----------------|----------------------|
| **HMÜ C 215** | 2026-08-24T20:30:48Z | ~12h | 2026-07-20 | Trip proxy ≤15m | standby | PLUGGED_INFERRED | UNKNOWN | NONE | AVAILABLE | good (inferred) | standby/unknown | Standby / inferred plugged |
| **WOB L 9755** | 2026-07-18T13:42:28Z | **38d** | 2026-07-11 | Comm. only (plug=false) | offline | UNKNOWN | OFFLINE | ACTION_REQUIRED | **AVAILABLE** | unevaluable (inferred) | offline/unknown | **Device check required** |
| **WOB L 7503** | 2026-07-23T14:43:38Z | **33d** | 2026-07-08 | Snapshot 2026-07-23 | offline | UNKNOWN | OFFLINE | ACTION_REQUIRED | **AVAILABLE** | unevaluable (inferred) | offline/unknown | **Device check required** |

**Counts:**
- `UNKNOWN` + `DEVICE_CHECK_REQUIRED`: **2** (WOB L 9755, WOB L 7503)
- `UNPLUGGED_CONFIRMED`: **0** in this audit set

---

## M. obdIsPluggedIn Semantics (domain decision)

Repository evidence (`connectivity-signals.ts` → `parseBoolSignal`, DIMO `{ value, timestamp }` shape):

| Flag | Meaning in domain model |
|------|-------------------------|
| `true` | Strong positive physical evidence when snapshot is fresh |
| `null` / absent | Communication evidence only — inferred plugged when fresh |
| `false` | Negative physical signal — **does not** count as recovery; `UNKNOWN` + `DEVICE_CHECK_REQUIRED` |

**Decision:** OPTION 2 — snapshot communication ≠ physical plug. Implemented in `derivePhysicalDeviceEvidence()` (tests S1–S6).

**WOB L 9755 answer:** A valid snapshot after unplug does **not** always mean positive connected/recovery evidence when `obdIsPluggedIn=false`.

---

## N. P0.2 Requirements

1. Conservative episode authority — do not OPEN from silence alone.
2. Projection layer must reconcile Availability/Health with canonical connectivity (P0.3/P0.4).
3. Reference matrix above must drive UI copy and operator actions.
4. Processing gate must observe live unplug → RESOLVE before implementation GO.

---

## O. Final Verdict

| Question | Answer |
|----------|--------|
| CONNECTIVITY DOMAIN REFERENCE MATRIX | **PASS** |
| PRODUCTION PROCESSING GATE | **CONDITIONAL** |
| P0.2 DOMAIN DESIGN READY | **YES** |
| P0.2 IMPLEMENTATION READY | **NO** |

---

## Tooling

- `backend/scripts/ops/forensic-vehicle-connectivity-readonly.ts` (extended: inbox, episodes, fleet connectivity list projection)
- Production SQL discovery query (≥30d snapshot age, DIMO-linked)
