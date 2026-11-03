# Production database guard & PG16 hotfix audit (read-only)

**Production app SHA:** `c6d5ab99416bbff569f25741c27b4e24f46aaf8e` (#2078 merge)  
**Target `main` SHA:** `cf20c49f6596589a56eae346b5550f0b662c46b6` (#2079 + workstreams)

Authority: `architecture/dsrg/PRODUCTION_DATABASE_DDL_GUARD.md`, PR **#2078**, PR **#2079**.

---

## Deploy executor & guard bundle

| Item | Production (live) | `main` @ `cf20c49f` (expected) |
|------|-------------------|----------------------------------|
| **Deploy script** | `/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` | Same path in release tree |
| **Executor git SHA** | `c6d5ab99` | N/A until promoted |
| **Prisma CLI guard** | `backend/scripts/ops/lib/prisma-cli-guard.mjs` | Manifest hash `678abbc824eaaffc41d50116a3dcb7d24baf55d647f75b95e2067e155d0b299d` (**matches prod disk**) |
| **`prisma-with-guard.sh`** | Disk SHA `2fd041037f4f686f126c070f06aae95763d455111bdf63fd898e9c619ffad7fd` — ROOT `../../` (hotfix) | Manifest expects `7477a699d32b0598dba318d838d758e8a3ba4f1faa53cd83ffdb722625bbe1c0` (includes comment + same ROOT) |
| **Git @ `c6d5ab99` (no hotfix)** | `ROOT=.../..` only (**wrong** — one `..`) | — |
| **PG16 backup verifier** | Disk `c0fb0ded84c1d6308e5acba00950d53f7632c98bdf134e5f5c39d539746e7e1f` | **Matches `main` manifest** |
| **Git @ `c6d5ab99` verifier** | `a88143a876246d7b0838ca01063b875bd847673b8c1ffb460ce0d372703117ff` | — |
| **`production-database-guard-bundle.manifest.sha256` on prod disk** | File hash `b2d0de69367ac981dbc5fa4bb3183a8bad34dade5a9c05a31b39c98ae78f1947` (stale manifest listing older hashes) | Repo file hash `77fcd86a8777a3281b8c90803750bf4fd1f0e2f59fae225cece76a1008e44059` for manifest itself |

**Interpretation:** After giant deploy, operators applied **partial VO5C recovery hotfix** on disk (PG16 verifier + Prisma ROOT) **without** git advancing to #2079. Manifest on disk is **not** consistent with on-disk file hashes → **bundle integrity drift**, not a bypass of guard logic.

---

## #2078 — Production database DDL guard

| Check | Status |
|--------|--------|
| Merged at production SHA | **YES** — `c6d5ab99` = Merge PR #2078 |
| Guard entrypoints present on prod | `prisma-with-guard.sh`, `prisma-cli-guard.mjs`, `vps-production-database-deploy-preflight.sh` |
| CI workflow in bundle | `production-database-guard.yml` listed in manifest |
| **DB_GUARD_2078_STATUS** | **DEPLOYED_AT_PROD_SHA** |

---

## #2079 — PG16 backup + Prisma ROOT hotfix

| Check | Status |
|--------|--------|
| On `main` | **YES** — merge `9c697f80c` |
| On production **git** tree | **NO** (30 commits behind) |
| On production **disk** (selected files) | **PARTIAL** — verifier + `prisma-with-guard` ROOT aligned with `main`; manifest not regenerated |
| **PG16_HOTFIX_2079_STATUS** | **ON_MAIN_NOT_FULLY_PINNED_IN_GIT** — remediated by deploying `cf20c49f` (or verified bundle install) |

---

## Mechanisms (read-only)

| Mechanism | Location | Prod evidence |
|-----------|----------|----------------|
| Prisma guarded migrate | `npm run prisma:migrate:deploy` via `prisma-with-guard.sh` → `prisma-cli-guard.mjs` | Present in `vps-deploy-release.sh` |
| Migration authority stamp | `/opt/synqdrive/shared/state/migration-authority.stamp` | **Present** (267 bytes, mode 600) — **HMAC content not read** |
| DB identity guard | `production-database-identity-guard.lib.sh` + `production-database-identity.v1.json` | Used in deploy script |
| Backup capture sidecar | `pdb_guard_write_backup_capture_sidecar` | Example: `db-pre-deploy-20261018230030.sql.gz.capture.json` → `db_oid: 514336` |
| PG16 content validation | `production-database-backup-capture-verify.py` + content gate in preflight | Verifier on disk matches `main` hash |
| Guard bundle install (no app deploy) | `vps-production-database-guard-install-verified-bundle.sh` | Requires `SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1` + `SYNQDRIVE_GUARD_BUNDLE_REQUIRED_SHA` |

**Supported update procedure (do not run without owner GO):**

```bash
# From a checkout at the exact verified SHA (e.g. cf20c49f):
SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1 \
SYNQDRIVE_GUARD_BUNDLE_REQUIRED_SHA=<40-char-sha> \
bash backend/scripts/ops/vps-production-database-guard-install-verified-bundle.sh \
  /opt/synqdrive/current/backend/scripts/ops
```

Normal **preferred** path: exact-SHA **deploy** promotes a release tree whose bundle is internally consistent (#2079 included).

---

## `GUARD_UPDATE_REQUIRED`

| Question | Answer |
|----------|--------|
| Separate bundle install **before** deploy? | **Not strictly required** if deploy targets `cf20c49f` (bundle ships with release). |
| Manifest drift on current symlink? | **YES** — document drift; **resolved** when `current` → new release. |
| Deploy using **only** `c6d5ab99` git ops without disk hotfix? | **Would be unsafe** (wrong Prisma ROOT / old PG16 verifier). **Do not** revert hotfixed ops files. |
| **GUARD_UPDATE_REQUIRED** | **NO** (for deploy-at-`cf20c49f` plan); **YES** if attempting migrate without promoting release/hotfix bundle |

**DEPLOY_EXECUTOR_GUARD_VERSION:** manifest on prod disk is **stale**; effective verifier **matches `main`**; Prisma wrapper **functionally corrected** on disk.

---

## Backup readiness (existing files — not a deploy backup)

| Backup | Size | Assessment |
|--------|------|------------|
| `db-pre-deploy-20261018141258.sql.gz` | **~6.8 MB** | **Do not use** as restore baseline (post-incident small dump) |
| `db-pre-deploy-20261018230030.sql.gz` | **~104 MB** | **BACKUP_FILE_EXISTS**, **BACKUP_GZIP_VALID** (by size + successful giant deploy) |
| Sidecar `...230030...capture.json` | 102 B | **BACKUP_DATABASE_IDENTITY_VERIFIED** (`db_oid` **514336** matches live) |
| **BACKUP_CONTENT_VALID** | Not re-run in audit (no production execute) | Deploy script runs content gate on **fresh** backup |
| **RESTORE_PROCEDURE_READY** | Documented in `architecture/dsrg/ROLLBACK_AND_CONTAINMENT.md` + deploy runbook | **Not tested** in this audit |

**FRESH_BACKUP_REQUIRED_AT_DEPLOY=YES** — `vps-deploy-release.sh` creates `db-pre-deploy-${TS}.sql.gz` + sidecar before migrate.

---

## Database recovery integrity (read-only)

| Check | Result |
|--------|--------|
| DB OID | **514336** |
| Public schema | **exists** |
| Table count (public) | **457** |
| Core counts | orgs **4**, vehicles **9**, `vehicle_trips` **2636** |
| PG version | **16.15** |
| Failed migration apply | **None active**; 16 historical **rolled_back** rows with `finished_at` NULL |
| **DATABASE_RECOVERY_INTEGRITY** | **ACCEPTABLE** — structure present; counts stable vs references |

**EXISTING_BACKUP_READINESS:** **PARTIAL** — last good giant-deploy backup + sidecar; small Oct 18 backup flagged **unsafe** as baseline.
