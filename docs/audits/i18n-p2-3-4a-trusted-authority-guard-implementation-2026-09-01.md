# P2.3.4A — Trusted Authority Guard Implementation Audit

**Date:** 2026-09-01  
**Phase:** P2.3.4A bootstrap (implementation record)  
**Implementation PR target:** `main`  
**Campaign branch (verified untouched):** `p239-p238-merge-baseline-3c10` @ `7406d4cdf7d87b91eea28c1f5a55368928656d1d`

---

## 1. Topology

| Field | Value |
|-------|-------|
| Main base SHA (branch origin) | `da959784f835a31482852d506daa137c90389b87` |
| Implementation branch | `cursor/p234a-i18n-trusted-authority-guard-3c10` |
| P2.3.3 merge commit (campaign) | `7406d4cdf7d87b91eea28c1f5a55368928656d1d` |
| Campaign modified in this task | **NO** |
| P2.3.3 workflow on main | **NO** (campaign-only; frozen by absence on this branch) |

---

## 2. Repository protection preflight

| Check | Observed |
|-------|----------|
| Default branch | `main` |
| Repository visibility | **public** |
| Repository rulesets | `[]` (none) |
| `main` branch protection API | **403** (not readable by integration; no changes made) |
| Campaign branch protection API | **403** (not readable; no changes made) |
| Expected protection state | unprotected / no required checks |
| CODEOWNERS (`.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`) | **absent** |
| `frontend/.npmrc` | **absent** |
| `.github/actions` i18n runners | **absent** |

---

## 3. Authority label capability

| Field | Result |
|-------|--------|
| Label `i18n-governance-authority-change` exists | **NO** (API 404) |
| Label create attempt | **403** (integration lacks permission) |
| Label apply permission (integration) | **not verified live** |
| Classification | **`AUTHORITY_LABEL_BOOTSTRAP_REQUIRES_OWNER_ACTION`** |

Policy is **not** weakened. Owner must create the label before authority-only PRs can pass live.

Suggested label metadata:

- **name:** `i18n-governance-authority-change`
- **description:** Explicit approval for i18n governance authority-only changes

---

## 4. Trusted workflow implementation

| Field | Value |
|-------|-------|
| Path | `.github/workflows/i18n-authority-protection.yml` |
| Workflow name | `i18n Governance — Authority Protection` |
| Job / check name | `i18n-authority-protection` |
| Event | `pull_request_target` |
| Target branches | `main`, `p239-p238-merge-baseline-3c10` |
| Paths filter | **NO** |
| `contents` | `read` |
| `pull-requests` | `read` |
| `issues` | `write` (label invalidation only) |
| PR-head checkout | **NO** |
| PR-head code execution | **0** |
| Secrets referenced | **0** |
| Changed-file API | `gh api --paginate --slurp repos/{owner}/{repo}/pulls/{number}/files` |
| Enumeration completeness | `ENUMERATED == github.event.pull_request.changed_files` else `INCOMPLETE_PR_FILE_ENUMERATION` |
| NUL-safe consumption | `while IFS= read -r -d '' path` from `${RUNNER_TEMP}` |

`HEAD_SHA` is recorded as PR metadata only; it is **not** used for checkout.

---

## 5. Authority path census (17 protected surfaces)

| # | Path / prefix |
|---|---------------|
| 1 | `.github/workflows/i18n-authority-protection.yml` |
| 2 | `.github/workflows/i18n-governance-new-debt.yml` |
| 3 | `frontend/scripts/i18n-hardcoded-scan.mjs` |
| 4 | `frontend/scripts/i18n-check.mjs` |
| 5 | `frontend/scripts/i18n-governance.mjs` |
| 6 | `frontend/scripts/i18n-pr-gate.mjs` |
| 7 | `frontend/scripts/i18n-shim-inventory.mjs` |
| 8 | `frontend/scripts/lib/i18n-governance/**` |
| 9 | `frontend/package.json` |
| 10 | `frontend/package-lock.json` |
| 11 | `frontend/src/i18n/i18n-debt-classifications.json` |
| 12 | `frontend/src/i18n/i18n-pr-gate.test.ts` |
| 13 | `frontend/src/i18n/i18n-governance-scanner.test.ts` |
| 14 | `frontend/src/i18n/translation-registry.test.ts` |
| 15 | `frontend/src/i18n/locales.test.ts` |
| 16 | `frontend/src/i18n/i18n-structural-check.test.ts` |
| 17 | `frontend/src/i18n/hardcoded-copy-guard.test.ts` |

Items 15–17 added from `i18n-check.mjs` direct execution graph review.

---

## 6. Product / presentation classification

Layer 0 conservative rule:

```
frontend/src/** minus explicit governance-authority paths → PRODUCT_OR_PRESENTATION_CHANGED
```

Non-`frontend/src` paths (backend, `docs/`, `architecture/`) do **not** trigger product classification.

---

## 7. Security model summary

| Invariant | Status |
|-----------|--------|
| `pull_request_target` on default branch anchor | **YES** |
| `TRUST_ANCHOR_SELF_PROTECTION` | **YES** (workflow includes itself) |
| Mixed authority + product blocks regardless of label | **YES** |
| Trusted owner actor (`FATIHS-MGCKS`) on `labeled` | **YES** |
| Stale label invalidated on `synchronize` | **YES** |
| Enumeration fail-closed | **YES** |
| Live default-branch certification | **PENDING** (workflow not on `main` until merge + P2.3.4B canary) |

---

## 8. Adversarial harness matrix (ephemeral, not committed)

Harness: `.cursor/scripts/ephemeral-i18n-authority-protection-harness.sh` (local only)

| # | Case | Expected |
|---|------|----------|
| 1 | backend-only | PASS / `NO_GOVERNANCE_AUTHORITY_CHANGE` |
| 2 | ordinary frontend product only | PASS / `NO_GOVERNANCE_AUTHORITY_CHANGE` |
| 3 | `i18n-pr-gate.mjs` only | FAIL / `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| 4 | P2.3.3 workflow only | FAIL / `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| 5 | authority workflow itself only | FAIL / `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| 6 | `package.json` only | FAIL / `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| 7 | authority + frontend product | FAIL / `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE` |
| 8 | authority + translations | FAIL / `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE` |
| 9 | authority + ordinary docs | PASS / `GOVERNANCE_AUTHORITY_APPROVED` (with label) |
| 10 | trusted owner label | PASS / `GOVERNANCE_AUTHORITY_APPROVED` |
| 11 | untrusted label actor | FAIL / `UNTRUSTED_AUTHORITY_APPROVAL_ACTOR` |
| 12 | synchronize with stale label | FAIL / `AUTHORITY_REAPPROVAL_REQUIRED_AFTER_HEAD_CHANGE` |
| 13 | reapply trusted label after new HEAD | PASS / `GOVERNANCE_AUTHORITY_APPROVED` |
| 14 | filename with spaces | PASS (parsed exactly) |
| 15 | Unicode filename | PASS (parsed exactly) |
| 16 | enumeration count mismatch | FAIL / `INCOMPLETE_PR_FILE_ENUMERATION` |
| 17 | zero changed files | PASS / `NO_GOVERNANCE_AUTHORITY_CHANGE` |
| 18 | API enumeration failure (workflow) | FAIL / `PR_FILE_ENUMERATION_FAILED` (code review) |

**Harness result:** `17/17` classification cases PASS (case 18 verified by workflow code review).

---

## 9. Non-effects (P2.3.3 freeze)

| Surface | Diff on implementation branch |
|---------|-------------------------------|
| `.github/workflows/i18n-governance-new-debt.yml` | **not present on main** / unchanged |
| `frontend/scripts/i18n-pr-gate.mjs` | unchanged on main slice |
| Scanner semantics | unchanged |
| Dictionaries | unchanged |
| Manifest (`i18n-debt-classifications.json`) | not on main slice |
| Production UI | **0** changes |
| Category E | **0** |

Authoritative campaign governance state (unchanged):

| Firewall | Value |
|----------|-------|
| `fingerprintVersion` | 3 |
| Historical baseline | 1627 |
| `capturedFromSha` | `381671605ea1cd55844518312839b0f7d99a48bd` |
| Enhanced | 1542 / Rental 257 / Finance 43 |
| Active | 0 |
| New-Unclassified | 0 |
| Legacy | 1241 / 144 / 25 |
| EN / DE | 9803 / 9803 |
| Parity / orphans | 100% / 0 |

---

## 10. Validation

| Check | Result |
|-------|--------|
| `git diff --check da959784...HEAD` | **PASS** |
| Workflow YAML load | **PASS** (`ruby -ryaml`) |
| Security grep (checkout/npm/node/bash/source/secrets) | **0 forbidden patterns** |
| Branch protection modified | **NO** |
| Rulesets modified | **NO** |
| Required checks activated | **NO** |

---

## 11. Future activation plan

1. Independent security audit of this PR
2. Merge trusted workflow to `main`
3. **P2.3.4B** — disposable canary PRs + live `pull_request_target` verification
4. **P2.3.4C** — repository rules / workflow path protection + required checks:
   - `i18n-authority-protection`
   - `i18n-new-debt-gate` (campaign)

---

## 12. Verdict

**B — TRUSTED GUARD IMPLEMENTED; LABEL BOOTSTRAP REQUIRES OWNER ACTION — READY FOR AUDIT**

---

*Implementation artifact. Draft PR remains open / unmerged. DO NOT MERGE YET.*
