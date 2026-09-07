# I18N-INTEGRATION-1B — Governance Scanners, Coverage Baseline and New-Debt CI

**Date:** 2026-09-07  
**Mission:** I18N-INTEGRATION-1B (governance infrastructure only; no runtime activation)  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha

---

## 1. Preflight anchors

| Field | Value |
|-------|-------|
| **Base SHA (origin/main at branch creation)** | `1676222bb66720d47a27764d7259adae66a07f7b` |
| **PR #1559 merge commit** | `1676222bb66720d47a27764d7259adae66a07f7b` (verified) |
| **Branch** | `cursor/i18n-integration-1b-governance-3c10` |
| **Recovery reference — governance implementation** | `aa949f641fde24924725b383eb0d2ccc027f583a` |
| **Recovery reference — preceding tests/manifests** | `2242cd198af5f9c4701a8daa91ceb2acee8b076f` |
| **Cherry-pick policy** | **None** — files restored individually and adapted |

### Integration-1A properties confirmed on base

- `frontend/src/i18n/**` present (dormant platform runtime/catalog)
- Nine official locales: `de`, `en`, `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it`
- English and German complete; partial locales truthfully partial; Turkish fallback-only
- `frontend/src/App.tsx` does **not** mount platform `LanguageProvider`
- Rental `frontend/src/rental/i18n/LanguageContext.tsx` unchanged
- Trusted authority workflow + harness present and byte-stable

---

## 2. Restored file groups

### 2.1 Governance scripts (from `aa949f641`, adapted)

- `frontend/scripts/i18n-check.mjs`
- `frontend/scripts/i18n-governance.mjs`
- `frontend/scripts/i18n-hardcoded-scan.mjs`
- `frontend/scripts/i18n-pr-gate.mjs`
- `frontend/scripts/i18n-shim-inventory.mjs`
- `frontend/scripts/lib/i18n-governance/*` (11 modules)

### 2.2 Coverage and structural tests (from `aa949f641`, adapted)

- `frontend/src/i18n/translation-coverage.ts`
- `frontend/src/i18n/locales.test.ts`
- `frontend/src/i18n/translation-registry.test.ts`
- `frontend/src/i18n/i18n-structural-check.test.ts`

### 2.3 Scanner fixtures and adversarial tests (from `aa949f641`)

- `frontend/src/i18n/__fixtures__/governance-adversarial/**` (25 fixtures)
- `frontend/src/i18n/hardcoded-copy-guard.test.ts`
- `frontend/src/i18n/i18n-governance-scanner.test.ts`
- `frontend/src/i18n/i18n-pr-gate.test.ts`

### 2.4 Generated governance artifacts (regenerated on current main)

- `frontend/src/i18n/hardcoded-copy-inventory.json`
- `frontend/src/i18n/i18n-debt-classifications.json`
- `frontend/src/i18n/translation-coverage-baseline.json`

### 2.5 Package scripts

Added to `frontend/package.json`:

- `i18n:check`, `i18n:check:ci`, `i18n:scanner:test`, `i18n:pr-gate`, `i18n:pr-gate:test`, `i18n:governance`

### 2.6 Agent engineering rules

- `.cursor/rules/i18n.mdc` — reconciled to platform-canonical `frontend/src/i18n/*`
- `AGENTS.md` — narrowly scoped i18n section only

### 2.7 CI workflow

- `.github/workflows/i18n-governance-new-debt.yml`

---

## 3. Intentionally not restored

| Path | Reason |
|------|--------|
| `frontend/src/App.tsx` | Integration-2 runtime activation forbidden |
| `frontend/src/rental/App.tsx` | Out of scope |
| `frontend/src/rental/i18n/LanguageContext.tsx` | Out of scope |
| `frontend/src/i18n/platform-provider-placement.test.ts` | Integration-2 deferred |
| `frontend/src/i18n/surface-integration.test.ts` | Integration-2 deferred |
| Product surface migrations | Integration-2 deferred |
| Backend / deployment / production changes | Forbidden |

---

## 4. Generated-artifact procedure

1. `cd frontend && npm ci`
2. Writable scan: `node scripts/i18n-hardcoded-scan.mjs` → `hardcoded-copy-inventory.json`
3. Baseline fingerprints refreshed in `i18n-debt-classifications.json` against SHA `1676222bb`
4. Coverage baseline generated via `buildCoverageBaseline()` in `translation-coverage.ts`
5. Consecutive stability proof:
   - `npm run i18n:check` (writable refresh)
   - `git diff --exit-code` on three artifacts → **0 diff**
   - `npm run i18n:check:ci` (read-only) → **0 diff**, worktree clean

---

## 5. Scanner scope

- Deterministic hardcoded-copy scanner over `frontend/src/**` (TS/TSX)
- Adversarial fixtures: 11 must-detect + 14 must-not-detect cases
- Fingerprint version 3; stable across consecutive scans
- Enforce-clean surface policy preserved (P2.1/P2.2 phases) but product guard block skipped until Integration-2

---

## 6. Coverage matrix (nine locales)

| Locale | Owned keys | Canonical | Status |
|--------|-----------|-----------|--------|
| `en` | 9,803 | 9,803 | complete |
| `de` | 9,803 | 9,803 | complete |
| `pl` | 493 | 9,803 | partial |
| `fr` | 786 | 9,803 | partial |
| `cs` | 493 | 9,803 | partial |
| `nl` | 493 | 9,803 | partial |
| `es` | 493 | 9,803 | partial |
| `tr` | 0 | 9,803 | fallback-only |
| `it` | 493 | 9,803 | partial |

**Canonical English key count:** 9,803

---

## 7. Classification totals

| Classification | Count |
|----------------|------:|
| `PREEXISTING_BASELINE_DEBT` | 1,594 |
| `MACHINE_DOMAIN` | 358 |
| `ACTIVE_REMEDIATION_REQUIRED` | 2,065 |
| `DATA_ANALYSE_PLANNED_REMOVAL` | 45 |
| `IAM_PRODUCT_WIRING_REQUIRED` | 5 |
| **Total findings** | **4,067** |

- **Unclassified active-host debt:** 0
- **Stale manifest entries:** 0 (validator pass)
- **Hardcoded-copy inventory finding records:** 4,067 (fingerprinted)

Manifest semantic rules (3): `DATA_ANALYSE_PLANNED_REMOVAL`, `IAM_PRODUCT_WIRING_REQUIRED`, `EDITORIAL_CONTENT` (Help Center path rule).

---

## 8. PR-gate threat model

| Threat | Mitigation |
|--------|------------|
| New hardcoded host presentation in PR diff | Base-aware scanner + `NEW_PR_ACTIONABLE_HOST_DEBT` rejection |
| Unclassified active-host debt | Manifest validator fail-closed |
| Unauthorized governance authority edits | Requires exact label `i18n-governance-authority-change` |
| Similarly named label spoofing | Exact string match only |
| Renamed/deleted files with spaces | NUL-safe git diff + real-git integration tests |
| Missing git objects / malformed manifest | Fail-closed with explicit diagnostics |
| CI mutating artifacts | `--read-only` mode + post-step worktree cleanliness assertion |
| Fork PR secret exfiltration | Ordinary `pull_request` only; `contents: read`; no secrets |

**Authority label is not proof of correctness** — it only permits owner-audited authority-file changes.

---

## 9. Workflow permission analysis

**File:** `.github/workflows/i18n-governance-new-debt.yml`

| Property | Value |
|----------|-------|
| Trigger | `pull_request` (types: opened, synchronize, reopened, ready_for_review, labeled, unlabeled) |
| `pull_request_target` | **Absent** |
| Permissions | `contents: read` only |
| Secrets | **None** |
| Write permissions | **None** |
| Label mutation | **None** |
| Trusted helper checkout | **None** (inline bootstrap only) |
| Irrelevant PRs | Explicit no-op pass |
| Relevant PRs | scanner tests → PR-gate tests → read-only `i18n:check:ci` → new-debt gate |

### Unchanged authority layer (hashes verified)

| File | SHA-256 |
|------|---------|
| `.github/workflows/i18n-authority-protection.yml` | `2924d75917ba9b9f8964e00a7734b58e36f7c46f484040036bffa0baeee48878` |
| `.cursor/scripts/i18n-authority-protection-invalidation.harness.sh` | `cdd4a1c386e3494cab6702e426820f7e2d0d04ace7da40f06f051c099851107f` |

---

## 10. Validation commands and results

```bash
cd frontend
npm ci
npm run i18n:scanner:test          # 43 passed, 2 skipped
npm run i18n:pr-gate:test          # 64 passed, 5 skipped
npm run i18n:check                 # PASS
git diff --exit-code -- src/i18n/hardcoded-copy-inventory.json \
  src/i18n/i18n-debt-classifications.json \
  src/i18n/translation-coverage-baseline.json  # exit 0
npm run i18n:check:ci              # PASS, worktree clean
npm run build                      # PASS
npx vitest run src/i18n/locales.test.ts src/i18n/auth-error-i18n.test.ts  # 24 passed
bash .cursor/scripts/i18n-authority-protection-invalidation.harness.sh  # 15/15 PASS
actionlint .github/workflows/i18n-governance-new-debt.yml  # PASS
```

### Runtime activation proof

| File | SHA-256 (unchanged) |
|------|---------------------|
| `frontend/src/App.tsx` | `3ba9386a3b6915191620f2b57bdebe0756f152be9e906e2280f5b841643491e6` |
| `frontend/src/rental/i18n/LanguageContext.tsx` | `266c86609707516651e8130f770a4734857af6b7c0fa004e448a362f2a066992` |

---

## 11. Exclusions and deferred work

- **Integration-2:** platform provider mount, rental consolidation, login/topbar selector wiring, `platform-provider-placement.test.ts`, `surface-integration.test.ts`, enforce-clean product guard (~145 tests currently skipped)
- **PR #1496:** untouched (open draft canary)
- **Backend:** no changes
- **Production:** no deploy

---

## 12. Residual risks

1. `ACTIVE_REMEDIATION_REQUIRED` (2,065 findings) reflects unmigrated product debt on main — expected until Integration-2 surface migration.
2. Authority-changing files in this PR will fail Layer-0 authority CI until independent owner applies `i18n-governance-authority-change` after audit.
3. Fork PRs execute repository-controlled `npm ci` scripts under `pull_request` — mitigated by read-only token and no secrets; standard GitHub fork model risk remains bounded to public script behavior.

---

## 13. Rollback procedure

1. Close or revert Draft PR without merging.
2. `git revert <integration-1b-commit-sha>` on `main` if accidentally merged.
3. Base anchor for re-attempt: `1676222bb66720d47a27764d7259adae66a07f7b` (Integration-1A merge).

---

## 14. Governance authority classification

```
GOVERNANCE_AUTHORITY_CHANGED=YES
AUTHORITY_LABEL_APPLIED=NO
PRODUCT_RUNTIME_ACTIVATED=NO
I18N_INTEGRATION_2_STARTED=NO
```

Expected CI without label: Layer-0 `i18n-authority-protection` **FAIL** (authority paths changed); Layer-1/2 new-debt gate **PASS** on validation steps when run on this PR head.
