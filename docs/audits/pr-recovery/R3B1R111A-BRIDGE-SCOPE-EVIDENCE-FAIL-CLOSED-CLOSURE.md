# R3B1R.1.1a — Bridge Scope, Evidence & Fail-Closed Closure

**Phase:** `CI-R3B1R.1.1a`  
**Generated:** `2026-08-16T15:15:00+00:00`  
**Result:** Bridge source authority frozen — **Production execution NOT authorized**  
**Mode:** Source/evidence closure + read-only Production (`PRODUCTION_MUTATIONS_R3B1R111A=0`)

Supersedes inconsistent portions of `R3B1R11-HISTORICAL-INTEGRITY-AND-SCHEMA-HISTORY-CLOSURE.md` / `ci-r3b1r11-assessment-raw-2026-08.json` regarding bridge SHA and scope. Historical R3B1R.1.1 discrepancy is preserved, not erased.

Raw assessment: `docs/audits/ci-recovery/data/ci-r3b1r111a-assessment-raw-2026-08.json`

---

## 1. Inherited R3B1R.1.1 result

R3B1R.1.1 achieved OUTCOME B (historical M252 restored to ledger bytes; ephemeral recovery added) but bundled undocumented `DriveType`/`drive_type` DDL into a migration named only for `short_code`, and reported conflicting bridge SHA values across commits/evidence.

---

## 2. Entry state

| Field | Value |
|-------|-------|
| ENTRY_HEAD_SHA | `e47bf35a08e7acd719c17929406faa1a867b0bad` |
| CURRENT_MAIN_SHA | `721ad893d15cfa46786a112860548ce12a2be71d` |
| PR #1054 | OPEN, DRAFT, unmerged |
| WORKTREE | clean at entry |

---

## 3. Bridge SHA discrepancy resolution

| SHA | Provenance |
|-----|------------|
| `00511c4d29b7b16ccc660c68bf27b8021c19c857eba85aaa39af1c42631fc713` | Original R3B1R.1.1 short_code-only bridge (commit `16783e27`) |
| `7612396773727d3153baae5a3f547f592d865dbcd1609df7b2b987f49aeb599d` | Bundled short_code + drive_type (commit `0b243f43`; reported in R3B1R.1.1 Markdown/JSON) |

**Canonical current source (R3B1R.1.1a):**

| Migration | SHA256 |
|-----------|--------|
| `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` | `a483d6ca2791c9c917ddd28c54ce04126dc4369d9ebfbde31ee37ca992059a30` |
| `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` | `5531600e0d864eb28fc3b838301a869acaf0cc677ac3c2ad743e9792994aed99` |

`MARKDOWN_RAW_SOURCE_SHA_CONSISTENT=true` (this artifact + raw JSON + pending set).

---

## 4. Complete bridge DDL effect inventory

`BRIDGE_EFFECT_COUNT=4` across **two explicit migrations**:

1. `organizations.short_code` nullable `TEXT` column  
2. `organizations_short_code_key` unique btree index on `(short_code)`  
3. `public."DriveType"` enum labels `FWD,RWD,AWD,FOUR_WD`  
4. `vehicles.drive_type` nullable `"DriveType"` column  

No hidden tasks remain in a single misnamed migration file.

---

## 5. short_code provenance

| Field | Value |
|-------|-------|
| In Prisma schema | yes |
| Created by existing migration | **no** |
| Live Production | `text`, nullable, unique index `organizations_short_code_key` |
| History gap | **yes** |
| Bridge | `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` |

---

## 6. DriveType / drive_type provenance

| Field | Value |
|-------|-------|
| `DriveType` enum in schema | yes |
| `Vehicle.driveType` in schema | yes |
| Enum created by existing migration | **no** |
| Column created by existing migration | **no** |
| Git migration-tree search | no matches |
| History gap | **yes** (`DRIVE_TYPE_HISTORY_BRIDGE_REQUIRED=true`) |

**Live Production (read-only):**

| Field | Value |
|-------|-------|
| LIVE_DRIVETYPE_EXISTS | true |
| LIVE_DRIVETYPE_SCHEMA | `public` |
| LIVE_DRIVETYPE_LABELS_IN_ORDER | `FWD,RWD,AWD,FOUR_WD` |
| LIVE_VEHICLES_DRIVE_TYPE_EXISTS | true |
| LIVE_VEHICLES_DRIVE_TYPE_UDT_SCHEMA | `public` |
| LIVE_VEHICLES_DRIVE_TYPE_UDT_NAME | `DriveType` |
| LIVE_VEHICLES_DRIVE_TYPE_NULLABLE | `YES` |
| LIVE_VEHICLES_DRIVE_TYPE_DEFAULT | null |

Bridge split: `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge`

---

## 7. Per-object Production comparison

| Object | Source expected | Live | Match | Catalog mutation if deployed |
|--------|-----------------|------|-------|------------------------------|
| `organizations.short_code` | nullable TEXT | nullable TEXT | yes | 0 |
| `organizations_short_code_key` | unique btree (short_code) | unique btree (short_code), valid/ready | yes | 0 |
| `public.DriveType` | enum FWD,RWD,AWD,FOUR_WD | same | yes | 0 |
| `vehicles.drive_type` | nullable DriveType | nullable DriveType | yes | 0 |

`EXPECTED_PRODUCTION_CATALOG_CHANGE_COUNT=0`  
Each bridge: `EXPECTED_LEDGER_MUTATIONS=1`

---

## 8. Semantic guard hardening

### short_code
- Migration guards use `pg_index` catalog fields (unique/valid/ready/live/am/key cols/predicate/expression/include-via-def)
- Verifier: `backend/scripts/verify-history-bridge-semantics.ts`
- Negative tests: **7/7 PASS** (`history-bridge-semantics-negative.test.sh`)
- `SHORT_CODE_EXACT_SEMANTIC_GUARD=true`

### DriveType
- Enum guard: namespace, kind=`e`, exact ordered labels, no extras
- Column guard: `atttypid = to_regtype('public."DriveType"')::oid`, nullable, no default
- Negative tests: **6/6 PASS**
- `DRIVE_TYPE_EXACT_SEMANTIC_GUARD=true`

---

## 9. Ephemeral recovery default-off

Changed `prisma-migrate-deploy-resilient.sh`:

```bash
PRISMA_MIGRATE_EPHEMERAL_RECOVERY="${PRISMA_MIGRATE_EPHEMERAL_RECOVERY:-0}"
```

| Guard | Value |
|-------|-------|
| EPHEMERAL_RECOVERY_DEFAULT_ENABLED | **false** |
| EPHEMERAL_RECOVERY_EXPLICIT_OPT_IN_REQUIRED | **true** |

Gate tests (`ephemeral-recovery-gate.test.sh`): unset blocked, `0` blocked, `1` allowed.

---

## 10. Production exposure audit

| Check | Result |
|-------|--------|
| PRODUCTION_USES_RESILIENT_RECOVERY_HELPER | **false** (`vps-deploy-release.sh` uses `npm run prisma:migrate:deploy`) |
| PRODUCTION_SETS_EPHEMERAL_RECOVERY_FLAG | **false** (no workflow/deploy script sets flag) |

Resilient helper used only in CI/bootstrap scripts with explicit `PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1`.

---

## 11. Bootstrap / regression

| Gate | Result |
|------|--------|
| Empty DB deploy | **PASS** (308 migrations) |
| Legacy DB deploy | **PASS** |
| Backend integration + postgres invariants | **PASS** |
| M252 negative tests | **7/7 PASS** |
| Golden tests | **17/17 PASS** |
| M252 source SHA | `12bf2015…` == Production ledger |

`MIGRATION_RELATED_FAILED=0`

---

## 12. Dependency audit (explicit separate blocker)

| Field | Value |
|-------|-------|
| DEPENDENCY_FINDINGS_HIGH | **10** |
| DEPENDENCY_FINDINGS_PR_INTRODUCED | **0** |
| DEPENDENCY_GRAPH_CHANGED_BY_THIS_REMEDIATION | **false** |
| MAIN_HAS_SAME_FINDINGS | **true** (pre-existing) |
| LOCAL_DEPENDENCY_AUDIT_FAILED | **true** |

Not suppressed. Remains an independent merge-readiness blocker distinct from bridge authority.

---

## 13. Production immutability

| Field | Value |
|-------|-------|
| PRODUCTION_MUTATIONS_R3B1R111A | **0** |
| PRODUCTION_IMMUTABLE | **true** |
| LEDGER_FINGERPRINT_BEFORE | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| LEDGER_FINGERPRINT_AFTER | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| CATALOG_FINGERPRINT_BEFORE | `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58` |
| CATALOG_FINGERPRINT_AFTER | `407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58` |

---

## 14. Exact pending / would-deploy set

| Pos | Migration | SHA256 | Catalog Δ | Ledger Δ |
|-----|-----------|--------|-----------|----------|
| 1 | `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge` | `a483d6ca…` | 0 | 1 |
| 2 | `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge` | `5531600e…` | 0 | 1 |

`UNEXPECTED_PENDING_MIGRATIONS=0`

---

## 15. Changed files

- Split + hardened bridge migrations (2 files)
- `backend/scripts/verify-history-bridge-semantics.ts`
- `backend/scripts/test/history-bridge-semantics-negative.test.sh`
- `backend/scripts/test/ephemeral-recovery-gate.test.sh`
- `backend/scripts/test/prisma-migrate-deploy-resilient.sh` (default-off)
- This artifact + raw JSON

---

## 16. Machine status

```
CI_R3B1R111A_BRIDGE_SCOPE_EVIDENCE_FAIL_CLOSED_CLOSURE_COMPLETED

BRIDGE_SOURCE_AUTHORITY = FROZEN_AND_EXACT
BRIDGE_EXPECTED_PRODUCTION_CATALOG_MUTATIONS = 0

NEXT_PHASE = R3B1R1_2_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_REQUIRES_SEPARATE_AUTHORIZATION
R3B1R12_READINESS = NOT_READY_PENDING_PRODUCTION_HISTORY_BRIDGE
PR1054_MERGE_READINESS = BLOCKED
```

**R3B1R.1.1a DID NOT MUTATE PRODUCTION. NO PRODUCTION HISTORY BRIDGE WAS EXECUTED. PR #1054 WAS NOT MERGED. R3B1R.2 MUST NOT START YET.**

---

## Changes / Architektur

**Changes:** not updated (audit/remediation phase only).  
**Architektur:** not updated.
