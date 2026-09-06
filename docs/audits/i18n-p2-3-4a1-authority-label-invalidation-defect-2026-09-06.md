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

### Changed surfaces

| Path | Change |
|------|--------|
| `.github/workflows/i18n-authority-protection.yml` | Source shared invalidation lib; emit safe diagnostics; distinct postcondition failure |
| `.github/scripts/i18n-authority-protection-invalidation.lib.sh` | Fail-closed DELETE + sanitized diagnostics + label-absence postcondition |
| `.cursor/scripts/i18n-authority-protection-invalidation.harness.sh` | Adversarial harness (10 cases) |

### Invalidation contract (post-correction)

1. Execute DELETE with URL-encoded label name; capture stdout/stderr + exit code.
2. On nonzero exit: fail closed; emit `LABEL_INVALIDATION_API_RESULT=FAIL`, exit code, sanitized diagnostic (no tokens).
3. On zero exit: GET current PR labels; verify authority label absent.
4. Only then set `AUTHORITY_LABEL_PRESENT=false`.
5. If label still present: `AUTHORITY_LABEL_INVALIDATION_POSTCONDITION_FAILED`.
6. If label verification fails: `AUTHORITY_LABEL_INVALIDATION_POSTCONDITION_FAILED` via `POSTCONDITION_VERIFY_FAILED` path.

### Permissions decision

**No `pull-requests: write` expansion** in this correction. Issues write was already present at failure time; actual API error must be observed on next live run before broadening permissions.

Checkout added only for **base ref** helper script (trusted anchor), not PR head.

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

1. Owner reviews and approves correction PR with `i18n-governance-authority-change`.
2. Merge correction to `main`.
3. Re-trigger #1496 synchronize (or fresh push) to capture **observable** API diagnostic if DELETE still fails.
4. Only then decide whether `pull-requests: write` is required.

---

## 8. Verdict

**P2.3.4A.1 CORRECTION READY — OWNER AUTHORITY APPROVAL REQUIRED**

The live synchronize canary exposed a real invalidation defect with suppressed API evidence. Correction restores observability and verified postconditions while remaining fail-closed.
