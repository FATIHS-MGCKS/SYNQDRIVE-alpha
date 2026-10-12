# Deployment Security & Release Governance (DSRG) — Audit Manifest

Standard: [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0

## Fixed metadata

| Key | Value |
|-----|-------|
| **MODULE** | Deployment Security & Release Governance (DSRG) |
| **MODULE_KEY** | `DSRG` |
| **MODULE_SLUG** | `dsrg` |
| **AUDIT_STARTED_AT** | `2026-10-11T00:50:00Z` (DSRG-03 R0) |
| **AUDIT_COMPLETED_AT** | `2026-10-11T13:49:49Z` (Gate A @ R3 Production audit) |
| **REGISTRY_STATUS_AT_END** | `AUTHORITY_ACTIVE` (proposed DSRG-03 R6 — effective on promotion PR merge) |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **ORIGIN_MAIN_SHA** | `f456350c72daf8da08ca80b00090276da8ff60f1` (#1976 merge; DSRG-03 R5) |
| **GATE_A_AUDIT_MAIN_SHA** | `299205bc7fa07f3494f50961c49fd5a591e029fe` (frozen R3 certification baseline) |
| **AUDIT_BRANCH_SHA** | `b24203d82d6` — frozen R0 capture (unchanged) |
| **PRODUCTION_AUDITED_AT** | `2026-10-11T13:49:49Z` (DSRG-03 R3) |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20261010184619_v4994` |
| **PRODUCTION_RELEASE_SHA** | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| **PRODUCTION_SHA_ATTESTATION** | `SYNQDRIVE_DEPLOYED_GIT_SHA`; `backend.env` SHA256 `19685a3b…` |
| **PRODUCTION_RELEASE_GIT_HEAD** | **N/A** |
| **REPO_PRODUCTION_DRIFT** | App behind `main` tip (ancestor); pin `448a889` aligned |
| **VALIDATION_STATUS** | Registry + graph validators **PASS**; DSRG graph in module-registry CI (R3) |

## Lifecycle

| Phase | Status |
|-------|--------|
| **0–4** | **Complete** (R3 fresh Production + execution inventory) |
| **5 — Promotion** | **PROPOSED** DSRG-03 R6 (`AUTHORITY_ACTIVE` registry); runtime enforcement **not** in scope |

## Canonical ledger

[`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md) — append DSRG-03-R3 there.

## Evidence chain

| Workstream | Document |
|------------|----------|
| R0/R1 | `PRODUCTION_BASELINE.md` |
| R2 | `DSRG_03_R2_PRODUCTION_RECONCILIATION.md` |
| R3 | `DSRG_03_R3_PRODUCTION_AUDIT.md`, `EXECUTION_PATH_INVENTORY.md` |
| Gate A | `GATE_A_READINESS.md` |
