# Trip Detection & Lifecycle — Knowledge Graph (human index)

Machine-readable graph: [`graph/`](graph/) · Validator: `bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh`

**Maturity:** Phase 4 **partial** — post-R9 wake subsystem indexed; full FSM graph incomplete.

## Production status (current)

| Fact | State |
|------|-------|
| R9 on `origin/main` | **YES** — merged #1553 @ `4bef60463…` |
| R9 runtime on Production | **YES** — @ `0ba96e03…` |
| Provider speed+ignition wiring | **5/5** active cohort (190497 excluded) |
| Natural R9 wake observed | **NO** — **NEXT_GATE** `NATURAL_R9_WAKE_OBSERVATION` |

## Canonical lifecycle flow

```
DIMO provider trigger (speed / ignition)
  → SnapshotWakeIntakeService
  → durable Redis pending mailbox
  → stable canonical dimo.snapshot.poll job
  → DimoSnapshotProcessor (single serialized fetch per vehicle)
  → TripDetectionOrchestrationService
  → detectors / policy
  → TripDecisionEngine
  → vehicle_trips + VehicleTripDetectionState
```

**Lifecycle authority:** `TripDecisionEngine` · **Persisted FSM authority:** `TripDetectionOrchestrationService`

R9 does **not** create a second trip lifecycle authority.

## R9 wake / handoff flow

```
Provider wake eligible (AVAILABLE|RENTED, DIMO CONNECTED, FSM RESTING)
  → pending mailbox (atomic merge, monotonic version)
  → canonical snapshot job (QUEUED/DELAYED = valid future consumer)
  → afterSnapshotJob coalesce semantics
  → successor mailbox + snapshot-wake-handoff queue (never provider-fetch)
  → dispatchSuccessorHandoff → canonical snapshot enqueue when ELIGIBLE_RESTING
```

**Continuation policy:** `classifyWakeContinuation` — only `ELIGIBLE_RESTING` may schedule successor execution; `UNKNOWN` fail-closed with bounded retry handoff.

## Decision index

| ID | Title | STATUS |
|----|-------|--------|
| TDL-DEC-R9-001 | R9 adaptive polling wake subsystem | VALIDATED |
| TDL-DEC-R9A-001 | Durable-first wake mailboxes | VALIDATED |
| TDL-DEC-R9B-001 | Handoff rearm without self-coalescing | VALIDATED |
| TDL-DEC-R9C-001 | Generation-1 probe terminal bound | VALIDATED |
| TDL-DEC-R9D-001 | Continuation RESTING + eligibility | VALIDATED |
| TDL-DEC-R9E-001 | UNKNOWN defer + obsolete CAS | VALIDATED |
| TDL-DEC-R9F-001 | UNKNOWN bounded retry completeness | VALIDATED |
| TDL-DEC-R9-CX-001 | DIMO webhook → Trip wake delegation boundary | VALIDATED |

Detail: [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md)

## Supporting evidence (non-canonical routing)

- [`docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md`](../../docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md) — R9A–R9F implementation record
- [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) — provider wiring PASS (cross-module)

## Open boundaries (unchanged)

- COMPLETED → Driving Intelligence handoff (TDL-GAP-001)
- `drive-profile/` ownership (TDL-GAP-002)
- Natural R9 wake end-to-end delivery (TDL-GAP-013; cross-ref DIM-GAP-006)
- DIMO Integration `AUDIT_IN_PROGRESS` — segment/trigger ownership gaps remain (TDL-CX-006 partially superseded)
