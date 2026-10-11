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
| **ORIGIN_MAIN_SHA** | `2a44f5cdc6ce0f1e4ec3846243352f8a82aef072` |
| **AUDIT_BRANCH_SHA** | `b24203d82d6` (DSRG-03 R0; see PR head if amended) |
| **PRODUCTION_AUDITED_AT** | `2026-10-11T00:47:51Z` (read-only SSH; no deploy runner invoked) |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA** | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` (`SYNQDRIVE_DEPLOYED_GIT_SHA` on VPS) |
| **RUNTIME_FOOTPRINT** | VPS pinned executor trees, shared deploy config, PM2 application replicas, nginx release path — **no mutations in DSRG-03 R0** |
| **AUDIT_MODE** | `READ_ONLY` (documentation + Production observation) |
| **VALIDATION_STATUS** | Registry validator required before merge; graph validator **deferred** |

## Lifecycle phase status

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** (DSRG-03 R0) |
| **1 — Repository current-state audit** | **Bootstrap complete** (ops scripts + selftests inventoried in CURRENT_STATE) |
| **2 — Production read-only audit** | **Bounded baseline** (DSRG-03 R0); not a full promotion gate audit |
| **3 — Reconciliation** | **Started** — repository vs Production separated in CURRENT_STATE and PRODUCTION_BASELINE |
| **4 — Authority construction** | **Partial** — mandatory core files; graphs/decisions/validators **missing** |
| **5 — Promotion gate** | **Not eligible** |

## Prior workstreams (preserved, not re-audited in full)

| Workstream | Role |
|------------|------|
| VO5C P4B12–P4B16 | Implementation and evidence under `architecture/vehicle-onboarding/evidence/` |
| DSRG-01 (#1970) | Pinned runner `exec bash` + governance hub docs |
| DSRG-02 R1/R2 | Pin promotion to `448a889…`; seal evidence `evidence/DSRG_02_PIN_REPROMOTION_2026-10-11.md` |

## Canonical change ledger

| Location | Role |
|----------|------|
| [`CHANGE_LEDGER.md`](CHANGE_LEDGER.md) | **Canonical append-only ledger for DSRG** |
| [`../vehicle-onboarding/research/CHANGE_LEDGER.md`](../vehicle-onboarding/research/CHANGE_LEDGER.md) | **Historical VO5C deploy entries** — reference only; do not duplicate DSRG rows |

Per Standard §4, `research/CHANGE_LEDGER.md` under DSRG is **not** created until migration plan completes; avoids competing ledgers.

## Mandatory structure not yet completed

| Artifact | Status |
|----------|--------|
| `KNOWLEDGE_GRAPH.md` | **Missing** |
| `graph/schema.yaml`, `nodes.yaml`, `edges.yaml`, `invariants.yaml` | **Missing** |
| `decisions/DECISION_REGISTER.md` | **Missing** |
| `contradictions/OPEN_CONTRADICTIONS.md` | **Missing** |
| `research/FAILED_APPROACHES.md`, `OPEN_HYPOTHESES.md`, `OPEN_QUESTIONS.md` | **Missing** |
| `scripts/validate-graph.sh` | **Missing** |

## Mutations performed (DSRG-03 R0)

Registry metadata and authority bootstrap documentation only. **No** Production deploy, pin change, PM2, sudoers, enforcement, or application mutations.
