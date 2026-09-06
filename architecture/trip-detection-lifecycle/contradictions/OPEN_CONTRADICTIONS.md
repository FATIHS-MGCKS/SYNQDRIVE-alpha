# Trip Detection & Lifecycle — Open Contradictions

Contradictions remain **open** until resolved by code + evidence in a later phase.

| ID | Contradiction | Evidence | Status |
|----|---------------|----------|--------|
| **TDL-CX-001** | **Repo vs Production trip FSM version** — `main` includes R8 (#1549); Production `01541c2ab…` does not | [AUDIT_MANIFEST.md](../AUDIT_MANIFEST.md), [PRODUCTION_BASELINE.md](../evidence/PRODUCTION_BASELINE.md), TDL-EV-R8-001 | **OPEN** — expected until deploy |
| **TDL-CX-002** | **P2 Production SQL vs 2026-09-07 SQL** — P2 cited stale counts; fresh aggregates differ | TDL-EV-P2-001 vs PRODUCTION_BASELINE | **RESOLVED for audit** — P2 Production claims marked HISTORICAL |
| **TDL-CX-003** | **`ENDED` enum vs live engine** — schema includes `ENDED`; zero runtime writers | Re-audit: no `TripDetectionState.ENDED` in `trips/` | **OPEN (schema debt)** — not a runtime contradiction but schema/code mismatch |
| **TDL-CX-004** | **Historical audit SHA vs current `main`** — P2–P5 audited pre-R1 baseline `3d5040b67…` | EVIDENCE_INDEX classifications | **OPEN as documentation drift** — mitigated by PARTIALLY_CURRENT labels |
| **TDL-CX-005** | **Repair PROPOSED volume (8472) vs 0 ONGOING trips** — large proposed repair backlog with no live ONGOING | PRODUCTION_BASELINE SQL | **OPEN** — may indicate reconciliation cadence vs live FSM cohort mismatch; not root-caused |
| **TDL-CX-006** | **Neighbor registry: "Trip Detection / DIMO Segments own boundaries"** (Driving Intelligence) vs DIMO Integration `NOT_STARTED` | SYNQDRIVE_RENTAL_ARCHITECTURE.md DI boundary | **OPEN** — segment ownership split between trip reconciliation code and not-yet-bootstrapped DIMO authority |

## Non-contradictions (explicitly closed this phase)

| Item | Resolution |
|------|------------|
| P1 sole lifecycle writer | Reconfirmed via `TRIP_OWNERSHIP.ts` + `TripDecisionEngine` |
| Five reachable FSM states | Reconfirmed — `ENDED` unused |
| Production SSH access | Gate passed — contradicts P2/P3 "SSH failed" session notes |
