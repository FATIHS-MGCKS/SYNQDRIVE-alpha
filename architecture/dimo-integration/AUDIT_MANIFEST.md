# DIMO Integration — Audit Manifest

Standard: [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0

## Fixed metadata

| Key | Value |
|-----|-------|
| **MODULE** | DIMO Integration |
| **MODULE_SLUG** | `dimo-integration` |
| **AUDIT_STARTED_AT** | `2026-09-07T02:55:00Z` |
| **AUDIT_COMPLETED_AT** | `IN_PROGRESS` |
| **REGISTRY_STATUS_AT_START** | `NOT_STARTED` |
| **REGISTRY_STATUS_AT_END** | `AUDIT_IN_PROGRESS` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA (historical R9 rebase)** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **does not contain R9** |
| **CURRENT_ORIGIN_MAIN_SHA** | `1393095f5d8faa2ff73e9dce5fe84024841e2528` — includes R9 runtime merged via #1553 @ `4bef60463…` |
| **R9_MERGE_ON_MAIN_SHA** | `4bef60463…` (PR #1553) |
| **PRIOR_ORIGIN_MAIN_SHA** | `feaf1f13559ba906f28bdd8641393227a90880a3` (pre-canary docs merge baseline) |
| **AUDIT_BRANCH (historical)** | `trip-fsm/r9-adaptive-polling-wake` |
| **AUDIT_BRANCH_SHA (historical)** | `1186e9d23a9b07e24da17b06a72f2614038db77a` — pre-merge R9 audit baseline; superseded by main merge |
| **PRE_CORRECTION_GOVERNANCE_HEAD** | `5383391c27c8265c2bff12c068a6f8d527a1102e` |
| **PRODUCTION_AUDITED_AT** | `2026-09-07T22:35:00Z` (read-only SSH + provider GET audit) |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA (current)** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `/opt/synqdrive/releases/20260925182907_v4994` (TDL-OQ-009 read-only @ `2026-09-26`) |
| **PRODUCTION_RELEASE_SHA (historical R9 canary)** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **PRODUCTION_RELEASE_SHA (historical pre-R9)** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **REPO_PRODUCTION_DRIFT (historical @ 01541c2ab…)** | R8 #1549 and R9 were **NOT_ON_PRODUCTION** at pre-R9 release — **HISTORICAL** |
| **REPO_PRODUCTION_DRIFT (current @ `8a1d9c658…`)** | R9 runtime **present**; **R9 authorized provider cohort 5/5** subscribed (TDL-OQ-009 re-read); natural R9 **start** wake **observed** historically; fleet-wide wake-rate KPI **unknown**; **1** stale former-fleet scheduler mirror (DIM-GAP-005) |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | `PASS` — authority graph + registry validators (latest semantic cleanup pass) |

## Lifecycle phase status

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Initial consolidated baseline** — `backend/src/modules/dimo/` inspected |
| **2 — Production read-only audit** | **Verified** — release SHA, health, PM2, deployed build grep, provider GET audit, Redis prefix counts |
| **3 — Reconciliation** | **Pending** |
| **4 — Authority construction** | **Partial** — bootstrap graph + DIM-DEC-R9-001 + canary evidence |
| **5 — Promotion gate** | **Pending** — not `AUTHORITY_ACTIVE` |

## Mutations performed

**None** in authority/documentation workstreams. Historical authorized provider mutation: five-vehicle R9 canary (documented in DIM-EV-R9-CANARY-001).

## Provider subscription state (current)

**Verified read-only @ `2026-09-07T22:35:00Z` (canary) and re-read @ `2026-09-26` (TDL-OQ-009 / `8a1d9c658…`):**

| Metric | Authorized R9 cohort (B) | DB scheduler view (A) |
|--------|-------------------------:|----------------------:|
| Cohort size | **5** | **6** (`SCHEDULER_ELIGIBLE_DB_ROWS`) |
| subscribed_speed / ignition / both | **5 / 5 / 5** | **5 / 5 / 5** among DB rows |
| `R9_AUTHORIZED_COHORT_COVERAGE` | **100%** | N/A |
| `STALE_FORMER_FLEET_SCHEDULER_MIRROR_COUNT` | **0** (excluded from B) | **1** (`HISTORICALLY_EXCLUDED_FORMER_FLEET_ASSET`) |
| `SCHEDULER_COHORT_WITH_BOTH_R9_TRIGGERS` | — | **5/6** (`DB_COHORT_VIEW` only) |

Method: GET `/v1/webhooks` + per-asset subscription audit (`backend/scripts/ops/r9-post-get-audit.mjs`). Historical canary detail: [evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md](evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md). Cross-ref: [TDL_OQ_009](../trip-detection-lifecycle/evidence/TDL_OQ_009_TIERED_POLLING_R9_INGRESS_2026-09-26.md).

**Natural R9 start wake:** **PRODUCTION_OBSERVED / PARTIALLY_VALIDATED** (KS MS 661). **Fleet-wide wake-rate KPI:** not established in OQ-009 read-only pass.
