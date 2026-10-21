# P2.3.4A.1 — Authority Label Invalidation Runtime Defect

**Date:** 2026-09-06
**Phase:** P2.3.4A.1 forensic diagnosis + minimal fail-closed correction
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha

---

## 1. Live incident summary

| Field | Value |
|-------|-------|
| Canary PR | #1496 (`canary(p234b): authority-only lifecycle probe`) |
| Canary HEAD at synchronize | `c6d47e5a7e122cd1d4e4a307623ec2be90717d77` |
| Trusted workflow | `.github/workflows/i18n-authority-protection.yml` |
| Synchronize run | `34065608954` |
| Job | `101573714081` |
| Event / action | `pull_request_target` / `synchronize` |

### Observed runtime (run 34065608954)

| Diagnostic | Value |
|------------|-------|
| `AUTHORITY_CHANGED` | YES |
| `PRODUCT_OR_PRESENTATION_CHANGED` | NO |
| `AUTHORITY_LABEL_PRESENT` | YES (at evaluation start) |
| `AUTHORITY_APPROVED` | NO |
| `I18N_AUTHORITY_PROTECTION` | FAIL |
| `REASON` | `AUTHORITY_LABEL_INVALIDATION_FAILED` |
| PR label after run | **Still present** (`i18n-governance-authority-change`) |

Stale approval was **correctly detected**. Label removal did **not** complete.

---

## 2. Token permissions evidence (run 34065608954)

GitHub Actions job log `GITHUB_TOKEN Permissions`:

| Permission | Value |
|------------|-------|
| Contents | read |
| Issues | **write** |
| Metadata | read |
| Pull requests | read |

Canonical workflow declares:

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: write
```

GitHub REST contract for `DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}` accepts **Issues: write** OR **Pull requests: write**.

**Conclusion:** `PRIOR_ROOT_CAUSE_PERMISSION_HYPOTHESIS_CERTIFIED=NO` — insufficient `issues:write` is **not** established fact from live evidence.

---

## 3. Root observability defect (pre-correction)

Pre-correction `invalidate_authority_label()` redirected all DELETE stdout/stderr to `/dev/null`:

```bash
gh api --method DELETE ... >/dev/null 2>&1
```

Therefore:

| Field | Value |
|-------|-------|
| `ACTUAL_PRIOR_API_ERROR_AVAILABLE` | **NO** |
| `ROOT_CAUSE_CLASSIFICATION` | `UNKNOWN_BECAUSE_ERROR_OUTPUT_SUPPRESSED` |

The HTTP/API failure class, status code, and GitHub message were **destroyed** before diagnosis.

---

## 4. Prior trusted approval (certified context)

Before synchronize, owner applied trusted label:

| Field | Value |
|-------|-------|
| Run | `34065205030` |
| Actor | `FATIHS-MGCKS` |
| Result | PASS |
| Reason | `GOVERNANCE_AUTHORITY_APPROVED` |

This confirms approval lifecycle worked up to synchronize invalidation.

---

## 5. Correction (P2.3.4A.1)

### Architecture (self-contained trust anchor)

| Field | Value |
|-------|-------|
| `SELF_CONTAINED_TRUSTED_WORKFLOW` | **YES** |
| `CHECKOUT_COUNT` | **0** |
| `RUNTIME_REPO_SOURCE_COUNT` | **0** |
| `NEW_RUNTIME_AUTHORITY_DEPENDENCIES` | **0** |
| `CAMPAIGN_TARGET_COMPATIBILITY` | **PRESERVED** |
| `PR_HEAD_REPOSITORY_CODE_EXECUTED` | **0** |
| `BASE_REPOSITORY_CODE_EXECUTED` | **0** |

The trusted workflow YAML is the **entire** executable policy. Invalidation helpers are **inlined** in `.github/workflows/i18n-authority-protection.yml`. No `actions/checkout`, no `source` of repository files, no `.github/scripts` runtime helper, no composite action or workflow_call dependency.

Campaign-target PRs (`base.ref=p239-p238-merge-baseline-3c10`) require **no file** from the campaign branch — the guard bootstraps entirely from runner-native tools (`bash`, `gh`, `jq`, `python3`).

### Changed surfaces (final correction)

| Path | Change |
|------|--------|
| `.github/workflows/i18n-authority-protection.yml` | Inline invalidation helpers; emit safe diagnostics; distinct postcondition failure |
| `.cursor/scripts/i18n-authority-protection-invalidation.harness.sh` | Adversarial harness with isolated function copies (15 tests) |
| `docs/audits/i18n-p2-3-4a1-authority-label-invalidation-defect-2026-09-06.md` | This document |

**Removed from final diff:** `.github/scripts/i18n-authority-protection-invalidation.invalidation.lib.sh` (intermediate regression — external runtime helper + base-ref checkout).

### Invalidation contract (post-correction)

1. URL-encode label name.
2. Execute DELETE; capture stdout/stderr + exit code.
3. On nonzero exit: fail closed; emit `LABEL_INVALIDATION_API_RESULT=FAIL`, exit code, sanitized diagnostic (no tokens).
4. On zero exit: GET current PR labels; verify authority label absent.
5. Only then set `AUTHORITY_LABEL_PRESENT=false`.
6. If label still present: `AUTHORITY_LABEL_INVALIDATION_POSTCONDITION_FAILED` via `POSTCONDITION_FAIL`.
7. If label verification fails: `AUTHORITY_LABEL_INVALIDATION_POSTCONDITION_FAILED` via `POSTCONDITION_VERIFY_FAILED`.

### Distinct failure reasons

| Path | Reason |
|------|--------|
| DELETE/API failure | `AUTHORITY_LABEL_INVALIDATION_FAILED` |
| DELETE succeeded but postcondition failed/unverifiable | `AUTHORITY_LABEL_INVALIDATION_POSTCONDITION_FAILED` |
| Successful invalidation on synchronize | `AUTHORITY_REAPPROVAL_REQUIRED_AFTER_HEAD_CHANGE` |

All synchronize invalidation paths remain `AUTHORITY_APPROVED=NO`, `I18N_AUTHORITY_PROTECTION=FAIL`.

### Permissions decision

**No `pull-requests: write` expansion** in this correction. Issues write was already present at failure time; actual API error must be observed on next live run before broadening permissions.

---

## 6. Non-effects

| Surface | Modified |
|---------|----------|
| PR #1496 | **NO** (unchanged; label not manually removed) |
| Campaign branch | **NO** |
| P2.3.3 workflow | **NO** |
| Product/presentation code | **NO** |
| Branch protection / rulesets | **NO** |
| Category E | **0** |

---

## 7. Next steps (post-merge)

1. Independent security audit of correction PR #1555.
2. Owner reviews and approves correction PR with `i18n-governance-authority-change`.
3. Merge correction to `main`.
4. Re-trigger #1496 synchronize (or fresh push) to capture **observable** API diagnostic if DELETE still fails.
5. Only then decide whether `pull-requests: write` is required.

---

## 8. Verdict

**P2.3.4A.1 SELF-CONTAINED CORRECTION READY — INDEPENDENT AUDIT REQUIRED**

The live synchronize canary exposed a real invalidation defect with suppressed API evidence. Correction restores observability and verified postconditions while preserving the original self-contained trust-anchor architecture.
