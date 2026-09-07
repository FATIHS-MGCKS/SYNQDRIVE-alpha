# Trip Detection & Lifecycle — Partial Module Authority

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority maturity** | `PARTIAL_RECONSTRUCTION` |
| **Authority directory** | `architecture/trip-detection-lifecycle/` |
| **Canonical target** | This directory — **not** `docs/architecture/trip-fsm/` or `architecture/trip-fsm/` |
| **Last updated** | 2026-09-07 |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

Per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md):

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Initial consolidated baseline established** — further reconstruction **in progress** |
| **2 — Production read-only audit** | **Verified baseline established** (with documented limitations) |
| **3 — Reconciliation and classification** | **Pending / in progress** |
| **4 — Authority construction** | **Partial** — R9 wake subgraph, decision register entries, and `validate-graph.sh` created; full FSM graph incomplete |
| **5 — Validation and promotion gate** | **Pending** |

Phase 1 is **not** fully complete while dead/legacy inventory, the full feature-flag matrix, Mapbox/FMM failure taxonomy, and the Driving Intelligence handoff remain unresolved.

Historical FSM audits under [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) are **supporting evidence only** — linked via [`evidence/EVIDENCE_INDEX.md`](evidence/EVIDENCE_INDEX.md).

## Mandatory read-first documents

| Order | Document | Purpose |
|-------|----------|---------|
| 1 | [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md) | Fixed metadata, phase status, coverage matrix |
| 2 | [CURRENT_STATE.md](CURRENT_STATE.md) | Separated repo / Production / inferred / historical claims |
| 3 | [AGENT_CONTRACT.md](AGENT_CONTRACT.md) | Agent rules during audit |
| 4 | [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md) | Evidence registry (P1 + P2–R9 + Production) |
| 5 | [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) | Read-only Production observations |
| 6 | [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md) | Human-readable graph index (Phase 4 partial) |
| 7 | [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md) | Decision register (Phase 4 partial) |

## Preliminary scope

**In scope (Trip Detection & Lifecycle):**

- Live trip FSM (`VehicleTripDetectionState`)
- Snapshot-triggered start evaluation and BullMQ trip-tracking execution loop
- Start/end detection policies, detectors, CUSUM end validation
- `TripDecisionEngine` lifecycle mutations on `VehicleTrip`
- Terminal recovery, lifecycle invariant recovery, mid-gap split safety
- Tiered snapshot polling ingress (DIMO snapshot processor path)
- **R9 adaptive provider-wake start-liveness ingress** (`SnapshotWakeIntakeService`, `SnapshotWakeCoordinatorService`, durable Redis mailboxes, `snapshot.wake.handoff` queue, DIMO webhook wiring)
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
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
git diff --check
```

Module-specific graph validator: `validate-graph.sh` (Phase 4 partial).

## Related historical evidence (non-canonical)

- [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) — P2–P6 audits and R1–R9 implementation artifacts
- [`backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts`](../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) — P1 ownership invariants (no separate P1 Markdown)
