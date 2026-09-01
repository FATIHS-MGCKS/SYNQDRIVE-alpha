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
| Path extraction | `filename` **and** `previous_filename` (when present) |
| Enumeration completeness | `ENUMERATED_FILE_COUNT == changed_files` (not path count) |
| Classification path count | `CLASSIFIED_PATH_COUNT` (filename + previous_filename identities) |
| NUL-safe consumption | `while IFS= read -r -d '' path` from `${RUNNER_TEMP}` |
| Approval provenance | **Exact `labeled` event only** — passive label presence insufficient |
| Workflow authority prefix | `.github/workflows/**` |
| Enumeration limit firewall | `changed_files >= 3000` → `PR_FILE_ENUMERATION_LIMIT_UNSAFE` |
| Label invalidation | **Fail-closed** (`AUTHORITY_LABEL_INVALIDATION_FAILED`) |
| Shell event interpolation in `run:` | **0** (`GITHUB_EXPRESSION_DIRECT_SHELL_INTERPOLATION_COUNT`) |

`HEAD_SHA` is recorded as PR metadata only; it is **not** used for checkout.

---

## 5. Authority path census

| Namespace | Model |
|-----------|--------|
| `.github/workflows/**` | Complete workflow namespace (spoofing firewall) |
| i18n scripts / lib / package / governance tests | 15 additional explicit surfaces |

Total explicit non-workflow authority surfaces: **15**. Workflow namespace is prefix-based.

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
| Passive label presence cannot approve | **YES** (exact `labeled` event required) |
| Rename pre-image (`previous_filename`) classified | **YES** |
| Complete `.github/workflows/**` authority namespace | **YES** |
| `changed_files >= 3000` fail-closed | **YES** |
| Label invalidation fail-closed | **YES** |
| Shell event values via `env:` only in `run:` | **YES** |
| Enumeration fail-closed | **YES** |
| Live default-branch certification | **PENDING** (workflow not on `main` until merge + P2.3.4B canary) |

---

## 8. Adversarial harness matrix (ephemeral, not committed)

Harness: `.cursor/scripts/ephemeral-i18n-authority-protection-harness.sh` (local only)

**Final matrix:** 37 cases covering backend/product/authority paths, passive-label
rejection, invalidation success/failure, synchronize invalidation, mixed scope,
rename pre/post images, complete `.github/workflows/**` namespace, 2999/3000/3001
boundaries, API/JSON/jq failures, enumeration mismatch, and shell-injection data
cases.

**Harness result:** `37/37` PASS

### Security correction history

| Finding | Fix |
|---------|-----|
| Rename-away bypass | Classify `filename` + `previous_filename` |
| Passive label approval | Exact trusted `labeled` event only |
| Narrow workflow protection | `.github/workflows/**` authority namespace |
| Label invalidation fail-open | Remove `\|\| true`; fail on removal error |
| 3000-file boundary | `PR_FILE_ENUMERATION_LIMIT_UNSAFE` |
| Shell injection surface | Event metadata via step `env:` only |

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
