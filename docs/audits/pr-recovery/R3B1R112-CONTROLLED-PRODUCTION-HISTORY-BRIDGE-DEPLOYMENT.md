# R3B1R.1.2 — Controlled Production History-Bridge Deployment

**Phase:** `CI-R3B1R.1.2`  
**Generated:** `2026-08-16T16:40:00+00:00`  
**Result:** **INCIDENT** — deploy attempted once, failed before migration execution  
**Mode:** Authorized Production deploy attempt; **zero ledger/catalog mutations**

Raw assessment: `docs/audits/ci-recovery/data/ci-r3b1r112-assessment-raw-2026-08.json`

---

## 1. Explicit authorization

Separate user authorization received for R3B1R.1.2 after R3B1R.1.1b `FINAL_FROZEN_EXACT_SEMANTICS`.

Inherited gate: `CI_R3B1R111B_FINAL_EXACT_BRIDGE_SEMANTIC_FREEZE_COMPLETED`

---

## 2. Entry identity

| Field | Value |
|-------|-------|
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| BRANCH | `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08` |
| ENTRY_HEAD_SHA | `be199f7806583a66cac45de8cba2044dfaffa7a3` |
| PR_1054_HEAD_SHA | `be199f7806583a66cac45de8cba2044dfaffa7a3` |
| CURRENT_MAIN_SHA | `721ad893d15cfa46786a112860548ce12a2be71d` |
| PR_1054_STATE | OPEN, DRAFT, UNMERGED |
| WORKTREE_CLEAN_AT_ENTRY | **true** |
| R3B1R111B_ACCEPTED_ENTRY | **true** |

---

## 3. Frozen bridge names and SHA256

| Bridge | SHA256 | Match |
|--------|--------|-------|
| `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` | `30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006` | **true** |
| `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` | `a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82` | **true** |

`SOURCE_EVIDENCE_SHA_MISMATCHES=0`

---

## 4. Pre-deploy mutation barrier

All pre-mutation gates passed before backup/deploy:

| Gate | Result |
|------|--------|
| BRIDGE SHA authority | PASS |
| Live four-object exact parity | PASS |
| R3B authority | 54/54 PASS |
| M252 semantic mismatches | 0 |
| Pending / would-deploy set | exactly 2 bridges |
| Ledger incomplete rows | 0 |
| Bridge rows absent from ledger | true |

`R3B1R112_MUTATION_BARRIER=PASS`

---

## 5. Backup / recovery readiness

| Field | Value |
|-------|-------|
| BACKUP_METHOD | `postgres_pg_dump_gzip` |
| BACKUP_OR_SNAPSHOT_IDENTIFIER | `/opt/synqdrive/shared/backups/db-pre-r3b1r112_20260816163505.sql.gz` |
| BACKUP_STARTED_AT | `2026-08-16T16:35:05Z` |
| BACKUP_COMPLETED_AT | `2026-08-16T16:35:23Z` |
| BACKUP_SIZE | 58213268 bytes |
| BACKUP_CHECKSUM | `7ea0442cf3bde6565fb7341dae3ba7384986cd00cbb57c3de908efe2eaa16c85` |
| RECOVERY_READINESS | **true** |

---

## 6. Ledger BEFORE

| Field | Value |
|-------|-------|
| LEDGER_ROW_COUNT_BEFORE | **339** |
| LEDGER_FINISHED_COUNT_BEFORE | **323** |
| LEDGER_FAILED_COUNT_BEFORE | **16** (pre-existing) |
| LEDGER_INCOMPLETE_COUNT_BEFORE | **0** |
| LEDGER_FINGERPRINT_BEFORE | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| BRIDGE_1_LEDGER_ROW_EXISTS_BEFORE | **false** |
| BRIDGE_2_LEDGER_ROW_EXISTS_BEFORE | **false** |

---

## 7. Catalog BEFORE

`CATALOG_FINGERPRINT_BEFORE=` `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58`

---

## 8. Deploy execution (single attempt)

| Field | Value |
|-------|-------|
| DEPLOY_COMMAND | `npm run prisma:migrate:deploy` |
| DEPLOY_STARTED_AT | `2026-08-16T16:37:15Z` |
| DEPLOY_FINISHED_AT | `2026-08-16T16:37:16Z` |
| DEPLOY_ATTEMPT_COUNT | **1** |
| DEPLOY_EXIT_CODE | **1** |

**Failure class:** `ENV_ACCESS_INCIDENT`

Prisma in the temp PR-branch clone could not read `DATABASE_URL` from the symlinked `/opt/synqdrive/shared/backend.env` (`EACCES: permission denied`). Pre-status, deploy, and post-status all failed at schema env load. **No migration SQL executed.**

Sanitized deploy stderr (excerpt):

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DATABASE_URL.
Schema Env Error: Error: EACCES: permission denied, open '.../backend/.env'
```

Per R3B1R.1.2 policy: **no retry**, **no resolve**, **no manual repair** in this phase.

---

## 9. Ledger AFTER (unchanged)

| Field | Value |
|-------|-------|
| LEDGER_ROW_COUNT_AFTER | **339** |
| LEDGER_FINGERPRINT_AFTER | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| NEW_LEDGER_ROWS | **0** |
| NEW_FINISHED_ROWS | **0** |
| NEW_FAILED_ROWS | **0** |
| BRIDGE_1_LEDGER_FINISHED | **false** |
| BRIDGE_2_LEDGER_FINISHED | **false** |

---

## 10. Catalog AFTER (unchanged)

| Field | Value |
|-------|-------|
| CATALOG_FINGERPRINT_AFTER | `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58` |
| CATALOG_MUTATIONS_DETECTED | **0** |

`CATALOG_FINGERPRINT_BEFORE == CATALOG_FINGERPRINT_AFTER`

---

## 11. Mutation accounting

| Metric | Value |
|--------|-------|
| DEPLOY_INVOCATIONS | 1 |
| MIGRATIONS_APPLIED | **0** |
| PRODUCTION_LEDGER_ROWS_ADDED | **0** |
| PRODUCTION_CATALOG_MUTATIONS | **0** |
| PRODUCTION_SCHEMA_SEMANTIC_CHANGES | **0** |

Backup created (authorized pre-deploy step). Bridge history reconciliation **not completed**.

---

## 12. Application health

Read-only health check after failed deploy: **PASS** (`/api/v1/health` returned ok).

---

## 13. Dependency blocker (unchanged)

| Field | Value |
|-------|-------|
| LEGAL_DEPENDENCY_SCAN_STATUS | FAIL (10 backend HIGH, pre-existing) |
| MERGE_BLOCKER_REMAINS | **true** |

---

## 14. Machine status

```
CI_R3B1R112_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_INCIDENT

BRIDGE_EXECUTION = PARTIAL_OR_UNEXPECTED_PRODUCTION_EXECUTION
R3B1R12_READINESS = NOT_READY
PR1054_MERGE_READINESS = BLOCKED
```

---

## 15. Required next steps (outside R3B1R.1.2)

1. Separate incident assessment: fix Production deploy env access (`backend.env` readability for authorized migrate path) without altering bridge semantics.
2. Re-authorize a controlled retry outside this phase.
3. Do **not** run `prisma migrate resolve` or manual ledger edits.
4. Do **not** merge PR #1054.

**R3B1R.1.2 PRODUCED AN UNEXPECTED PRODUCTION RESULT.**  
**DO NOT RETRY PRISMA MIGRATE DEPLOY IN THIS PHASE.**  
**DO NOT RUN PRISMA MIGRATE RESOLVE.**  
**DO NOT MERGE PR #1054.**  
**A SEPARATE INCIDENT ASSESSMENT IS REQUIRED.**

---

## Changes / Architektur

**Changes:** not updated (incident evidence only).  
**Architektur:** not updated.
