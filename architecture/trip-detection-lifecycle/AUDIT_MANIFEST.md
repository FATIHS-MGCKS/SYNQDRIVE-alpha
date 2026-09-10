# Trip Detection & Lifecycle — Audit Manifest

Standard: [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0

## Fixed metadata

| Key | Value |
|-----|-------|
| **MODULE** | Trip Detection & Lifecycle |
| **MODULE_SLUG** | `trip-detection-lifecycle` |
| **AUDIT_STARTED_AT** | `2026-09-06T23:09:32Z` |
| **AUDIT_COMPLETED_AT** | `IN_PROGRESS` |
| **REGISTRY_STATUS_AT_START** | `NOT_STARTED` |
| **REGISTRY_STATUS_AT_END** | `AUDIT_IN_PROGRESS` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA (historical R9 rebase)** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **does not contain R9** |
| **CURRENT_ORIGIN_MAIN_SHA** | `f4109e34c24f1eb497e2023f4b4bb997abfc159f` — R12 pre-drive hardening #1594 merged; **CI_VALIDATED**; **NOT_DEPLOYED** |
| **R9_MERGE_ON_MAIN_SHA** | `4bef60463…` (PR #1553) |
| **R9_RUNTIME_BRANCH_SHA (historical)** | `1186e9d23a9b07e24da17b06a72f2614038db77a` — pre-merge audit baseline |
| **PHASE_0_2_AUTHORITY_SNAPSHOT_SHA** | `a36db67a3fb418ac7521d260461adf631256582c` — historical Phase-0-to-2 snapshot |
| **PRODUCTION_AUDITED_AT (historical session)** | `2026-09-06T23:47:41Z` |
| **PRODUCTION_AUDITED_AT (R9 canary session)** | `2026-09-07T22:35:00Z` |
| **PRODUCTION_AUDITED_AT (R12 pre-hardening deploy)** | `2026-09-09T19:26:03Z` |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA (current known — PRE_HARDENING_R12)** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| **PRODUCTION_RELEASE_PATH (current known)** | `/opt/synqdrive/releases/20260909190912_v4994` |
| **PRODUCTION_RELEASE_SHA (historical @ R11)** | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` @ `/opt/synqdrive/releases/20260909024150_v4994` |
| **PRODUCTION_RELEASE_SHA (historical @ R9)** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **PRODUCTION_RELEASE_SHA (historical pre-R9)** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **REPO_PRODUCTION_DRIFT (historical @ 01541c2ab…)** | R8 and R9 were **NOT_ON_PRODUCTION** at pre-R9 release — **HISTORICAL** |
| **REPO_PRODUCTION_DRIFT (historical @ 0ba96e03…)** | R9 runtime **was deployed**; provider trigger wiring **validated** (5/5 active cohort); natural wake delivery **not yet validated** — **superseded** |
| **RUNTIME_FOOTPRINT** | Backend NestJS module `vehicle-intelligence/trips/`; BullMQ queues `dimo.snapshot.poll`, `dimo.trip-tracking`, `snapshot.wake.handoff`; schedulers; PostgreSQL trip models; rental trip UI; DIMO snapshot ingress and reconciliation workers on Production VPS. |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | `PASS` — authority graph + registry validators (semantic cleanup pass) |

**Baseline note:** Do not treat pre-R9 Production @ `01541c2ab…`, R9 @ `0ba96e03…`, or R9 audit branch @ `1186e9d23…` as **current known Production**. **Current known Production:** `157b3c722…` (**PRE_HARDENING_R12**). **Current hardened main:** `f4109e34…` (#1594 merged, **NOT_DEPLOYED**). See [CURRENT_STATE.md](CURRENT_STATE.md) authority axes.

## Lifecycle phase status (Standard 1.0)

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Initial consolidated baseline established** — further reconstruction in progress |
| **2 — Production read-only audit** | **Verified** — historical session @ `01541c2ab…`; historical R9/canary @ `0ba96e03…`; **current known** pre-hardening R12 deploy @ `157b3c722…` (TDL-EV-R12-PROD-DEPLOY-001) |
| **3 — Reconciliation and classification** | **Pending / in progress** |
| **4 — Authority construction** | **Partial** — R9 wake subgraph + decision register + `validate-graph.sh` |
| **5 — Validation and promotion gate** | **Pending** — not `AUTHORITY_ACTIVE` |

## Audit-coverage matrix

### Repository — `origin/main` @ `1393095f5…` (includes R9 via #1553)

| Surface | Evidence | Result | Limitation |
|---------|----------|--------|------------|
| `backend/src/modules/vehicle-intelligence/trips/` | Code inspection | Orchestration, decision engine, detectors, reconciliation present | Not every file read line-by-line |
| R9 wake subsystem | Code inspection @ `4bef60463…` | `snapshot-wake` module, handoff processor, DIMO webhook intake on **main** | Natural wake not Production-validated |
| Worker processors/schedulers | Code inspection | Snapshot + trip-tracking + recovery + reconciliation + R9 wake wired | Full flag matrix incomplete |
| Historical `docs/audits/trip-fsm/*` | Index only | P1–R9 artifacts linked | Supporting evidence only |

### Production (read-only) — current known @ `157b3c722…` (PRE_HARDENING_R12)

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

Preserved in [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md). At this session R8/R9 were **NOT_ON_PRODUCTION** — do not conflate with **current known Production** @ `157b3c722…`.

Detail: [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md). Full evidence registry: [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md).

## Mutations performed

**None.** No deploy, PM2 change, DB write, Redis write, queue mutation, or Production file edit in authority workstreams.
