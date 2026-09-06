# Trip Detection & Lifecycle — Evidence Index

Historical FSM audit corpus under [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/). **Supporting evidence only** — not the canonical authority.

**Repository re-audit baseline:** `origin/main` @ `06095af91ce6f58366734a182ac5962830e858db` (2026-09-07)

## P1 — ownership invariants (no Markdown artifact)

| Evidence ID | Path | Purpose | Audited SHA | Classification |
|-------------|------|---------|-------------|----------------|
| **TDL-EV-P1-001** | [`backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts`](../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) | P1 ownership rules: sole creator (`TripDecisionEngine`), sole lifecycle writer, detector read-only, repair routes through decision engine | Present on `06095af91…` | **CURRENT_SUPPORTING_EVIDENCE** |

**Note:** No separate `P1_*.md` exists in `docs/audits/trip-fsm/`. P1 conclusions were captured in code comments and cross-referenced by P2–P3.

**Still supported on `main`:** Rules 1–5 match live code — `TripDecisionEngine` remains sole `tripStatus` writer; detectors return findings only.

---

## P2 — state machine & execution phases

| Evidence ID | Path | Purpose | Audited SHA | Classification |
|-------------|------|---------|-------------|----------------|
| **TDL-EV-P2-001** | [`docs/audits/trip-fsm/P2_STATE_MACHINE_EXECUTION_PHASE_AUDIT_2026-09-05.md`](../../docs/audits/trip-fsm/P2_STATE_MACHINE_EXECUTION_PHASE_AUDIT_2026-09-05.md) | Persistent FSM vs BullMQ execution phases; `ENDED` dead enum; finalize → RESTING | `3d5040b67…` | **PARTIALLY_CURRENT** |

| Claim | Status on `06095af91…` |
|-------|------------------------|
| Six Prisma FSM states; five reachable | **CONFIRMED** — zero `TripDetectionState.ENDED` references in `trips/` |
| Execution triggers: PS/AT/PEC/EV/FINALIZE not persisted as state | **CONFIRMED** — `trip-detection.types.ts` |
| Production SQL in P2 | **HISTORICAL** — stale; superseded by [PRODUCTION_BASELINE.md](PRODUCTION_BASELINE.md) |

| Superseded / limited |
|---------------------|
| P2 Production SSH failure | Superseded — SSH gate passed 2026-09-07 |
| Exact line numbers in orchestration | May drift — re-verify before citing |

---

## P3 — signal authority & timestamp ordering

| Evidence ID | Path | Purpose | Audited SHA | Classification |
|-------------|------|---------|-------------|----------------|
| **TDL-EV-P3-001** | [`docs/audits/trip-fsm/P3_SIGNAL_AUTHORITY_TIMESTAMP_ORDERING_AUDIT_2026-09-05.md`](../../docs/audits/trip-fsm/P3_SIGNAL_AUTHORITY_TIMESTAMP_ORDERING_AUDIT_2026-09-05.md) | EVENT_TIME vs WORKER_TIME separation; boundary field contract | `3d5040b67…` (logic); HEAD `c52d0c76…` | **PARTIALLY_CURRENT** |

| Claim | Status on `06095af91…` |
|-------|------------------------|
| Physical boundaries use event-time fields (`possibleStartAt`, `possibleEndAt`, movement anchors) | **CONFIRMED** — reinforced by R1 on `main` |
| FSM dwell clocks use worker entry timestamps | **CONFIRMED** |
| Production verification | **UNKNOWN** in P3 — now partially addressed in PRODUCTION_BASELINE |

---

## P4 — trip start deep dive

| Evidence ID | Path | Purpose | Audited SHA | Classification |
|-------------|------|---------|-------------|----------------|
| **TDL-EV-P4-001** | [`docs/audits/trip-fsm/P4_TRIP_START_DEEP_DIVE_AUDIT_2026-09-05.md`](../../docs/audits/trip-fsm/P4_TRIP_START_DEEP_DIVE_AUDIT_2026-09-05.md) | Start detectors, policies, failure windows, liveness gaps | HEAD `b62c4c44…` | **PARTIALLY_CURRENT** |

| Claim | Status on `06095af91…` |
|-------|------------------------|
| Start policy resolver + composite detectors exist | **CONFIRMED** |
| P4-F11/F12 start liveness issues | **ADDRESSED on main** via R3 (verify in code) |
| P4-F01/F03 start consistency issues | **ADDRESSED on main** via R4 |

---

## P5 — trip end deep dive

| Evidence ID | Path | Purpose | Audited SHA | Classification |
|-------------|------|---------|-------------|----------------|
| **TDL-EV-P5-001** | [`docs/audits/trip-fsm/P5_TRIP_END_DEEP_DIVE_AUDIT_2026-09-06.md`](../../docs/audits/trip-fsm/P5_TRIP_END_DEEP_DIVE_AUDIT_2026-09-06.md) | End modes, CUSUM, PEC/EV/CH paths, finalize semantics | P5 closure 2026-09-06 | **PARTIALLY_CURRENT** |

| Claim | Status on `06095af91…` |
|-------|------------------------|
| End validation classifier + CUSUM path | **CONFIRMED** |
| P5-F03/F11/F13 end metadata issues | **ADDRESSED on main** via R5 |
| P5-F04/F09 mid-gap split control flow | **ADDRESSED on main** via R6 |
| P5-F05 terminal RESTING recovery | **ADDRESSED on main** via R7 |

---

## P6 — target architecture & remediation plan

| Evidence ID | Path | Purpose | Audited SHA | Classification |
|-------------|------|---------|-------------|----------------|
| **TDL-EV-P6-001** | [`docs/audits/trip-fsm/P6_TARGET_ARCHITECTURE_REMEDIATION_PLAN_2026-09-06.md`](../../docs/audits/trip-fsm/P6_TARGET_ARCHITECTURE_REMEDIATION_PLAN_2026-09-06.md) | R1–R8 dependency graph; target architecture synthesis | `3d5040b67…` design baseline | **PARTIALLY_CURRENT** |

| Claim | Status on `06095af91…` |
|-------|------------------------|
| Ordered R1→R8 remediation program | **CONFIRMED merged on main** through R8 (#1549) |
| P6 as canonical architecture | **SUPERSEDED** by this authority bootstrap — P6 deferred canonical docs explicitly |
| Pre-R1 gap inventory | **HISTORICAL** for closed R-items; still useful for decision reconstruction |

---

## R1 — event-time authority implementation

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R1-001** | [`docs/audits/trip-fsm/R1_EVENT_TIME_AUTHORITY_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R1_EVENT_TIME_AUTHORITY_IMPLEMENTATION_2026-09-06.md) | EVENT_TIME boundary field contract vs worker dwell clocks | `3d5040b67…` | **CURRENT_SUPPORTING_EVIDENCE** |

**Still supported:** Separates event-time physical boundaries from worker-time FSM clocks without changing thresholds (per artifact). Code paths cited in artifact exist on `main`.

**Limitation:** Deploy status NOT PERFORMED at R1 time — Production may lag until post-`01541c2ab…` deploy.

---

## R2 — lifecycle invariants

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R2-001** | [`docs/audits/trip-fsm/R2_LIFECYCLE_INVARIANTS_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R2_LIFECYCLE_INVARIANTS_IMPLEMENTATION_2026-09-06.md) | Lifecycle commit + orphan recovery invariants | `8ddf73e56…` | **CURRENT_SUPPORTING_EVIDENCE** |

**Still supported:** Terminal lifecycle commit utilities and orphan recovery specs present (`trip-terminal-lifecycle-commit.util.ts`, R2 specs).

---

## R3 — start liveness ordering

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R3-001** | [`docs/audits/trip-fsm/R3_START_LIVENESS_ORDERING_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R3_START_LIVENESS_ORDERING_IMPLEMENTATION_2026-09-06.md) | Queue handoff settlement; start execution liveness | `ff95395d6…` | **CURRENT_SUPPORTING_EVIDENCE** |

**Still supported:** `trip-tracking-handoff-settlement.ts`, `trip-tracking-queue.util.ts`, R3 specs on `main`.

---

## R4 — start detection consistency

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R4-001** | [`docs/audits/trip-fsm/R4_START_DETECTION_CONSISTENCY_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R4_START_DETECTION_CONSISTENCY_IMPLEMENTATION_2026-09-06.md) | Dual scoring clarity; LIVE_START freshness | `12a5fdac9…` | **CURRENT_SUPPORTING_EVIDENCE** |

---

## R5 — end validation semantics

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R5-001** | [`docs/audits/trip-fsm/R5_END_VALIDATION_SEMANTICS_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R5_END_VALIDATION_SEMANTICS_IMPLEMENTATION_2026-09-06.md) | End anchor, metadata reset, attempt accounting | `eb51d8f80…` | **CURRENT_SUPPORTING_EVIDENCE** |

---

## R6 — mid-gap split safety

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R6-001** | [`docs/audits/trip-fsm/R6_MID_GAP_SPLIT_SAFETY_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R6_MID_GAP_SPLIT_SAFETY_IMPLEMENTATION_2026-09-06.md) | Mid-trip gap split control flow safety | `4cd02d7f8…` | **CURRENT_SUPPORTING_EVIDENCE** |

---

## R7 — terminal RESTING recovery

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R7-001** | [`docs/audits/trip-fsm/R7_TERMINAL_RESTING_RECOVERY_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R7_TERMINAL_RESTING_RECOVERY_IMPLEMENTATION_2026-09-06.md) | Terminal lifecycle → RESTING hardening (INV-08) | `de402f7c9…` | **CURRENT_SUPPORTING_EVIDENCE** |

---

## R8 — observability & forensics

| Evidence ID | Path | Purpose | Baseline SHA | Classification |
|-------------|------|---------|--------------|----------------|
| **TDL-EV-R8-001** | [`docs/audits/trip-fsm/R8_OBSERVABILITY_FORENSICS_IMPLEMENTATION_2026-09-06.md`](../../docs/audits/trip-fsm/R8_OBSERVABILITY_FORENSICS_IMPLEMENTATION_2026-09-06.md) | Forensic metadata contract; metric/timeline corrections | `140ebdd33…` branch baseline | **CURRENT_SUPPORTING_EVIDENCE** (repo) / **NOT DEPLOYED** (Production `01541c2ab…`) |

| Claim | Status |
|-------|--------|
| R8 merged on `main` (#1549) | **CONFIRMED** at `06095af91…` |
| R8 on Production | **CONTRADICTED vs deployed** — Production SHA predates R8 |
| Legacy metric mislabeling fixed in R8 | **UNKNOWN on Production** until deploy |

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **CURRENT_SUPPORTING_EVIDENCE** | Artifact claims reconfirmed on `origin/main` @ audit SHA |
| **PARTIALLY_CURRENT** | Core model still valid; Production refs, line numbers, or pre-R fixes stale |
| **HISTORICAL** | Described pre-remediation state; superseded by R1–R8 merges |
| **SUPERSEDED** | Explicitly replaced (e.g., P6 deferral of canonical docs) |
| **CONTRADICTED** | Conflicts with re-audited code or fresh Production evidence |
| **UNKNOWN** | Not re-verified this phase |

## Explicit non-artifacts

- **R9** adaptive polling wake — out of scope for this bootstrap PR; not indexed here
- **Competing authority paths** — must not be created under `architecture/trip-fsm/` or `docs/architecture/trip-fsm/`
