# i18n Governance — Authority Path Contract Parity (2026-09-09)

**Baseline:** `2f0d128da1ee966250da200a2a17f2a5e24f1a73` (main after #1581)
**Related:** #1585 (workflow classifier fix), #1581 (governance closure)

---

## Problem

The trusted `pull_request_target` workflow (Layer 0) and the canonical JS
governance policy (`pr-gate-policy.mjs`) each maintained independent
authority-path classifiers. Drift caused real regressions (e.g. coverage
baseline paths missing from workflow classifier, fixed in #1585).

Patching individual missing paths does not prevent recurrence.

---

## Architectural decision

| Component | Role |
|-----------|------|
| `frontend/scripts/lib/i18n-governance/authority-path-contract.mjs` | **Canonical SSOT** for checkout-based JS governance |
| `frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs` | Delegates `isGovernanceAuthorityPath()` to contract |
| `.github/workflows/i18n-authority-protection.yml` | Inline bash duplicate (required for `pull_request_target` security) |
| `frontend/scripts/lib/i18n-governance/workflow-authority-classifier.mjs` | Parses actual workflow YAML case arms + return semantics; unknown pattern syntax fails closed (no handwritten mirror, no execution) |
| `frontend/src/i18n/i18n-pr-gate.test.ts` (P2.3.4 parity section) | Regression contract — fails CI on unexplained drift |

**Why not a single manifest sourced by the workflow?**

`pull_request_target` must never checkout or execute PR-head repository
content. A shared manifest checked out from PR head would be attacker-controlled.
A manifest read from default branch at runtime would still require checkout or
an external fetch pattern not present in Layer 0.

**Chosen model:** tested duplication with explicit parity enforcement and
documented intentional asymmetry.

---

## Canonical contract

Exact paths and prefix rules live in `authority-path-contract.mjs`
(`CANONICAL_GOVERNANCE_EXACT_PATHS`, `CANONICAL_GOVERNANCE_PREFIX_RULES`).

Notable additions in this change:

- `frontend/src/i18n/hardcoded-copy-guard.test.ts` (governance test; was workflow-only)
- Workflow aligned to include `.cursor/rules/i18n.mdc`, `AGENTS.md`,
  `hardcoded-copy-inventory.json`, `translation-coverage.ts` (were JS-only)

---

## Intentional asymmetry (workflow broader than canonical)

| Rule | ID | Reason |
|------|-----|--------|
| `.github/workflows/*` | `all-github-workflows` | Layer 0 runs without checkout; all workflow files are security-critical. Canonical JS gate only marks `i18n-governance-new-debt.yml` as authority; other workflow changes fall to `otherPaths` in checkout-based partition. |

Encoded in `TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES` and tested by
`i18n-pr-gate.test.ts` (P2.3.4 parity section).

Workflow i18n script rule uses shell wildcard `frontend/scripts/i18n-*.mjs`
(semantically equivalent to canonical prefix `frontend/scripts/i18n-` + `.mjs`).

---

## Regression protection

CI fails when:

1. Any canonical exact path is not trusted-workflow authority
2. `analyzeAuthorityPathParity()` finds unexplained `canonicalOnly` or `semanticDifferences`
3. Inline workflow YAML classifier diverges from `isTrustedWorkflowAuthorityPath()` mirror
4. `pr-gate-policy` delegation diverges from canonical contract
5. Harness negative control (disabled product detection) no longer catches mixed-change bypass

---

## Security invariants preserved

- No `actions/checkout` in authority-protection workflow
- No PR-head script execution in Layer 0
- Fail-closed on enumeration limits, untrusted label actors, stale labels on synchronize
- Mixed authority + product still blocked regardless of label

---

## Final semantic parser hardening (PR #1589 correction)

**Synced to main:** `c343fab9aa8930b0023702bd4f3c31afd34393fa`

The workflow classifier parser is deliberately narrow and **fail-closed**:

| Invariant | Enforcement |
|-----------|-------------|
| Complete case-arm consumption | Every arm between `case "$path" in` and `esac` must match supported grammar or contract is invalid |
| Supported arm grammar | `PATTERN[|PATTERN...])\n  return 0\|1\n  ;;` only — same-line bodies, extra commands, `;&`, or single `;` terminators fail |
| First-match semantics | `evaluatePathAuthoritySemantics()` walks `contract.arms` in source order (not grouped return-0/return-1 buckets) |
| Explicit default | Trailing `return 1` required inside `is_authority_path()` after `esac`; absent or `return 0` fails validation |
| Bootstrap diff scope | PR effective paths from `git diff --name-only origin/main`; historical `2f0d128d` retained only as classifier fixture |

Bootstrap neutral paths for #1589 are exact-path scoped (not `architecture/*` prefix).
