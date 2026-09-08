# I18N-INTEGRATION-1B.1 — Governance Scanners and New-Debt CI (Authority)

**Date:** 2026-09-08  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base SHA (verified):** `1393095f5d8faa2ff73e9dce5fe84024841e2528` (includes merged PR #1566)

---

## 1. Mission scope

Integration **1B.1** restores governance authority only:

- deterministic hardcoded-copy scanner and libraries
- PR new-debt gate
- debt-classification manifest
- active governance tests
- read-only CI workflow (`pull_request`, `contents: read`)
- engineering rules (`.cursor/rules/i18n.mdc`, scoped `AGENTS.md` section)

**Not in scope:** runtime/provider activation, product surface migration, dictionary edits, coverage baseline edits, inventory regeneration.

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

Classifies authority paths including workflow, scripts, package.json, debt manifest, and named governance tests.

### Layer-1/2 (new workflow + PR gate)

`pr-gate-policy.mjs` protects:

- all `frontend/scripts/i18n-*.mjs` and `lib/i18n-governance/**`
- debt manifest, governance tests, workflow
- `.cursor/rules/i18n.mdc` (protected by new gate; **not** in Layer-0 list)

**Parity gap documented:** Layer-0 does not classify `.cursor/rules/i18n.mdc` or `AGENTS.md` (neither authority nor product). The new PR gate adds `.cursor/rules/i18n.mdc` to authority prefixes. `AGENTS.md` remains outside both classifiers but is documentation-only in this PR.

**Baseline laundering:** inventory and coverage files from #1566 are **not** modified. Debt manifest metadata updated (`capturedFromSha` → `1393095f5`).

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

New-debt protection is **active only after this PR merges**.

---

## 5. Skipped tests (not counted as passing protection)

| File | Skipped | Reason |
|------|--------:|--------|
| `i18n-governance-scanner.test.ts` | 2 | Legacy P2.3.1 count compatibility block |
| `i18n-pr-gate.test.ts` | 5 | Repository integration self-test block (`describe.skip`) |
| `translation-registry.test.ts` | 10 | Coverage print-only tests (deferred structural suite) |
| `i18n-structural-check.test.ts` | 1 | Rental shim parity — Integration 2 |
| `LanguageContext.test.tsx` | 1 | Integration 1A runtime (pre-existing) |
| `LanguageSelector.test.tsx` | 1 | Integration 1A runtime (pre-existing) |

**Not restored:** `hardcoded-copy-guard.test.ts` — entire enforce-clean suite is `describe.skip` (inactive until Integration 2).

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
