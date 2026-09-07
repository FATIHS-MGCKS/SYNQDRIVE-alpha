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
| **ORIGIN_MAIN_SHA** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **`origin/main` does not contain R9** until PR #1553 merges |
| **R9_RUNTIME_BRANCH_SHA** | `1186e9d23a9b07e24da17b06a72f2614038db77a` — post-rebase R9 runtime/code state audited on branch `trip-fsm/r9-adaptive-polling-wake` |
| **PHASE_0_2_AUTHORITY_SNAPSHOT_SHA** | `a36db67a3fb418ac7521d260461adf631256582c` — stable Phase-0-to-2 authority-content snapshot (historical) |
| **AUDIT_BRANCH_SHA** | `1186e9d23a9b07e24da17b06a72f2614038db77a` — refers to the audited R9 runtime branch state, not the Phase-0-to-2 snapshot |
| **PRODUCTION_AUDITED_AT** | `2026-09-06T23:47:41Z` |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20260906213654_v4994` |
| **REPO_PRODUCTION_DRIFT_MAIN** | Production release is an **ancestor** of `origin/main` @ `a47255148…`. **`main` is ahead** of observed Production release, including Trip FSM **R8 #1549** merged on `main`; **R9 is not on `main`**. |
| **REPO_PRODUCTION_DRIFT_R9_BRANCH** | Production release is an **ancestor** of R9 audit branch @ `1186e9d23…`. Branch is ahead of Production for **R8 and R9**; R9 adaptive polling wake **NOT_ON_PRODUCTION** at observed release `01541c2ab…`. |
| **RUNTIME_FOOTPRINT** | Backend NestJS module `vehicle-intelligence/trips/`; BullMQ queues `dimo.snapshot.poll`, `dimo.trip-tracking`; schedulers (snapshot poll, trip-tracking recovery, trip reconciliation); PostgreSQL models `vehicle_trips`, `vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`, `trip_repairs`, `vehicle_trip_route_artifacts`; rental trip UI under `frontend/src/rental/components/trips/`; DIMO snapshot ingress and reconciliation workers on Production VPS. |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | `PASS` — `git diff --check origin/main...HEAD`; `bash architecture/scripts/validate-module-registry.sh` (see correction commit) |
| **REMAINING_LIMITATIONS** | Phase 1 repository audit is an **initial consolidated baseline** only — dead/legacy path inventory, full feature-flag matrix, Mapbox/FMM failure taxonomy, and Driving Intelligence handoff remain incomplete. Phase 3 reconciliation/classification ongoing. Phase 4 authority construction **partial** (R9 wake subgraph + decision register + `validate-graph.sh`; full FSM graph incomplete). Phase 5 promotion gate **pending**. PM2 apps `synqdrive` and `synqdrive-b` correlated to two Node PIDs at `PRODUCTION_AUDITED_AT`; **not** described as replicas of one application; trip-worker role split not verified. External PostgreSQL `:5432` unreachable from agent network; DB access via SSH-local `psql` only. No ClickHouse trip-assist query. No PII/per-vehicle traces exported. **Governance correction 2026-09-07:** DIMO Integration bootstrap + baseline epistemic separation (`origin/main` vs R9 branch vs Production). |

**Baseline note:** `PHASE_0_2_AUTHORITY_SNAPSHOT_SHA` (`a36db67a3…`) preserves the historical Phase-0-to-2 authority-content snapshot. **`AUDIT_BRANCH_SHA` / `R9_RUNTIME_BRANCH_SHA`** (`1186e9d23…`) is the audited R9 runtime branch state. Do not conflate `origin/main` @ `a47255148…` with R9 branch-only runtime.

**Timestamp note:** `AUDIT_STARTED_AT` is the ISO timestamp of commit `a36db67a3…`. `PRODUCTION_AUDITED_AT` is a single read-only session (`date -u` at session start) during which release path/SHA, health, PM2/PID correlation, Redis prefix counts, and bounded SQL aggregates were observed together.

## Lifecycle phase status (Standard 1.0)

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** — registry transition, scope, neighbor boundaries, manifest |
| **1 — Repository current-state audit** | **Initial consolidated baseline established** — core entry points, FSM, queues, persistence, API/UI documented; further reconstruction **in progress** (dead/legacy inventory, flags, handoff, route failure taxonomy incomplete) |
| **2 — Production read-only audit** | **Verified baseline established** — SSH, release SHA/path, bounded SQL/Redis/health/PM2 observations; documented limitations |
| **3 — Reconciliation and classification** | **Pending / in progress** — evidence index started; full classification ongoing |
| **4 — Authority construction** | **Partial** — R9 wake subgraph (`graph/*.yaml`, `KNOWLEDGE_GRAPH.md`), partial `DECISION_REGISTER.md`, `validate-graph.sh`; full FSM graph incomplete |
| **5 — Validation and promotion gate** | **Pending** — not `AUTHORITY_ACTIVE` |

## Audit-coverage matrix

### Repository — `origin/main` baseline @ `a47255148…`

| Surface | Evidence | Result | Limitation |
|---------|----------|--------|------------|
| `backend/src/modules/vehicle-intelligence/trips/` | Code inspection | Orchestration, decision engine, detectors, reconciliation, route-artifact present | Not every file read line-by-line |
| Worker processors/schedulers | Code inspection | Snapshot + trip-tracking + recovery + reconciliation wired; **R8 on `main`** | R8 **NOT_ON_PRODUCTION** at observed release |
| `backend/prisma/schema.prisma` | Code inspection | Trip models/enums confirmed | Migration history not fully narrated |
| Trip API + rental UI | Code inspection | Controller routes + trip components located | Full UI contract matrix incomplete |
| Historical `docs/audits/trip-fsm/*` | Index only | P1–R8 artifacts linked | Files not moved or rewritten |

### Repository — R9 audit branch @ `1186e9d23…` (branch-only until #1553 merges)

| Surface | Evidence | Result | Limitation |
|---------|----------|--------|------------|
| R9 wake path | Code inspection @ `1186e9d23…` | `snapshot-wake` module, handoff processor, DIMO webhook intake wiring present | **Not on `origin/main`** until merge |
| DIMO webhook cross-module contract | Code inspection | `DimoWebhookController` → `SnapshotWakeIntakeService`; DIMO authority owns provider gateway ([`architecture/dimo-integration/`](../dimo-integration/)) | Segment/trigger subscription state UNKNOWN |
| R9 tests / BullMQ integration | Repo tests @ branch | Focused R9 suites + `test:snapshot-wake:bullmq-integration` green on branch | **NOT_ON_PRODUCTION** |

### Production (read-only)

| Surface | Evidence ID / method | Result | Limitation |
|---------|---------------------|--------|------------|
| Release path + SHA | TDL-EV-PROD-001 | Symlink + detached HEAD match `01541c2ab…` | — |
| Health endpoint | TDL-EV-PROD-002 | HTTP 200 | Liveness only |
| Node / PM2 processes | TDL-EV-PROD-003 | Two Node PIDs (`3789590`, `3789796`) correlate 1:1 with PM2 apps `synqdrive` and `synqdrive-b` (each `instances=1`, `fork_mode`) | Not replicas of one app; trip roles not verified |
| Redis BullMQ prefixes | TDL-EV-PROD-004 | Key-prefix counts recorded | Not job-state cardinality |
| SQL aggregates | TDL-EV-PROD-005 … PROD-009 | Bounded aggregates only | 6 FSM rows — cohort implication |
| Env flags | Name-only grep | Trip-adjacent keys sampled | Values redacted; matrix incomplete |

Detail and reproducibility templates: [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md). Full evidence registry: [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md).

## Mutations performed

**None.** No deploy, PM2 change, DB write, Redis write, queue mutation, or Production file edit.
