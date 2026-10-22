# TDL P1B.9D — Tesla Start Boundary Ground-Truth Validation (21.10.2026)

**Basis:** `main` @ `80315f3c74ba539e00110e3f1d43a542abb75531` (PR #2117 merged)  
**Mode:** Read-only Production forensics + offline resolver replay (no provider calls, no mutations)

## Ground truth (driver-confirmed)

| Trip | ID | GT start (UTC) | GT end (UTC) | Legacy `start_time` | Legacy error |
|------|-----|----------------|--------------|---------------------|--------------|
| 1 | `14c41c06-0a54-49d1-b5d2-f9d7373e638d` | **12:03:15** | 12:07:10 | 11:58:00 | **−315 s** |
| 2 | `7a9d6a28-d91a-4919-98d8-d92fbea1573e` | **12:20:08** | 12:24:10 | 12:15:00 | **−308 s** |

Vehicle: Tesla Model 3 · `68868291-5478-42cd-b0c4-cc77b2a78e21` · DIMO **186946**

## Resolver review (code paths)

| Function | Role |
|----------|------|
| `resolveLegacyConfirmedStartBoundary` | Production mirror: DIMO segment epoch when matched → explains −315/−308 s |
| `resolveEvidenceBackedStartBoundary` | P1B proposed boundary: prefix admission + global movement fallback |
| `compareStartBoundaryAdmissionShadow` | Offline legacy vs proposed delta (shadow-only) |
| `findEarliestTrustedMovementInWindow` | Min(core route) movement; **not** segment aggregates as GPS |
| P1B gates | Shadow env + vehicle allowlist; route fetch default OFF on 21.10 |

**L3/S4:** `TRUSTED_MAX_AVAILABLE` on both trips (P1B.9B); used as QC context only — movement replay uses **HF-speed-derived core samples + waypoints**, not L3 grid as independent motion proof.

## Per-trip offline evaluation (explicitly not live replay)

`possibleStartAt` was **not** persisted on completed trips. Offline replay uses:

- Trip 1: `candidateStartAt` = first `POSSIBLE_START_VALIDATION` run **12:03:39.737Z**, `confirmedAt` = trip `created_at` **12:04:10.951Z**
- Trip 2: `candidateStartAt` = `confirmedAt` = **12:20:20.005Z** (validation run same second)

Sparse fixtures: `fixtures/p1b9d-tesla-oct21-ground-truth.fixture.ts` (CH + waypoint excerpts; gaps documented).

| Trip | Legacy start | FSM confirm | Earliest trusted movement (fixture) | P1B proposed | Δ P1B vs GT | Decision | Coverage |
|------|--------------|---------------|-------------------------------------|--------------|-------------|----------|----------|
| 1 | 11:58:00 | 12:04:10.951 | **12:03:08** (route speed) | **12:03:08** | **−7 s** | `PROVIDER_START_BOUNDED` | `TRUSTED_MOVEMENT_PRESENT` |
| 2 | 12:15:00 | 12:20:20.005 | **12:20:15** (core speed) | **12:20:15** | **+7 s** | `PROVIDER_START_BOUNDED` | `TRUSTED_MOVEMENT_PRESENT` |

Prometheus on 21.10 aggregated **`PROVIDER_START_BOUNDED`** for SOFTWARE_INTEGRATION; per-trip JSON was **not** retained (P1B.9). Offline replay **aligns on decision class** when prefix window is reconstructed; if `possibleStartAt` remained at segment epoch, decision label can be `MOVEMENT_BOUNDARY_SELECTED` with **the same movement timestamp**.

## Root cause

Legacy canonical writer binds `start_time` to **DIMO segment epoch** (~5 min before driver GT). FSM confirmation (`created_at`) trails GT by **+55 s / +12 s** because it follows telemetry, but **does not rewrite** `start_time`. P1B shadow resolver **already bounds** to earliest HF/route movement within the admission window — within **±7 s** of GT on these fixtures.

## Bounding policy vs five-minute early starts

**Yes** — for these two trips, existing `PROVIDER_START_BOUNDED` / movement selection would correct the ~300 s legacy error **if** proposed `canonicalStartAt` were ever wired to the canonical writer (not in scope).

## Regression tests

`trip-start-boundary-admission-p1b9d-tesla-gt.spec.ts` — 10 cases (fixtures + legacy unchanged + P1B.9C mid-gap suite still green).

## Next action

1. Append-only persist shadow payload at start confirmation (per P1B.9 recommendation).  
2. Pilot review: no canonical cutover until durable per-trip shadow + allowlist dashboard.  
3. Optional: archive core/route batch at confirmation for true live replay.

```
ARCHITECTURE_GOVERNANCE
- substantive_change: YES
- affected_modules: Trip Detection Lifecycle
- authority_updates: CHANGE_LEDGER + this evidence doc
- registry_review:
  - module: Trip Detection Lifecycle
    result: UNCHANGED
    registry_status_before: AUTHORITY_ACTIVE
    registry_status_after: AUTHORITY_ACTIVE
    reason: Research + regression fixtures only
```
