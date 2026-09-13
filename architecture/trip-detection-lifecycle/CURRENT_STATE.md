# Trip Detection & Lifecycle — Current State (Partial, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **origin/main baseline (historical @ R9 rebase)** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **does not contain R9** |
| **origin/main (current @ R12 hardening #1594 merged)** | `f4109e34c24f1eb497e2023f4b4bb997abfc159f` — **CI_VALIDATED** (Trip FSM run 34424546044); **NOT_DEPLOYED** |
| **origin/main (historical @ evidence auth)** | `32526c95a6ae6fae930fd048072dccfc19b30516` — includes R11 merged via #1584 |
| **origin/main (at R11 deploy)** | `0b91dcd96f68164282a38458242fe8489e0b3b82` — **not deployed** (frozen target used) |
| **R9 audit branch (historical)** | `1186e9d23a9b07e24da17b06a72f2614038db77a` — pre-merge audit baseline |
| **Production baseline (current @ POST-#1627 deploy)** | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` @ `/opt/synqdrive/releases/20260913074250_v4994` (#1627 merged 2026-09-13) |
| **Production baseline (historical — PRE_HARDENING_R12)** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` @ `/opt/synqdrive/releases/20260909190912_v4994` (R12 deploy 2026-09-09) — **does not include #1594 hardening** |
| **Pre-R12 Production (historical)** | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` @ `/opt/synqdrive/releases/20260909024150_v4994` (R11 deploy 2026-09-09) |
| **Pre-R11 Production (historical)** | `68495041974135f7c6565fd5b836b3e2f9176fae` @ `20260908172927_v4994` (R10 deploy 2026-09-08) |
| **Pre-R10 Production (historical)** | `7b9a785710fdb4b2c620514de2e8afc0923a5b6a` @ `20260908045043_v4994` |
| **Last verified Production evidence** | `2026-09-13T10:44:09Z` (POST-#1627 WOB L 7503 acceptance TDL-EVID-R12-WOB7503-POST-1627-001 @ `9a32685d…` — **FAIL**); prior R12 pre-hardening deploy @ `157b3c722…` remains historical |
| **Epistemic policy** | Claims separated below — do not merge axes |

## Authority axes (mandatory separation — do not conflate)

| Axis | SHA / status | Classification |
|------|--------------|----------------|
| **R12_HARDENED_CODE_ON_MAIN** | `f4109e34…` (#1594 merged) | **CI_VALIDATED** — main push run 34424546044 |
| **PRE_HARDENING_R12_PRODUCTION_DEPLOYED** | `157b3c722…` @ `20260909190912_v4994` | **DEPLOYED** / **POST_DEPLOY_HEALTH_CONFIRMED** — TDL-EV-R12-PROD-DEPLOY-001 |
| **R12_HARDENED_PRODUCTION_DEPLOYED** | — | **NOT YET CONFIRMED** — no deploy evidence for `f4109e34…` |
| **R12_HARDENED_PRODUCTION_BEHAVIOR_VALIDATED** | — | **NOT YET CONFIRMED** — no natural-drive acceptance on hardened production SHA |

## Phase status (this document)

Phase **1** documents an **initial consolidated baseline** — not a claim that repository audit is fully complete. Outstanding gaps include dead/legacy inventory, full feature-flag matrix, Mapbox/FMM failure taxonomy, and Driving Intelligence handoff.

---

## CONFIRMED — origin/main baseline @ `a47255148…`

### Module entry points

| Surface | Path / symbol |
|---------|----------------|
| Live orchestration | `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` |
| Lifecycle authority | `backend/src/modules/vehicle-intelligence/trips/decision/trip-decision.engine.ts` |
| Ownership invariants (P1) | `backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts` |
| Types / triggers | `backend/src/modules/vehicle-intelligence/trips/trip-detection.types.ts` |
| Nest wiring | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts` |
| Worker wiring | `backend/src/workers/workers.module.ts` |
| Snapshot ingress | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Trip execution loop | `backend/src/workers/processors/trip-tracking.processor.ts` |
| Snapshot scheduler | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` |
| Tracking recovery | `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.ts` |
| Reconciliation scheduler | `backend/src/workers/schedulers/trip-reconciliation.scheduler.ts` |
| Reconciliation/repair | `backend/src/modules/vehicle-intelligence/trips/reconciliation/` |
| Route artifacts | `backend/src/modules/vehicle-intelligence/trips/route-artifact/` (Route V2) |
| Trip API | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` (`GET trips*`) |
| Rental UI | `frontend/src/rental/components/trips/`, `frontend/src/rental/components/TripsView.tsx` |
| Metrics | `backend/src/modules/observability/trip-metrics.service.ts` (+ R8 forensic utils on `main`) |

~249 TypeScript files under `backend/src/modules/vehicle-intelligence/trips/`.

### Persistent FSM model (`VehicleTripDetectionState`)

Prisma enum `TripDetectionState`:

| State | Role on `main` |
|-------|----------------|
| `RESTING` | Default terminal; post-finalize reset |
| `POSSIBLE_START` | Start candidate (no trip row yet) |
| `ACTIVE_TRIP` | Confirmed movement trip |
| `IDLE_WITHIN_TRIP` | Stopped but trip still open |
| `POSSIBLE_END` | End candidate (trip still ONGOING) |
| `ENDED` | **Schema-only — no runtime writer** (zero `TripDetectionState.ENDED` in `trips/`) |

Successful finalize → **`RESTING`**, not `ENDED` (TDL-EV-P2-001 + code reconfirmation).

### BullMQ execution phases (not persisted as FSM state)

From `TRIP_TRACKING_TRIGGERS` in `trip-detection.types.ts`:

| Trigger | Processor phase |
|---------|-----------------|
| `POSSIBLE_START` | Start validation window |
| `ACTIVE_TICK` | In-trip metric + route sampling |
| `POSSIBLE_END_CHECK` | End candidacy |
| `END_VALIDATION` | CUSUM / classifier validation |
| `FINALIZE` | Terminal lifecycle commit |

### Queues & workers

| Queue | Name | Role |
|-------|------|------|
| Snapshot poll | `dimo.snapshot.poll` | DIMO snapshot fetch → start evaluation |
| Trip tracking | `dimo.trip-tracking` | Self-scheduling FSM execution loop |

Related downstream (not owned): `trip.behavior.enrichment`, `trip.driving-impact.compute`, `driving.intelligence.jobs`.

### Decision engine & lifecycle

- **`TripDecisionEngine`** sole writer of `vehicleTrip.tripStatus` (TDL-EV-P1-001)
- Repair layer routes lifecycle mutations through decision engine

### Persistence (Prisma)

| Model | Purpose |
|-------|---------|
| `VehicleTrip` | Canonical trip row + enrichment/analysis status fields |
| `VehicleTripDetectionState` | Live FSM row (1:1 vehicle) |
| `VehicleTripTrackingRun` | Execution forensics |
| `TripRepair` | Repair audit trail |
| `VehicleTripWaypoint` | Raw route observations |
| `VehicleTripRouteArtifact` | Canonical route artifact (Route V2) |

### Remediation on `main`

R1–R8 merged through #1549 on `origin/main`. R9 merged via #1553 @ `4bef60463…` (see R9 section below).

---

## CONFIRMED — R9 runtime on main (@ `4bef60463…`)

**Epistemic note:** R9 code merged to `origin/main` via #1553. **Current known Production** is **not** @ `0ba96e03…` — see authority axes above (`157b3c722…` pre-hardening R12). Historical R9 Production snapshot @ `0ba96e03…` preserved below. Provider speed/ignition trigger wiring **validated** on that historical release (5/5 active cohort — see TDL-EV-R9-CANARY-001). **Natural wake delivery not yet validated.**

### R9 wake subsystem entry points

| Surface | Path / symbol |
|---------|----------------|
| Wake intake | `backend/src/workers/snapshot-wake/snapshot-wake-intake.service.ts` (`SnapshotWakeIntakeService`) |
| Wake coordinator | `backend/src/workers/snapshot-wake/snapshot-wake-coordinator.service.ts` (`SnapshotWakeCoordinatorService`) |
| Nest wiring | `backend/src/workers/snapshot-wake/snapshot-wake.module.ts` |
| Handoff processor | `backend/src/workers/processors/snapshot-wake-handoff.processor.ts` |
| Redis scripts | `backend/src/workers/snapshot-wake/snapshot-wake-redis.scripts.ts` |
| DIMO webhook wiring | `backend/src/modules/dimo/dimo-webhook.controller.ts` (delegates eligible wakes to intake; provider gateway owned by [DIMO Integration](../dimo-integration/)) |

**R9 architecture (confirmed on main @ `4bef60463…`; historical Production deploy @ `0ba96e03…` — superseded):**

- Durable **pending** and **successor** Redis mailboxes with monotonic version merge
- Coalesce while canonical `snapshot-{vehicleId}` job is **QUEUED** or **ACTIVE**
- **Handoff never provider-fetches** — `snapshot.wake.handoff` dispatches canonical `dimo.snapshot.poll` enqueue only
- **Continuation** when FSM is **RESTING** and vehicle is wake-eligible (AVAILABLE/RENTED, DIMO CONNECTED)
- **UNKNOWN** wake classification → bounded retry before retirement
- **Coalesce delivery contract:** ACTIVE/UNKNOWN coalesce returns `PERSIST_FAILED` / `QUEUE_FAILED` when successor/handoff consumer cannot be scheduled — never false `COALESCED`
- **scheduleDurableSuccessor:** persist failures → `PERSIST_FAILED`; enqueue failures → `QUEUE_FAILED`
- **Successor handoff orphan recovery (R9H):** `SnapshotWakeHandoffRecoveryScheduler` leader-gated `@Interval(60s)` — at most one Redis SCAN/tick; `scanCursor` assigned to Redis `nextCursor` on fetch; `pendingBatchKeys` carries unprocessed SCAN tail across ticks; max 50 keys/tick, per-key error isolation, idempotent `enqueueHandoffJob()`; no provider fetch; no LONG_IDLE dependency
- **Generation-0 bounded consumer:** after R9H, accepted generation-0 wakes with successful successor persist eventually gain a runnable handoff consumer via initial enqueue or recovery re-arm (latency bounded by recovery tick + SCAN cursor, not instantaneous on `QUEUE_FAILED`)
- Cross-module contract: DIMO webhook → Trip wake intake; DIMO does **not** own Trip FSM (see TDL-DEC-R9-CX-001, [DIMO Integration](../dimo-integration/decisions/DECISION_REGISTER.md) DIM-DEC-R9-001)

See [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md) TDL-EV-R9-*.

---

## CONFIRMED — Current known Production state (read-only)

**Current known Production authority:** `157b3c72226869e4e35d1a9398b78cab50d3fa54` @ `/opt/synqdrive/releases/20260909190912_v4994` — **PRE_HARDENING_R12** (does not include #1594 hardening).

Canonical detailed evidence: [R12_PRODUCTION_DEPLOY_2026-09-09.md](evidence/R12_PRODUCTION_DEPLOY_2026-09-09.md) (**TDL-EV-R12-PROD-DEPLOY-001** @ `2026-09-09T19:26:03Z`).

Chronological baseline index: [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md).

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path | `157b3c722…` @ `20260909190912_v4994` | TDL-EV-R12-PROD-DEPLOY-001 |
| Classification | DEPLOYED / CI_VALIDATED / POST_DEPLOY_HEALTH_CONFIRMED | TDL-EV-R12-PROD-DEPLOY-001 |
| Behavior validation | **NOT PRODUCTION_BEHAVIOR_VALIDATED** | TDL-EV-R12-PROD-DEPLOY-001 |
| KS MS 661 post-deploy T0 | ACTIVE_TRIP — **PHYSICAL_TEST_READY=NO** | TDL-EV-R12-PROD-DEPLOY-001 Gate 9 |

---

## HISTORICAL — R9 Production / canary @ `0ba96e03…`

**Not current Production.** Superseded by R10 → R11 → R12 deploy chain; **current known Production** is `157b3c722…`.

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path (historical @ R9) | `0ba96e03…` @ `20260907204434_v4994` | TDL-EV-R9-CANARY-001; [PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) |
| R9 runtime | **Was deployed** on this historical release | DIMO cross-ref; TDL-EV-R9-CODE-001 |
| Provider trigger wiring (canary) | **PASS** — 5/5 speed+ignition; tokenId **190497** excluded | TDL-EV-R9-CANARY-001 @ `2026-09-07T22:35:00Z` |
| Natural R9 wake delivery | **Not validated** | TDL-EV-R9-CANARY-001; NEXT_GATE `NATURAL_R9_WAKE_OBSERVATION` |

**Do not attribute** the frozen `2026-09-06T23:47:41Z` aggregate counts (FSM, trips, PM2, Redis, route artifacts, tracking runs) to this SHA — those belong to the pre-R9 release @ `01541c2ab…` below.

---

## HISTORICAL — Pre-R9 read-only Production snapshot @ `01541c2ab…`

**Not current Production.** Frozen read-only session @ **`2026-09-06T23:47:41Z`** on release `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994`. At this session R8/R9 were **NOT_ON_PRODUCTION**.

See [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) § Historical Production session.

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path (historical) | `01541c2ab…` @ `20260906213654_v4994` | TDL-EV-PROD-001 @ `2026-09-06T23:47:41Z` |
| Health | HTTP 200 | TDL-EV-PROD-002 @ `2026-09-06T23:47:41Z` |
| PM2 / Node processes | Two Node PIDs (`3789590`, `3789796`); apps `synqdrive` + `synqdrive-b`, each `instances=1` | TDL-EV-PROD-003 @ `2026-09-06T23:47:41Z` |
| FSM states | 6 × RESTING | TDL-EV-PROD-005 @ `2026-09-06T23:47:41Z` |
| Trips | 1994 COMPLETED, 18 CANCELLED, 0 ONGOING | TDL-EV-PROD-006 @ `2026-09-06T23:47:41Z` |
| Route artifacts | 94 | TDL-EV-PROD-007 @ `2026-09-06T23:47:41Z` |
| Tracking runs (7d) | 6964 PS validation, 3753 PEC, 1842 active, 53 finalize, 2 end validation | TDL-EV-PROD-009 @ `2026-09-06T23:47:41Z` |
| Redis key prefixes | snapshot 5, trip-tracking 7 | TDL-EV-PROD-004 @ `2026-09-06T23:47:41Z` |

**Topology wording (historical @ `2026-09-06T23:47:41Z`):** two distinct PM2 application names, each `instances=1`. **Not** described as replicas of a single PM2 application; trip-worker role split was **not** verified beyond PID correlation.

---

## INFERRED behavior

| Inference | Basis |
|-----------|-------|
| Small telematics cohort drives live FSM rows (historical @ `01541c2ab…` session) | TDL-EV-PROD-005 vs PROD-009 @ `2026-09-06T23:47:41Z` |
| Reconciliation scans broader history than live FSM (historical session) | TDL-EV-PROD-008 vs PROD-006 @ `2026-09-06T23:47:41Z` |
| Production trip FSM R8/R9 deploy (historical) | R8/R9 **were deployed** @ `0ba96e03…` (historical); superseded by R10→R11→R12; current known Production @ `157b3c722…` |
| Natural trip processing active (historical session inference) | TDL-EV-PROD-009 @ `2026-09-06T23:47:41Z` — not current fleet state |

---

## HISTORICAL evidence

- P2–P5 audit Production SSH/SQL failure notes (superseded by 2026-09-06 Production baseline)
- Pre-R1 gap inventories in P4/P5/P6 (closed on `main` via R1–R8)

---

## UNKNOWN facts

- Exact COMPLETED → Driving Intelligence durable handoff (TDL-OQ-001)
- `drive-profile/` ownership (TDL-OQ-002)
- ClickHouse trip-assist runtime on Production
- Complete trip feature-flag matrix
- Full dead/legacy/competing path inventory (**Phase 1 incomplete**)
- Mapbox/FMM failure taxonomy (**Phase 1 incomplete**)

---

## CONTRADICTED claims

| Claim | Conflict |
|-------|----------|
| "Two backend replicas" without role proof | Contradicts TDL-EV-PROD-003 precision | **RESOLVED** — wording corrected; not called replicas |

See [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md).

---

## Explicit non-claims

- Production validation of R1–R8 (separate from repo/test evidence)
- Production validation of R9 adaptive polling wake — **runtime deployed** @ `684950419…` (R10 release); **provider trigger wiring validated** (5/5 canary); **natural start wake partially observed** on KS MS 661 tokenId 187361 (TDL-EVID-KS-MS-661-001); efficiency vs polling-only **not proven**
- Natural R9 wake delivery — **PARTIAL** (start wake observed KS MS 661 @ `684950419…`); in-trip/end-path wake and archived webhook payloads remain **OPEN** (DIM-GAP-006 / TDL-GAP-013)
- R10 motor-off pause / finalize guards — **deployed** @ `684950419…` (TDL-EV-R10-PROD-DEPLOY-001); **NOT exercised** on KS MS 661 (0× `POSSIBLE_END`); TDL-DEC-R10-001/002 remain **not** `PRODUCTION_VALIDATED`
- TDL-DEC-R11-001 — **deployed** @ `f7eb94cb…` (`20260909024150_v4994`, TDL-EV-R11-PROD-DEPLOY-001); **CI_VALIDATED**; **POST_DEPLOY_HEALTH_CONFIRMED**; natural end-path **NOT validated** on KS MS 661 (TDL-EVID-KS-MS-661-R11-NATURAL-001: Axis E **FAIL**, `stopBoundaryAt` null, 0× POSSIBLE_END); post-audit STALE_ONGOING @ 06:51:54Z
- TDL-DEC-R12-001 — **PRE_HARDENING_R12_PRODUCTION_DEPLOYED** @ `157b3c722…` (`20260909190912_v4994`, TDL-EV-R12-PROD-DEPLOY-001); **CI_VALIDATED** (run 34387586390); **POST_DEPLOY_HEALTH_CONFIRMED**; **NOT PRODUCTION_BEHAVIOR_VALIDATED**; KS MS 661 post-deploy T0 **PHYSICAL_TEST_READY=NO**
- TDL-DEC-R12 pre-drive hardening (#1594) — **R12_HARDENED_CODE_ON_MAIN** @ `f4109e34…` **MERGED**; **CI_VALIDATED** (main push run 34424546044); closes AUD-002/003/004/007; **R12_HARDENED_PRODUCTION_DEPLOYED = NOT YET CONFIRMED**; **R12_HARDENED_PRODUCTION_BEHAVIOR_VALIDATED = NOT YET CONFIRMED**
- PR #1600 end-cycle hardening — **MERGED**; PE clock durability **PRODUCTION_PROVEN** on drive `fc93f98f…`; POST-#1600 defect class documented (TDL-EVID-R12-KS661-DISPATCH-GAP-001); trip `fc93f98f…` **NOT repaired**
- PR #1603 PEC→EV lock-order fix — **MERGED** @ `9e3a5a19c`; **DEPLOYED** @ `9a32685d…` (`20260913074250_v4994`); **#1603 failure class NOT reproduced** on POST-#1627 WOB drive (0× EV — end cycle never entered)
- PR #1617 CUSUM boundary preservation — **DEPLOYED** @ `9a32685d…`; **NOT exercised** on POST-#1627 WOB drive (no CUSUM runs)
- PR #1627 retry-budget preservation — **MERGED + DEPLOYED** @ `9a32685d…` (`20260913074250_v4994`, TDL-EV-R12-PROD-DEPLOY-002); **CI_VALIDATED**; **POST-#1627 physical acceptance FAIL** on WOB L 7503 (TDL-EVID-R12-WOB7503-POST-1627-001): 0× END_VALIDATION; trip `aaedd4a5…` **ONGOING** @ audit; `live_mid_trip_gap_split` **reproduced**; empty-core/stale-VLS blocked end entry — **#1627 retry budget not physically proven**
- WOB L 7503 POST-#1617 drive (historical) — **FAIL** @ `a8320f2ca…` — `END_VALIDATION_RETRY_BUDGET_RESET_LOOP` (17× EV, 0× FINALIZE); trip `4083e24c…` **STALE_ONGOING** repaired 2026-09-12 — preserved unchanged
- KS MS 661 **2026-09-09** natural drive (`3b26019d…`) — **ONGOING** @ audit; end path blocked (empty-core + stale VLS); historical 2026-09-08 trip (`e324ee8c…`) completed via **`STALE_ONGOING` repair** — separate incident (TDL-EVID-KS-MS-661-001)
- Promotion to `AUTHORITY_ACTIVE`
- Complete machine-readable FSM graph (Phase 4 partial — R9 wake subgraph indexed; full FSM graph incomplete)
- Resolved DIMO Integration vs trip reconciliation ownership (partial — DIMO authority bootstrapped; segment split gaps remain TDL-CX-006 / DIM-GAP-001)

---

## Ownership boundaries (preliminary)

| Owner | Scope |
|-------|-------|
| **Trip Detection & Lifecycle** | Live FSM, start/end detection, tracking queue, boundary persistence, recovery/reconciliation, route artifacts |
| **Driving Intelligence** | Post-trip behavior — consumes boundaries |
| **KG-ATE** | Post-finalize enrichment |
| **KG-EED** | REFUEL/RECHARGE |
| **Scaling Process** | Leader election, DIMO budget, generic mutex |
| **Battery V2** | Downstream trip hooks |
| **DIMO Integration** | Provider transport/auth/webhook gateway ([`architecture/dimo-integration/`](../dimo-integration/), `AUDIT_IN_PROGRESS`) — R9 webhook wiring documented on both authorities |

**Open:** COMPLETED handoff to DI; `drive-profile/` ownership.
