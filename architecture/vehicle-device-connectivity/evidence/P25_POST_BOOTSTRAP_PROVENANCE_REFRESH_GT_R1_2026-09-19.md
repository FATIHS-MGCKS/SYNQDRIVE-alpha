# P2.5 — Post-bootstrap same-state PROVENANCE_REFRESH GT-R1 proof

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-POST-BOOTSTRAP-PROVENANCE-REFRESH-001 |
| **Date** | 2026-09-19 |
| **Epistemic** | **IMPLEMENTATION_PRESENT** (branch candidate; not Production-deployed) |
| **Historical rows** | **Immutable** — 107 T+24h `UNEXPLAINED_*` observations are not rewritten |

## Semantic invariant

Fresh SNAPSHOT_OBD that confirms an **already-established PLUGGED** physical projection may yield coordinator decision **`PROVENANCE_REFRESH`**. This refreshes provenance (evidence reference, `evidenceObservedAt`, `stateVersion`) without a logical connectivity state transition.

Legacy **`no_open_episode`** answers: *may this snapshot resolve an OPEN legacy unplug episode?* It is **not** provider OBD ground truth and **not** `PLUGGED=false`.

Shadow comparator domains are **non-isomorphic** unless GT-R1 proves the physical provenance refresh is expected.

## GT-R1 proof class

**`SNAPSHOT_PLUG_POST_BOOTSTRAP_PROVENANCE_REFRESH`**

### Preconditions

- Admissible SNAPSHOT_OBD PLUG evidence (LTE_R1 hardware, physical snapshot source, binding aligned).
- Physical projection **exists** with `effectiveState=PLUGGED` and `physicalProjectionEvidenceAt` set.
- Incoming snapshot candidate **PLUGGED**.
- `snapshotEvidenceObservedAt` **strictly greater than** projection `physicalProjectionEvidenceAt`.
- Legacy evaluation: **`reject`** with reason **`no_open_episode`**.
- **`episode == null`** (required for canonical `no_open_episode` reject — not interpreted as plug-false).
- At comparator time: coordinator decision must be **`PROVENANCE_REFRESH`** (`isProvenExpectedFixForPhysicalDecision`).

### Failure conditions

- Absent projection → bootstrap proof only (`SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT`).
- UNPLUGGED baseline → repair proof only (`SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE`).
- UNPLUG snapshot / `obd_false` → unplug GT-R1 paths only.
- Non-monotonic or ineligible freshness (orchestrator eligibility gate).
- Open episode present → not `no_open_episode` plug reject shape.
- Physical decision not `PROVENANCE_REFRESH` (e.g. `ESTABLISHED`, `APPLIED`).

### Classification when proven

Reuses **`EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`** (non-blocking). Unproven cases remain **`UNEXPLAINED_OLD_REJECT_NEW_ACCEPT`** (blocking).

## Comparator domain model

`inferPhysicalStateShadowComparisonDomain()` distinguishes:

- `STATE_TRANSITION`
- `EPISODE_RESOLUTION`
- `SAME_STATE_PROVENANCE_REFRESH`

Forensics/metrics only — classification still requires GT-R1 proof.

## Cutover / epoch

- **Does not** retroactively clear the authoritative epoch’s 107 historical blockers.
- Cutover still requires operational **`UNEXPLAINED_*` = 0** in the pilot window per runbook; post-deploy observations may classify as EXPECTED_FIX when proof applies.
- **New validation epoch** may be required for cutover readiness after deploy (historical window evidence unchanged).

## Validation

- `physical-state-gt-r1-proof.spec.ts`
- `physical-state-post-bootstrap-provenance-shadow.spec.ts`
- `physical-state-shadow-comparison-domain.spec.ts`
