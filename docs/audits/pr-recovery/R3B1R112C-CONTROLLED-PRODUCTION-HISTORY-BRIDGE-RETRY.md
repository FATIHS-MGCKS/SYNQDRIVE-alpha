# R3B1R.1.2c — Controlled Production History-Bridge Retry

**Phase:** `CI-R3B1R.1.2c`  
**Generated:** `2026-08-16T20:32:17+00:00`  
**Result:** **SUCCESS** — exactly one authorized Production deploy; two ledger-only history bridges applied  
**Mode:** Authorized Production retry after R3B1R.1.2 environment-only incident

**Authoritative preflight:** `R3B1R112B1-FAIL-CLOSED-RETRY-PREFLIGHT-EVIDENCE-REPAIR.md`  
**Supersedes deploy incident:** `R3B1R112-CONTROLLED-PRODUCTION-HISTORY-BRIDGE-DEPLOYMENT.md` (R3B1R.1.2 — zero migrations applied)  
**Raw evidence:** `docs/audits/ci-recovery/data/ci-r3b1r112c-assessment-raw-2026-08.json`  
**Orchestrator (audit tooling):** `docs/audits/ci-recovery/tooling/ci_r3b1r112c_run_retry.py`

---

## 1. Explicit retry authorization

Separate explicit user authorization received for R3B1R.1.2c Production retry after the R3B1R.1.2 execution-environment incident (`EACCES` on temp `.env` symlink; Prisma never reached migration SQL).

Inherited accepted preflight state:

| Field | Value |
|-------|-------|
| CI_R3B1R112B1 | `FAIL_CLOSED_RETRY_PREFLIGHT_EVIDENCE_REPAIR_COMPLETED` |
| RETRY_PREFLIGHT_AUTHORITY | `INDEPENDENTLY_DERIVED_AND_FAIL_CLOSED` |
| EXECUTION_ENV_REMEDIATION | `CANONICAL_ROOT_SUDO_PATH_VERIFIED` |
| R3B1R112_RETRY_READINESS (pre-retry) | `READY_FOR_SEPARATE_EXPLICIT_PRODUCTION_RETRY_AUTHORIZATION` |

This phase authorized **exactly one** `npm run prisma:migrate:deploy` attempt. No second deploy, no `prisma migrate resolve`, no manual ledger repair.

---

## 2. Entry / PR identity

| Field | Value |
|-------|-------|
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| BRANCH | `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08` |
| ENTRY_HEAD_SHA | `dd8fd40a9a2e5f4722242ebd83a6dee55457e16f` |
| PR_1054_HEAD_SHA | `dd8fd40a9a2e5f4722242ebd83a6dee55457e16f` |
| CURRENT_MAIN_SHA | `721ad893d15cfa46786a112860548ce12a2be71d` |
| PR_STATE | OPEN |
| PR_IS_DRAFT | true |
| PR1054_MERGED | **false** |
| CURRENT_PR_BACKEND_TREE_SHA | `453da01cdec9500db1e112f5afa7d0169f6da138` |
| FROZEN_EXECUTABLE_BACKEND_TREE_SHA | `453da01cdec9500db1e112f5afa7d0169f6da138` |

Full PR HEAD advanced with audit-only commits after R3B1R.1.2b.1; executable backend tree bytes remain frozen at `453da01c…`.

---

## 3. Frozen bridge authority

| Bridge | SHA256 | Match |
|--------|--------|-------|
| `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` | `30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006` | **true** |
| `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` | `a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82` | **true** |

`BRIDGE_SHA_MISMATCHES=0` (recalculated from exact retry source at deploy time and re-verified post-deploy).

**Frozen retry command SHA256:** `192edfa3eb4dc110c788e7fca80f4478b55a2a325e71899a725dd67f08dbfcbc`

**Canonical execution mechanism:**

```bash
sudo bash -lc '
  set -eo pipefail
  set -a
  source /opt/synqdrive/shared/backend.env
  set +a
  set -u
  cd "<EXACT_RETRY_BACKEND_PATH>"
  npm run prisma:migrate:deploy
'
```

No temporary `.env` symlink. Not executed as `synqdrive-admin`. Not `sudo -E`.

---

## 4. Recovery / backup (pre-deploy)

| Field | Value |
|-------|-------|
| BACKUP_METHOD | `postgres_pg_dump_gzip` |
| BACKUP_IDENTIFIER | `/opt/synqdrive/shared/backups/db-pre-r3b1r112c_20260816192940.sql.gz` |
| BACKUP_SIZE_BYTES | **58346233** |
| BACKUP_CHECKSUM_SHA256 | `d4c230500e8223daa1d9366550be22df93a6f35e0ff1182921efa5efc027d59d` |
| RESTORE_OWNER | `platform_ops` |
| RESTORE_PATH_VERIFIED | **true** |
| RECOVERY_READINESS | **true** |

Backup completed immediately before the authorized deploy window (deploy ledger timestamps ~19:40:12Z).

---

## 5. Production target (read-only)

| Field | Value |
|-------|-------|
| LIVE_PRODUCTION_ACCESS | **true** |
| PRODUCTION_TARGET_CONFIRMED | **true** |
| DATABASE_NAME | `synqdrive` |
| EXPECTED_SCHEMA | `public` |
| ENVIRONMENT_IDENTITY | Production VPS (`app.synqdrive.eu`) |

Credentials not recorded in this artifact.

---

## 6. Canonical secret context

| Field | Value |
|-------|-------|
| ENV_FILE | `/opt/synqdrive/shared/backend.env` |
| owner | `root` |
| group | `root` |
| mode | `600` |
| SECRET_PERMISSION_CONFIGURATION_CANONICAL | **true** |
| DATABASE_URL_PRESENT | **true** |
| DATABASE_URL_LENGTH_GT_ZERO | **true** |

Verified in exact future execution shell via root `sudo bash -lc` explicit source. No permission changes made.

---

## 7. Pre-deploy ledger BEFORE

| Field | Value |
|-------|-------|
| LEDGER_ROW_COUNT_BEFORE | **339** |
| LEDGER_FINISHED_COUNT_BEFORE | **323** |
| LEDGER_FAILED_COUNT_BEFORE | **16** (pre-existing) |
| LEDGER_INCOMPLETE_COUNT_BEFORE | **0** |
| LEDGER_FINGERPRINT_BEFORE | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| BRIDGE_1_LEDGER_ROW_EXISTS_BEFORE | **false** |
| BRIDGE_2_LEDGER_ROW_EXISTS_BEFORE | **false** |

Baseline bound from R3B1R.1.2b.1 immutability proof (unchanged between preflight end and retry deploy).

---

## 8. Catalog fingerprint BEFORE

`CATALOG_FINGERPRINT_BEFORE=` `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58`

---

## 9. Pre-deploy four-object exact parity

| Gate | Result |
|------|--------|
| LIVE_SHORT_CODE_EXACT | **true** |
| LIVE_SHORT_CODE_INDEX_EXACT | **true** (btree unique, NULLS NOT DISTINCT, full attribute binding) |
| LIVE_DRIVETYPE_EXACT | **true** (`FWD`, `RWD`, `AWD`, `FOUR_WD` exact order) |
| LIVE_VEHICLES_DRIVE_TYPE_EXACT | **true** (nullable, no default) |
| BRIDGE_EXACT_LIVE_PARITY | **true** |

Verified at mutation-barrier pass before deploy (R3B1R.1.2b.1 + fresh remote gates).

---

## 10. Pre-deploy R3B / M252

| Scope | Result |
|-------|--------|
| R3B objects | **19/19** |
| R3B tables | **9/9** |
| R3B enums | **10/10** |
| R3B properties | **54/54** |
| Critical authority counters | all **0** |
| M252_SEMANTIC_MISMATCHES | **0** |
| R3B_AUTHORITY_PARITY | **true** |
| M252_AUTHORITY_PARITY | **true** |

Both stale recovery indexes absent.

---

## 11. Pre-deploy parsed pending set (fail-closed)

| Field | Value |
|-------|-------|
| PARSER_VALID | **true** |
| DATABASE_ONLY_PARSE_VALID | **true** |
| STATUS_PENDING_COUNT | **2** |
| STATUS_UNEXPECTED_PENDING_NAMES | **[]** |
| STATUS_MISSING_EXPECTED_PENDING_NAMES | **[]** |
| UNEXPLAINED_DATABASE_ONLY_MIGRATIONS | **0** |

**STATUS_PENDING_NAMES:**

- `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge`
- `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge`

17 accepted Production-only privacy migrations fully explained (R3B1N.1 authority set).

---

## 12. Independent would-deploy (pre-deploy)

| Field | Value |
|-------|-------|
| INDEPENDENT_CALCULATION_VALID | **true** |
| INDEPENDENT_WOULD_DEPLOY_COUNT | **2** |
| STATUS_VS_INDEPENDENT_SET_MATCH | **true** |
| UNEXPECTED_INDEPENDENT_WOULD_DEPLOY_NAMES | **[]** |
| MISSING_EXPECTED_INDEPENDENT_NAMES | **[]** |

Expected mutation accounting pre-deploy:

| Bridge | Catalog | Ledger |
|--------|---------|--------|
| Bridge 1 (short_code) | 0 | 1 |
| Bridge 2 (drive_type) | 0 | 1 |
| **Total** | **0** | **2** |

---

## 13. Mutation barrier

`R3B1R112C_MUTATION_BARRIER=PASS` (all gates true before deploy).

Concurrent migration runner blocked; execution window ready; no other deploy lock conflict.

---

## 14. Deploy execution (single authorized attempt)

| Field | Value |
|-------|-------|
| DEPLOY_ATTEMPT_COUNT | **1** |
| DEPLOY_EXIT_CODE | **0** |
| DEPLOY_STARTED_AT | `2026-08-16T19:40:12.174153Z` |
| DEPLOY_FINISHED_AT | `2026-08-16T19:40:12.239261Z` |
| MIGRATIONS_ATTEMPTED | **2** |
| MIGRATIONS_APPLIED | **2** |
| UNEXPECTED_MIGRATIONS_APPLIED | **0** |

**Applied migrations (exactly and only):**

1. `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge`
2. `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge`

Deploy stdout/stderr were captured during the live deploy session. Final post-deploy verification JSON binds deploy outcome primarily via Production `_prisma_migrations` ledger reconstruction (`evidence_source=production_ledger_reconstruction_after_single_authorized_deploy`) after verify-only re-runs superseded the in-memory deploy transcript. Ledger timestamps, checksums, and row arithmetic are consistent with a successful two-bridge ledger-only apply.

Sanitized expected deploy output pattern:

```
Applying migration `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge`
Applying migration `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge`
All migrations have been successfully applied.
```

---

## 15. Ledger AFTER

| Field | Value |
|-------|-------|
| LEDGER_ROW_COUNT_AFTER | **341** |
| LEDGER_FINISHED_COUNT_AFTER | **325** |
| LEDGER_FAILED_COUNT_AFTER | **16** |
| LEDGER_INCOMPLETE_COUNT_AFTER | **0** |
| LEDGER_FINGERPRINT_AFTER | updated (+2 finished rows) |
| NEW_LEDGER_ROWS | **2** |
| NEW_FINISHED_ROWS | **2** |
| NEW_FAILED_ROWS | **0** |
| NEW_INCOMPLETE_ROWS | **0** |

### Bridge checksum bindings

| Bridge | Exists | Finished | Rolled back | Checksum match |
|--------|--------|----------|-------------|----------------|
| short_code history bridge | **true** | **true** | **false** | **true** (`30557c65…`) |
| drive_type history bridge | **true** | **true** | **false** | **true** (`a5054aff…`) |

---

## 16. Catalog immutability

| Field | Value |
|-------|-------|
| CATALOG_FINGERPRINT_AFTER | `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58` |
| CATALOG_FINGERPRINT_UNCHANGED | **true** |
| PRODUCTION_CATALOG_MUTATIONS_R3B1R112C | **0** |

`CATALOG_FINGERPRINT_BEFORE == CATALOG_FINGERPRINT_AFTER`

---

## 17. Post-deploy four-object exact parity

| Gate | Result |
|------|--------|
| LIVE_SHORT_CODE_EXACT_AFTER | **true** |
| LIVE_SHORT_CODE_INDEX_EXACT_AFTER | **true** |
| LIVE_DRIVETYPE_EXACT_AFTER | **true** |
| LIVE_VEHICLES_DRIVE_TYPE_EXACT_AFTER | **true** |

---

## 18. Post-deploy Prisma status

| Field | Value |
|-------|-------|
| POST_DEPLOY_PARSER_VALID | **true** |
| POST_DEPLOY_PENDING_COUNT | **0** |
| POST_DEPLOY_PENDING_NAMES | **[]** |
| POST_DEPLOY_UNEXPECTED_PENDING_NAMES | **[]** |
| POST_DEPLOY_UNEXPLAINED_DATABASE_ONLY_MIGRATIONS | **0** |
| Status message | `Database schema is up to date!` |

---

## 19. Post-deploy independent would-deploy (idempotency)

| Field | Value |
|-------|-------|
| POST_DEPLOY_INDEPENDENT_CALCULATION_VALID | **true** |
| POST_DEPLOY_WOULD_DEPLOY_COUNT | **0** |
| POST_DEPLOY_WOULD_DEPLOY_NAMES | **[]** |

No second Production deploy authorized in R3B1R.1.2c.

---

## 20. Final R3B / M252

| Scope | Result |
|-------|--------|
| R3B_FINAL_PARITY | **true** (19/19, 9/9, 10/10, 54/54) |
| M252_FINAL_PARITY | **true** (0 semantic mismatches) |
| Critical authority counters | all **0** |

---

## 21. PR target vs live Production

| Scope | Value |
|-------|-------|
| POST_BRIDGE_R3B_SCOPE | **0** |
| POST_BRIDGE_M252_SCOPE | **0** |
| POST_BRIDGE_UNKNOWN_SCOPE | **0** |
| POST_BRIDGE_NEW_STRATEGY_DRIFT | **0** |
| POST_BRIDGE_UNATTRIBUTED | **0** |
| PR_TARGET_TOTAL_DIFF (raw, informational) | **393** |

Raw total not used alone as safety decision; scoped attribution gates all zero.

---

## 22. Application health

| Field | Value |
|-------|-------|
| APPLICATION_HEALTH_PASS | **true** |
| DATABASE_CONNECTIVITY_PASS | **true** |
| NORMAL_OPERATIONS_ACTIVE | **true** (API health `status=ok`) |
| MIGRATION_EXECUTION_LOCK_RELEASED | **true** |

No application code deployed. No unnecessary service restarts.

---

## 23. Mutation accounting

| Field | Value |
|-------|-------|
| DEPLOY_INVOCATIONS_R3B1R112C | **1** |
| MIGRATIONS_APPLIED_R3B1R112C | **2** |
| PRODUCTION_LEDGER_ROWS_ADDED_R3B1R112C | **2** |
| PRODUCTION_FINISHED_LEDGER_ROWS_ADDED_R3B1R112C | **2** |
| PRODUCTION_FAILED_LEDGER_ROWS_ADDED_R3B1R112C | **0** |
| PRODUCTION_INCOMPLETE_LEDGER_ROWS_ADDED_R3B1R112C | **0** |
| PRODUCTION_CATALOG_MUTATIONS_R3B1R112C | **0** |
| PRODUCTION_SCHEMA_SEMANTIC_CHANGES_R3B1R112C | **0** |

---

## 24. Source / tooling immutability

| Field | Value |
|-------|-------|
| CURRENT_BACKEND_TREE_SHA_AFTER | `453da01cdec9500db1e112f5afa7d0169f6da138` |
| BRIDGE_SOURCE_CHANGED_DURING_R3B1R112C | **0** |
| SCHEMA_PRISMA_CHANGED_DURING_R3B1R112C | **false** |
| APPLICATION_RUNTIME_CHANGED_DURING_R3B1R112C | **0** |
| PRECHECK_TOOLING_CHANGED_DURING_R3B1R112C | **0** (deploy phase); audit orchestrator retained for evidence capture only |

Only sanitized evidence added after Production verification.

---

## 25. Security / CI blocker (separate from bridge result)

| Field | Value |
|-------|-------|
| LEGAL_DEPENDENCY_SCAN_STATUS | **FAIL** |
| DEPENDENCY_FINDINGS_HIGH | **10** |
| PR_INTRODUCED | **0** |
| MAIN_REPRODUCES | **true** |

Merge blocker may remain after bridge success. Does not alter Production bridge outcome.

---

## 26. Machine status

```
CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_COMPLETED
R3B1R112_EXECUTION=RECOVERED_FROM_ENVIRONMENT_ONLY_INCIDENT
R3B1R_HISTORY_BRIDGE=PRODUCTION_HISTORY_ALIGNED_WITH_FROZEN_SOURCE
BRIDGE_EXECUTION=TWO_LEDGER_ONLY_BRIDGES_APPLIED_ZERO_CATALOG_MUTATIONS
R3B1R12_READINESS=READY_FOR_INDEPENDENT_FROZEN_POST_REMEDIATION_ACCEPTANCE
PR1054_MERGE_READINESS=BLOCKED_PENDING_R3B1R12
```

---

## 27. Next phase boundary

**PR #1054 was NOT merged.**

**Next required phase:** R3B1R.2 — Independent Frozen Post-Remediation Acceptance.

Do **not** merge PR #1054 until R3B1R.2 completes.

---

## 28. Incident recovery note

R3B1R.1.2 failed with `ENV_ACCESS_INCIDENT` before any migration SQL executed. R3B1R.1.2c retried using the canonical root `sudo bash -lc` + explicit `backend.env` source path verified in R3B1R.1.2b.1. Production database catalog state was unchanged across both attempts until the authorized ledger-only bridges were applied.
