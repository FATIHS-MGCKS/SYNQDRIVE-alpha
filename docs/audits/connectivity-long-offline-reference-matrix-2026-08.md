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

**HMÜ C 215** is included as the recovered-historical-unplug reference (Case C / recovery proxy).

**Reference matrix verdict:** **PASS** — three distinct real-world evidence classes documented.

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

## C. Vehicle 1 — WOB L 9755 (Case A: silence, no confirmed unplug)

### Identity
- LTE_R1, DIMO token `190497`, connection status `CONNECTED`
- Latest snapshot: **2026-07-18T13:42:28Z** (`obdIsPluggedIn=0` at last snapshot)
- OBD applicable: **yes**

### Device events
| Source | Type | observedAt | processedAt | Notes |
|--------|------|----------|-------------|-------|
| Canonical | `OBD_DEVICE_UNPLUGGED` | 2026-07-11T18:39:45Z | NULL | **Older than last snapshot** — historically recovered |
| Inbox | — | — | — | **0 rows** |

### Episodes
- **0** OPEN / resolved episodes

### Evidence ordering
1. Canonical unplug **2026-07-11** (pre-snapshot-era, not newer than telemetry)
2. Last valid snapshot **2026-07-18** (after unplug — recovery proxy)
3. **>30d silence** since 2026-07-18

**Classification:** **Case C variant** — historical unplug recovered by later snapshot, then long silence → `UNKNOWN` + `DEVICE_CHECK_REQUIRED` (not `UNPLUGGED_CONFIRMED`).

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
Historical unplug **2026-07-08** → recovery snapshot **2026-07-23** → **>30d silence**.

**Classification:** **Case C variant** (same as WOB L 9755).

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

| Vehicle | Latest snapshot | Latest canonical unplug | Unplug newer than snapshot? | Recovery after unplug? |
|---------|-----------------|-------------------------|----------------------------|------------------------|
| WOB L 9755 | 2026-07-18 | 2026-07-11 | **No** | Yes (snapshot after unplug) |
| WOB L 7503 | 2026-07-23 | 2026-07-08 | **No** | Yes |
| HMÜ C 215 | 2026-08-24 (fresh) | 2026-07-20 | No (superseded) | Yes (trip proxy ≤15m) |

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
| Historical unplug | July 20, recovered | July 8/11, recovered then silent |
| Operator label (future) | Standby / inferred plugged | **Device check required** |

HMÜ C 215 audit precision corrections applied in `connectivity-hmue-c-215-forensic-verification-2026-08.md` (recovery proxy wording, SAME_TOKEN_RECOVERY).

---

## L. Reference Matrix

| Vehicle | Latest snapshot | Age | Latest unplug | Later recovery | Telemetry | Physical | Overall | Attention | Availability UI | Health UI | Connectivity UI | Future operator label |
|---------|-----------------|-----|---------------|----------------|-----------|----------|---------|-----------|-----------------|-----------|-----------------|----------------------|
| **HMÜ C 215** | 2026-08-24T20:30:48Z | ~12h | 2026-07-20 | Trip proxy ≤15m | standby | PLUGGED_INFERRED | UNKNOWN | NONE | AVAILABLE | good (inferred) | standby/unknown | Standby / inferred plugged |
| **WOB L 9755** | 2026-07-18T13:42:28Z | **38d** | 2026-07-11 | Snapshot 2026-07-18 | offline | UNKNOWN | OFFLINE | ACTION_REQUIRED | **AVAILABLE** | unevaluable (inferred) | offline/unknown | **Device check required** |
| **WOB L 7503** | 2026-07-23T14:43:38Z | **33d** | 2026-07-08 | Snapshot 2026-07-23 | offline | UNKNOWN | OFFLINE | ACTION_REQUIRED | **AVAILABLE** | unevaluable (inferred) | offline/unknown | **Device check required** |

**Counts:**
- `UNKNOWN` + `DEVICE_CHECK_REQUIRED`: **2** (WOB L 9755, WOB L 7503)
- `UNPLUGGED_CONFIRMED`: **0** in this audit set

---

## M. P0.2 Requirements

1. Conservative episode authority — do not OPEN from silence alone.
2. Projection layer must reconcile Availability/Health with canonical connectivity (P0.3/P0.4).
3. Reference matrix above must drive UI copy and operator actions.
4. Processing gate must observe live unplug → RESOLVE before implementation GO.

---

## N. Final Verdict

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
