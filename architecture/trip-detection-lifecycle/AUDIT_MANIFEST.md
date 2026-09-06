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
| **ORIGIN_MAIN_SHA** | `06095af91ce6f58366734a182ac5962830e858db` |
| **AUDIT_BRANCH_SHA** | `a36db67a3fb418ac7521d260461adf631256582c` |
| **PRODUCTION_AUDITED_AT** | `2026-09-06T23:24:20Z` |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20260906213654_v4994` |
| **REPO_PRODUCTION_DRIFT** | Production release is an **ancestor** of `origin/main` @ `06095af91…`. **`main` is 3 commits ahead**, including Trip FSM **R8 #1549** not present on the observed Production release. |
| **RUNTIME_FOOTPRINT** | Backend NestJS module `vehicle-intelligence/trips/`; BullMQ queues `dimo.snapshot.poll`, `dimo.trip-tracking`; schedulers (snapshot poll, trip-tracking recovery, trip reconciliation); PostgreSQL models `vehicle_trips`, `vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`, `trip_repairs`, `vehicle_trip_route_artifacts`; rental trip UI under `frontend/src/rental/components/trips/`; DIMO snapshot ingress and reconciliation workers on Production VPS. |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | `PASS` — `git diff --check origin/main...HEAD`; `bash architecture/scripts/validate-module-registry.sh` (see correction commit) |
| **REMAINING_LIMITATIONS** | Phase 1 repository audit is an **initial consolidated baseline** only — dead/legacy path inventory, full feature-flag matrix, Mapbox/FMM failure taxonomy, and Driving Intelligence handoff remain incomplete. Phase 3 reconciliation/classification, Phase 4 authority construction (graphs/decisions), and Phase 5 promotion gate **pending**. Original bootstrap Production SQL session had no recovered exact ISO timestamp; aggregates preserved from that session and **revalidated** at `PRODUCTION_AUDITED_AT`. PM2 application roles verified read-only (`synqdrive`, `synqdrive-b`); replica topology for trip workers not fully mapped. External PostgreSQL `:5432` unreachable from agent network; DB access via SSH-local `psql` only. No ClickHouse trip-assist query. No PII/per-vehicle traces exported. |

**`AUDIT_BRANCH_SHA` note:** `a36db67a3…` is the stable Phase-0-to-2 **authority-content snapshot** commit. Later correction commits on the same branch do not change this audited content baseline and are not recursively chased in manifest metadata.

**Timestamp note:** `AUDIT_STARTED_AT` is the ISO timestamp of commit `a36db67a3…`. `PRODUCTION_AUDITED_AT` is from read-only re-observation (`date -u`) during PR #1554 correction; the earlier bootstrap SQL session occurred in the same UTC evening without a recovered exact timestamp.

## Lifecycle phase status (Standard 1.0)

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** — registry transition, scope, neighbor boundaries, manifest |
| **1 — Repository current-state audit** | **Initial consolidated baseline established** — core entry points, FSM, queues, persistence, API/UI documented; further reconstruction **in progress** (dead/legacy inventory, flags, handoff, route failure taxonomy incomplete) |
| **2 — Production read-only audit** | **Verified baseline established** — SSH, release SHA/path, bounded SQL/Redis/health/PM2 observations; documented limitations |
| **3 — Reconciliation and classification** | **Pending / in progress** — evidence index started; full classification ongoing |
| **4 — Authority construction** | **Pending** — graphs, decision registers, validators not created |
| **5 — Validation and promotion gate** | **Pending** — not `AUTHORITY_ACTIVE` |

## Audit-coverage matrix

### Repository (`origin/main` @ `06095af91…`)

| Surface | Evidence | Result | Limitation |
|---------|----------|--------|------------|
| `backend/src/modules/vehicle-intelligence/trips/` | Code inspection | Orchestration, decision engine, detectors, reconciliation, route-artifact present | Not every file read line-by-line |
| Worker processors/schedulers | Code inspection | Snapshot + trip-tracking + recovery + reconciliation wired | R9 wake path out of bootstrap scope |
| `backend/prisma/schema.prisma` | Code inspection | Trip models/enums confirmed | Migration history not fully narrated |
| Trip API + rental UI | Code inspection | Controller routes + trip components located | Full UI contract matrix incomplete |
| Historical `docs/audits/trip-fsm/*` | Index only | P1–P8 artifacts linked | Files not moved or rewritten |

### Production (read-only)

| Surface | Evidence ID / method | Result | Limitation |
|---------|---------------------|--------|------------|
| Release path + SHA | TDL-EV-PROD-001 | Symlink + detached HEAD match `01541c2ab…` | — |
| Health endpoint | TDL-EV-PROD-002 | HTTP 200 | Liveness only |
| Node / PM2 processes | TDL-EV-PROD-003 | PM2 apps `synqdrive`, `synqdrive-b` (each `instances=1`); matching Node processes observed via `pgrep` | Not proven as two replicas of one app |
| Redis BullMQ prefixes | TDL-EV-PROD-004 | Key-prefix counts recorded | Not job-state cardinality |
| SQL aggregates | TDL-EV-PROD-005 … PROD-009 | Bounded aggregates only | 6 FSM rows — cohort implication |
| Env flags | Name-only grep | Trip-adjacent keys sampled | Values redacted; matrix incomplete |

Detail and reproducibility templates: [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md). Full evidence registry: [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md).

## Mutations performed

**None.** No deploy, PM2 change, DB write, Redis write, queue mutation, or Production file edit.
