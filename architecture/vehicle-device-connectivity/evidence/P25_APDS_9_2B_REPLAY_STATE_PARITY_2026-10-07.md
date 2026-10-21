# P25 APDS-9.2B — Frozen-replay execution state parity (poll-start clock)

| Field | Value |
|-------|--------|
| **Evidence ID** | VDC-EVID-P25-APDS-9-2B-001 |
| **Production base SHA** | `a376c965ecedf855eb0fbcda42542ff15b74422c` |
| **Execution contract** | `P25_APD_SHADOW_EXECUTION_V2` (Production V2 row count 0 — no V2.1 fork) |
| **Shadow ON** | **NO** |
| **Deploy** | **NO** |

## Offline frozen replay authority (PS1 + policy core)

| Semantics | Source |
|-----------|--------|
| Poll start `p.tMs` | `dimo_poll_logs.started_at` |
| Poll end `p.tEndMs` | `COALESCE(finished_at, started_at)` |
| Poll filter | `job_type = SNAPSHOT`, `status = SUCCESS` |
| Reconciliation | `!inActiveTrip(vehicleId, p.tMs)` via `vehicle_trips` intervals only |
| `lastAllowedMs` on allow | `p.tMs` (shared across reconciliation and non-reconciliation) |
| `lastLvSourceMs` advance | reconciliation ∧ allow only; visibility at `p.tEndMs` |

## Live V2 corrections (engineering branch)

- Authoritative policy evaluation at **actual baseline poll start** in `DimoSnapshotProcessor` (`observeActualBaselinePollStart`).
- Scheduler `observePrePoll` is **non-authoritative** (no scientific rows).
- Durable `lastAllowed` from `real_poll_started_at` (no reconciliation partition).
- Per-policy simulated LV from `real_poll_visible_lv_source_at` on reconciliation ∧ advancing rows.
- Reconciliation classification uses `vehicle_trips` (offline parity), not polling tier.

## Validation

- `npm test -- --testPathPattern='adaptive-polling-shadow|p25-apd-shadow-execution|p25-apd-policy-parity'`
- Migration `20261007180000_apd_shadow_poll_start_clock` (additive).
