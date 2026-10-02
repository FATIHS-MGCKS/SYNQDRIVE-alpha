# Trip Detection & Lifecycle — Audit Manifest

Standard: [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0

## Fixed metadata

| Key | Value |
|-----|-------|
| **MODULE** | Trip Detection & Lifecycle |
| **MODULE_SLUG** | `trip-detection-lifecycle` |
| **AUDIT_STARTED_AT** | `2026-09-06T23:09:32Z` |
| **AUDIT_COMPLETED_AT** | `2026-09-26` — Phase 5 Gate A (TDL-DEC-PHASE5-001) |
| **REGISTRY_STATUS_AT_START** | `NOT_STARTED` |
| **REGISTRY_STATUS_AT_END** | `AUTHORITY_ACTIVE` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA (historical R9 rebase)** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **does not contain R9** |
| **CURRENT_ORIGIN_MAIN_SHA (REPO_CURRENT @ Phase 5)** | `0b44b146fe82997a04940d7e03c4f8c198490501` |
| **ORIGIN_MAIN_SHA (historical rebaseline)** | `d6ff7e198110ff7401d03389c232398af47766f0` |
| **PRODUCTION_AUDITED_AT (current)** | `2026-09-26` — Phase 5 read-only refresh (TDL-EVID-PHASE5-PROD-BASELINE-001) |
| **PRODUCTION_RELEASE_SHA (current verified)** | `2b54a357854c9d44f638ee857f72936967c04992` |
| **PRODUCTION_RELEASE_PATH (current verified)** | `/opt/synqdrive/releases/20260926094359_v4994` |
| **PRODUCTION_AUDIT_STATUS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA (historical — QS V1 acceptance 2026-09-25)** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `/opt/synqdrive/releases/20260924235024_v4994` |
| **PRODUCTION_RELEASE_SHA (historical — PRE_HARDENING_R12)** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| **PRODUCTION_RELEASE_SHA (historical @ R11)** | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` @ `/opt/synqdrive/releases/20260909024150_v4994` |
| **PRODUCTION_RELEASE_SHA (historical @ R9)** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **PRODUCTION_RELEASE_SHA (historical pre-R9)** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **REPO_PRODUCTION_DRIFT (historical @ 01541c2ab…)** | R8 and R9 were **NOT_ON_PRODUCTION** at pre-R9 release — **HISTORICAL** |
| **REPO_PRODUCTION_DRIFT (historical @ 0ba96e03…)** | R9 runtime **was deployed**; provider trigger wiring **validated** (5/5 active cohort); natural wake delivery **not yet validated** — **superseded** |
| **RUNTIME_FOOTPRINT** | Backend NestJS module `vehicle-intelligence/trips/`; BullMQ queues `dimo.snapshot.poll`, `dimo.trip-tracking`, `snapshot.wake.handoff`; schedulers; PostgreSQL trip models; rental trip UI; DIMO snapshot ingress and reconciliation workers on Production VPS. |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | `PASS` — extended graph validator (FSM transitions, OQ-010 mapping, orphans) + registry validator @ Phase 5 |

**Baseline note:** Do not treat pre-R9 Production @ `01541c2ab…`, R9 @ `0ba96e03…`, or PRE_HARDENING_R12 @ `157b3c722…` as **PRODUCTION_CURRENT**. **PRODUCTION_CURRENT:** `2b54a357…` @ `20260926094359_v4994` (TDL-EVID-PHASE5-PROD-BASELINE-001). **REPO_CURRENT:** `0b44b146f…` — separate baseline from Production (drift is docs-only; see Phase 5 evidence). See [CURRENT_STATE.md](CURRENT_STATE.md) authority axes.

## Lifecycle phase status (Standard 1.0)

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Complete** — @ `0b44b146f…`; OQ-001…010 closed |
| **2 — Production read-only audit** | **Complete** — `VERIFIED_READ_ONLY`; **PRODUCTION_CURRENT** @ `2b54a357…` (TDL-EVID-PHASE5-PROD-BASELINE-001); QS acceptance @ `99d722b4…` historical; PRE_HARDENING_R12 @ `157b3c722…` **HISTORICAL** |
| **3 — Reconciliation and classification** | **Complete** — CX/GAP promotion classes assigned |
| **4 — Authority construction** | **Complete** — full live FSM graph (5 states / 14 transitions) + execution/authority/failure graphs + decision register |
| **5 — Validation and promotion gate** | **Complete** — Gate A 17/17 → `AUTHORITY_ACTIVE` (2026-09-26) |

## Audit-coverage matrix

### Repository — `origin/main` @ `1393095f5…` (includes R9 via #1553)

| Surface | Evidence | Result | Limitation |
|---------|----------|--------|------------|
| `backend/src/modules/vehicle-intelligence/trips/` | Code inspection | Orchestration, decision engine, detectors, reconciliation present | Not every file read line-by-line |
| R9 wake subsystem | Code inspection @ `4bef60463…` | `snapshot-wake` module, handoff processor, DIMO webhook intake on **main** | Natural wake not Production-validated |
| Worker processors/schedulers | Code inspection | Snapshot + trip-tracking + recovery + reconciliation + R9 wake wired | Flag matrix closed via TDL-OQ-008 (was incomplete at this pass) |
| Historical `docs/audits/trip-fsm/*` | Index only | P1–R9 artifacts linked | Supporting evidence only |

### Production (read-only) — current verified @ `2b54a357…` (2026-09-26)

See [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) current section (CURRENTLY_REOBSERVED vs CARRIED_FORWARD classes) and TDL-EVID-PHASE5-PROD-BASELINE-001.

### Production (read-only) — historical QS acceptance @ `99d722b4…`

| Surface | Evidence ID / method | Result | Limitation |
|---------|---------------------|--------|------------|
| Qualified Stop V1 acceptance | TDL-EVID-QS-V1-PROD-ACCEPT-001 | 3/3 natural SAME_TRIP; **`PASS_WITH_EVIDENCE_GAPS`** | No natural >300s SPLIT / POST_SPLIT_TRIP2 in window |
| Shadow runtime | TDL-EVID-QS-V1-PROD-ACCEPT-001 + shadow doc | **ENABLED** | Divergences **NOT_EVALUATED_SHORT_WINDOW** |
| #1750 / #1753 presence | Release SHA verification | **PRODUCTION_PRESENT** | Does not imply full behavior seal |

### Production (read-only) — historical @ `157b3c722…` (PRE_HARDENING_R12)

| Surface | Evidence ID / method | Result | Limitation |
|---------|---------------------|--------|------------|
| R12 pre-hardening deploy | TDL-EV-R12-PROD-DEPLOY-001 | Both replicas on TARGET_SHA; POST_DEPLOY_HEALTH_CONFIRMED | **Not** #1594 hardened code; **not** behavior validated |
| KS MS 661 post-deploy T0 | TDL-EV-R12-PROD-DEPLOY-001 Gate 9 | ACTIVE_TRIP — PHYSICAL_TEST_READY=NO | Fleet not clean baseline |

### Production (read-only) — historical @ `0ba96e03…` (R9/canary)

| Surface | Evidence ID / method | Result | Limitation |
|---------|---------------------|--------|------------|
| R9 runtime (historical deploy) | DIMO cross-ref DIM-EV-PROD-R9-001 | `SnapshotWakeIntakeService` in deployed webhook build @ historical release | Natural wake not observed; superseded |
| R9 provider trigger wiring | TDL-EV-R9-CANARY-001 | 5/5 speed+ignition on active cohort; 190497 excluded | Historical @ `0ba96e03…` |
| Legacy session aggregates | TDL-EV-PROD-001 … PROD-009 @ `2026-09-06` | Bounded SQL/Redis at **historical** release `01541c2ab…` | Frozen counts — not current fleet state |

### Production (read-only) — historical session @ `01541c2ab…` (`2026-09-06T23:47:41Z`)

Preserved in [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md). At this session R8/R9 were **NOT_ON_PRODUCTION** — do not conflate with **PRODUCTION_CURRENT** @ `2b54a357…`.

Detail: [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md). Full evidence registry: [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md).

## Mutations performed

**None.** No deploy, PM2 change, DB write, Redis write, queue mutation, or Production file edit in authority workstreams.
