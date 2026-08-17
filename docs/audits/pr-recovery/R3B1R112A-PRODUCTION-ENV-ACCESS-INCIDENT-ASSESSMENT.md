# R3B1R.1.2a — Production Env Access Incident Assessment

**Phase:** `CI-R3B1R.1.2a`  
**Generated:** `2026-08-16T17:30:00+00:00`  
**Result:** **SUCCESS** — read-only incident assessment completed; Production unchanged  
**Mode:** Diagnosis only — **zero Production mutations**, **no deploy retry**

Prior incident: `R3B1R112-CONTROLLED-PRODUCTION-HISTORY-BRIDGE-DEPLOYMENT.md`  
Raw assessment: `docs/audits/ci-recovery/data/ci-r3b1r112a-assessment-raw-2026-08.json`

---

## 1. Incident entry status

| Field | Value |
|-------|-------|
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| BRANCH | `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08` |
| ENTRY_HEAD_SHA | `42ea0365d643759e3b0162df28e9150307a467a2` |
| PR_1054_HEAD_SHA | `42ea0365d643759e3b0162df28e9150307a467a2` |
| CURRENT_MAIN_SHA | `721ad893d15cfa46786a112860548ce12a2be71d` |
| PR_1054_STATE | OPEN, DRAFT, UNMERGED |
| WORKTREE_CLEAN | **true** |

---

## 2. Original deploy failure (R3B1R.1.2)

| Field | Value |
|-------|-------|
| DEPLOY_ATTEMPT_COUNT | **1** |
| DEPLOY_EXIT_CODE | **1** |
| MIGRATIONS_ATTEMPTED | **0** |
| MIGRATIONS_APPLIED | **0** |
| FAILURE_CLASS | `ENV_ACCESS_INCIDENT` |
| PRISMA_ERROR_CODE | `P1012` |
| FAILING_FILE_PATH | `/tmp/synqdrive-r3b1r112-20260816163505/backend/.env` |
| SYMLINK_TARGET | `/opt/synqdrive/shared/backend.env` |
| COMMAND_CWD | `/tmp/synqdrive-r3b1r112-20260816163505/backend` |
| DEPLOY_PROCESS_USER | `synqdrive-admin` (uid 1000) |

Sanitized failure chain:

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DATABASE_URL.
Schema Env Error: Error: EACCES: permission denied, open '.../backend/.env'
```

---

## 3. Proof zero migrations executed

| Metric | Value |
|--------|-------|
| PRODUCTION_LEDGER_ROWS_ADDED | **0** |
| PRODUCTION_CATALOG_MUTATIONS | **0** |
| LEDGER_FINGERPRINT_BEFORE (R3B1R.1.2) | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| LEDGER_FINGERPRINT_CURRENT | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| CATALOG_FINGERPRINT_UNCHANGED | **true** |

---

## 4. Fresh ledger state

| Field | Value |
|-------|-------|
| LEDGER_ROW_COUNT | **339** |
| LEDGER_FINISHED_COUNT | **323** |
| LEDGER_FAILED_COUNT | **16** (pre-existing rolled-back rows) |
| LEDGER_INCOMPLETE_COUNT | **0** |
| LEDGER_FINGERPRINT_CURRENT | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| NEW_LEDGER_ROWS_SINCE_INCIDENT | **0** |
| NEW_FAILED_ROWS_SINCE_INCIDENT | **0** |
| NEW_INCOMPLETE_ROWS_SINCE_INCIDENT | **0** |
| BRIDGE_1_LEDGER_ROW_EXISTS | **false** |
| BRIDGE_2_LEDGER_ROW_EXISTS | **false** |

---

## 5. Fresh catalog state

| Field | Value |
|-------|-------|
| CATALOG_FINGERPRINT_CURRENT | `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58` |
| CATALOG_CHANGED_SINCE_INCIDENT | **false** |

---

## 6. Bridge SHA freeze

| Bridge | Expected SHA256 | Match |
|--------|-----------------|-------|
| `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` | `30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006` | **true** |
| `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` | `a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82` | **true** |

`SOURCE_EVIDENCE_SHA_MISMATCHES=0`

---

## 7. Failing process identity

| Field | Value |
|-------|-------|
| DEPLOY_PROCESS_USER | `synqdrive-admin` |
| DEPLOY_PROCESS_UID | **1000** |
| DEPLOY_PROCESS_GROUPS | `synqdrive-admin`, `sudo` (27) |
| TEMP_CLONE_PATH | `/tmp/synqdrive-r3b1r112-20260816163505` |
| TEMP_BACKEND_PATH | `/tmp/synqdrive-r3b1r112-20260816163505/backend` |
| TEMP_ENV_LINK_PATH | `/tmp/synqdrive-r3b1r112-20260816163505/backend/.env` |
| TEMP_ENV_LINK_TARGET | `/opt/synqdrive/shared/backend.env` |

---

## 8. Filesystem permission chain

`namei -l /opt/synqdrive/shared/backend.env` (sanitized):

| Path component | Owner | Group | Mode | Traverse (synqdrive-admin) |
|----------------|-------|-------|------|----------------------------|
| `/` | root | root | 755 | yes |
| `/opt` | root | root | 755 | yes |
| `/opt/synqdrive` | root | root | 755 | yes |
| `/opt/synqdrive/shared` | root | root | 755 | yes |
| `/opt/synqdrive/shared/backend.env` | root | root | **600** | **read denied** |

| Field | Value |
|-------|-------|
| ENV_ACCESS_FAILURE_COMPONENT | `/opt/synqdrive/shared/backend.env` |
| ENV_ACCESS_FAILURE_REASON | File is `root:root` mode `600`; SSH deploy user can traverse path but cannot open file (EACCES) |
| SYNQDRIVE_ADMIN_READABLE | **false** |
| SUDO_READABLE | **true** (`DATABASE_URL_PRESENT=true`, length > 0; value not printed) |

`getfacl` unavailable on VPS; no supplemental ACLs observed via `stat`.

---

## 9. Canonical Production deploy architecture

Established path (not ad-hoc temp-clone direct read):

| Field | Value |
|-------|-------|
| CANONICAL_PRODUCTION_DEPLOY_USER | **root** |
| CANONICAL_PRODUCTION_MIGRATION_COMMAND | `npm run prisma:migrate:deploy` |
| CANONICAL_PRODUCTION_WORKDIR | `/opt/synqdrive/releases/<release_id>/backend` |
| CANONICAL_ENV_LOADING_MECHANISM | `ln -sfn /opt/synqdrive/shared/backend.env backend/.env` under **root** in `vps-deploy-release.sh`; audit/ops tooling uses `sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a'` |
| CANONICAL_ENV_OWNER | root |
| CANONICAL_ENV_GROUP | root |
| CANONICAL_ENV_MODE | 600 |
| REFERENCE_SCRIPT | `backend/scripts/ops/vps-deploy-release.sh` |

Live app process: PM2 `synqdrive` runs as **root** on `/opt/synqdrive/current/backend`.

---

## 10. R3B1Q vs R3B1R.1.2 execution comparison

| Dimension | R3B1Q (successful mutations) | R3B1R.1.2 (failed) |
|-----------|------------------------------|---------------------|
| Execution user | **root** (via sudo in ephemeral wrapper) | **synqdrive-admin** (SSH, no elevation) |
| Working directory | `/tmp/r3b1q_20260816110731/repo/backend` | `/tmp/synqdrive-r3b1r112-20260816163505/backend` |
| Env source | `/opt/synqdrive/shared/backend.env` | same target via symlink |
| Env loading | `sudo bash -lc` + `source backend.env` (effective); symlink alone logged EACCES during generate | Prisma dotenv read of symlink only |
| Prisma command | `migrate resolve` / `prisma:migrate:deploy` | `npm run prisma:migrate:deploy` |

**EXECUTION_PATH_DIFFERENCES:**

1. R3B1R.1.2 ran as `synqdrive-admin` without sudo/root elevation.
2. R3B1R.1.2 relied on Prisma reading symlinked `.env`; R3B1Q effective path used root-readable `backend.env` via sudo/source.
3. Canonical `vps-deploy-release.sh` runs migrate as root, not `synqdrive-admin`.

**First material difference:** execution user lacks read permission on `/opt/synqdrive/shared/backend.env` (`root:root` `600`).

---

## 11. Temp-clone symlink determination

| Gate | Value |
|------|-------|
| TEMP_CLONE_ENV_SYMLINK_CANONICAL | **false** (for `synqdrive-admin` without sudo/source) |
| NO_PERMISSION_BROADENING_FOR_TEMP_CLONE | **true** |

Symlink pattern exists in release deploy, but only under **root** identity. Ad-hoc temp-clone + symlink for `synqdrive-admin` is **not** an established supported migration path. **Do not** chmod/chown `backend.env` merely to support that pattern.

---

## 12. Safe credential-presence probe

| Probe | Result |
|-------|--------|
| synqdrive-admin direct read | `DATABASE_URL_PRESENT=false` |
| sudo canonical source | `DATABASE_URL_PRESENT=true`, `DATABASE_URL_LENGTH_GT_ZERO=true` |
| CANONICAL_CONTEXT_DATABASE_URL_ACCESS | **true** |
| Values printed | **none** |

---

## 13. Prisma validate (canonical context)

Command (read-only): `sudo bash -lc 'source /opt/synqdrive/shared/backend.env; cd /opt/synqdrive/current/backend && npx prisma validate'`

| Gate | Value |
|------|-------|
| CANONICAL_CONTEXT_PRISMA_VALIDATE | **true** |
| EXIT_CODE | **0** |

---

## 14. Read-only migrate status (future retry context)

PR branch shallow clone + canonical sudo/source env (no deploy):

| Gate | Value |
|------|-------|
| PENDING_COUNT | **2** |
| PENDING_NAMES | `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge`, `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` |
| UNEXPECTED_PENDING_MIGRATIONS | **0** |

Note: output may also list database-only privacy migrations absent from PR branch; bridge pending set is exact.

---

## 15. Would-deploy set

| Gate | Value |
|------|-------|
| WOULD_DEPLOY_COUNT | **2** |
| EXPECTED_CATALOG_MUTATIONS_TOTAL | **0** |
| EXPECTED_LEDGER_MUTATIONS_TOTAL | **2** |

| Migration | EXPECTED_CATALOG_MUTATIONS | EXPECTED_LEDGER_MUTATIONS |
|-----------|---------------------------|---------------------------|
| `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` | 0 | 1 |
| `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` | 0 | 1 |

---

## 16. Four-object exact parity (fresh live)

PR branch verifier via canonical sudo/source + `verify-history-bridge-semantics.ts`:

| Gate | Value |
|------|-------|
| LIVE_SHORT_CODE_EXACT | **true** |
| LIVE_SHORT_CODE_INDEX_EXACT | **true** |
| LIVE_DRIVETYPE_EXACT | **true** |
| LIVE_VEHICLES_DRIVE_TYPE_EXACT | **true** |

---

## 17. R3B / M252 parity

| Gate | Value |
|------|-------|
| R3B objects | **19/19** |
| R3B tables | **9/9** |
| R3B enums | **10/10** |
| R3B properties | **54/54** |
| M252_SEMANTIC_MISMATCHES | **0** |

---

## 18. Root-cause classification

| Field | Value |
|-------|-------|
| INCIDENT_ROOT_CAUSE_CLASS | **B** — `WRONG_PRODUCTION_EXECUTION_USER` |
| Secondary factor | **A** — temp-clone symlink without canonical root/sudo env loading |
| INCIDENT_ROOT_CAUSE | Authorized R3B1R.1.2 deploy ran as `synqdrive-admin` using temp-clone `.env` symlink; `backend.env` is root-only `600`, so Prisma failed with P1012/EACCES before any migration SQL |
| DATABASE_STATE_AFFECTED | **false** |

Not primary: canonical secret misconfiguration (permissions are intentional for root deploy). Not: wrong env file path (path is correct; access identity is wrong).

---

## 19. Proposed remediation / retry path (DO NOT EXECUTE HERE)

| Field | Value |
|-------|-------|
| PROPOSED_RETRY_EXECUTION_USER | **root** (`sudo bash -lc` on VPS, matching `vps-deploy-release.sh`) |
| PROPOSED_RETRY_WORKDIR | Fresh shallow clone of PR branch; `ln -sfn /opt/synqdrive/shared/backend.env backend/.env` |
| PROPOSED_RETRY_ENV_MECHANISM | `sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a'` before Prisma |
| PROPOSED_RETRY_COMMAND | `npm run prisma:migrate:deploy` (single attempt, separately re-authorized) |

**Explicit exclusions:** no chmod/chown on `backend.env`, no credential copy into repo, no `prisma migrate resolve`, no bridge SQL edits.

---

## 20. Production immutability (R3B1R.1.2a)

| Metric | Value |
|--------|-------|
| PRODUCTION_DATABASE_MUTATIONS_R3B1R112A | **0** |
| PRODUCTION_CATALOG_MUTATIONS_R3B1R112A | **0** |
| PRODUCTION_LEDGER_MUTATIONS_R3B1R112A | **0** |
| PRODUCTION_IMMUTABLE_R3B1R112A | **true** |

Post-assessment fingerprints unchanged from R3B1R.1.2 incident state.

---

## 21. Explicit no-retry boundary

- R3B1R.1.2a **did not** retry `prisma migrate deploy`
- R3B1R.1.2a **did not** mutate Production schema, data, or `_prisma_migrations`
- PR #1054 **was not** merged
- R3B1R.2 **not** started

A future retry requires **separate remediation** (use canonical root/sudo execution path) and **explicit re-authorization**.

---

## Machine status

```
CI_R3B1R112A_PRODUCTION_ENV_ACCESS_INCIDENT_ASSESSMENT_COMPLETED

R3B1R112_INCIDENT_CLASS = EXECUTION_ENVIRONMENT_ONLY
DATABASE_STATE = UNCHANGED
R3B1R112_RETRY_READINESS = READY_FOR_SEPARATE_ENV_REMEDIATION_AND_REAUTHORIZATION
R3B1R12_READINESS = NOT_READY
PR1054_MERGE_READINESS = BLOCKED
```

Inherited incident gate remains: `CI_R3B1R112_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_INCIDENT`

---

## Changes / Architektur

**Changes:** not updated (read-only incident assessment evidence only).  
**Architektur:** not updated.
