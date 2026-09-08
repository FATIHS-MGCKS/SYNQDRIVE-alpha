# I18N-INTEGRATION-1B.1 — Governance Scanners and New-Debt CI (Authority)

**Date:** 2026-09-08  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base SHA (verified):** `1393095f5d8faa2ff73e9dce5fe84024841e2528` (includes merged PR #1566)  
**Audited PR:** #1569 — `cursor/i18n-integration-1b1-governance-authority-3c10`  
**Implementation HEAD (pre-1B.1A):** `a2e645fbc04dd3bb289adb5dc817eafbdd037a9f`  
**1B.1A corrective commit:** applied in same PR after independent audit (see final report)

---

## 1. Mission scope

Integration **1B.1** restores governance authority only:

- deterministic hardcoded-copy scanner and libraries
- PR new-debt gate
- debt-classification manifest
- active governance tests
- read-only CI workflow (`pull_request`, `contents: read`)
- engineering rules (`.cursor/rules/i18n.mdc`, scoped `AGENTS.md` section)

**Not in scope:** runtime/provider activation, product surface migration, dictionary edits, coverage baseline edits, inventory regeneration. **Integration 2 not started.**

---

## 2. Prerequisite state (merged via PR #1566)

| Dataset | Count | Notes |
|---------|------:|-------|
| Legacy hardcoded-copy inventory records | **3,091** | `hardcoded-copy-inventory.json` — unchanged in 1B.1 |
| Enhanced governance scanner findings | **4,067** | debt manifest baseline fingerprints — distinct dataset |
| Adversarial fixtures | **24** | merged on main |
| Coverage baseline | 9,803 canonical keys | en/de complete; tr fallback-only; six partial locales |

---

## 3. Authority-path parity

### Layer-0 (`i18n-authority-protection.yml`) — unchanged

Classifies authority paths including workflow, scripts, package.json, debt manifest, and named governance tests. Layer-0 **does not** include every new Layer-1/2 protected path.

### Layer-1/2 (new workflow + PR gate) — active after merge

Canonical protected-path contract (workflow-inline bootstrap **and** `pr-gate-policy.mjs`):

**Exact paths (15):**

- `.cursor/rules/i18n.mdc`
- `AGENTS.md`
- `.github/workflows/i18n-governance-new-debt.yml`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/i18n/hardcoded-copy-inventory.json`
- `frontend/src/i18n/translation-coverage-baseline.json`
- `frontend/src/i18n/translation-coverage.ts`
- `frontend/src/i18n/translation-coverage.test.ts`
- `frontend/src/i18n/i18n-debt-classifications.json`
- `frontend/src/i18n/i18n-governance-scanner.test.ts`
- `frontend/src/i18n/i18n-pr-gate.test.ts`
- `frontend/src/i18n/i18n-structural-check.test.ts`
- `frontend/src/i18n/locales.test.ts`
- `frontend/src/i18n/translation-registry.test.ts`

**Prefixes:** `frontend/scripts/i18n-*.mjs`, `frontend/scripts/lib/i18n-governance/*`, plus `frontend/src/*` for product relevance.

**1B.1A corrections:**

- `.cursor/rules/i18n.mdc` and `AGENTS.md` are protected by **both** workflow-inline bootstrap relevance and JavaScript `isI18nRelevantPath()` / `isGovernanceAuthorityPath()`. Rule-only or AGENTS-only PRs never take the irrelevant no-op route.
- Inventory, coverage baseline/module/test, and debt manifest are governance-authority paths. Same-PR product + authority baseline changes fail as mixed laundering **even with** the authority label.
- Workflow bootstrap relevance remains trusted inline shell (not PR-controlled JavaScript).
- Parity tests read the committed workflow case statement and fail on contract drift.

**Baseline laundering:** inventory and coverage files from #1566 are **not** modified in 1B.1/1B.1A. Debt manifest metadata updated (`capturedFromSha` → `1393095f5`).

---

## 4. Workflow security model

| Property | Value |
|----------|-------|
| Trigger | `pull_request` (opened, synchronize, reopened, ready_for_review, labeled, unlabeled) |
| `pull_request_target` | **Absent** |
| Permissions | `contents: read` only |
| Secrets | None |
| Checkout | PR head SHA, `fetch-depth: 0`, `persist-credentials: false` |
| Post-validation | worktree cleanliness asserted |
| Test annotations | Tests capture `console.error` in memory (no forward to process stderr); `emitGithubAnnotations: false` by default in `runGate()` test calls; production gate still emits `::error` when enabled |

New-debt protection is **active only after this PR merges**.

---

## 5. Test execution summary (post-1B.1A)

| Command / suite | Passed | Skipped | Notes |
|-----------------|-------:|--------:|-------|
| `npm run i18n:scanner:test` | 43 | 2 | Legacy P2.3.1 block (`describe.skip`) — pre-existing |
| `npm run i18n:pr-gate:test` | 113 | 0 | All five repository-integration tests **active** (temp git repos) |
| Combined 9-suite vitest | 214 | 5 | See per-file skips below |
| Authority invalidation harness | 15 | 0 | `.cursor/scripts/i18n-authority-protection-invalidation.harness.sh` |

**Remaining skipped tests (not counted as passing protection):**

| File | Skipped | Reason | Origin |
|------|--------:|--------|--------|
| `i18n-governance-scanner.test.ts` | 2 | Legacy P2.3.1 count compatibility block | Pre-existing |
| `i18n-structural-check.test.ts` | 1 | Rental shim parity | Integration 2 |
| `LanguageContext.test.tsx` | 1 | Runtime provider placement | Integration 1A / Integration 2 |
| `LanguageSelector.test.tsx` | 1 | Shared selector wiring | Integration 1A / Integration 2 |

**Not restored:** `hardcoded-copy-guard.test.ts` — entire enforce-clean suite is `describe.skip` (inactive until Integration 2).

**Repository integration (formerly skipped):** authority-only pass/fail, backend-only no-op, controlled red/green — all active with isolated temp repositories (no fixed campaign SHA).

---

## 6. Governance invariant

```
NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT=0
```

Classification totals (enhanced findings):

| Classification | Count |
|----------------|------:|
| PREEXISTING_BASELINE_DEBT | 1,594 |
| MACHINE_DOMAIN | 358 |
| ACTIVE_REMEDIATION_REQUIRED | 2,065 |
| DATA_ANALYSE_PLANNED_REMOVAL | 45 |
| IAM_PRODUCT_WIRING_REQUIRED | 5 |

---

## 7. Integration 2 deferrals

- Platform `LanguageProvider` mount in `App.tsx`
- Rental provider consolidation
- `hardcoded-copy-guard.test.ts` enforce-clean product guard
- `platform-provider-placement.test.ts`, `surface-integration.test.ts`

---

## 8. Rollback

Revert the 1B.1 merge commit on `main`. Prerequisite data from #1566 remains. Re-open authority work from preserved branch `cursor/i18n-integration-1b-governance-3c10` for audit recovery only.

---

## 9. Expected CI before authority label

| Check | Expected |
|-------|----------|
| Scanner/governance static validation | PASS |
| Layer-0 authority protection | FAIL — `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| New-debt gate (authority policy step) | FAIL — missing `i18n-governance-authority-change` label |
| Mixed governance/product | **Must not occur** |
