# Final joint release scope alignment (read-only)

**Audit UTC:** 2026-10-19T~15:45Z  
**Evidence PR:** #2086  
**Production SHA (unchanged):** `c6d5ab99416bbff569f25741c27b4e24f46aaf8e`

---

## 1. `main` and CI refresh

| Ref | SHA | Note |
|-----|-----|------|
| **Prior audit target** | `cf20c49f6596589a56eae346b5550f0b662c46b6` | R11 + CI gate **success** (completed) |
| **Current `origin/main`** | `76b463c98e6f8a08ce3b0560deccbdd2a9ec3866` | Merge commit for **#2085** (+1 commit over `cf20c49f`) |
| **Commits prod → current main** | **31** | Was 30 before #2085 merge |

**Backend R11 @ `cf20c49f`:** `completed` / `success`  
**CI @ `76b463c98`:** workflows **queued** at audit (post-merge); **re-attest required** before deploy GO.

---

## 2. PR #2085 — full review (retrospective; **already merged**)

| Topic | Finding | Evidence |
|--------|---------|----------|
| **State** | **MERGED** to `main` as `76b463c98` | `gh pr view 2085` → `state: MERGED` |
| **Production shadow P1 wiring** | Optional `runDirectionAwareEmissionP1Shadow` in `road-matching-pipeline.ts`; output under `nonAuthoritativeShadowDecoders.directionAwareEmissionP1` | `git show origin/main:.../road-matching-pipeline.ts` |
| **Default OFF** | `DI_V0_S4_RESEARCH_DIRECTION_AWARE_EMISSION_P1_ENABLED` parsed as boolean flag; requires `DI_V0_S4_RESEARCH_*` + road-matching V2 | `di-v0-s4-research-control-plane.ts` |
| **Forward V2 parity** | Unit test: `withP1.windows[i].viterbi` **equals** base when P1 shadow on | `s4-research-synthetic.unit.spec.ts` |
| **No authoritative change** | `authoritativeForProduct: false`; product S4 / `viterbi-dp-costs` unchanged | integration doc + pipeline |
| **Route-aware R4.1** | **Not** in processor sync path | `S4_PRODUCTION_SHADOW_P1_INTEGRATION.md` |
| **Tesla / Tiguan cohort** | Documented UUID allowlists (Tiguan `19fedd4b-…`, Tesla `68868291-…`); gated by `DI_V0_S4_RESEARCH_*_ALLOWLIST` | same doc |
| **Performance / queue** | P1 second pass runs **only** when shadow flag + full research stack enabled for allowlisted scope; **zero cost** when flags off (prod today) | `isDiV0S4ResearchDirectionAwareEmissionP1ShadowConfigured()` |
| **CI on PR branch** | CI gate **success**; S4 unit/PostgreSQL, Nest boot, VD typecheck **success** on PR checks | `gh pr view 2085` statusCheckRollup |
| **Branch protection** | Merged via GitHub (required checks satisfied on PR) | MERGED state |

**Merge-freigabe (retrospective):** Integration is **consistent with joint-release policy** (shadow only, default off, no authority promotion). **Owner merge already occurred** — agents must **not** merge again.

**If audit had been pre-merge:** would have been **MERGE_READY** subject to same release flag policy (no activation on deploy).

---

## 3. S4 lifecycle states (do not conflate)

| State | At production `c6d5ab99` | After deploy `76b463c98` (flags unchanged) |
|-------|--------------------------|---------------------------------------------|
| **A. Code deployed** | Research **libs** partially (pre-#2084/85); **no** P1 worker wiring | **Yes** — full research tree + P1 shadow **code** on disk |
| **B. Shadow decoder installed** | **No** P1 pipeline hook | **Yes** — callable from research worker when configured |
| **C. Shadow decoder enabled** | **No** (`DI_V0_S4_RESEARCH_*` absent) | **No** — remains off without explicit env |
| **D. Authoritative S4 decoder promoted** | Production forward V2 / S4 worker | **Unchanged** — no promotion |

**Route-aware R4.1:** **A** only (offline/batch library) after deploy; **not B/C/D**.

---

## 4. VPS guard (read-only)

| Item | Production disk | `main` @ `76b463c98` |
|------|-----------------|----------------------|
| App SHA | `c6d5ab99` | (not deployed) |
| `prisma-with-guard.sh` | `2fd04103…` (ROOT `../../`) | `7477a699…` (manifest-aligned) |
| `manifest.sha256` file | `b2d0de69…` (**stale** vs hotfixed files) | `7f279b17…` |
| PG16 backup verifier | `c0fb0ded…` (**matches main**) | same |

**Resolution:** Normal **verified release path** — `vps-deploy-release.sh` clones exact SHA, runs **fresh backup + content gate**, guarded `prisma:migrate:deploy` only. **No bypass.** Manifest drift on **current** symlink fixed when `current` → new release. **Fail closed** on integrity mismatch (preflight / guard scripts). **No** `migrate reset`, `db push`, or destructive Prisma in deploy path.

**#2079 hotfix:** Included in `main`; deploy to `76b463c98` aligns bundle without separate install (unless deploy blocked — then `vps-production-database-guard-install-verified-bundle.sh` with owner GO).

---

## 5. Joint release strategy

1. **Deploy target:** pin **`SYNQDRIVE_REQUESTED_DEPLOY_SHA`** to **current `main` tip after CI green** — at audit: **`76b463c98e6f8a08ce3b0560deccbdd2a9ec3866`** (do not deploy `cf20c49f` without re-audit).
2. **Do not enable** `DI_V0_S4_RESEARCH_DIRECTION_AWARE_EMISSION_P1_ENABLED` (or other new opt-ins) during release.
3. **Pending migration unchanged:** `20261019120000_vsi_p3a_provider_catalog_axes` only.
4. **#2079** ships with deploy — avoids further delay vs waiting on #2085 (now already on `main`).

Release without #2085 is **moot** (#2085 merged). Delaying deploy for #2085 is **no longer required**.

---

## Machine-readable final output

```
CURRENT_MAIN_SHA=76b463c98e6f8a08ce3b0560deccbdd2a9ec3866
R11_CI_STATUS=SUCCESS_ON_cf20c49f;PENDING_REATTEST_ON_76b463c98_QUEUED_AT_AUDIT
PR2085_MERGE_READINESS=ALREADY_MERGED_RETROSPECTIVE_APPROVED_SAFE_FOR_JOINT_RELEASE_WITH_FLAGS_OFF
PR2085_BLOCKERS=NONE_MERGED
DB_GUARD_HOTFIX_READINESS=ON_MAIN_READY_VIA_DEPLOY_76b463c98
GUARD_MANIFEST_DRIFT_RESOLUTION=PROMOTE_VERIFIED_RELEASE_TREE_FAIL_CLOSED_NO_BYPASS
PENDING_MIGRATIONS=20261019120000_vsi_p3a_provider_catalog_axes
JOINT_RELEASE_TARGET_STRATEGY=EXACT_SHA_DEPLOY_CURRENT_MAIN_AFTER_CI_GREEN_FLAGS_UNCHANGED
S4_DIRECTION_AWARE_AVAILABLE_AFTER_DEPLOY=B_INSTALLED_C_OFF_DEFAULT
S4_ROUTE_AWARE_AVAILABLE_AFTER_DEPLOY=A_OFFLINE_LIBRARY_ONLY_NOT_WORKER_SYNC
S4_SHADOW_ACTIVATION_STATUS=OFF_PLANNED
S4_AUTHORITATIVE_STATUS=UNCHANGED_PRODUCTION_FORWARD_V2
READY_FOR_OWNER_GO=NO_UNTIL_CI_GREEN_ON_76b463c98_AND_OWNER_DEPLOY_AUTHORIZATION
DEPLOY_EXECUTED=NO
PRODUCTION_MUTATIONS=NONE
FINAL_VERDICT=SCOPE_ALIGNED_DEPLOY_76b463c98_AFTER_CI_REATTEST_NO_FLAG_ACTIVATION
```
