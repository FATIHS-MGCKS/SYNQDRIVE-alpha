# P2.3.4 — Workflow Authority Protection

**Date:** 2026-09-01
**Phase:** P2.3.4A (trusted authority guard bootstrap)
**P2.3.3 merge commit:** `7406d4cdf7d87b91eea28c1f5a55368928656d1d`
**Campaign branch:** `p239-p238-merge-baseline-3c10`
**Default branch trust anchor:** `main`

---

## 1. Problem statement

P2.3.3 introduced the base-aware changed-file / new-debt PR gate in
`.github/workflows/i18n-governance-new-debt.yml`. That workflow is itself
mutable PR-head repository content.

P2.3.3 architecture documents:

```
WORKFLOW_SELF_MODIFICATION = POST_MERGE_REPOSITORY_PROTECTION_REQUIRED
```

A PR author could modify governance workflow files on the PR head and
potentially weaken enforcement before merge. P2.3.4A adds an independent
trusted control layer that cannot be disabled by PR-head workflow content.

P2.3.4A does **not** activate branch protection or required checks.

---

## 2. Layer hierarchy

| Layer | Mechanism | Event model | Executes PR-head code? |
|-------|-----------|-------------|------------------------|
| **Layer 0** | `i18n-authority-protection.yml` | `pull_request_target` | **NO** |
| **Layer 1** | P2.3.3 workflow-inline relevance bootstrap | `pull_request` | YES (PR head) |
| **Layer 2** | P2.3.3 base-aware PR new-debt gate | `pull_request` | YES (PR head) |

Layer 0 is the trust anchor. Layers 1–2 remain authoritative for i18n
relevance and new-debt enforcement on the campaign branch after P2.3.3
merge.

---

## 3. Default-branch trust anchor

`pull_request_target` executes the workflow definition from the **trusted
base / default branch**, not from the PR head.

Therefore:

- The trusted workflow must ultimately exist on **`main`**
- It must **never** checkout or execute PR-head repository code
- It classifies changed paths via GitHub API metadata only

```
TRUST_ANCHOR_SELF_PROTECTION = BASE_DEFINED_PULL_REQUEST_TARGET
```

When a future PR modifies
`.github/workflows/i18n-authority-protection.yml`, GitHub runs the
**current trusted base version** to evaluate the proposed replacement.

---

## 4. Trusted workflow contract

| Field | Value |
|-------|-------|
| Path | `.github/workflows/i18n-authority-protection.yml` |
| Workflow name | `i18n Governance — Authority Protection` |
| Job / check name | `i18n-authority-protection` |
| Trigger | `pull_request_target` |
| Target branches | `main`, `p239-p238-merge-baseline-3c10` |
| Paths filter | **NONE** (always materializes) |

### Permissions (minimum)

- `contents: read`
- `pull-requests: read`
- `issues: write` (label invalidation only)

No secrets. No `contents: write`. No `actions: write`.

---

## 5. Zero PR-head execution firewall

Forbidden in the authority gate:

- `actions/checkout` with PR head
- `npm ci` / `npm install` / `npm run`
- `node <repo-script>`
- `bash <repo-script>` / `source <repo-file>`
- Docker builds from PR
- Local actions from PR head
- `workflow_call` to PR-controlled reusable workflows

Changed paths are retrieved exclusively via paginated GitHub API:

```
gh api --paginate --slurp repos/{owner}/{repo}/pulls/{number}/files
```

Enumeration completeness is verified against
`github.event.pull_request.changed_files`. Mismatch → fail closed.

Paths are consumed NUL-delimited from `${RUNNER_TEMP}`.

### Rename pre-image hardening

For every PR file record, Layer 0 classifies **both**:

- `filename` (post-image / destination)
- `previous_filename` (pre-image / source), when present

A protected governance path cannot escape authority classification by being
renamed away.

Enumeration metrics are split:

| Metric | Meaning |
|--------|---------|
| `CHANGED_FILES_ENUMERATED` | PR file **records** (`== changed_files`) |
| `CLASSIFIED_PATH_COUNT` | Path identities consumed (`filename` + `previous_filename`) |

### Workflow namespace authority (`REQUIRED_CHECK_NAME_SPOOFING_FIREWALL`)

The complete GitHub workflow namespace is governance authority:

```
.github/workflows/**
```

Any add, modify, delete, or rename identity under `.github/workflows/` sets
`AUTHORITY_CHANGED=YES`. A PR cannot introduce a spoof workflow that emits
an expected governance check name without being treated as authority mutation.

### PR file enumeration limit

If `changed_files >= 3000`, Layer 0 fails closed with
`PR_FILE_ENUMERATION_LIMIT_UNSAFE` before treating API enumeration as
authoritative.

### Shell event-data boundary

GitHub event metadata is passed through step `env:` declarations and
consumed as quoted shell data. Attacker-controlled event strings are not
interpolated directly into the `run:` shell source.

### Label invalidation fail-closed

Authority-label removal uses `invalidate_authority_label()` with **no**
`|| true` suppression. Removal failure yields
`AUTHORITY_LABEL_INVALIDATION_FAILED`.

---

## 6. Trusted governance authority path census

Layer 0 independently protects:

| Path / prefix |
|---------------|
| `.github/workflows/**` (complete workflow namespace) |
| `frontend/scripts/i18n-hardcoded-scan.mjs` |
| `frontend/scripts/i18n-check.mjs` |
| `frontend/scripts/i18n-governance.mjs` |
| `frontend/scripts/i18n-pr-gate.mjs` |
| `frontend/scripts/i18n-shim-inventory.mjs` |
| `frontend/scripts/lib/i18n-governance/**` |
| `frontend/package.json` |
| `frontend/package-lock.json` |
| `frontend/src/i18n/i18n-debt-classifications.json` |
| `frontend/src/i18n/i18n-pr-gate.test.ts` |
| `frontend/src/i18n/i18n-governance-scanner.test.ts` |
| `frontend/src/i18n/translation-registry.test.ts` |
| `frontend/src/i18n/locales.test.ts` |
| `frontend/src/i18n/i18n-structural-check.test.ts` |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` |

The three additional `frontend/src/i18n/*` test files are included because
`i18n-check.mjs` executes them directly and they can materially alter
dictionary / structural validation without touching the scripts above.

`frontend/.npmrc` does not exist. No local `.github/actions` i18n runners
exist.

---

## 7. Mixed-scope firewall (Layer 0)

Layer 0 is deliberately conservative:

```
PRODUCT_OR_PRESENTATION_CHANGED = YES
```

for any changed path under `frontend/src/**` that is **not** an explicit
governance-authority path above.

Therefore an authority PR cannot bundle:

- ordinary UI / rental / master / operator source
- translations
- presentation components
- product hooks

with governance authority changes.

If `AUTHORITY_CHANGED = YES` and `PRODUCT_OR_PRESENTATION_CHANGED = YES`:

```
I18N_AUTHORITY_PROTECTION = FAIL
REASON = MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE
```

No label can override this.

---

## 8. Authority approval label lifecycle

| Field | Value |
|-------|-------|
| Label | `i18n-governance-authority-change` |
| Trusted actor | `FATIHS-MGCKS` (repository owner) |
| Competing labels | **NONE** (P2.3.3 compatibility preserved) |

### States

| Condition | Result |
|-----------|--------|
| No authority change | `PASS` / `NO_GOVERNANCE_AUTHORITY_CHANGE` |
| Authority only, no label | `FAIL` / `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| Authority only, trusted label on **`labeled` event** | `PASS` / `GOVERNANCE_AUTHORITY_APPROVED` |
| Authority only, label merely present (opened/reopened/ready_for_review) | `FAIL` / `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| Authority + product | `FAIL` / `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE` |
| Untrusted label actor | label removed / `FAIL` / `UNTRUSTED_AUTHORITY_APPROVAL_ACTOR` |
| `synchronize` with stale label | label removed / `FAIL` / `AUTHORITY_REAPPROVAL_REQUIRED_AFTER_HEAD_CHANGE` |

### Synchronize invalidation (mandatory)

Governance approval must **not** survive new commits. On `synchronize`
when authority paths changed and the label is present, the trusted
workflow removes the label and fails the new HEAD.

**Approval provenance:** passive label presence on PR metadata is **not**
sufficient. `AUTHORITY_APPROVED=YES` is granted only on an exact
`pull_request_target / labeled` event where
`github.event.label.name == i18n-governance-authority-change` and
`github.event.sender.login == FATIHS-MGCKS`, with authority-only scope.

The existing P2.3.3 `pull_request` workflow may momentarily observe a
stale label during synchronize. That does **not** authorize merge because
`i18n-authority-protection` is the independent trusted gate and fails
until reapproval.

---

## 9. Future required-check topology (P2.3.4B+)

After independent audit, merge to `main`, and live canary verification:

1. Require **`i18n-authority-protection`** on `main` and campaign branch
2. Require **`i18n-new-debt-gate`** on campaign branch (already exists from P2.3.3)
3. Protect `.github/workflows/i18n-governance-new-debt.yml` and
   `.github/workflows/i18n-authority-protection.yml` via repository rules /
   CODEOWNERS when a second trusted identity exists

P2.3.4A explicitly does **not** activate these settings.

---

## 10. CODEOWNERS deferral

CODEOWNERS is **not** the primary mechanism in P2.3.4A because:

- The repository currently appears to use a single owner identity for
  Cursor-created PRs
- Mandatory CODEOWNERS approval from the same identity can create
  self-review deadlock

The trusted `pull_request_target` gate is the primary authority-protection
mechanism. CODEOWNERS remains optional defense-in-depth for a future second
trusted GitHub identity/team.

---

## 11. Rollback / lockout considerations

| Risk | Mitigation |
|------|------------|
| Trusted workflow blocks all authority PRs | Owner applies `i18n-governance-authority-change` after authority-only diff |
| Stale label after push | Auto-removed on `synchronize` |
| Mixed authority + product PR | Must split into separate PRs |
| Workflow self-modification | Evaluated by trusted base version via `pull_request_target` |
| Required-check activation before live canary | Forbidden until P2.3.4B |

---

## 12. P2.3.3 freeze

P2.3.4A does not modify P2.3.3 workflow or control-plane scripts on the
campaign branch. P2.3.3 remains frozen while Layer 0 is bootstrapped on
`main`.

---

*Architecture record for P2.3.4A. Branch protection activation pending P2.3.4B.*
