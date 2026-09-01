# P2.3.3 — Fail-Closed Bootstrap Correction Smoke Audit

**Date:** 2026-09-01  
**Mode:** Independent correction smoke certification (delta audit only)  
**Implementation PR:** #1464  
**Pre-correction HEAD:** `c605df58a343bac7b4bd1811558d64b178ab1bcb`  
**Corrected HEAD audited:** `6c39be380753e6c79a1be5ff37b68eb600ac8a65`  
**Historical blocking audit:** #1476 (`b802806b31a845f5ab458506886579dfb5e1cdfa`)  
**Campaign base:** `021f6a22b66cc69b28291a15d7f4055e3977e33d`

---

## A — Topology

| Field | Verified |
|-------|----------|
| PR #1464 open / draft / unmerged | **YES** |
| PR #1464 mergeable | **MERGEABLE** |
| Base branch | `p239-p238-merge-baseline-3c10` |
| Base SHA | `021f6a22b66cc69b28291a15d7f4055e3977e33d` |
| Implementation HEAD | `6c39be380753e6c79a1be5ff37b68eb600ac8a65` |
| Commit count | **5** |
| Campaign branch HEAD | `021f6a22b66cc69b28291a15d7f4055e3977e33d` ✓ |
| Audit #1476 open / draft / unmerged | **YES** |
| Audit #1476 HEAD (immutable) | `b802806b31a845f5ab458506886579dfb5e1cdfa` |
| Audit #1476 base (pre-correction) | `c605df58a343bac7b4bd1811558d64b178ab1bcb` |

---

## B — Correction-only diff

**Range:** `c605df58a...6c39be380`

| File | Purpose |
|------|---------|
| `.github/workflows/i18n-governance-new-debt.yml` | Synchronous diff enumeration |
| `architecture/I18N_GOVERNANCE_CHANGED_FILE_GATE_P2_3_3_2026-08-31.md` | Architecture correction |
| `frontend/src/i18n/i18n-pr-gate.test.ts` | 2-line workflow regression assertion |

| Classification | Count |
|----------------|------:|
| Production UI | **0** |
| Dictionaries | **0** |
| Manifest/baseline | **0** |
| Scanner semantics | **0** |
| PR-gate Layer-B semantics | **0** |
| Business/API/fetch/mutation | **0** |
| Category E | **0** |

`git diff --check c605df58a...6c39be380` → **zero output**.

---

## C — Historical #1476 blocker

Audit #1476 (verdict **C**) independently proved on pre-correction HEAD `c605df58a`:

```
while ...; done < <(git diff --name-only -z ...)
```

With `set -euo pipefail`, process-substitution producer failure (`exit 128`) was **swallowed**:

- `OLD_PARENT_EXIT = 0`
- `relevant = false`
- Irrelevant no-op path reachable

Audit #1476 remains immutable historical evidence for `c605df58a` only.

---

## D — Final synchronous architecture

Verified in `.github/workflows/i18n-governance-new-debt.yml`:

| Invariant | Result |
|-----------|--------|
| `PROCESS_SUBSTITUTION_DIFF_ENUMERATION` | **ABSENT** |
| `git cat-file` BASE then HEAD | **YES** |
| `DIFF_FILE` under `$RUNNER_TEMP` | **YES** |
| Foreground `git diff --name-only -z > "${DIFF_FILE}"` | **YES** |
| `relevant=false` only after successful diff | **YES** |
| `while IFS= read -r -d '' path; do ... done < "${DIFF_FILE}"` | **YES** |
| `DIFF_BEFORE_RELEVANCE_DECISION` | **YES** |
| `DIFF_SYNCHRONOUS` | **YES** |
| `DIFF_STORAGE_OUTSIDE_REPOSITORY` | **YES** |
| `NUL_SAFE` | **YES** |

**set -e semantics:** Certification relies on `git diff` being an ordinary foreground command subject to `set -euo pipefail`, **not** on pipefail propagating process substitution.

---

## E — Independent forced producer-failure experiment

**Method:** Temp Git repo with valid BASE/HEAD; PATH-scoped `git` shim delegating `cat-file` to `/usr/bin/git` but returning `exit 128` for `git diff`.

### Corrected structure (NEW)

```
fatal: forced diff failure
NEW_PARENT_EXIT=128
```

- `DIFF_PRODUCER_EXIT = 128`
- `FAILURE_PROPAGATED = YES`
- `RELEVANT_FALSE_EMITTED_AFTER_FAILURE = NO`
- `IRRELEVANT_NOOP_REACHED = NO`

### Old structure (reproduced for comparison)

```
fatal
relevant=false
OLD_PARENT_EXIT=0
```

---

## F — Old vs new behavior

| Behavior | Pre-correction (`c605df58a`) | Corrected (`6c39be380`) |
|----------|------------------------------|-------------------------|
| Producer failure | Parent exit **0** | Parent exit **128** |
| `relevant=false` after failure | **YES** | **NO** |
| No-op reachable | **YES** | **NO** |
| `OLD_FAIL_OPEN_REPRODUCED_OR_VERIFIED` | **YES** | — |
| `NEW_FAIL_CLOSED` | — | **YES** |

---

## G — Relevance smoke matrix (corrected structure)

| Case | `relevant` | Parent exit |
|------|------------|------------:|
| Backend-only (`backend/src/f.ts`) | `false` | **0** |
| Frontend (`frontend/src/rental/F.tsx`) | `true` | **0** |
| Authority (`frontend/scripts/i18n-pr-gate.mjs`) | `true` | **0** |
| Workflow (`.github/workflows/i18n-governance-new-debt.yml`) | `true` | **0** |

---

## H — NUL / path-space smoke

Path: `frontend/src/rental/components/Foo Bar.tsx`

```
PATH=[frontend/src/rental/components/Foo Bar.tsx]
path_count=1
```

No splitting; NUL delimiters preserved via binary temp file.

---

## I — Invalid SHA smoke

| Case | Parent exit |
|------|------------:|
| Invalid BASE | **128** |
| Invalid HEAD | **128** |

No authoritative irrelevant/no-op PASS emitted.

---

## J — Live GitHub run `33484479889`

| Field | Value |
|-------|-------|
| Commit SHA | `6c39be380753e6c79a1be5ff37b68eb600ac8a65` ✓ |
| `BASE_SHA` | `021f6a22b66cc69b28291a15d7f4055e3977e33d` |
| `HEAD_SHA` | `6c39be380753e6c79a1be5ff37b68eb600ac8a65` |
| `I18N_RELEVANT_CHANGES` | **YES** |
| Log shows `git diff ... > "${DIFF_FILE}"` | **YES** |
| Log shows `done < "${DIFF_FILE}"` | **YES** |
| Process substitution absent in log | **YES** |

**Actual step order:** Checkout → inline relevance → Setup Node → npm ci → scanner 45/45 → PR-gate 69/69 → read-only check → final gate (exit 3) → worktree clean.

---

## K — Live control-plane results

| Step | Result |
|------|--------|
| Scanner tests | **45/45 PASS** |
| PR-gate adversarial tests | **69/69 PASS** |
| Read-only `i18n:check:ci` | **PASS** (inventory not written) |
| Final gate | `I18N_PR_GATE=FAIL`, exit **3** |
| Gate metrics | `NEW_PR_ACTIONABLE_HOST_DEBT=0`, `REINTRODUCED_HISTORICAL_DEBT=0`, `GOVERNANCE_AUTHORITY_CHANGED=YES`, `MIXED_AUTHORITY_PRODUCT_CHANGE=NO` |
| Classification | **EXPECTED_AUTHORITY_POLICY_RED** |
| Worktree cleanliness | `WORKTREE_CLEAN_AFTER_CI=YES` (after exit 3) |

PR-gate test suite witnesses (from live run logs): new host copy fail, translated pass, rename+duplicate fail, approved/unapproved self-gate, backend-only no-op — all executed within 69/69 PASS.

---

## L — Governance firewalls (unchanged by correction)

| Firewall | Value |
|----------|-------|
| `fingerprintVersion` | **3** |
| Historical `findingCount` | **1627** |
| `capturedFromSha` | `381671605ea1cd55844518312839b0f7d99a48bd` |
| `baselineFingerprints` | **1627** (unchanged) |
| Enhanced total | **1542** |
| Rental | **257** |
| Finance/Billing | **43** |
| `ACTIVE_REMEDIATION_REQUIRED` | **0** |
| `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT` | **0** |
| Legacy Global / Rental / Finance | **1241** / **144** / **25** |
| EN / DE | **9803** / **9803** |
| Parity | **100%** |
| Orphans | **0** |
| Dictionary diff (correction) | **0** |
| Manifest diff | **0** |
| Product/business/API/fetch/mutation diff | **0** |
| Category E | **0** |

---

## M — Workflow protection prerequisite

Architecture doc retains:

```
WORKFLOW_SELF_MODIFICATION = POST_MERGE_REPOSITORY_PROTECTION_REQUIRED
```

Bootstrap correction does **not** remove this prerequisite. `i18n-new-debt-gate` must not be activated as a required check until repository-level protection exists for `.github/workflows/i18n-governance-new-debt.yml`.

Campaign branch protection: **not activated** (no new required status checks).

---

## N — Blocking findings

**0**

---

## O — Non-blocking observations

| ID | Observation |
|----|-------------|
| N-001 | Full-range `git diff --check 021f6a22b...6c39be380` reports 6 pre-existing trailing-whitespace lines in documentation headers from earlier P2.3.3 commits; correction-only diff is clean. |

---

## Final verdict

### **A — CORRECTION CERTIFIED — P2.3.3 READY FOR MERGE**

- **The process-substitution fail-open identified by audit #1476 is closed.**
- **Git diff producer failure now propagates synchronously and fail-closed.**
- **P2.3.3 governance semantics outside the bootstrap are unchanged.**
- **PR #1464 may be marked Ready and merged into `p239-p238-merge-baseline-3c10`.**
- **Audit PR #1476 and this correction-smoke audit remain unmerged.**
- **Required-check activation remains forbidden until repository-level workflow protection is configured.**

---

*Smoke audit artifact only. No implementation changes. Audit PR remains draft / open / unmerged.*
