# Trip Detection & Lifecycle — Knowledge Graph (human index)

Machine-readable graph: [`graph/`](graph/) · Validator: `bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh`

**Maturity:** Phase 4 **partial** — post-R9 wake subsystem and R10 end-cycle finalize decisions indexed; full FSM graph incomplete.

## Production status (current)

| Fact | State |
|------|-------|
| **REPO_CURRENT** | `79102e516…` @ post PR #1789 (OQ-009) + OQ-010 inventory branch |
| **TDL-OQ-007** | **RESOLVED** — OQ-007.1 passive closure @ `2026-09-25T13:25Z` |
| **TDL-OQ-003** | **RESOLVED** — detection-state cardinality @ `2026-09-25T18:05Z` (TDL-EVID-OQ003-CARDINALITY-001) |
| **TDL-OQ-004** | **RESOLVED** — route artifact coverage policy @ `2026-09-25` (TDL-EVID-OQ004-ROUTE-COV-001; epistemic correction same day) |
| **TDL-OQ-008** | **RESOLVED** — feature-flag matrix @ `2026-09-25` (TDL-EVID-OQ008-FLAG-MATRIX-001) |
| **TDL-OQ-009** | **RESOLVED** — tiered polling + R9 ingress @ `2026-09-26` (TDL-EVID-OQ009-R9-INGRESS-001) |
| **TDL-OQ-010** | **RESOLVED** — legacy/duplicate path inventory @ `2026-09-26` (TDL-EVID-OQ010-LEGACY-INV-001) |
| **TDL-OQ-005** | **RESOLVED** — `TripDetectionState.ENDED` @ `2026-09-26` (TDL-EVID-OQ005-ENDED-001) |
| **TDL-OQ-010** | **RESOLVED** — legacy/duplicate runtime inventory @ `2026-09-26` (TDL-EVID-OQ010-LEGACY-INV-001; **`RESOLVED_WITH_BOUNDED_DEBT`**) |
| **PRODUCTION_CURRENT** | `8a1d9c658…` @ `20260925182907_v4994` |
| **Shadow runtime** | **LAST_VERIFIED @ `99d722b4…`** — not re-checked @ `8a1d9c658…` in OQ-004 |
| R9 on `origin/main` | **YES** — merged #1553 (`4bef6046…` ancestor of `47a3b42b8…`) |
| R9 runtime on Production | **YES** — ancestor of `8a1d9c658…` (not pre-R9) |
| Activity-tier snapshot polling | **ACTIVITY_TIERED** @ Production — scheduler tick **30s** ≠ per-vehicle poll every 30s |
| R9 provider authorized cohort | **5/5** speed+ignition (`R9_AUTHORIZED_COHORT_COVERAGE=100%`) |
| SynqDrive scheduler DB cohort | **6** rows — includes **1** **`HISTORICALLY_EXCLUDED_FORMER_FLEET_ASSET`** stale mirror (DIM-GAP-005) |
| R9 five-vehicle canary @ 2026-09-07 | **HISTORICAL_CORRECT** — authorized provider cohort **5** |
| Natural R9 wake observed | **YES (historical)** — KS MS 661 @ R10/R11 releases; **recent fleet KPIs unknown** (OQ-009) |

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

| TDL-DEC-R10-001 | End-boundary-anchored activity resume + stale finalize guards | PROPOSED |
| TDL-DEC-R10-002 | Legacy tokenless FINALIZE admission without silent token assignment | PROPOSED |
| TDL-DEC-QS-V1-001 | Qualified Stop Contract V1 — 300_000 ms shared same-trip/split authority | VALIDATED (Production **`PASS_WITH_EVIDENCE_GAPS`**) |
| TDL-DEC-OQ001-001 | COMPLETED → DI V2 handoff via post-finalize producer + PG job ledger | VALIDATED (**`RESOLVED_WITH_BOUNDED_GAPS`**) |
| TDL-DEC-OQ006-001 | DIMO segment vs live FSM boundary authority (repair evidence, not live override) | VALIDATED (**`RESOLVED_WITH_BOUNDED_GAPS`**) |
| TDL-DEC-OQ008-001 | Trip runtime-control matrix (defaults vs Production effective) | VALIDATED |
| TDL-DEC-OQ009-001 | Tiered polling + R9 provider-wake ingress contract | VALIDATED (**`RESOLVED_INGRESS_CONTRACT_ALIGNED`**) |
| TDL-DEC-OQ010-001 | Legacy/duplicate trip runtime path inventory — dual post-finalize pipelines | VALIDATED (**`RESOLVED_WITH_BOUNDED_DEBT`**) |
| TDL-DEC-OQ005-001 | `TripDetectionState.ENDED` historical compat; RESTING terminal FSM | VALIDATED (**`ENDED_HISTORICAL_COMPAT_ONLY`**) |

Detail: [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md)

## R10 end-cycle finalize flow (branch only — not deployed)

```
POSSIBLE_END (possibleEndEnteredAt clocked)
  → END_VALIDATION / FINALIZE jobs carry endCycleToken = possibleEndEnteredAt ISO
  → scheduleFinalize recycles waiting stable jobId before enqueue
  → resume (post-boundary motion only) cancels pending ev/fin jobs
  → processFinalize admission: token match OR legacy tokenless requestedAt >= enteredAt
  → TripDecisionEngine.finalizeTrip → tripStatus=COMPLETED + FSM RESTING + activeTripId=null
```

**Production observation:** KS MX reference case (TDL-EVID-R10-KS-MX-001). **Natural-drive post-deploy validation open.**

## Supporting evidence (non-canonical routing)

- [`docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md`](../../docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md) — R9A–R9F implementation record
- [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) — provider wiring PASS (cross-module)

## Open boundaries

- COMPLETED → Driving Intelligence handoff (TDL-GAP-001) — **RESOLVED** (TDL-DEC-OQ001-001; org invariant TDL-EVID-OQ001-1-ORG-001)
- ~~`drive-profile/` ownership (TDL-GAP-002)~~ — **RESOLVED** Battery V2 owns (TDL-EVID-OQ002-DRIVE-PROFILE-001)
- Natural R9 wake end-to-end delivery (TDL-GAP-013; cross-ref DIM-GAP-006) — **historical start wake proven**; recent operational rates **unknown**
- ~~Tiered polling vs R9 ingress (TDL-GAP-016)~~ — **RESOLVED** (TDL-EVID-OQ009-R9-INGRESS-001)
- ~~Legacy duplicate trip paths (TDL-GAP-012)~~ — **RESOLVED** (TDL-EVID-OQ010-LEGACY-INV-001)
- DIMO Integration `AUDIT_IN_PROGRESS` — segment/trigger ownership gaps remain (TDL-CX-006 partially superseded)
