# Trip Detection & Lifecycle — Knowledge Graph (human index)

Machine-readable graph: [`graph/`](graph/) · Validator: `bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh`

**Maturity:** Phase 5 **complete** — full live FSM (5 runtime states + `ENDED` schema-compat), 14 validator-enforced transitions, execution / recovery / boundary graph, OQ-010 41-path mapping. Registry coverage **`AUTHORITY_ACTIVE`** since 2026-09-26 (TDL-DEC-PHASE5-001; Gate A record [TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md](evidence/TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md)).

## Production status (current)

| Fact | State |
|------|-------|
| **REPO_CURRENT** | `0b44b146…` (`origin/main` @ Phase 5 start; merge of #1793) |
| **PRODUCTION_CURRENT** | `2b54a357…` @ `20260926094359_v4994` — `VERIFIED_READ_ONLY` 2026-09-26 (TDL-EVID-PHASE5-PROD-BASELINE-001) |
| **Repo ↔ Production TDL runtime delta** | **NONE** — `2b54a357…` → `0b44b146…` is docs-only |
| **TDL-OQ-001 … TDL-OQ-010** | **All RESOLVED** (see [research/OPEN_QUESTIONS.md](research/OPEN_QUESTIONS.md)) |
| **FSM rows @ Production** | 6 — all `RESTING`, 0 active, 0 locked; scheduler-eligible cohort 6 |
| **Snapshot polling** | **ACTIVITY_TIERED** — scheduler tick 30 s ≠ per-vehicle poll every 30 s |
| **R9 provider authorized cohort** | 5/5 speed+ignition (carried forward from TDL-EVID-OQ009-R9-INGRESS-001); 1 stale former-fleet mirror (DIM-GAP-005) |
| **Qualified Stop V1** | 300 000 ms `CANONICAL_DEFAULT` on Production; acceptance **`PASS_WITH_EVIDENCE_GAPS`** |
| **Natural R9 wake** | Historical start wake proven (KS MS 661); recent fleet KPIs not measured (TDL-GAP-013) |

## Live FSM (`VehicleTripDetectionState.state`)

| Graph node | State | Role |
|------------|-------|------|
| `TDL-STATE-RESTING-001` | `RESTING` | Initial (lazy row, Prisma default) + terminal rest |
| `TDL-STATE-POSSIBLE-START-001` | `POSSIBLE_START` | Start candidate; no trip row |
| `TDL-STATE-ACTIVE-TRIP-001` | `ACTIVE_TRIP` | ONGOING trip referenced by `activeTripId` |
| `TDL-STATE-IDLE-WITHIN-TRIP-001` | `IDLE_WITHIN_TRIP` | Pause within ONGOING trip |
| `TDL-STATE-POSSIBLE-END-001` | `POSSIBLE_END` | End candidate; only state from which FINALIZE commits |
| `TDL-STATE-ENDED-001` | `ENDED` | **`SCHEMA_COMPAT_ONLY` / `NOT_RUNTIME_REACHABLE`** — zero transitions (TDL-DEC-OQ005-001) |

Sole state writer: `TripDetectionOrchestrationService.transitionState` (TDL-INV-FSM-SINGLE-STATE-WRITER-001).

### Transitions (`transitions_to` edges in [`graph/edges.yaml`](graph/edges.yaml))

| ID | From → To | Trigger (summary) |
|----|-----------|-------------------|
| TDL-TR-001 | RESTING → POSSIBLE_START | Snapshot job → `evaluateSnapshotForTripStart` |
| TDL-TR-002 | POSSIBLE_START → ACTIVE_TRIP | PS confirmation → `createTrip` / `reopenTripForMerge`; recovery ADOPT |
| TDL-TR-003 | POSSIBLE_START → RESTING | `CONFIRM_MAX_WAIT_MS` timeout |
| TDL-TR-004 | ACTIVE_TRIP → IDLE_WITHIN_TRIP | Continuity IDLE |
| TDL-TR-005 | IDLE_WITHIN_TRIP → ACTIVE_TRIP | Continuity ACTIVE; QS split repoint; recovery |
| TDL-TR-006 | ACTIVE_TRIP → ACTIVE_TRIP | Same-state: metrics, empty-core deferral, QS split repoint |
| TDL-TR-007 | IDLE_WITHIN_TRIP → IDLE_WITHIN_TRIP | Same-state: pause refresh, empty-core deferral |
| TDL-TR-008 | ACTIVE_TRIP → POSSIBLE_END | Continuity POSSIBLE_END; stop boundary / provider silence; CH assist |
| TDL-TR-009 | IDLE_WITHIN_TRIP → POSSIBLE_END | Same as TR-008 |
| TDL-TR-010 | POSSIBLE_END → ACTIVE_TRIP | Resume after boundary; CUSUM ongoing; CH skip-resume; recovery |
| TDL-TR-011 | POSSIBLE_END → POSSIBLE_END | Same-state: clock durability, EV evidence, inconclusive, validated, fallback |
| TDL-TR-012 | POSSIBLE_END → RESTING | Admitted FINALIZE → `finalizeTrip` / `discardTrip`; RESET_TO_RESTING |
| TDL-TR-013 | ACTIVE_TRIP → RESTING | Missing pointer / RESET_TO_RESTING (terminal trip) |
| TDL-TR-014 | IDLE_WITHIN_TRIP → RESTING | Same as TR-013 |

**14 transitions** (11 state-changing + 3 same-state). Verified absent: RESTING → ACTIVE_TRIP (`CONFLICT_MISMATCH`, fail closed), ACTIVE_TRIP/IDLE → POSSIBLE_START, POSSIBLE_START → POSSIBLE_END, FINALIZE from ACTIVE_TRIP (`stale_active_trip`), any transition to/from `ENDED`. Full guard / authority / queue / recovery columns: Phase 5 evidence record.

## Execution graph

```
DIMO trigger → DimoWebhookController [DIMO boundary] → SnapshotWakeIntakeService → Redis pending mailbox
  → SnapshotWakeCoordinatorService (coalesce; successor mailbox) → snapshot.wake.handoff → SnapshotWakeHandoffProcessor
DimoSnapshotScheduler @30s leader-gated ACTIVITY_TIERED ─┐
wake coordinator / handoff worker ───────────────────────┴→ dimo.snapshot.poll (snapshot-{vehicleId})
  → DimoSnapshotProcessor → VehicleLatestState → evaluateSnapshotForTripStart (TR-001)
  → dimo.trip-tracking → TripTrackingProcessor
       POSSIBLE_START → processPossibleStart · ACTIVE_TICK → processActiveTick
       POSSIBLE_END_CHECK → processPossibleEndCheck · END_VALIDATION → processEndValidation · FINALIZE → processFinalize
  → resolvers (start policy, continuity, CUSUM end, CH end assist, mid-gap split) — pure
  → TripDecisionEngine (sole VehicleTrip lifecycle writer) + transitionState (sole FSM writer)
Recovery: TripTrackingRecoveryScheduler 120 s · lifecycle invariant ADOPT/REPOINT/RESET · TripReconciliationScheduler 15 min / 4 h / 03:00
          · SnapshotWakeHandoffRecoveryScheduler 60 s · BoundaryRefreshLifecycleService · empty-core bounded backoff
```

## Module boundaries

| Boundary | Direction | Graph |
|----------|-----------|-------|
| DIMO Integration webhook + segments transport | Upstream provider evidence | `TDL-PIPE-DIMO-WEBHOOK-BOUNDARY-001`, `TDL-DATA-DIMO-SEGMENTS-001` |
| DIMO segments → repair only | Evidence, never live boundary | `TDL-AUTH-DIMO-SEGMENT-EVIDENCE-001`, TDL-INV-DIMO-SEGMENT-EVIDENCE-ONLY-001 |
| Driving Intelligence V2 | Downstream of COMPLETED | `TDL-CONS-DI-V2-001` |
| Automatic Trip Enrichment legacy HF | Downstream of COMPLETED (parallel) | `TDL-CONS-ATE-LEGACY-001` |
| Trip metadata (assignment, tire usage) | Downstream readers | `TDL-CONS-TRIP-METADATA-001` |
| Route V2 artifacts | TDL-owned; 3 downstream callers | `TDL-ORCH-ROUTE-ARTIFACT-001` → `TDL-RES-MAPBOX-CHUNK-MATCH-001` |

Downstream consumers are never lifecycle writers (TDL-INV-DOWNSTREAM-NOT-LIFECYCLE-WRITER-001). Qualified Stop 300 000 ms (TDL-INV-QS-V1-DURATION-001) and `MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS=180` (TDL-INV-UNCOVERED-SPAN-SEPARATE-001) are separate authorities.

**OQ-010 productive paths:** 41 — 14 `GRAPH_MAPPED`, 27 `BOUNDARY_MAPPED`, 0 unmapped (`oq010_paths` on nodes; validator-enforced).

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

## R10–R12 end-cycle flow (present in Production `2b54a357…`)

```
POSSIBLE_END (possibleEndEnteredAt clocked; clock durability reconciled)
  → END_VALIDATION / FINALIZE jobs carry endCycleToken = possibleEndEnteredAt ISO
  → scheduleFinalize recycles waiting stable jobId before enqueue
  → resume (credible post-boundary motion only) cancels pending ev/fin jobs
  → processFinalize admission: token match OR legacy tokenless requestedAt >= enteredAt; never from ACTIVE_TRIP
  → TripDecisionEngine.finalizeTrip → tripStatus=COMPLETED + FSM RESTING + activeTripId=null
```

## Decision index

| ID | Title | STATUS |
|----|-------|--------|
| TDL-DEC-P1-001 | Single lifecycle writer + FSM persistence split | VALIDATED |
| TDL-DEC-R1R8-001 | R1–R8 FSM behavioral contracts (consolidated) | VALIDATED |
| TDL-DEC-R9-001 | R9 adaptive polling wake subsystem | VALIDATED |
| TDL-DEC-R9A-001 | Durable-first wake mailboxes | VALIDATED |
| TDL-DEC-R9B-001 | Handoff rearm without self-coalescing | VALIDATED |
| TDL-DEC-R9C-001 | Generation-1 probe terminal bound | VALIDATED |
| TDL-DEC-R9D-001 | Continuation RESTING + eligibility | VALIDATED |
| TDL-DEC-R9E-001 | UNKNOWN defer + obsolete CAS | VALIDATED |
| TDL-DEC-R9F-001 | UNKNOWN bounded retry completeness | VALIDATED |
| TDL-DEC-R9-CX-001 | DIMO webhook → Trip wake delegation boundary | VALIDATED |
| TDL-DEC-R10-001 | End-boundary-anchored activity resume + stale finalize guards | VALIDATED |
| TDL-DEC-R10-002 | Legacy tokenless FINALIZE admission without silent token assignment | VALIDATED |
| TDL-DEC-R11-001 | Empty-core evidence contract (pause, provider anchor, stop boundary) | VALIDATED |
| TDL-DEC-R12-001 | Provider-time stop boundary + boundary-backed end liveness | VALIDATED |
| TDL-DEC-QS-V1-001 | Qualified Stop Contract V1 — 300_000 ms shared same-trip/split authority | VALIDATED (Production **`PASS_WITH_EVIDENCE_GAPS`**) |
| TDL-DEC-ROUTE-V2-001 | Route V2 chunked matching authority | VALIDATED |
| TDL-DEC-OQ001-001 | COMPLETED → DI V2 handoff via post-finalize producer + PG job ledger | VALIDATED (**`RESOLVED_WITH_BOUNDED_GAPS`**) |
| TDL-DEC-OQ002-001 | drive-profile ownership — Battery V2 owns | VALIDATED |
| TDL-DEC-OQ003-001 | Detection-state vs tracking-run cardinality | VALIDATED (**`RESOLVED_EXPECTED_CARDINALITY`**) |
| TDL-DEC-OQ004-001 | Route artifact coverage policy | VALIDATED |
| TDL-DEC-OQ005-001 | `TripDetectionState.ENDED` historical compat; RESTING terminal FSM | VALIDATED (**`ENDED_HISTORICAL_COMPAT_ONLY`**) |
| TDL-DEC-OQ006-001 | DIMO segment vs live FSM boundary authority (repair evidence, not live override) | VALIDATED (**`RESOLVED_WITH_BOUNDED_GAPS`**) |
| TDL-DEC-OQ007-001 | R1–R8 Production validation coverage | VALIDATED (**`RESOLVED_BY_SCOPE_REDUCTION`**) |
| TDL-DEC-OQ008-001 | Trip runtime-control matrix (defaults vs Production effective) | VALIDATED |
| TDL-DEC-OQ009-001 | Tiered polling + R9 provider-wake ingress contract | VALIDATED (**`RESOLVED_INGRESS_CONTRACT_ALIGNED`**) |
| TDL-DEC-OQ010-001 | Legacy/duplicate trip runtime path inventory — dual post-finalize pipelines | VALIDATED (**`RESOLVED_WITH_BOUNDED_DEBT`**) |
| TDL-DEC-PHASE5-001 | Promote authority to `AUTHORITY_ACTIVE` (Gate A 17/17) | VALIDATED |

Detail: [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md)

## Supporting evidence (non-canonical routing)

- [`docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md`](../../docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md) — R9A–R9F implementation record
- [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) — provider wiring PASS (cross-module)

## Explicit non-blocking limitations

- QS V1 `PASS_WITH_EVIDENCE_GAPS` — no natural > 300 s split observed
- TDL-GAP-005 ClickHouse mirror contents · TDL-GAP-008 Route V2 handler artifact contract · TDL-GAP-013 recent R9 wake rates · TDL-GAP-014 natural LTE empty-core re-drive · TDL-GAP-015 VLS per-field freshness
- TDL-CX-005 `PROPOSED` repair backlog without expiry/review path · TDL-CX-006 neighbor wording on DIMO segment role
- `ENDED` enum label retained (optional enum migration) · dual post-finalize pipelines (TDL-DEC-OQ010-001) · R10–R12 `VALIDATED`, not `PRODUCTION_VALIDATED`
