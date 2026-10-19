# Joint release manifest — read-only preflight

**Audit UTC:** 2026-10-19T14:45:00Z (approx.)  
**Mode:** Production release engineering — **no deploy, no mutations**  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`

## Release authority (resolved)

| Field | Value | Evidence |
|--------|--------|----------|
| **Target `origin/main`** | `cf20c49f6596589a56eae346b5550f0b662c46b6` | `git fetch origin main` → `git rev-parse origin/main` |
| **Production `/opt/synqdrive/current`** | `c6d5ab99416bbff569f25741c27b4e24f46aaf8e` | SSH `git rev-parse HEAD` under `/opt/synqdrive/current` |
| **Production release dir** | `/opt/synqdrive/releases/20261018230030_v4994` | SSH `readlink -f /opt/synqdrive/current` |
| **Commits pending deploy** | **30** | `git log --oneline c6d5ab99..cf20c49f` |
| **Deploy target SHA (planned)** | `cf20c49f6596589a56eae346b5550f0b662c46b6` | Same as current `main` tip at audit |
| **Replica health** | HTTP 200 both `:3001` and `:3002` | SSH `curl` health JSON `status: ok` |
| **Deployment locks** | None observed | SSH `ls` `/opt/synqdrive/*.lock` |

Reference SHAs from planning (`c6d5ab99`, `cf20c49f`) **match** live resolution at audit time.

## Classification legend

- **IN_PROD** — already running at production SHA or DB already migrated
- **ON_MAIN_NOT_DEPLOYED** — merged to `main`, not in production app tree
- **OPEN_PR_EXCLUDED** — not merged; out of automatic release scope
- **PASSIVE_CODE** — ships with deploy; default/env gates keep behavior unchanged
- **RESEARCH_ONLY** — offline / non-authoritative decoders; no production S4 authority swap

## Workstreams in this release (merged on `main`, not in prod app)

| Workstream | Merged PRs | Status | Notes |
|------------|------------|--------|--------|
| **A. Driving Intelligence S4 / EXP021** | #2082, #2084 (+ commits eaa52ccf, df0fef2c, 0ea34ff8, cf20c49f) | ON_MAIN_NOT_DEPLOYED | Research libs: backtrack R1, OSM node-id topology, route-aware R4.1, direction-aware emission P1; **production forward V2 unchanged** |
| **B. Vehicle Signal Intelligence P3A** | #2083 | ON_MAIN_NOT_DEPLOYED | Schema + gated writer/resolver; **1 pending migration** |
| **C. DTC-02 P5A mixed-mode** | #2080 | ON_MAIN_NOT_DEPLOYED | Opt-in `DTC_01F_COHORT_MIXED_MODE_ENABLED`; **not set in prod env** |
| **D. Physical Device Inventory P1B.7** | #2063 | ON_MAIN_NOT_DEPLOYED | Operator CLI; gate `PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED` |
| **E. Battery HV/LV** | (no new PR in 30-commit window beyond existing prod baseline) | IN_PROD / PASSIVE | HV R22 migrations already applied at prod; delta is CI/RFRF mirror only |
| **F. Trip FSM / TDL** | — | IN_PROD | Shadow flags present in env; **no new trip-boundary promotion in delta** |
| **G. Ops / DB guard hotfix** | #2079 (merge 9c697f80c) | ON_MAIN_NOT_DEPLOYED | PG16 backup verifier + Prisma guard ROOT; **partial hotfix already on prod disk** (see guard audit) |
| **G. Production DB DDL guard** | #2078 (already at prod SHA) | IN_PROD | `c6d5ab99` merge commit message: PR #2078 |
| **G. CI / RFRF** | 31c3d2424 | ON_MAIN_NOT_DEPLOYED | Postgres mirror fallback for CI only |

## Explicit exclusions (open / superseded PRs)

| PR | Reason |
|----|--------|
| **#2077**, **#2081** | User directive: superseded/mixed drafts — **do not auto-promote** |
| **#2085** | Open draft: P1 **production shadow wiring** — **not on `main`** |
| All other open PRs | Not merged — excluded (`gh pr list --state open`) |

## Database / migrations (summary)

| Item | Value |
|------|--------|
| PostgreSQL | **16.15** (Ubuntu) |
| Database OID | **514336** (`datname=synqdrive`) |
| Public schema | **present** |
| Public base tables | **457** |
| `vehicle_trips` rows | **2636** (reference 2623 — **+13**, not a decrease) |
| `organizations` | **4** |
| `vehicles` | **9** |
| Finished migrations | **424** |
| Rolled-back incomplete ledger rows | **16** (historical; e.g. `20260714170000_payment_request_status_lifecycle`) |
| **Pending apply at deploy** | `20261019120000_vsi_p3a_provider_catalog_axes` only |

## Production runtime flags (effective snapshot)

Redacted grep of `/opt/synqdrive/shared/backend.env`:

- **S4 production:** `DI_V0_S4_*` present (master, worker, discovery, position, R1, allowlists).
- **S4 research:** **no** `DI_V0_S4_RESEARCH_*` keys → research worker / shadow decoders **off** (defaults).
- **VSI P3A:** **no** `VSI_P3A_*` keys → per `.env.example`, write/resolver **false**.
- **DTC mixed-mode:** **no** `DTC_01F_*` keys → mixed-mode **off**.
- **PDI:** **no** `PDI_*` keys → operator CLI **off**.
- **Trip FSM shadow:** `TRIP_FSM_SHADOW_*`, `TRIP_START_BOUNDARY_ADMISSION_SHADOW_*` present (values redacted).

## CI attestation (target SHA `cf20c49f`)

- **CI gate (all critical jobs):** `success` (completed)
- **S4 unit + PostgreSQL suites:** `success`
- **Nest production boot check:** `success`
- **Vehicle Detail Playwright:** `success`
- **validate-module-registry:** `success`
- **HV R22 charging counter PostgreSQL:** `success`
- **production-database-guard** workflow: present in bundle manifest on `main`
- **Pending at audit:** `Backend R11 postgres+redis integration` — **`in_progress`** (refresh before owner GO)

## Deliverables index

1. `JOINT_RELEASE_MANIFEST.md` (this file)
2. `WORKSTREAM_DEPLOY_MATRIX.md`
3. `PRODUCTION_DB_GUARD_HOTFIX_AUDIT.md`
4. `PRODUCTION_MIGRATION_PLAN.md`
5. `FEATURE_FLAG_BEFORE_AFTER_MATRIX.md`
6. `GIANT_RELEASE_GO_NO_GO.md`
7. `EXACT_SHA_DEPLOY_RUNBOOK.md`
8. `POST_DEPLOY_ACCEPTANCE_AND_ROLLBACK.md`

**DEPLOY_EXECUTED=NO · PRODUCTION_MUTATIONS=NONE**
