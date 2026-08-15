# CI-R3B1N — Production Recovery Exposure Resolution

**Phase:** CI-R3B1N  
**Branch:** `audit/ci-r3b1n-production-exposure-2026-08`  
**Status:** `CI_R3B1N_PRODUCTION_EXPOSURE_INCONSISTENT`

---

## Baseline

| Field | Value |
|-------|-------|
| PRE_R3B1N_SHA | `11b2043e328a71b799fde2bb091d2423ea6e8ef8` |
| R3B1M remote HEAD | `11b2043e328a71b799fde2bb091d2423ea6e8ef8` |
| main HEAD | `721ad893d15cfa46786a112860548ce12a2be71d` |
| Parent branch | `fix/ci-r3b1m-prisma-schema-authority-alignment-2026-08` |

---

## Final recovered authority

Recovered branch authority is hash-bound in `ci-r3b1n-recovery-authority-manifest-2026-08.json`.

| Metric | Value |
|--------|-------|
| Final migration count | 305 |
| Migration HEAD | `20260814130000_ci_r3b_post_replay_parity_reconciliation` |
| R3B1G migration | `20260716182730_ci_r3b_tire_setup_status_predecessor` |
| R3B1I migration | `20260721245000_ci_r3b_iam_membership_permissions_predecessor` |
| Migration 252 original checksum prefix | `…` |
| Migration 252 corrected checksum prefix | `…` |

---

## Production service identification

| Field | Value |
|-------|-------|
| Service | `pm2:synqdrive on Hostinger VPS srv1374778.hstgr.cloud` |
| PM2 cwd | `/opt/synqdrive/current/backend` |
| Release symlink | `/opt/synqdrive/releases/20260726212924_v4994` |

---

## Deployed revision proof

| Field | Value |
|-------|-------|
| Deployed SHA | `d8461e28c9b4cee121e34a1d79145d0ff6b97991` |
| Revision confidence | `HIGH` |
| Conflicting sources | 0 |
| Git subject | `docs(master-admin): certify 2G.7 on the live production release` |
| Git date | `2026-07-26 21:28:53 +0000` |

Independent sources: 3 agreeing revision probes.

---

## Merge/deployment triggers

| Trigger | Value |
|---------|-------|
| Merge auto-deploys production | `NO` |
| Merge auto-runs DB migrations | `NO` |
| Deploy script runs DB migrations | `YES` |
| Deploy mechanism | manual SSH script backend/scripts/ops/vps-deploy-release.sh (clones main, npm ci, prisma migrate deploy, pm2 restart) |

---

## Production database identity

| Field | Value |
|-------|-------|
| Bound to running service | PASS |
| Database name (sanitized) | `synqdrive` |
| PostgreSQL version line | `PostgreSQL 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit` |
| Read-only transaction | `True` |
| Host fingerprint SHA-256 prefix | `49960de5880e8c68…` |

---

## Read-only safety controls

All production SQL executed inside `BEGIN TRANSACTION READ ONLY` with short statement/lock timeouts. No writes, no migration commands, no service restarts.

---

## Production Prisma ledger

| Metric | Value |
|--------|-------|
| Rows | 315 |
| Unique migration names | 299 |
| Finished | 299 |
| Unfinished | 0 |
| Rolled back | 16 |

---

## Ledger vs recovered repository

| Metric | Value |
|--------|-------|
| Repo migrations total | 305 |
| Repo present finished in production | 282 |
| Repo absent from production finished | 23 |
| Production-only names | 17 |
| Checksum matches | 211 |
| Checksum mismatches | 71 |
| Last finished migration started_at | `2026-07-26 18:56:19.646591+00` |

Checksum semantics: production _prisma_migrations.checksum equals SHA-256 of migration.sql bytes (empirically verified on unchanged migrations)

---

## Recovery migration exposure

| State | Count |
|-------|-------|
| ABSENT | 19 |
| PRESENT_FINISHED_MATCHING | 2 |
| PRESENT_FINISHED_CHECKSUM_MISMATCH | 1 |
| PRESENT_FAILED | 0 |
| PRESENT_ROLLED_BACK | 0 |
| PRESENT_UNKNOWN | 0 |

Total recovery migrations tracked: 22

---

## Migration 252 checksum/history exposure

| Field | Value |
|-------|-------|
| Migration | `20260721270000_iam_role_assignment_drift_reconciliation` |
| Ledger state | `M252_ORIGINAL_FINISHED` |
| Production checksum prefix | `12bf2015a256fdd8…` |
| Matches original | True |
| Matches corrected | False |
| Pre-correction history present | True |
| Ledger rows | 2 |

---

## Migration 252 catalog footprint

| Field | Value |
|-------|-------|
| Table exists | False |
| Catalog state | `M252_CATALOG_ABSENT` |
| Legacy name artifacts | 0 |

---

## R3B1G production exposure

| Field | Value |
|-------|-------|
| Migration | `20260716182730_ci_r3b_tire_setup_status_predecessor` |
| Ledger | `ABSENT` |
| Catalog column exists | True |
| Column type | `TireSetupStatus` |

---

## R3B1I production exposure

| Field | Value |
|-------|-------|
| Migration | `20260721245000_ci_r3b_iam_membership_permissions_predecessor` |
| Ledger | `ABSENT` |
| Catalog column exists | True |
| Column type | `jsonb` |

---

## Production R3B 19/9/10/54 parity

| Dimension | Result |
|-----------|--------|
| Objects | 19/19 |
| Tables | 9/9 |
| Enums | 10/10 |
| Properties | 54/54 |
| Catalog classification | `PROD_R3B_RECOVERED_AUTHORITY_MATCH` |
| Parity pass | True |

---

## Production code ancestry

| Field | Value |
|-------|-------|
| Deployed SHA | `d8461e28c9b4cee121e34a1d79145d0ff6b97991` |
| Code exposure class | `C0_PRE_RECOVERY` |
| Contains R3B1M schema alignment | False |
| R3B1G migration in deployed git tree | False |
| R3B1I migration in deployed git tree | False |

Code and DB exposure are separate dimensions.

---

## Checksum risk

| Metric | Value |
|--------|-------|
| Finished migrations compared | 282 |
| Matching | 211 |
| Mismatching | 71 |
| History-sensitive mismatches | 1 |
| Migration 252 original finished / corrected repo | True |
| Prisma deploy risk | `HIGH` |

---

## Ledger health

`LEDGER_MULTIPLE_ISSUES`

---

## Exposure vector

| Dimension | Class |
|-----------|-------|
| Code | `C0_PRE_RECOVERY` |
| Ledger | `L1_PARTIAL_RECOVERY_MIGRATIONS` |
| Migration 252 | `M252_ORIGINAL_FINISHED` |
| Catalog | `PROD_R3B_RECOVERED_AUTHORITY_MATCH` |

---

## Composite exposure classification

**`E5_MIXED_OR_INCONSISTENT`**

---

## Merge safety classification

**`MERGE_BLOCKED_EXPOSURE_INCONSISTENCY`**

---

## Deployment safety classification

**`DEPLOY_REQUIRES_HISTORICAL_CHECKSUM_STRATEGY`**

Planning evidence only — this phase does not authorize deployment.

---

## Required next phase

`STOP — reconcile evidence/state before planning`

---

## Evidence limitations

Missing evidence items: 0

---

## Secret/data sanitization

Artifacts scanned for DSN/password/token patterns before commit. Connection evidence uses fingerprints only.

---

## Immutability

| Check | Result |
|-------|--------|
| schema.prisma changed | False |
| Modified migrations | 0 |
| Production mutations | 0 |

---

## Safety

| Control | Value |
|---------|-------|
| Production SQL writes | 0 |
| Production service restarts | 0 |
| Production deployments | 0 |
| Workflow dispatches | 0 |
| Golden tests | 8/8 |

---

## Report ↔ machine consistency

Mismatch count: **0**  
Failed checks: none

---

## Hard stop

DO NOT MERGE. DO NOT DEPLOY. DO NOT RUN PRODUCTION MIGRATIONS.
