# Final GO gate attestation (read-only)

**UTC:** 2026-10-19T~15:58Z  
**Target:** `76b463c98e6f8a08ce3b0560deccbdd2a9ec3866`  
**Production:** `c6d5ab99416bbff569f25741c27b4e24f46aaf8e`

## 1. `main` SHA

Verified after `git fetch origin main`: **`76b463c98e6f8a08ce3b0560deccbdd2a9ec3866`** (unchanged).

## 2. GitHub CI @ exact SHA

At attestation time, **0 / 46** check-runs on `76b463c98` had `status=completed`. All listed workflows remained **`queued`** for **>14 minutes** since `2026-10-19T15:43:44Z` (example: `gh run list --commit 76b463c98`).

**Required checks (must be re-verified when completed):**

| Check | Status @ attestation |
|--------|----------------------|
| CI gate (all critical jobs) | **not completed** (nested in VD/Legal workflows — still queued) |
| Backend R11 postgres+redis | **queued** |
| Nest production boot check | **queued** |
| S4 unit / PostgreSQL suites | **queued** |
| S4A PostgreSQL integration | **queued** |
| Migration tests (PostgreSQL) | **queued** |
| Physical Device Inventory PostgreSQL | **queued** |
| validate-module-registry | **queued** |
| Playwright E2E (Vehicle Detail) | **queued** |
| production-database-guard workflow | **not triggered** on this commit (path filter; no ops file change in #2085) |
| DTC-01B PostgreSQL | **not triggered** on this commit (path filter; DTC delta in #2080 @ `cf20c49f`) |
| i18n governance | **not observed completed** on this SHA |

**Do not infer green main from `cf20c49f` or #2085 PR checks.**

## 3. VPS production

| Item | Value |
|------|--------|
| SHA | `c6d5ab99416bbff569f25741c27b4e24f46aaf8e` |
| Health :3001 / :3002 | `status: ok` |
| Scheduler | **1 leader** — A=FOLLOWER, B=LEADER |

## 4. Database identity

| Item | Value |
|------|--------|
| PostgreSQL | **16.15** |
| OID | **514336** |
| Public schema | **yes** |
| Public tables | **457** |
| Finished migrations | **424** |
| VSI P3A migration | **not applied** (no row for `20261019120000_vsi_p3a_provider_catalog_axes`) |
| organizations / vehicles / vehicle_trips | **4** / **9** / **2639** (+3 trips vs prior audit 2636 — live traffic, not regression) |

## 5. Pending migrations

**Only:** `20261019120000_vsi_p3a_provider_catalog_axes`

## 6. Guard / executor

| Item | Assessment |
|------|------------|
| On-disk PG16 verifier @ prod | `c0fb0ded…` — matches `main` bundle |
| On-disk `prisma-with-guard.sh` | ROOT `../../` — **functional** hotfix; hash differs from `main` manifest until promote |
| `vps-production-database-deploy-preflight.sh` | **present** on current executor |
| Initial preflight @ deploy | Executor uses **on-disk** ops (hotfix OK); **fail closed** on mismatch |
| Release @ `76b463c98` | **Internally consistent #2079 bundle** (`sha256sum -c` on repo tree — local verify only) |
| Separate bundle install | **Not required** for normal deploy path |

## 7. Standard deploy path (unchanged)

`vps-deploy-release.sh`: identity preflight → **fresh** `pg_dump` + gzip → sidecar → **content gate** → clone exact SHA → VO5C admission → guarded `prisma:migrate:deploy` → build → boot check → **rolling restart** → leader convergence.

## 8. Flags

**FEATURE_FLAG_DELTA=NONE** — no env changes; S4 P1 shadow **OFF** after deploy unless explicitly set.

## 9. Rollback

Application rollback (prior release dir) **≠** DB recovery (pre-deploy backup + documented restore). VSI migration is forward-only.

---

See machine-readable block in user-facing final report.
