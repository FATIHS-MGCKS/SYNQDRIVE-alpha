# P2.3.3 — Final Independent Security & Governance Audit

**Date:** 2026-09-01  
**Auditor mode:** Independent / read-only / adversarial  
**Implementation PR:** #1464  
**Implementation branch:** `cursor/p233-i18n-new-debt-pr-gate-3c10`  
**Implementation HEAD audited:** `c605df58a343bac7b4bd1811558d64b178ab1bcb`  
**Campaign branch:** `p239-p238-merge-baseline-3c10`  
**Campaign base SHA:** `021f6a22b66cc69b28291a15d7f4055e3977e33d`

---

## 1. Audit topology

| Field | Verified value |
|-------|----------------|
| PR #1464 open | **YES** |
| PR #1464 merged | **NO** |
| PR #1464 draft | **YES** |
| Base branch | `p239-p238-merge-baseline-3c10` |
| Base SHA | `021f6a22b66cc69b28291a15d7f4055e3977e33d` |
| Head branch | `cursor/p233-i18n-new-debt-pr-gate-3c10` |
| Head SHA | `c605df58a343bac7b4bd1811558d64b178ab1bcb` |
| Commit count | **4** |
| Campaign branch HEAD | `021f6a22b66cc69b28291a15d7f4055e3977e33d` ✓ |

---

## 2. Implementation diff census

**Diff range:** `021f6a22b66cc69b28291a15d7f4055e3977e33d...c605df58a343bac7b4bd1811558d64b178ab1bcb`

| Category | Count |
|----------|------:|
| Production UI changes | **0** |
| Business logic changes | **0** |
| API changes | **0** |
| Fetch/mutation changes | **0** |
| Dictionary changes | **0** |
| Historical manifest mutation | **0** |
| Category E | **0** |

**Changed files (12):**

- `.github/workflows/i18n-governance-new-debt.yml` — governance workflow
- `architecture/I18N_GOVERNANCE_CHANGED_FILE_GATE_P2_3_3_2026-08-31.md` — architecture record
- `docs/audits/i18n-p2-3-3-changed-file-new-debt-gate-implementation-2026-08-31.md` — implementation audit
- `frontend/package.json` — governance npm scripts
- `frontend/scripts/i18n-check.mjs` — read-only CI path
- `frontend/scripts/i18n-hardcoded-scan.mjs` — `--no-write` support
- `frontend/scripts/i18n-pr-gate.mjs` — CLI / orchestration
- `frontend/scripts/lib/i18n-governance/git-diff.mjs` — NUL parser
- `frontend/scripts/lib/i18n-governance/git-source.mjs` — fail-closed reads
- `frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs` — authority / relevance policy
- `frontend/scripts/lib/i18n-governance/pr-gate.mjs` — gate engine
- `frontend/src/i18n/i18n-pr-gate.test.ts` — adversarial suite

**Classification:** governance tooling / tests / docs / workflow only.

---

## 3. Trust-boundary analysis

### 3.1 External bootstrap removal

| Check | Result |
|-------|--------|
| `.github/scripts/i18n-pr-bootstrap-relevance.sh` present | **NO** |
| Workflow executes `bash .github/scripts/` before relevance | **NO** |
| Workflow executes `source .github/` before relevance | **NO** |
| Workflow executes `node <repo-script>` before relevance | **NO** |
| Workflow executes `npm` before relevance | **NO** |
| `EXTERNAL_BOOTSTRAP_EXECUTABLE` | **ABSENT** |
| `PRE_RELEVANCE_PR_HEAD_REPOSITORY_EXECUTION` | **0** |

### 3.2 Inline bootstrap inspection

Workflow step `Classify PR relevance (workflow-inline trusted bootstrap)` verified:

- Uses `set -euo pipefail`
- `BASE_SHA="${{ github.event.pull_request.base.sha }}"`
- `HEAD_SHA="${{ github.event.pull_request.head.sha }}"`
- Checkout: `ref: github.event.pull_request.head.sha`, `fetch-depth: 0`
- Pre-relevance commands: `git cat-file`, Bash builtins, `git diff`, `case`, `echo`, `$GITHUB_OUTPUT` only

### 3.3 NUL-safe path handling

**Independent witness:** temp Git repo with rename `frontend/src/rental/old path/Foo Bar.tsx` → `frontend/src/rental/new path/Foo Bar.tsx`.

```
PATH[1]=[frontend/src/rental/new path/Foo Bar.tsx]
path_count=1
```

NUL-safe `while IFS= read -r -d ''` correctly yields one path; spaces are not split into pseudo-paths.

### 3.4 Invalid SHA fail-closed

| Test | Parent exit |
|------|------------:|
| Invalid base SHA (`000…000`) after `set -euo pipefail` | **128** |
| Invalid head SHA (`000…000`) | **128** |

Invalid SHAs do not emit authoritative false relevance and continue as successful no-op.

### 3.5 Empty / valid diff behavior

| Scenario | `relevant` | Parent exit |
|----------|----------|------------:|
| Valid backend-only diff | `false` | **0** (no-op path) |
| Valid frontend diff | `true` | **0** |

Valid irrelevant diff is distinguishable from producer failure only when producer succeeds.

---

## 4. BLOCKING FINDING — Process-substitution fail-open

### 4.1 Required adversarial test

**Question:** Can a `git diff` producer failure inside process substitution be swallowed, leaving `relevant=false` and causing workflow no-op PASS?

**Answer:** **YES**

`CAN_PROCESS_SUBSTITUTION_PRODUCER_FAILURE_BE_SWALLOWED = YES`

### 4.2 Test method

Isolated Bash reproduction using the **same structure** as the workflow relevance step:

```bash
set -euo pipefail
git cat-file -e "${BASE}^{commit}"
git cat-file -e "${HEAD}^{commit}"
relevant=false
while IFS= read -r -d '' path; do
  ...
done < <(PRODUCER "${BASE}...${HEAD}")
echo "relevant=${relevant}"
```

Environment: GNU bash 5.2.21 (same family as GitHub `ubuntu-latest` runners).

### 4.3 Witnesses

| Producer | Output | Parent exit |
|----------|--------|------------:|
| `false` (exit 1) | `relevant=false` | **0** |
| `/bin/false` | `relevant=false` | **0** |
| `/tmp/fail-diff.sh` (simulated `git diff`, exit 128) | `relevant=false` | **0** |
| Real `git diff` with invalid commit in `BASE...INVALID` after valid `cat-file` | `relevant=false` | **0** |
| `exit 128` in process sub (exact workflow structure) | `SHOULD_NOT_REACH relevant=false` | **0** |

**Additional control:**

| Structure | Parent exit |
|-----------|------------:|
| `set -euo pipefail; false \| while read; do :; done` | **1** (pipefail works) |
| `set -euo pipefail; cat < <(exit 128)` | **0** (process sub alone not caught) |

### 4.4 Impact

When `git diff --name-only -z "${BASE_SHA}...${HEAD_SHA}"` fails after successful `git cat-file`:

1. The `while read` loop receives no paths.
2. `relevant` remains `false`.
3. The relevance step exits **0**.
4. Workflow takes `Irrelevant PR no-op pass` → `I18N_PR_GATE=PASS`, `I18N_RELEVANT_CHANGES=NO`.
5. Full governance path (scanner tests, PR-gate tests, dictionary check, final gate) is **skipped**.

This is a **fail-open trust bypass** in the Layer A inline bootstrap.

### 4.5 Required remediation (report only)

The inline bootstrap must propagate producer failure synchronously and fail-closed. Example patterns (not implemented in this audit):

- Avoid process substitution for the producer; capture diff output with explicit exit check.
- Use `PIPESTATUS` / explicit producer exit inspection after the loop.
- Replace `while read < <(git diff …)` with a fail-closed wrapper that aborts on non-zero `git diff`.

**PR #1464 MUST NOT be merged until this is fixed.**

---

## 5. Relevance contract matrix

Independent evaluation via `isI18nRelevantPath()`:

| Path | Expected | Actual |
|------|----------|--------|
| `backend/src/example.ts` | irrelevant | ✓ false |
| `frontend/src/rental/Foo.tsx` | relevant | ✓ true |
| `frontend/scripts/i18n-pr-gate.mjs` | relevant | ✓ true |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | relevant | ✓ true |
| `frontend/scripts/i18n-check.mjs` | relevant | ✓ true |
| `frontend/scripts/i18n-shim-inventory.mjs` | relevant | ✓ true |
| `frontend/scripts/lib/i18n-governance/pr-gate.mjs` | relevant | ✓ true |
| `frontend/package.json` | relevant | ✓ true |
| `frontend/package-lock.json` | relevant | ✓ true |
| `.github/workflows/i18n-governance-new-debt.yml` | relevant | ✓ true |
| `frontend/src/i18n/i18n-pr-gate.test.ts` | relevant | ✓ true |
| `frontend/src/i18n/i18n-governance-scanner.test.ts` | relevant | ✓ true |
| `frontend/src/i18n/translation-registry.test.ts` | relevant | ✓ true |

**Bootstrap vs full policy parity:** No path is governance-authority while inline relevance classifies irrelevant. Inverse (relevant but not authority, e.g. `frontend/src/**`) is conservative and acceptable.

---

## 6. Authority-path census

All required authority paths independently verified via `isGovernanceAuthorityPath()`:

- `frontend/scripts/i18n-hardcoded-scan.mjs` ✓
- `frontend/scripts/i18n-check.mjs` ✓
- `frontend/scripts/i18n-governance.mjs` ✓
- `frontend/scripts/i18n-pr-gate.mjs` ✓
- `frontend/scripts/i18n-shim-inventory.mjs` ✓
- `frontend/scripts/lib/i18n-governance/**` ✓
- `frontend/package.json` ✓
- `frontend/package-lock.json` ✓
- `frontend/src/i18n/i18n-debt-classifications.json` ✓
- `frontend/src/i18n/i18n-pr-gate.test.ts` ✓
- `frontend/src/i18n/i18n-governance-scanner.test.ts` ✓
- `frontend/src/i18n/translation-registry.test.ts` ✓
- `.github/workflows/i18n-governance-new-debt.yml` ✓

No missing executable/configuration authority path identified.

---

## 7. Adversarial gate matrix (Layer B — PR-head code)

Evidence source: independent re-run of `npm run i18n:pr-gate:test` (69/69 PASS at 60s timeout) plus test-suite inspection.

| Scenario | Expected | Verified |
|----------|----------|----------|
| Authority-only without label | exit 3 | ✓ (test 69b, live CI) |
| Authority-only with `--authority-approved` | pass | ✓ (test 69, approved self-gate) |
| Mixed authority + product (unapproved) | exit 3 | ✓ |
| Mixed authority + product (approved) | exit 3 | ✓ |
| Ungoverned `frontend/src/**/*.ts(x)` | exit 4 | ✓ |
| Unsupported `frontend/src/**/*.js(x)` | exit 4 | ✓ |
| New host-presentation literal | `NEW_PR_ACTIONABLE_HOST_DEBT=1`, exit 2 | ✓ |
| Translated addition only | `NEW_PR_ACTIONABLE_HOST_DEBT=0` | ✓ |
| Duplicate multiset (+1 occurrence) | new count = 1 | ✓ |
| Real rename with spaces, same debt | `R*`, new debt = 0 | ✓ |
| Real rename + duplicate in same commit | `R*`, new debt = 1, exit 2 | ✓ |
| Copy semantics (destination new lineage) | fail-closed as designed | ✓ (test suite) |
| Historical reintroduction | `REINTRODUCED_HISTORICAL_DEBT=1` | ✓ (dedicated proof) |
| Deferred surface new-copy (Data Analyse / IAM) | blocks | ✓ |
| RAW_PROVIDER / RAW_USER / machine values | allowed where classified | ✓ |
| Editorial boundary (Help Center shell) | fail-closed | ✓ |
| `GIT_SOURCE_READ_FAILURE` CLI | exit 5 | ✓ (spawned CLI witness) |
| Exact PR base SHA authority | no merge-base substitution | ✓ (code inspection + tests) |
| Authority before no-op | authority paths cannot no-op first | ✓ (`runGate` ordering) |
| Backend-only diff | relevance false, gate no-op after authority precheck | ✓ |

**Layer B gate engine is sound.** The blocking defect is confined to Layer A inline bootstrap producer-failure handling.

---

## 8. Live CI evidence (run `33405230809`, HEAD `c605df58a`)

### 8.1 Step order (actual, not inferred)

1. Checkout PR head — **success**
2. Classify PR relevance (workflow-inline) — **success**, `I18N_RELEVANT_CHANGES=YES`
3. Irrelevant PR no-op pass — **skipped**
4. Setup Node.js — **success**
5. npm ci — **success**
6. Scanner tests — **success**, 45/45
7. PR-gate adversarial tests — **success**, 69/69
8. Dictionary check (read-only) — **success**
9. PR new-debt gate — **failure (exit 3)**, expected policy red
10. Assert worktree clean — **success**, `WORKTREE_CLEAN_AFTER_CI=YES`

### 8.2 Final gate classification (expected policy red)

```
I18N_PR_GATE=FAIL
NEW_PR_ACTIONABLE_HOST_DEBT=0
REINTRODUCED_HISTORICAL_DEBT=0
GOVERNANCE_AUTHORITY_CHANGED=YES
MIXED_AUTHORITY_PRODUCT_CHANGE=NO
```

Classified as **EXPECTED POLICY RED** (authority PR without `i18n-governance-authority-change` label).

### 8.3 Workflow event coverage

Triggers: `opened`, `synchronize`, `reopened`, `ready_for_review`, `labeled`, `unlabeled`.  
No top-level `paths:` filter — backend-only PRs materialize then cheaply no-op.

---

## 9. Firewall verification

### 9.1 Historical baseline immutability

| Field | Required | Verified |
|-------|----------|----------|
| `fingerprintVersion` | 3 | **3** |
| `governanceBaseline.findingCount` | 1627 | **1627** |
| `capturedFromSha` | `381671605ea1cd55844518312839b0f7d99a48bd` | **match** |
| `baselineFingerprints.length` | 1627 | **1627** |

PR #1464 does not mutate `i18n-debt-classifications.json`.

### 9.2 Enhanced scanner state

| Metric | Required | Verified |
|--------|----------|----------|
| Enhanced total | 1542 | ✓ (scanner tests) |
| Rental | 257 | ✓ |
| Finance/Billing | 43 | ✓ |
| `ACTIVE_REMEDIATION_REQUIRED` | 0 | ✓ |
| `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT` | 0 | ✓ |

### 9.3 Legacy scanner compatibility

| Metric | Required | Verified |
|--------|----------|----------|
| Global | 1241 | ✓ (scanner test) |
| Rental | 144 | ✓ |
| Finance/Billing | 25 | ✓ |

### 9.4 Dictionary firewall

| Metric | Value |
|--------|------:|
| EN | 9803 |
| DE | 9803 |
| Parity | 100% |
| Orphans | 0 |
| Dictionary diff in #1464 | **0** |

### 9.5 Product semantic firewall

Production UI / business / API / fetch / mutation / Category E diffs relative to campaign base: **0**.

---

## 10. Workflow self-modification reality check

Documentation explicitly records:

```
WORKFLOW_SELF_MODIFICATION = POST_MERGE_REPOSITORY_PROTECTION_REQUIRED
```

Repository-level protection (CODEOWNERS / ruleset / protected governance paths) for `.github/workflows/i18n-governance-new-debt.yml` is required **before** `i18n-new-debt-gate` becomes a mandatory merge check.

P2.3.3 does **not** falsely claim full tamper resistance. Inline bootstrap removes PR-head executable bootstrap bypass but workflow YAML itself remains modifiable via PR until post-merge protection is installed.

**Branch protection:** Not activated/modified by #1464.  
**Required-check activation:** **NOT allowed** until workflow self-modification protection exists.

---

## 11. diff-check

```
git diff --check 021f6a22b...c605df58a
```

**Result:** 6 trailing-whitespace warnings in documentation headers (architecture + implementation audit docs). **Non-zero output.**

---

## 12. Findings summary

### Blocking findings (1)

| ID | Severity | Finding |
|----|----------|---------|
| **B-001** | **BLOCKER** | Workflow-inline bootstrap `while read … done < <(git diff …)` does not propagate producer failure under `set -euo pipefail`. Git diff failure → `relevant=false` → no-op PASS → full governance skipped. |

### Non-blocking observations (2)

| ID | Severity | Finding |
|----|----------|---------|
| N-001 | Observation | `git diff --check` reports trailing whitespace in doc headers (6 lines). |
| N-002 | Observation | Local PR-gate suite can flake at default 20s per-describe timeout under load; CI and 60s timeout pass 69/69. |

---

## 13. Final verdict

### **C — BLOCKER — INLINE BOOTSTRAP FAIL-OPEN / TRUST BYPASS**

P2.3.3 Layer B (PR-head gate engine, adversarial tests, authority firewall, historical baseline, scanner/dictionary firewalls) is independently sound. However, Layer A workflow-inline bootstrap fails open when the `git diff` process-substitution producer errors: the relevance step exits 0 with `relevant=false`, causing an authoritative no-op PASS and skipping all downstream governance checks.

**PR #1464 MUST NOT be merged until the inline bootstrap propagates Git diff producer failure synchronously and fail-closed.**

---

*Independent audit artifact. No implementation code modified. Audit PR remains draft / open / unmerged.*
