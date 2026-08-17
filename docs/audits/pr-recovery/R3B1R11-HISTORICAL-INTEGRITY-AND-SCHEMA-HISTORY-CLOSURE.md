# R3B1R.1.1 — Historical Migration Integrity + Missing Schema-History Closure

**Phase:** `CI-R3B1R.1.1`  
**Generated:** `2026-08-16T14:45:00+00:00`  
**Result:** **SOURCE REMEDIATION COMPLETE — OUTCOME B (Production history bridge pending)**  
**Mode:** Source remediation + read-only Production inspection (`PRODUCTION_MUTATIONS_R3B1R11=0`)

Raw assessment: `docs/audits/ci-recovery/data/ci-r3b1r11-assessment-raw-2026-08.json`

---

## 1. Entry state

| Field | Value |
|-------|-------|
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| BRANCH | `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08` |
| ENTRY_HEAD_SHA | `63dd1d6a97b812570de7ab5a512d7686aaa7a27f` |
| PR_1054_HEAD_SHA | `63dd1d6a97b812570de7ab5a512d7686aaa7a27f` |
| CURRENT_MAIN_SHA | `721ad893d15cfa46786a112860548ce12a2be71d` |
| PR_STATE | OPEN |
| PR_IS_DRAFT | true |
| WORKTREE_CLEAN | true (at entry) |

### GitHub checks at entry (HEAD `63dd1d6a`)

| Check | Result |
|-------|--------|
| Migration tests (PostgreSQL) | PASS |
| Playwright E2E (Vehicle Detail) | PASS |
| Backend integration tests | **FAIL** — `organizations.short_code` missing |
| Security / dependency scan (Legal Documents workflow) | **FAIL** — backend `npm audit --audit-level=high` (pre-existing) |
| Security / dependency scan (Vehicle Detail workflow) | PASS (critical-only gate) |
| CI gate (Legal Documents workflow) | PASS |
| CI gate (Vehicle Detail workflow) | skipping (failed deps in sibling workflow) |

---

## 2. M252 post-application rewrite proof (preserved)

| Field | Value |
|-------|-------|
| MAIN_FILE_SHA256 | `12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9` |
| PR_FILE_SHA256 (before R3B1R.1.1) | `415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee` |
| PRODUCTION_LEDGER_CHECKSUM | `12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9` |
| FIRST_SUCCESSFUL_PROD_FINISHED_AT | `2026-07-22 13:49:51.333878+00` |
| REPAIR_COMMIT_SHA | `ee634cef5d46004e39f5c61588f9251cc3d4a00b` |
| REPAIR_COMMIT_TIME | `2026-08-15 15:06:20 +0000` |

**Verdict:** `POST_APPLICATION_REWRITE=true` (unchanged; repair commit post-dates first successful Production apply).

---

## 3. Historical migration restoration

Restored `backend/prisma/migrations/20260721270000_iam_role_assignment_drift_reconciliation/migration.sql` byte-for-byte to `origin/main` / Production ledger bytes.

| Field | Value |
|-------|-------|
| RESTORED_FILE_SHA256 | `12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9` |
| PRODUCTION_LEDGER_CHECKSUM | `12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9` |
| SOURCE_CHECKSUM_MATCHES_PRODUCTION_LEDGER | **true** |
| POST_APPLICATION_SOURCE_CHECKSUM_MISMATCH | **false** |
| APPLIED_HISTORICAL_MIGRATIONS_REWRITTEN_UNAUTHORIZED | **0** |

---

## 4. Clean-bootstrap collision reproduction (authoritative bytes)

| Field | Value |
|-------|-------|
| EXACT_FAILING_STATEMENT | `CREATE UNIQUE INDEX "organization_role_assignment_drift_reconciliation_applications_idempotency_key_key" …` |
| POSTGRES_ERROR_CODE | `42P07` |
| TRUNCATED_IDENTIFIER_A | `organization_role_assignment_drift_reconciliation_applications_` |
| TRUNCATED_IDENTIFIER_B | `organization_role_assignment_drift_reconciliation_applications_` |
| COLLISION_PROVEN | **true** |

Long PK / unique / composite index names all truncate to the same 63-byte PostgreSQL identifier.

---

## 5. Ephemeral recovery design (outside `migrations/**`)

Extended `backend/scripts/test/prisma-migrate-deploy-resilient.sh` with:

1. Exact migration identity gate: `20260721270000_iam_role_assignment_drift_reconciliation`
2. Exact failure gate: PostgreSQL `42P07` / `42710` / `already exists` on deploy log for that migration
3. Ephemeral context gate: `PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1` (set by CI/bootstrap scripts only; **not** used by VPS deploy)
4. Corrected semantic DDL via `backend/scripts/apply-m252-ephemeral-recovery.ts` (short approved constraint/index names)
5. Exact parity verification via `backend/scripts/verify-m252-exact-parity.ts`
6. `prisma migrate resolve --applied` only after parity pass
7. Continue normal deploy

| Guard | Value |
|-------|-------|
| PRODUCTION_RECOVERY_PATH_FOR_HISTORICAL_M252 | **false** |
| EPHEMERAL_RECOVERY_EXACT_IDENTITY_BOUND | **true** |
| EPHEMERAL_RECOVERY_FAIL_CLOSED | **true** |

Production deploy path remains `npm run prisma:migrate:deploy` in `vps-deploy-release.sh` (no resilient helper).

---

## 6. Tail recovery hardening

Replaced table-existence-only tail resolve with mandatory exact M252 semantic parity before resolve.

| Guard | Value |
|-------|-------|
| TABLE_EXISTENCE_ONLY_RESOLVE_ALLOWED | **false** |
| EXACT_M252_PARITY_REQUIRED_BEFORE_TAIL_RESOLVE | **true** |

Negative fail-closed tests: `backend/scripts/test/m252-exact-parity-negative.test.sh` (7 cases: wrong column, PK, unique, composite, FK target, FK action, unexpected object) — **PASS**.

---

## 7. `organizations.short_code` provenance

| Field | Value |
|-------|-------|
| SHORT_CODE_IN_SCHEMA | true (`Organization.shortCode String? @unique @map("short_code")`) |
| SHORT_CODE_CREATED_BY_EXISTING_MIGRATION | **false** (no migration in tree creates it) |
| SHORT_CODE_EXISTING_CREATOR_MIGRATION | null |
| SHORT_CODE_PRESENT_IN_LIVE_PRODUCTION | **true** |
| SHORT_CODE_LIVE_TYPE | `text` |
| SHORT_CODE_LIVE_NULLABLE | `YES` |
| SHORT_CODE_LIVE_DEFAULT | null |
| SHORT_CODE_LIVE_UNIQUE | true (`organizations_short_code_key`) |
| SHORT_CODE_LIVE_INDEX_OR_CONSTRAINT_NAME | `organizations_short_code_key` |
| SHORT_CODE_ORIGIN_PROVENANCE | schema field from initial monorepo; live Production object predates migration-tree coverage |

Bootstrap after remediation:

| Field | Value |
|-------|-------|
| MAIN_CLEAN_BOOTSTRAP_HAS_SHORT_CODE | true (with bridge) |
| PR_CLEAN_BOOTSTRAP_HAS_SHORT_CODE | true (with bridge) |

---

## 8. Append-only bridge migration (source only — NOT applied to Production)

| Field | Value |
|-------|-------|
| SHORT_CODE_BRIDGE_MIGRATION_REQUIRED | **true** |
| SHORT_CODE_BRIDGE_MIGRATION_NAME | `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` |
| SHORT_CODE_BRIDGE_SHA256 | `00511c4d29b7b16ccc660c68bf27b8021c19c857eba85aaa39af1c42631fc713` |
| EXPECTED_PRODUCTION_CATALOG_CHANGE_COUNT | **0** (idempotent DO blocks; column/index already correct) |
| EXPECTED_PRODUCTION_LEDGER_CHANGE_COUNT | **1** (append ledger row only) |

SQL: idempotent nullable `TEXT` column + unique index with fail-closed incompatible-object checks.

---

## 9. Empty database bootstrap

| Field | Result |
|-------|--------|
| EMPTY_DATABASE_DEPLOY_PASS | **true** |
| EMPTY_DATABASE_FINAL_SCHEMA_MATCHES_PRISMA | **true** |
| M252_SEMANTIC_MISMATCHES | **0** |
| SHORT_CODE_PRESENT | **true** |
| SHORT_CODE_SEMANTICS_MATCH | **true** |
| PHYSICAL_TAIL_HISTORY_COMPLETE | **true** |
| FAILED_MIGRATIONS | **0** (successful applied rows for all migrations) |
| INCOMPLETE_MIGRATIONS | **0** (rolled-back failure rows only; expected recovery artifact) |

Command: `bash scripts/test/legal-documents-migration-test.sh empty`

---

## 10. Legacy database bootstrap

| Field | Result |
|-------|--------|
| LEGACY_DATABASE_DEPLOY_PASS | **true** |
| LEGACY_FINAL_SCHEMA_MATCHES_PRISMA | **true** |

Command: `bash scripts/test/legal-documents-migration-test.sh legacy`

---

## 11. Backend integration

| Field | Result |
|-------|--------|
| BACKEND_INTEGRATION_PASS | **true** |

Command: resilient deploy + `npm run test:legal-documents:integration` — 4 suites / 25 tests PASS. Prior `organizations.short_code` failure eliminated via migration history (not test weakening).

---

## 12. Local CI-relevant tests

| Gate | Result |
|------|--------|
| Prisma validate | PASS |
| Migration tests (empty + legacy) | PASS |
| M252 negative parity tests | PASS (7/7) |
| Backend integration | PASS |
| `ci_r3b1q2_golden_tests.py` | 17/17 PASS |
| Dependency audit (`audit-dependencies.sh`) | **FAIL** — backend 10 high (pre-existing; unchanged scope) |

`LOCAL_FAILED=1` (dependency audit only; migration/integration gates pass)

---

## 13. Live Production read-only recheck

| Field | Value |
|-------|-------|
| PRODUCTION_MUTATIONS_R3B1R11 | **0** |
| PRODUCTION_IMMUTABLE_R3B1R11 | **true** |
| M252 ledger checksum | `12bf2015…` (matches restored source) |
| M252 first apply | `2026-07-22 13:49:51.333878+00` |
| Tail ledger checksum | `c158dcbb…` |
| Stale recovery indexes | absent (`org_invoices_invoice_number_key`, `whatsapp_conversations_organization_id_contact_phone_key` count 0) |
| Bridge ledger row | absent (expected — not deployed) |
| Live `short_code` | `text`, nullable, unique index `organizations_short_code_key` |

---

## 14. Prisma pending / would-deploy (read-only analysis)

Against live Production catalog + remediated PR source:

| Field | Expected |
|-------|----------|
| PRISMA_PENDING_COUNT | **1** |
| PRISMA_PENDING_NAMES | `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` |
| WOULD_DEPLOY_COUNT | **1** |
| WOULD_DEPLOY_NAMES | same bridge only |
| UNEXPECTED_PENDING_MIGRATIONS | **0** |

Current deployed release reports up-to-date (306 migrations). Remediated source adds exactly one append-only bridge pending separately authorized Production execution.

---

## 15. Migration-history integrity final check

| Field | Value |
|-------|-------|
| APPLIED_HISTORICAL_MIGRATIONS_REWRITTEN_UNAUTHORIZED | **0** |
| APPLIED_HISTORICAL_MIGRATIONS_DELETED | **0** |
| APPLIED_HISTORICAL_MIGRATIONS_RENAMED | **0** |
| 20260721270000 SOURCE_CHECKSUM_MATCHES_PRODUCTION_LEDGER | **true** |

---

## 16. Changed files

- `backend/prisma/migrations/20260721270000_iam_role_assignment_drift_reconciliation/migration.sql` — restored to ledger/main bytes
- `backend/scripts/apply-m252-ephemeral-recovery.ts` — ephemeral corrected semantic DDL
- `backend/scripts/verify-m252-exact-parity.ts` — fail-closed M252 parity verifier
- `backend/scripts/test/prisma-migrate-deploy-resilient.sh` — M252 + hardened tail recovery
- `backend/scripts/test/m252-exact-parity-negative.test.sh` — negative parity tests
- `backend/scripts/test/legal-documents-migration-test.sh` — ephemeral recovery flag
- `backend/prisma/migrations/20260816152200_ci_r3b1r11_organizations_short_code_history_bridge/migration.sql` — short_code bridge (source only)
- `.github/workflows/legal-documents-production-readiness.yml` — ephemeral recovery flag on integration job
- `docs/audits/ci-recovery/data/ci-r3b1r11-assessment-raw-2026-08.json`
- This document

---

## 17. Machine status — OUTCOME B

```
CI_R3B1R11_HISTORICAL_INTEGRITY_SCHEMA_HISTORY_CLOSURE_COMPLETED

HISTORICAL_MIGRATION_INTEGRITY = RESTORED_AND_LEDGER_ALIGNED
SCHEMA_HISTORY = APPEND_ONLY_PRODUCTION_HISTORY_BRIDGE_REQUIRED
R3B1R12_READINESS = NOT_READY_PENDING_SEPARATELY_AUTHORIZED_SHORT_CODE_HISTORY_BRIDGE
PR1054_MERGE_READINESS = BLOCKED

NEXT_PHASE = R3B1R1_2_CONTROLLED_PRODUCTION_HISTORY_BRIDGE
```

**R3B1R.1.1 DID NOT MUTATE PRODUCTION. PR #1054 WAS NOT MERGED. DO NOT START R3B1R.2.**

---

## Changes / Architektur

**Changes:** not updated (audit/remediation phase only).  
**Architektur:** not updated.
