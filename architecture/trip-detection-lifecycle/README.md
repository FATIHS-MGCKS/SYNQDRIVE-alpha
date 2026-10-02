# Trip Detection & Lifecycle — Module Authority

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` (promoted 2026-09-26 — Gate A 17/17) |
| **Authority maturity** | `PHASE_0_5_COMPLETE` — explicit non-blocking limitations tracked |
| **Authority directory** | `architecture/trip-detection-lifecycle/` |
| **Canonical target** | This directory — **not** `docs/architecture/trip-fsm/` or `architecture/trip-fsm/` |
| **Last updated** | 2026-09-26 |

## Status banner

This authority is **`AUTHORITY_ACTIVE`** — promoted via the Phase 5 Gate A audit [TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md](evidence/TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md) (TDL-DEC-PHASE5-001). Remaining gaps/contradictions are classified **EXPLICIT_NON_BLOCKING_LIMITATION** or **HISTORICAL_NON_BLOCKING** — see [contradictions/](contradictions/).

Per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md):

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Complete** — `REPO_CURRENT` `0b44b146f…`; DI handoff (OQ-001), flags (OQ-008), legacy paths (OQ-010) closed |
| **2 — Production read-only audit** | **Complete** — **PRODUCTION_CURRENT** @ `2b54a357…` / `20260926094359_v4994` **VERIFIED_READ_ONLY** (TDL-EVID-PHASE5-PROD-BASELINE-001); historical releases preserved |
| **3 — Reconciliation and classification** | **Complete** — all CX/GAP promotion-classified; QS V1 **`PASS_WITH_EVIDENCE_GAPS`** = explicit limitation |
| **4 — Authority construction** | **Complete** — full live FSM graph (5 states / 14 transitions), execution/data/authority/failure graphs, decision register complete for declared scope |
| **5 — Validation and promotion gate** | **Complete** — Gate A 17/17 PASS @ 2026-09-26 |

Non-blocking follow-ups: Mapbox handler contract; **legacy path consolidation** (migration slices in OQ-010); optional `ENDED` enum removal. Feature-flag matrix **closed** (TDL-OQ-008). Tiered polling + R9 ingress **closed** (TDL-OQ-009). Legacy path inventory **closed** (TDL-OQ-010).

**Reconstruction reality (2026-09-26):** Task production anchor @ `8a1d9c658…` / `20260925182907_v4994` preserved in prior OQ evidence; **live** Production @ `2b54a357…` / `20260926094359_v4994` at OQ-005 DB read. **TDL-OQ-001** through **TDL-OQ-010** **CLOSED**. **`AUTHORITY_ACTIVE`** since Phase 5 gate (2026-09-26).

Historical FSM audits under [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) are **supporting evidence only** — linked via [`evidence/EVIDENCE_INDEX.md`](evidence/EVIDENCE_INDEX.md).

## Mandatory read-first documents

| Order | Document | Purpose |
|-------|----------|---------|
| 1 | [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md) | Fixed metadata, phase status, coverage matrix |
| 2 | [CURRENT_STATE.md](CURRENT_STATE.md) | Separated repo / Production / inferred / historical claims |
| 3 | [AGENT_CONTRACT.md](AGENT_CONTRACT.md) | Agent rules and maintenance contract |
| 4 | [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md) | Evidence registry (P1 + P2–R9 + Production) |
| 5 | [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) | Read-only Production observations |
| 6 | [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md) | Human-readable graph index (full live FSM + execution graph) |
| 7 | [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md) | Decision register (complete for declared scope) |

## Scope

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
| [DIMO Integration](../dimo-integration/) (`AUDIT_IN_PROGRESS`) | Provider auth, telemetry transport, segments, webhooks |

**Boundary resolutions:**

- COMPLETED-trip handoff contract to Driving Intelligence — **RESOLVED** (TDL-OQ-001)
- Ownership of `backend/src/modules/vehicle-intelligence/drive-profile/` — **RESOLVED**: **Battery V2** owns powertrain classification (`BatteryDriveProfile`); **not** trip FSM **`VehicleDetectionProfile`** (TDL-DEC-OQ002-001)

## Validation commands

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
git diff --check
```

Module-specific graph validator: `validate-graph.sh` (FSM transitions, OQ-010 mapping, orphans, invariants, decisions).

## Related historical evidence (non-canonical)

- [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) — P2–P6 audits and R1–R9 implementation artifacts
- [`backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts`](../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) — P1 ownership invariants (no separate P1 Markdown)
