# TDL-OQ-007 — R1–R8 Production Validation Coverage (Read-Only Authority Audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ007-R1R8-COV-001 |
| **Audit date (UTC)** | 2026-09-25 |
| **REPO_CURRENT** | `bca9579a1c32ebac23cb8d696870b011a76d30dd` (`origin/main` after #1769) |
| **PRODUCTION_CURRENT** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `LIVE_RELEASE_ID=20260924235024_v4994` |
| **Production observation (this audit)** | `2026-09-25T12:30:42Z` — release symlink + read-only SQL; **addendum** `2026-09-25T12:41:04Z` passive gap probes |
| **AUDIT_MODE** | **READ_ONLY** — no deploy, restart, env/flag change, DB/Redis/BullMQ mutation, enqueue, or synthetic trips |
| **Verdict (OQ-007)** | **`PARTIALLY_RESOLVED_ACTIVE_GAPS`** (see Phase 14–16; PR #1777 consistency correction) |

## Mandatory axis separation

| Axis | Meaning in this audit |
|------|------------------------|
| **MERGED_ON_MAIN** | Remediation commit reachable from `origin/main` |
| **PRODUCTION_PRESENT** | Current Production release ancestry contains the **current** code path for the behavior |
| **PRODUCTION_VALIDATED** | Natural Production observation proves **today’s** success/failure signature for an **active** contract |

**R1–R8 historical package validation ≠ current FSM behavioral production validation.**

---

## Phase 1 — R1–R8 package reconstruction (from P6 + merge SHAs + implementation artifacts)

| R | Merge PR | Merge SHA | Original defect class (P6) | Behavior contract (summary) | Primary runtime files | Test authority | Production evidence @ merge time | Later changes touching same contract |
|---|----------|-----------|----------------------------|----------------------------|-------------------------|----------------|----------------------------------|--------------------------------------|
| **R1** | #1538 | `8ddf73e562cc5fbe2e88056836bfd0b7ca493411` | P4-F02, P5-F02/F14, clock group A | Event-time vs worker-time field split on FSM clocks + movement anchor | `trip-fsm-clock-contract.ts`, orchestration writers | R1 artifact + clock unit tests | **NONE** (deploy not performed @ R1) | R10–R12 end clocks; QS pause uses same movement anchors |
| **R2** | #1539 | `ff95395d61706556643fe0d83c0e0e85c8f7ef63` | P4-F06/F10, P5-F05, B-group | Lifecycle orphan recovery (ADOPT / RESET / REPOINT) | `trip-lifecycle-invariant.ts`, `trip-lifecycle-recovery.service.ts`, orchestration preflight | `trip-lifecycle-invariant.spec.ts`, recovery specs | **NONE** | #1600 lock arbitration; #1603 EV defer; R7 enqueue patterns |
| **R3** | #1540 | `12a5fdac9e034aa445825e5c9f4318444a9612b3` | P4-F11/F12 | Start liveness: ACTIVE_TICK before battery await; PS errors propagate | `trip-detection-orchestration.service.ts` (confirm path) | R3 artifact scenarios | **NONE** | **R9** wake ingress (additive primary path) |
| **R4** | #1542 | `eb51d8f807347514e7499dec5986b745ec1dc134` | P4-F01/F03/F09 | Start confirm/scoring + merge/reopen anchor consistency | orchestration start evaluation, merge paths | R4 artifact + start tests | **NONE** | R9 snapshot evidence; QS merge/reopen alignment (#1753) |
| **R5** | #1543 | `4cd02d7f8b2814c1c5dc773d206f295f94169cf4` | P5-F03/F11/F13, partial P5-F10 | PEC/EV metadata reset, attempt accounting, end anchor hygiene | orchestration PEC/EV phases | R5 artifact + end tests | **NONE** | **R10** end-cycle token; **R11–R12** stop boundary + empty-core; **#1627/#1617/#1674** CUSUM/CH handoff |
| **R6** | #1546 | `de402f7c9b2cccd4706ae30af70bd6347a8730a0` | P5-F04/F09 | Mid-gap split fail-closed (`drift==null`); no post-split fallthrough | mid-gap block orchestration | R6 artifact + split tests | **NONE** | QS 300s threshold (#1753); reconciliation safety net unchanged |
| **R7** | #1547 | `140ebdd33c9102bcacb969ce5bef01b144c4b64a` | P5-F05 | COMPLETED persisted but RESTING transition failed → deterministic repair | `processFinalize`, recovery scheduler | R7 crash-injection tests | **NONE** | Absorbed into R2 recovery matrix + R10 finalize guards |
| **R8** | #1549 | `6ea95124343e15e971220cb0c672239ac4b077d6` | P5-F06/F07/F12, P3-F04 | Recognition latency metrics + forensic timeline metadata | `trip-metrics.service.ts`, orchestration timeline | R8 metric unit tests | **NONE** | #1648 shadow end/pause observability (extends, does not replace) |

Supporting synthesis: [P6 remediation plan](../../../docs/audits/trip-fsm/P6_TARGET_ARCHITECTURE_REMEDIATION_PLAN_2026-09-06.md) (`TDL-EV-P6-001`).

---

## Phase 2 — Survivorship vs R9–R12 and post-R12 hardening

| Later workstream | Effect on R1–R8 contracts |
|------------------|---------------------------|
| **R9** (#1553) | **Supersedes** tiered poll-only RESTING ingress as *primary* liveness path; **hardens** R3/R4 start chain (wake → POSSIBLE_START unchanged confirm semantics) |
| **R10** (#1574) | **Reimplements** end-cycle token + resume/finalize ordering; **supersedes** raw R5 PEC/EV ordering for motor-off false resume class |
| **R11** (#1584) | **Reimplements** empty-core / stop-boundary pause; **supersedes** R5-only empty-core POSSIBLE_END tunnel |
| **R12** (#1591, #1594) | **Reimplements** provider stop boundary + boundary-backed end liveness; **supersedes** pre-R11 end liveness |
| **#1600 / #1603** | **Hardens** R2 + end-cycle lock/handoff (POSSIBLE_END ↔ END_VALIDATION) |
| **#1617** | **Hardens** CUSUM boundary preservation (R5 attempt semantics under R12) |
| **#1627** | **Hardens** POSSIBLE_END retry-budget continuity (R5 accounting) |
| **#1635** | **Hardens** provider-silence liveness with #1627 |
| **#1648** | Shadow observability — **does not replace** R8 metrics contract |
| **#1674** | **Hardens** CH-assist skip resume revalidation (R5/R10 intersection) |
| **#1750 / #1753** | Finalize-quality route evidence + **Qualified Stop V1** — **replaces** short-pause split semantics for IDLE_WITHIN_TRIP (R6/R4 interaction) |

---

## Phase 3 — Behavior identity (active contracts)

Each row: **BEHAVIOR_ID**, owner, code path, test authority, success/failure signatures **as executed today** on Production ancestry.

| BEHAVIOR_ID | Origin | Survivorship | CURRENT_RUNTIME_OWNER | CURRENT_CODE_PATH (indicative) | CURRENT_TEST_AUTHORITY | SUCCESS signature | FAILURE signature |
|-------------|--------|--------------|----------------------|--------------------------------|------------------------|-------------------|-------------------|
| **R1-BEH-001** | R1 | ACTIVE_UNCHANGED | Orchestration + clock contract | `resolveStartCandidateClock`, PS entry writers | R1 + integration start tests | FSM `possibleStartAt` tracks snapshot event time; `possibleStartEnteredAt` = worker entry | Worker time written into `possibleStartAt` |
| **R1-BEH-002** | R1 | ACTIVE_HARDENED | Orchestration + R12 end clocks | `resolvePossibleEndBoundaryCandidate`, stop boundary latch | R12 continuity + finalize postgres specs | `possibleEndAt` event-anchored; entered-at on PE entry | PE clocks cleared without resume/finalize discipline |
| **R1-BEH-003** | R1 | ACTIVE_UNCHANGED | ACTIVE tick | `resolveLatestMeaningfulMovementEventAt` | R1 clock tests | `lastMeaningfulMovementAt` advances only on provider movement timestamps | Movement anchor updated from worker `now` alone |
| **R2-BEH-001** | R2 | ACTIVE_HARDENED | Lifecycle recovery | `evaluateTripLifecycleInvariant` + preflight | `trip-lifecycle-invariant.spec.ts` | Orphan classes → ADOPT/RESET/REPOINT without duplicate create | >1 ONGOING or ambiguous adopt → fail-closed |
| **R2-BEH-002** | R2 | ACTIVE_UNCHANGED | Invariant matrix | CONFLICT_* classes | recovery specs | Scheduler/orchestration refuses silent multi-ONGOING | Duplicate ONGOING rows per vehicle |
| **R3-BEH-001** | R3 | ACTIVE_HARDENED | Confirm path | schedule ACTIVE_TICK before battery proxy | R3 artifact ordering tests | ACTIVE_TICK job scheduled before blocking battery await | Battery await blocks first ACTIVE_TICK |
| **R3-BEH-002** | R3 | ACTIVE_UNCHANGED | PS processor | rethrow after log on PS failure | R3 BullMQ retry tests | PS failures surface retry / recovery | PS exception swallowed → SUCCESS without FSM progress |
| **R4-BEH-001** | R4 | ACTIVE_UNCHANGED | Start evaluation | confirm scoring symmetry | R4 tests | Confirm path uses consistent anchor/score contract | Candidate vs confirm asymmetry false negatives |
| **R4-BEH-002** | R4 | ACTIVE_HARDENED | Merge/reopen + QS | merge/reopen + QS policy alignment (#1753) | QS production acceptance + merge tests | Reopen/merge respects end/start anchors; QS SAME_TRIP when ≤300s | False split on traffic stop (QS regression class) |
| **R5-BEH-001** | R5 | **SUPERSEDED** (PEC/EV core) | — | Pre-R10 PEC step semantics | R5 historical tests | — | — |
| **R5-BEH-002** | R5 | ACTIVE_REIMPLEMENTED | R10–R12 + #1627/#1674 | end-cycle orchestration, CUSUM/CH handoff | R10–R12 CI matrix + #1674 unit/proof | End attempts bounded; metadata reset on resume; boundary preserved | Retry budget reset loop; boundary stripped on CUSUM reopen (pre-#1617 class) |
| **R6-BEH-001** | R6 | ACTIVE_HARDENED | Mid-gap + QS | mid-gap fail-closed + QS threshold | R6 + QS acceptance | `drift==null` → no live split; QS SAME_TRIP short pause | Unguarded live split on unknown drift |
| **R7-BEH-001** | R7 | ACTIVE_REIMPLEMENTED | R2 + finalize | post-finalize RESTING repair enqueue | R7 + R2 recovery tests | COMPLETED + non-RESTING FSM → repair without re-finalize | COMPLETED trip stuck in ACTIVE/PE FSM indefinitely |
| **R8-BEH-001** | R8 | ACTIVE_UNCHANGED | Metrics | `trip-metrics.service.ts` recognition counters | R8 metric tests | Latency histograms populated on recognition transitions | Mislabeled or missing recognition metrics |
| **R8-BEH-002** | R8 | ACTIVE_HARDENED | Forensics + shadow | timeline metadata + #1648 shadow | shadow observability doc | Tracking runs carry forensic fields; shadow enabled on prod | Silent end/pause without observability (shadow evaluates counterfactual only) |
| **R9-LEGACY-POLL** | pre-R9 | **SUPERSEDED** | — | Tiered poll as sole RESTING wake | — | — | — |
| **R5-LEGACY-PEC** | R5 | **SUPERSEDED** | — | R5-only PEC/EV ordering without R10–R12 | — | — | — |

**Total behavior contracts inventoried:** **18** = **14 ACTIVE** + **3 SUPERSEDED** + **1 DEAD** (mutually exclusive status classes in Phase 7 matrix).

---

## Behavior status cardinality (exclusive — Phase 1 reconcile)

Each of the **18** rows in Phase 7 carries **exactly one** terminal status class:

| Status class | Count | Behavior IDs |
|--------------|------:|--------------|
| **PRODUCTION_VALIDATED** | **5** | R2-BEH-001, R2-BEH-002, R4-BEH-002, R6-BEH-001, R8-BEH-002 |
| **VALIDATED_BY_CURRENT_EQUIVALENT** | **5** | R1-BEH-001, R1-BEH-002, R3-BEH-001, R5-BEH-002, R7-BEH-001 |
| **PRODUCTION_PRESENT_NOT_VALIDATED** | **4** | R1-BEH-003, R3-BEH-002, R4-BEH-001, R8-BEH-001 |
| **SUPERSEDED_NO_LONGER_REQUIRES_VALIDATION** | **3** | R5-BEH-001, R9-LEGACY-POLL, R5-LEGACY-PEC |
| **DEAD_NO_LONGER_REQUIRES_VALIDATION** | **1** | TripDetectionState.ENDED writer |
| **TOTAL** | **18** | — |

**Check:** 5 + 5 + 4 + 3 + 1 = **18**. No row appears in more than one class.

**Active contracts:** 5 + 5 + 4 = **14**. Scope reduction removes only the **3 SUPERSEDED** + **1 DEAD** rows from required historical replay; it does **not** remove the **4** active **PRODUCTION_PRESENT_NOT_VALIDATED** rows from OQ-007 obligations.

---

## Phase 2b — Passive evidence addendum (consistency correction @ `2026-09-25T12:41Z`)

Read-only probes before recomputing verdict (no new physical drives):

| BEHAVIOR_ID | Passive probe | Result | Status after probe |
|-------------|---------------|--------|-------------------|
| **R1-BEH-003** | FSM `last_meaningful_movement_at` vs `last_activity_at` (7d); trip `raw_detection_meta` keys | `movement_le_activity_violations=0` (n=1 FSM row with movement in 7d); meta lacks per-tick movement trace — cannot prove ACTIVE_TICK writer used provider event time only | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| **R3-BEH-002** | `vehicle_trip_tracking_runs` `POSSIBLE_START_VALIDATION` errors (14d) | `69` runs with `error_message` (single class: Prisma `dimo_` unique on create); **2** vehicles with fail→success within 2h — proves errors are **persisted**, not proof of BullMQ retry contract for all failure classes | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| **R4-BEH-001** | Completed trips (7d) with `startConfidence` in meta | **72/98** have `startConfidence` — does **not** expose candidate vs confirm scoring decision trace | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| **R8-BEH-001** | `GET http://127.0.0.1:3001/metrics` on VPS | HTTP 200 but **764 B** body; `/api/v1/metrics` → **401** missing bearer — **cannot** verify non-zero `synqdrive_trip_*_recognition_latency_seconds` samples without authorized scrape | **PRODUCTION_PRESENT_NOT_VALIDATED** |

**PASSIVE_EVIDENCE_NEWLY_FOUND:** partial only (R3 error persistence + 2 fail→ok vehicles); **insufficient** to reclassify any of the four gaps to PRODUCTION_VALIDATED or VALIDATED_BY_CURRENT_EQUIVALENT.

---

## Phase 4 — Production deployment ancestry @ `99d722b4…`

| Check | Result |
|-------|--------|
| Live symlink | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260924235024_v4994` |
| LIVE_PRODUCTION_SHA | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` |
| R1–R8 merge SHAs | **Ancestors** of Production release (merged before R9–R12 chain) |
| R9–R12 + #1600–#1674 + #1750/#1753 | **PRODUCTION_PRESENT** (documented in TDL-EVID-QS-V1-PROD-ACCEPT-001 ancestry table) |
| #1594 R12 hardening @ `f4109e34…` | **PRODUCTION_PRESENT** (included in release ancestry) |

Per active contract: necessary **current** code paths are **PRODUCTION_PRESENT**. No active contract classified **NOT_PRODUCTION_PRESENT**.

Historical **PRE_HARDENING_R12** deploy @ `157b3c722…` is **SUPERSEDED_BEFORE_CURRENT_PRODUCTION** — not used for active-contract validation.

---

## Phase 5 — Existing evidence reuse (natural + forensic)

| Evidence artifact | Reused for (behavior / contract) | Inheritance proof |
|-------------------|----------------------------------|-------------------|
| TDL-EVID-QS-V1-PROD-ACCEPT-001 | **R4-BEH-002**, **R6-BEH-001** pause/SAME_TRIP | Same QS V1 orchestration + mid-gap policy on `99d722b4…`; 3/3 natural SAME_TRIP |
| TDL-EVID-KS-MS-661-001 | **R9** wake ingress + **R3** liveness (partial) | Natural R9 wake observed; start chain entered ACTIVE_TRIP |
| KS661 R11/R12 corpus | **R5-BEH-002**, **R12** end liveness evolution | Shows supersession of R5-only empty-core path; motivates current pipeline |
| WOB POST-#1617/#1627 + #1627 CI | **R5-BEH-002** retry budget | Root-caused pre-fix loops; fix **PRODUCTION_PRESENT** |
| KS MX #1674 forensic + fix | **R5-BEH-002** CH skip resume | Defines current CH/CUSUM handoff signature |
| R9/R10/R11/R12 natural drive audits | End/start supersession mapping | Demonstrates which historical R1–R8 tunnels are **not** current semantics |
| Fleet SQL (this audit) | **R2-BEH-001/002**, **R7-BEH-001** | 0 ONGOING, 0 FSM/active-trip divergence @ `2026-09-25T12:31:04Z` |

---

## Phase 6 — Evidence inheritance rules (applied)

**Accepted inheritance:**

1. QS V1 natural SAME_TRIP validates **current** short-pause continuity (R6-BEH-001 + R4-BEH-002) because QS policy is the executed split authority on Production.
2. Post-#1627/#1674/#1750 code presence + absence of regression signatures validates **R5-BEH-002** as **VALIDATED_BY_CURRENT_EQUIVALENT** (not re-running pre-#1617 drives).
3. R2/R7 recovery validated by **fleet invariant SQL** + historical STALE_ONGOING repairs documented in KS661 corpus (failures were **pre-fix**, fixes present on current release).

**Rejected inheritance:**

- “Production includes R1–R8 commits” ⇒ all R1–R8 **PRODUCTION_VALIDATED** (**forbidden**).
- “Any completed trip” ⇒ all end modes validated (**forbidden** — CH skip, CUSUM-only, shadow counterfactuals are separate acceptance surfaces).

---

## Phase 7 — Coverage matrix (summary)

| Behavior ID | Origin | Active today? | Implementation | PRODUCTION_PRESENT? | Natural evidence? | Status |
|-------------|--------|---------------|----------------|---------------------|-------------------|--------|
| R1-BEH-001 | R1 | YES | ACTIVE_UNCHANGED | YES | Indirect via completed trips + clock tests | **VALIDATED_BY_CURRENT_EQUIVALENT** |
| R1-BEH-002 | R1 | YES | ACTIVE_HARDENED | YES | KS661/WOB end forensics + QS window | **VALIDATED_BY_CURRENT_EQUIVALENT** |
| R1-BEH-003 | R1 | YES | ACTIVE_UNCHANGED | YES | No event-time movement trace in-window (Phase 2b) | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| R2-BEH-001 | R2 | YES | ACTIVE_HARDENED | YES | 0 divergence SQL + KS661 STALE_ONGOING repairs (pre-fix) | **PRODUCTION_VALIDATED** |
| R2-BEH-002 | R2 | YES | ACTIVE_UNCHANGED | YES | dup ONGOING=0 @ audit | **PRODUCTION_VALIDATED** |
| R3-BEH-001 | R3 | YES | ACTIVE_HARDENED | YES | KS661 R9 wake + ACTIVE_TRIP entry | **VALIDATED_BY_CURRENT_EQUIVALENT** |
| R3-BEH-002 | R3 | YES | ACTIVE_UNCHANGED | YES | PS errors persisted; no full retry-signature proof (Phase 2b) | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| R4-BEH-001 | R4 | YES | ACTIVE_UNCHANGED | YES | `startConfidence` present; scoring symmetry not observable (Phase 2b) | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| R4-BEH-002 | R4 | YES | ACTIVE_HARDENED | YES | QS 3/3 SAME_TRIP | **PRODUCTION_VALIDATED** |
| R5-BEH-001 | R5 | NO | SUPERSEDED | n/a | n/a | **SUPERSEDED_NO_LONGER_REQUIRES_VALIDATION** |
| R5-BEH-002 | R5 | YES | ACTIVE_REIMPLEMENTED | YES | WOB/#1627/#1674 + no regression in QS scan | **VALIDATED_BY_CURRENT_EQUIVALENT** |
| R6-BEH-001 | R6 | YES | ACTIVE_HARDENED | YES | QS SAME_TRIP + fail-closed tests on main | **PRODUCTION_VALIDATED** |
| R7-BEH-001 | R7 | YES | ACTIVE_REIMPLEMENTED | YES | Equivalent to R2 recovery; 0 stuck COMPLETED+active FSM | **VALIDATED_BY_CURRENT_EQUIVALENT** |
| R8-BEH-001 | R8 | YES | ACTIVE_UNCHANGED | YES | Metrics scrape blocked (401 bearer); not inferred from deploy (Phase 2b) | **PRODUCTION_PRESENT_NOT_VALIDATED** |
| R8-BEH-002 | R8 | YES | ACTIVE_HARDENED | YES | #1648 shadow ENABLED @ `99d722b4…` | **PRODUCTION_VALIDATED** |
| R9-LEGACY-POLL | pre-R9 | NO | SUPERSEDED | n/a | n/a | **SUPERSEDED_NO_LONGER_REQUIRES_VALIDATION** |
| R5-LEGACY-PEC | R5 | NO | SUPERSEDED | n/a | n/a | **SUPERSEDED_NO_LONGER_REQUIRES_VALIDATION** |
| TripDetectionState.ENDED writer | schema | NO | DEAD_OR_UNREACHABLE | n/a | n/a | **DEAD_NO_LONGER_REQUIRES_VALIDATION** |

**Package rollup (R1–R8)** — package label **cannot exceed** weakest active behavior (Phase 5):

| Package | Active behaviors | Rollup status |
|---------|------------------|---------------|
| **R1** | 001/002 equivalent; **003 PP_NOT_VALIDATED** | **PARTIALLY_PRODUCTION_VALIDATED** |
| **R2** | both **PRODUCTION_VALIDATED** | **PRODUCTION_VALIDATED** |
| **R3** | 001 equivalent; **002 PP_NOT_VALIDATED** | **PARTIALLY_PRODUCTION_VALIDATED** |
| **R4** | 002 **PRODUCTION_VALIDATED**; **001 PP_NOT_VALIDATED** | **PARTIALLY_PRODUCTION_VALIDATED** |
| **R5** | legacy PEC **SUPERSEDED**; **002 equivalent** | **PARTIALLY_PRODUCTION_VALIDATED** (active slice only) |
| **R6** | **PRODUCTION_VALIDATED** | **PRODUCTION_VALIDATED** |
| **R7** | **VALIDATED_BY_CURRENT_EQUIVALENT** | **VALIDATED_BY_CURRENT_EQUIVALENT** |
| **R8** | 002 **PRODUCTION_VALIDATED**; **001 PP_NOT_VALIDATED** | **PARTIALLY_PRODUCTION_VALIDATED** |

---

## Phase 8 — Start lifecycle

| Contract | R9 interaction | Production evidence |
|----------|----------------|---------------------|
| R3 ordering + R4 confirm | R9 adds **SnapshotWakeIntakeService** ingress; confirm still **POSSIBLE_START → ACTIVE_TRIP** | KS661 natural R9 wake (historical release) + current code **PRODUCTION_PRESENT** |
| R9-LEGACY-POLL-only | **SUPERSEDED** as primary contract | OQ-009 remains separate (polling docs), not OQ-007 blocker |

**START_PATH_CURRENT_VALIDATION:** **PARTIALLY_PRODUCTION_VALIDATED** (R3-BEH-002 + R4-BEH-001 gaps remain)

---

## Phase 9 — Active-trip continuity / pause

| Contract | QS V1 interaction | Status |
|----------|---------------------|--------|
| Short pause SAME_TRIP | QS replaces ad-hoc IDLE split for ≤300s | **PRODUCTION_VALIDATED** (3/3 natural) |
| QS >300s SPLIT / POST_SPLIT | Acceptance **gap** (0 natural in window) | **Not an R1–R8 contract** — current-feature acceptance (QS), out of OQ-007 scope per Phase 15 |

**ACTIVE_CONTINUITY_CURRENT_VALIDATION:** **PRODUCTION_VALIDATED**  
**PAUSE_RESUME_CURRENT_VALIDATION:** **PRODUCTION_VALIDATED** (SAME_TRIP slice)

---

## Phase 10 — End lifecycle

Historical R5 PEC/EV tunnel → **SUPERSEDED** by R10–R12 + #1627/#1635/#1674 pipeline on Production.

**END_PATH_CURRENT_VALIDATION:** **VALIDATED_BY_CURRENT_EQUIVALENT**  
**FINALIZE_CURRENT_VALIDATION:** **PRODUCTION_VALIDATED** (0 ONGOING; 98 COMPLETED / 7d)

---

## Phase 11 — Recovery / duplicate / concurrency

| Area | R1–R8 origin | Current authority | OQ-007 treatment |
|------|--------------|-------------------|------------------|
| Duplicate jobs / idempotency | R2 + queue patterns | R10 tokens + #1603 handoff | **VALIDATED_BY_CURRENT_EQUIVALENT** — do not re-seal pre-#1603 class separately |
| Multi-replica | R2 scheduler locks | unchanged + PM2 two-process | **PRODUCTION_PRESENT_NOT_VALIDATED** (no defect observed) |

**RECOVERY_CURRENT_VALIDATION:** **PRODUCTION_VALIDATED**  
**DUPLICATE_IDEMPOTENCY_CURRENT_VALIDATION:** **VALIDATED_BY_CURRENT_EQUIVALENT**  
**MULTI_REPLICA_CURRENT_VALIDATION:** **PRODUCTION_PRESENT_NOT_VALIDATED**

---

## Phase 12 — Production forensic scan (this audit)

**Observation window:** point-in-time + 7-day trip aggregate @ `2026-09-25T12:31:04Z`

| Probe | Result | Contracts supported |
|-------|--------|---------------------|
| `ongoing_trips` | **0** | R2, R7, finalize liveness |
| `dup_ongoing_vehicle` | **0** | R2-BEH-002 |
| `active_fsm_no_ongoing` | **0** | R2-BEH-001, R7-BEH-001 |
| FSM states | **6× RESTING** | terminal recovery healthy |
| `completed_7d` | **98** | active pipeline producing completions |

**NEW_READ_ONLY_CASES_AUDITED:** 1 aggregate fleet probe (pseudonymous — no vehicle IDs exported).

---

## Phase 13 — Failure-signature scan (@ current Production)

| Signature class | Result |
|-----------------|--------|
| **NO_DUPLICATE_ONGOING_STATE** (simultaneous ONGOING per vehicle) | **NOT_OBSERVED_IN_AUDIT_WINDOW** — SQL `dup_ongoing_vehicle=0` @ `2026-09-25T12:31:04Z` |
| Duplicate trip row (physical / reconciliation duplication) | **NOT_OBSERVED_IN_AUDIT_WINDOW** — cross-ref [QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md](QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md) regression table (`Duplicate trip row`, `Reconciliation duplication`) |
| stale ONGOING | **NOT_OBSERVED_IN_AUDIT_WINDOW** (ongoing=0) |
| missing finalize | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| wrong RESTING transition | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| false resume / lost wake / retry loop / dead-zone / lock handoff loss / boundary overlap / repair oscillation | **NOT_OBSERVED_IN_AUDIT_WINDOW** (aligns with QS acceptance regression scan) |

**KNOWN_REGRESSION_SIGNATURES_FOUND:** none in current window.

**NEW_RUNTIME_DEFECT_FOUND:** **NO**

---

## Phase 14 — Scope reduction vs active validation gaps

**Scope reduction (allowed without replay):** **3 SUPERSEDED** + **1 DEAD** = **4** historical contracts excluded from required natural replay.

**Active contracts (still in scope for OQ-007):** **14** rows. Of these:

| Active subset | Count |
|---------------|------:|
| PRODUCTION_VALIDATED | 5 |
| VALIDATED_BY_CURRENT_EQUIVALENT | 5 |
| **PRODUCTION_PRESENT_NOT_VALIDATED** | **4** |

**Closure rule (OQ-007 contract):** If **any** active contract remains **PRODUCTION_PRESENT_NOT_VALIDATED**, verdict **must not** be `RESOLVED_BY_SCOPE_REDUCTION` with `OQ007_STATUS_AFTER=RESOLVED`.

The four gaps are **not** runtime defects (no `DEFECT_CONFIRMED`); they **do** keep OQ-007 **open** until passively or naturally evidenced, or until superseded/dead reclassification is proven.

---

## Phase 15 — Relation to other OQs

| OQ | Stays separate |
|----|----------------|
| OQ-003 | detection-state row count |
| OQ-004 | route artifacts |
| OQ-008 | feature flags (TDL-GAP-007) |
| OQ-009 | polling docs vs R9 |
| OQ-010 | dead code inventory |
| QS post-split gaps | QS acceptance status, not R1–R8 historical package validation |

---

## Phase 16 — Verdict

**TDL_OQ_007_AUDIT_RESULT = `PARTIALLY_RESOLVED_ACTIVE_GAPS`**

Historical R1–R8 paths that are **SUPERSEDED** or **DEAD** no longer require natural replay. **Four** active contracts remain **PRODUCTION_PRESENT_NOT_VALIDATED** after passive addendum (Phase 2b). No **DEFECT_CONFIRMED** on current Production.

**OQ007_STATUS_AFTER = `PARTIALLY_RESOLVED`** (OQ-007 table row remains open until the four gaps close or are reclassified with proof).

---

## Phase 17 — Active validation gaps (OQ-007 blocking)

| BEHAVIOR_ID | WHY_STILL_ACTIVE | WHAT_EVIDENCE_IS_MISSING | CAN_BE_PASSIVELY_OBSERVED | REQUIRES_PHYSICAL_DRIVE | SAFE_ACCEPTANCE_SIGNATURE |
|-------------|------------------|--------------------------|----------------------------|-------------------------|---------------------------|
| R1-BEH-003 | Movement anchor still written on ACTIVE ticks | Per-trip/provider trace that `lastMeaningfulMovementAt` advances only on event timestamps during ACTIVE | YES | NO | Provider-timestamp-ordered movement samples on a completed trip window |
| R3-BEH-002 | PS failure must not be swallowed | Documented BullMQ retry / recovery after PS `error_message` for a representative failure class | YES | NO | Failed PS run → retried job → FSM progress without silent SUCCESS |
| R4-BEH-001 | Start scoring symmetry | Production-visible candidate vs confirm decision (sparse GPS case if available) | YES | NO (rare edge may need natural sparse case) | Meta or run forensics showing confirm aligned with candidate policy |
| R8-BEH-001 | Recognition latency metrics | Authorized Prometheus scrape: non-zero `_count` on `synqdrive_trip_start_recognition_latency_seconds` / end counterpart | YES | NO | Bearer-authenticated `/api/v1/metrics` sample with expected histogram labels |

**PHYSICAL_DRIVE_REQUIRED=NO** (gaps closable via passive observation / metrics / run forensics)
**PASSIVE_OBSERVATION_SUFFICIENT=YES** (preferred next step — not OQ-007 closure today)

---

## Phase 18 — Evidence inheritance diagram (ASCII)

```
R1–R8 merges (main ancestry)
        │
        ▼
R9–R12 + post-R12 hardening + QS V1  ──► CURRENT runtime semantics
        │
        ├── SUPERSEDED paths (no prod re-validation required)
        └── ACTIVE paths ──► QS natural + KS661/WOB forensics + fleet SQL
```

---

## Reproduce (read-only)

```bash
# Production release SHA
ssh synqdrive-admin@srv1374778.hstgr.cloud 'readlink -f /opt/synqdrive/current; tr -d "\n" < /opt/synqdrive/current/.git/HEAD; echo'

# Fleet invariant SQL (URI query stripped)
ssh synqdrive-admin@srv1374778.hstgr.cloud 'sudo bash -s' <<'EOS'
source /opt/synqdrive/shared/backend.env
DB="${DATABASE_URL%%\?*}"
psql "$DB" -At -c "SELECT count(*) FROM vehicle_trips WHERE trip_status = '\''ONGOING'\'';"
EOS
```
