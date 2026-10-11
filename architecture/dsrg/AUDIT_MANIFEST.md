# Deployment Security & Release Governance (DSRG) — Audit Manifest

Standard: [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0

## Fixed metadata

| Key | Value |
|-----|-------|
| **MODULE** | Deployment Security & Release Governance (DSRG) |
| **MODULE_KEY** | `DSRG` |
| **MODULE_SLUG** | `dsrg` |
| **AUDIT_STARTED_AT** | `2026-10-11T00:50:00Z` (DSRG-03 R0) |
| **AUDIT_COMPLETED_AT** | `IN_PROGRESS` (Gate A documented; **not** `AUTHORITY_ACTIVE`) |
| **REGISTRY_STATUS_AT_START** | Absent from central inventory (hub docs only) |
| **REGISTRY_STATUS_AT_END** | `AUDIT_IN_PROGRESS` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA** | `46478500ef8dee5d22fda89a7c1876a5e37270ca` (DSRG-03 R2) |
| **AUDIT_BRANCH_SHA** | `b24203d82d6` — **frozen** DSRG-03 R0 first commit (not updated per PR commit) |
| **PR_NUMBER** | Draft PR for DSRG-03 R2 (see workstream output for head SHA) |
| **PRODUCTION_AUDITED_AT** | `2026-10-11T10:14:01Z` (DSRG-03 R2 read-only SSH) |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20261010184619_v4994` |
| **PRODUCTION_RELEASE_SHA** | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` (attestation) |
| **PRODUCTION_SHA_ATTESTATION** | `SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env` |
| **PRODUCTION_RELEASE_GIT_HEAD** | **N/A** — release path not a git checkout |
| **REPO_PRODUCTION_DRIFT** | `main` ahead of deployed app `7f47c9f` (ancestor); pin `448a889` aligned with merged ops on `main` |
| **RUNTIME_FOOTPRINT** | VPS pin trees, shared deploy config, PM2 replicas |
| **AUDIT_MODE** | `READ_ONLY` + offline repository selftests |
| **VALIDATION_STATUS** | Registry + graph validators **PASS** (local) |

## Lifecycle phase status

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Complete** (DSRG-03 R2) |
| **2 — Production read-only audit** | **Bounded baselines** R0 + **R2 refresh** |
| **3 — Reconciliation** | **Complete** for documented scope |
| **4 — Authority construction** | **Substantial** — graph, decisions, research, validators |
| **5 — Promotion gate** | **Not eligible** — see [`evidence/GATE_A_READINESS.md`](evidence/GATE_A_READINESS.md) |

## Mandatory structure inventory (Standard §4)

| Artifact | Status |
|----------|--------|
| Core README, AUDIT_MANIFEST, CURRENT_STATE, AGENT_CONTRACT | **Present** |
| KNOWLEDGE_GRAPH.md + graph/*.yaml | **Present** |
| decisions/DECISION_REGISTER.md | **Present** |
| evidence/* (index, baseline, R2 reconciliation) | **Present** |
| contradictions/* | **Present** |
| research/* (incl. CHANGE_LEDGER canonical) | **Present** |
| scripts/validate-graph.{mjs,sh} | **Present** |

## Canonical change ledger

| Location | Role |
|----------|------|
| [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md) | **Canonical** (DSRG-03 R2 migration) |
| [`CHANGE_LEDGER.md`](CHANGE_LEDGER.md) | Redirect only |
| [`../vehicle-onboarding/research/CHANGE_LEDGER.md`](../vehicle-onboarding/research/CHANGE_LEDGER.md) | VO5C historical — reference only |

## Mutations

DSRG-03 R2: documentation and graph artifacts only. **No** Production mutations.
