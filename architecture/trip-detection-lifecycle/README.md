# Trip Detection & Lifecycle — Partial Module Authority (Phase 0–2)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority maturity** | `PARTIAL_RECONSTRUCTION` (Phases 0–2 only) |
| **Authority directory** | `architecture/trip-detection-lifecycle/` |
| **Canonical target** | This directory — **not** `docs/architecture/trip-fsm/` or `architecture/trip-fsm/` |
| **Last updated** | 2026-09-07 |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

Phases **0–2** (entry, repository reconciliation, read-only Production baseline) are in progress. Machine graphs, decision reconstruction, validators, consistency validation, and promotion evaluation remain **outstanding**.

Historical FSM audits under [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) are **supporting evidence only** — linked via [`evidence/EVIDENCE_INDEX.md`](evidence/EVIDENCE_INDEX.md).

## Mandatory read-first documents (this authority)

| Order | Document | Purpose |
|-------|----------|---------|
| 1 | [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md) | Audit scope, SHAs, Production access, limitations |
| 2 | [CURRENT_STATE.md](CURRENT_STATE.md) | Separated repo / Production / inferred / historical claims |
| 3 | [AGENT_CONTRACT.md](AGENT_CONTRACT.md) | Rules for agents working on this module during audit |
| 4 | [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md) | Indexed P2–P6 / R1–R8 / P1 ownership evidence |
| 5 | [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) | Read-only Production observations (2026-09-07) |

## Completed audit phases (this PR)

| Phase | Deliverable |
|-------|-------------|
| **0** | Registry transition to `AUDIT_IN_PROGRESS`; scope and neighbor boundaries |
| **1** | Repository current-state reconciliation vs `origin/main` @ `06095af91…` |
| **2** | Read-only Production SSH baseline + bounded SQL aggregates |

## Remaining Standard-1.0 phases (not in this PR)

- Phase 3 — Decision reconstruction (`decisions/`, WHY registers)
- Phase 4 — Machine graphs (`graph/*.yaml`, validators)
- Phase 5 — Consistency validation records
- Phase 6 — Promotion gate evaluation → `AUTHORITY_ACTIVE`

Missing mandatory files until later phases: `KNOWLEDGE_GRAPH.md`, `graph/`, `decisions/DECISION_REGISTER.md`, module validators, Production-validated promotion record.

## Preliminary scope

**In scope (Trip Detection & Lifecycle):**

- Live trip FSM (`VehicleTripDetectionState`)
- Snapshot-triggered start evaluation and BullMQ trip-tracking execution loop
- Start/end detection policies, detectors, CUSUM end validation
- `TripDecisionEngine` lifecycle mutations on `VehicleTrip`
- Terminal recovery, lifecycle invariant recovery, mid-gap split safety
- Tiered snapshot polling ingress (DIMO snapshot processor path)
- Trip reconciliation / repair audit trail (`TripRepair`)
- Canonical route artifacts (Route V2 materialization)
- Trip API read models and rental UI trip surfaces

**Out of scope (neighbor authorities):**

| Neighbor | Owns |
|----------|------|
| [Driving Intelligence](../drivingintelligence/) | Post-trip behavior, scoring, misuse, DI V2 pipeline |
| [KG-ATE](../knowledge-graphs/automatic-trip-enrichment/) | Post-finalize enrichment orchestration |
| [KG-EED](../knowledge-graphs/energy-event-detection/) | REFUEL/RECHARGE semantics |
| [Scaling Process](../scaling-process/) | Leader election, DIMO budget, reconciliation mutex algorithms |
| [Battery V2](../battery-v2/) | Battery health; consumes trip lifecycle hooks |
| DIMO Integration (`NOT_STARTED`) | Provider auth, telemetry transport, segments, webhooks (code inspected; no active authority) |

**Open boundary (unresolved):**

- Exact COMPLETED-trip handoff contract to Driving Intelligence finalize analysis
- Ownership of `backend/src/modules/vehicle-intelligence/drive-profile/` (Battery-oriented profile resolver; **not** trip FSM `VehicleDetectionProfile`)

## Validation commands (available now)

```bash
bash architecture/scripts/validate-module-registry.sh
git diff --check
```

Module-specific graph validators: **not yet created** (Phase 4+).

## Related historical evidence (non-canonical)

- [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) — P2–P6 audits and R1–R8 implementation artifacts
- [`backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts`](../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) — P1 ownership invariants (no separate P1 Markdown)
