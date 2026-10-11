# Deployment Security & Release Governance (DSRG) — Audit Manifest

Standard: [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0

## Fixed metadata

| Key | Value |
|-----|-------|
| **MODULE** | Deployment Security & Release Governance (DSRG) |
| **MODULE_KEY** | `DSRG` |
| **MODULE_SLUG** | `dsrg` |
| **AUDIT_STARTED_AT** | `2026-10-11T00:50:00Z` (DSRG-03 R0) |
| **AUDIT_COMPLETED_AT** | `IN_PROGRESS` (promotion to `AUTHORITY_ACTIVE` not eligible) |
| **REGISTRY_STATUS_AT_START** | **Absent** from central registry inventory (hub docs under `architecture/dsrg/` only) |
| **REGISTRY_STATUS_AT_END** | `AUDIT_IN_PROGRESS` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA** | `2a44f5cdc6ce0f1e4ec3846243352f8a82aef072` (at DSRG-03 R0/R1 certification; PR #1973 not merged) |
| **AUDIT_BRANCH_SHA** | `b24203d82d6` — **frozen** at DSRG-03 R0 first registry commit; **not** the live PR head after follow-up commits |
| **AUDIT_BRANCH_SHA_CAPTURE** | Recorded when registry row and bootstrap files first landed (DSRG-03 R0); intentionally **not** rewritten on each PR commit (avoids manifest ↔ commit loop) |
| **PR_NUMBER** | `1973` (draft; human review) |
| **PRODUCTION_AUDITED_AT** | `2026-10-11T00:47:51Z` (read-only SSH; no deploy runner invoked) |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20261010184619_v4994` (`current` symlink target on VPS; DSRG-03 R0 read-only) |
| **PRODUCTION_RELEASE_SHA** | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| **PRODUCTION_SHA_ATTESTATION** | `SYNQDRIVE_DEPLOYED_GIT_SHA` in `/opt/synqdrive/shared/backend.env` — **deploy attestation**, not independent `git rev-parse` on release path |
| **PRODUCTION_RELEASE_GIT_HEAD** | **Not verified / not applicable** — release directory is **not** a git checkout (`git rev-parse` failed on VPS); do **not** equate path with repo HEAD |
| **REPO_PRODUCTION_DRIFT** | **Yes (expected).** `origin/main` @ `2a44f5c…` is **ahead** of deployed application SHA `7f47c9f…` (`7f47c9f` is an ancestor of `main`). Pinned executor on VPS @ `448a889…` **matches** merge on `main` (#1970). Live app **not** redeployed for pin-only promotion (DSRG-02). Repository-only selftests do **not** imply Production activation. |
| **RUNTIME_FOOTPRINT** | VPS pinned executor trees, shared deploy config, PM2 application replicas, nginx release path — **no mutations** in DSRG-03 R0/R1 |
| **AUDIT_MODE** | `READ_ONLY` (documentation + Production observation) |
| **VALIDATION_STATUS** | Registry validator **PASS** (local + CI on PR #1973); graph validator **deferred** (artifacts missing) |

**PR head for human review:** use GitHub PR #1973 “head” commit at review time (not `AUDIT_BRANCH_SHA`). DSRG-03 R1 workstream output records the exact SHA at certification.

## Lifecycle phase status

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** (DSRG-03 R0) |
| **1 — Repository current-state audit** | **Bootstrap complete** (ops scripts + selftests inventoried in CURRENT_STATE) |
| **2 — Production read-only audit** | **Bounded baseline** (DSRG-03 R0); not a full promotion gate audit |
| **3 — Reconciliation** | **Started** — drift documented above and in CURRENT_STATE |
| **4 — Authority construction** | **Partial** — mandatory core files; graphs/decisions/validators **missing** |
| **5 — Promotion gate** | **Not eligible** |

## Audit coverage matrix

| Surface | Repository / Production | Evidence | Result / classification | Limitation / open gap |
|---------|-------------------------|----------|---------------------------|------------------------|
| Central registry row (DSRG) | Repo @ `2a44f5c` + PR #1973 diff | `SYNQDRIVE_RENTAL_ARCHITECTURE.md` | **IMPLEMENTED** (PR); **not deployed** (docs only) | Promotion `AUTHORITY_ACTIVE` blocked |
| Ops pinned runner + preflight | Repo `main`; pin tree on VPS | `backend/scripts/ops/vps-vo5c-*`; PRODUCTION_BASELINE | **IMPLEMENTED**; pin **DEPLOYED**; runner **not ACTIVATED** in DSRG-03 | Last preflight PASS **HISTORICAL** (DSRG-02 R1) |
| P4B15 bypass enforcement lib | Repo + pin tree | selftest; VO5C P4B15 evidence | **IMPLEMENTED**; **OFF** on VPS | No enforcement env |
| Live application release | Production path + attestation SHA | PRODUCTION_BASELINE; SSH | **DEPLOYED** `7f47c9f…`; path **CONFIRMED** | No git HEAD on release dir |
| Pinned executor config | VPS shared env | DSRG-02 seal + R0 baseline | **ACTIVATED** pointer @ `448a889…` | `chattr +i` **absent** |
| Deploy authority / enforcement | Repo examples only | VPS file probe | **PLANNED** / **not DEPLOYED** | G-DSRG-05, G-DSRG-08 |
| APDS approved pin | Production `backend.env` | DSRG-02 **HISTORICAL** + R0 grep | **CONFIRMED** `ab72f574…` unchanged in R0 probe | ACTIVE epoch not re-queried R0/R1 |
| EXP021 Gate-6 | Production + DI ops | DSRG-02 seal **HISTORICAL** | **KILLED** per seal; **UNKNOWN** live re-probe R1 | G-DSRG-01 |
| VO5C product admission / MFA | VO onboarding authority | Not in DSRG scope | **UNKNOWN** on VPS env grep | G-DSRG-03; VO authority unchanged |
| RFRF rollback | RFRF / VO evidence | selftest **repository only** | **IMPLEMENTED** tests; VPS traps **UNKNOWN** | G-DSRG-07 |
| Registry validator | CI + local | `validate-module-registry.sh` | **VALIDATED** PASS | — |

## Prior workstreams (preserved, not re-audited in full)

| Workstream | Role |
|------------|------|
| VO5C P4B12–P4B16 | Implementation and evidence under `architecture/vehicle-onboarding/evidence/` |
| DSRG-01 (#1970) | Pinned runner `exec bash` + governance hub docs |
| DSRG-02 R1/R2 | Pin promotion to `448a889…`; seal evidence `evidence/DSRG_02_PIN_REPROMOTION_2026-10-11.md` |

## Canonical change ledger

| Location | Role |
|----------|------|
| [`CHANGE_LEDGER.md`](CHANGE_LEDGER.md) | **Canonical append-only ledger for DSRG** (retained until explicit migration design) |
| [`../vehicle-onboarding/research/CHANGE_LEDGER.md`](../vehicle-onboarding/research/CHANGE_LEDGER.md) | **Historical VO5C deploy entries** — reference only; do not duplicate DSRG rows |

`research/CHANGE_LEDGER.md` under DSRG is **not** created in bootstrap — avoids competing ledgers per Standard §4 until a controlled migration is designed.

## Mandatory structure inventory (Standard §4) — authority bootstrap **PARTIAL**

| Required artifact | Status |
|-------------------|--------|
| `README.md` | **Present** |
| `AUDIT_MANIFEST.md` | **Present** (this file) |
| `CURRENT_STATE.md` | **Present** |
| `AGENT_CONTRACT.md` | **Present** |
| `KNOWLEDGE_GRAPH.md` | **Missing** |
| `graph/schema.yaml` | **Missing** |
| `graph/nodes.yaml` | **Missing** |
| `graph/edges.yaml` | **Missing** |
| `graph/invariants.yaml` | **Missing** |
| `decisions/DECISION_REGISTER.md` | **Missing** |
| `evidence/EVIDENCE_INDEX.md` | **Present** |
| `evidence/PRODUCTION_BASELINE.md` | **Present** |
| `contradictions/KNOWLEDGE_GAPS.md` | **Present** |
| `contradictions/OPEN_CONTRADICTIONS.md` | **Missing** |
| `research/CHANGE_LEDGER.md` | **Deferred** (canonical ledger remains root `CHANGE_LEDGER.md`) |
| `research/FAILED_APPROACHES.md` | **Missing** |
| `research/OPEN_HYPOTHESES.md` | **Missing** |
| `research/OPEN_QUESTIONS.md` | **Missing** |
| `scripts/validate-graph.mjs` | **Missing** |
| `scripts/validate-graph.sh` | **Missing** |

No empty placeholder graphs or fake-complete validators are added in DSRG-03 R1.

## Mutations performed

| Workstream | Mutations |
|------------|-----------|
| DSRG-03 R0 | Registry + bootstrap docs only |
| DSRG-03 R1 | Manifest metadata + certification docs only |

**No** Production deploy, pin change, PM2, sudoers, enforcement, or application mutations.
