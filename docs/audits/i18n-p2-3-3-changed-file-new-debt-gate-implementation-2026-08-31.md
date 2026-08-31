# P2.3.3 — Changed-File / New-Debt PR Gate — Implementation Audit

**Date:** 2026-08-31  
**Branch:** `cursor/p233-i18n-new-debt-pr-gate-3c10`  
**Base SHA:** `021f6a22b66cc69b28291a15d7f4055e3977e33d`  
**Mode:** Governance-only implementation slice

---

## PART A — Topology

| Field | Value |
|-------|-------|
| Campaign branch | `p239-p238-merge-baseline-3c10` |
| Start SHA | `021f6a22b66cc69b28291a15d7f4055e3977e33d` |
| Production changes | **0** |
| Dictionary changes | **0** |
| Manifest/baseline changes | **0** |

---

## PART B — Current authority

| Metric | Value |
|--------|-------|
| `fingerprintVersion` | 3 |
| `governanceBaseline.findingCount` | 1627 |
| `capturedFromSha` | `381671605ea1cd55844518312839b0f7d99a48bd` |
| Enhanced total | 1542 |
| Rental enhanced | 257 |
| Finance/Billing enhanced | 43 |
| `ACTIVE_REMEDIATION_REQUIRED` | 0 |
| `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT` | 0 |
| EN / DE | 9803 / 9803 |
| Parity | 100% |
| Orphans | 0 |

---

## PART C — PR comparison model

- Explicit `--base-sha` (40-hex), HEAD = `git rev-parse HEAD` or `--head-sha`
- Fail-closed validation: SHA format, object existence, diff success
- Changed paths via `git diff --name-status -z -M BASE...HEAD`
- Governed production scope: `frontend/src/**` with scanner eligibility semantics
- Comparison uses `scanSource(..., { includeEnhanced: true })` at base/head file snapshots via `git show`

---

## PART D — Lineage identity

PR-lineage key:

`severity|category|presentationOwner|kind|normalizedLiteral`

Multiset delta: `max(0, headCount - baseCount)` per key.

---

## PART E — Rename/copy semantics

- `R*`: lineage pair old→new path
- `C*`: destination treated as new source (no inherited debt)
- `D`: deletion allowed
- Path-with-spaces rename parser regression covered

---

## PART F — Semantic exception policy

New-copy allowlist (narrow):

- MACHINE_DOMAIN / FORMAT_LOCALE
- RAW_PROVIDER / RAW_USER
- EDITORIAL_CONTENT via manifest rule match

Deferred baseline classifications do **not** authorize new host copy (Data Analyse, IAM, etc.).

Help Center enforce-clean editorial ambiguity: **fail closed**.

---

## PART G — Authority anti-bypass

- Mixed authority + product change → `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE` (exit 3)
- Authority-only without label/flag → exit 3
- Bootstrap PR requires `i18n-governance-authority-change` label or `--authority-approved`

---

## PART H — Ungoverned path firewall

- Outside scanner roots → `UNGOVERNED_PRODUCTION_SOURCE_PATH` (exit 4)
- `.js/.jsx` production under `frontend/src` → `UNSUPPORTED_GOVERNED_SOURCE_EXTENSION` (exit 4)

---

## PART I — Adversarial tests

`npm run i18n:pr-gate:test` — **65 tests PASS** (authoritative current count).

Covers: translated pass, direct/indirect host fail, duplicates, refactor pass, rename pass/fail, copy fail, deletion pass, wording change, dedicated historical reintroduction proof, Data Analyse/IAM new-copy block, machine/raw pass, Help Center shell fail, editorial fail-closed, parser statuses, authority policy (package.json, i18n-check, mixed authority/product), trusted bootstrap bypass resistance, real Git integration, CLI exit-5 witness, determinism.

> PRE-CORRECTION HISTORICAL RECORD: initial implementation shipped with 43 tests; first correction raised this to 56.

---

## PART J — CI workflow

| Item | Value |
|------|-------|
| File | `.github/workflows/i18n-governance-new-debt.yml` |
| Workflow name | `i18n Governance — New Debt Gate` |
| Job/check | `i18n-new-debt-gate` |
| Triggers | `pull_request` opened/synchronize/reopened/ready_for_review/labeled/unlabeled |
| Checkout | `github.event.pull_request.head.sha`, `fetch-depth: 0` |
| Base | `github.event.pull_request.base.sha` |
| Permissions | `contents: read` |
| Independent from | Vehicle Detail / backend typecheck / Legal Documents |

---

## PART K — Performance

PR gate logic (excluding `npm ci`): sub-second on local run (43 vitest cases in ~40ms; gate CLI dominated by git diff + targeted scans).

---

## PART L — Baseline/scanner compatibility

| Check | Before | After |
|-------|-------:|------:|
| Enhanced total | 1542 | 1542 |
| Active remediation | 0 | 0 |
| New unclassified | 0 | 0 |
| Scanner tests | 45/45 PASS | 45/45 PASS |

Added `isScannerEligibleRelativePath` export only; no scan semantic drift.

---

## PART M — Validation

| Command | Result |
|---------|--------|
| `npm run i18n:scanner:test` | PASS (45/45) |
| `npm run i18n:pr-gate:test` | PASS (**65/65**) |
| `npm run i18n:check` | PASS (EN=DE=9803) |
| `npm run i18n:governance` | PASS |
| `npm run check:surface` | PASS |
| `npx tsc -b` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Self gate (`--base-sha 021f6a22b... --authority-approved` on implementation HEAD): `NEW_PR_ACTIONABLE_HOST_DEBT=0`.

---

## PART N — Branch-protection readiness

**Not modified.** Check is implemented and self-contained; required-status activation waits for independent audit + observed green check context.

---

*Governance infrastructure only. DO NOT MERGE until independent audit certifies.*

---

## CORRECTION — P2.3.3 required-check hardening (2026-08-31)

### A. Required-check materialization defect

Top-level workflow `paths:` filter prevented `i18n-new-debt-gate` from materializing on backend-only PRs. **Fixed:** filter removed; check always runs.

### B. Workflow path-filter removal

`paths:` block removed from `.github/workflows/i18n-governance-new-debt.yml`.

### C. Backend-only no-op witness

Irrelevant PRs classify via `hasI18nRelevantChanges()`, emit no-op PASS, skip `npm ci` and full i18n suite.

### D. Git source-read fail-closed correction

`readSourceAtRef` no longer maps all `git show` errors to `null`. Expected absence is structural; unexpected failures throw `GIT_SOURCE_READ_FAILURE` (exit 5).

### E. Historical reintroduction dedicated proof

Test 22 now asserts exact `reintroducedHistoricalDebt.length === 1` with frozen `baselineFingerprints = [F]`.

### F. Actual Git integration tests

Temp-repo tests cover hardcoded add FAIL, translated add PASS, rename-with-spaces PASS, post-rename +1 FAIL, and `GIT_SOURCE_READ_FAILURE`.

### G. Read-only CI correction

`i18n-hardcoded-scan.mjs --no-write` + `npm run i18n:check:ci`; workflow uses read-only path.

### H. Workspace cleanliness

Workflow asserts empty `git status --porcelain` after relevant-path CI.

### I. Live workflow label result

Label `i18n-governance-authority-change` creation/application attempted on PR #1464; see final report for permission status.

### Updated test count (correction 1)

`npm run i18n:pr-gate:test` — **56 tests** (was 43).

---

## CORRECTION 2 — Trusted bootstrap / authority anti-bypass (2026-08-31)

### A. PR-head relevance classifier bypass

Workflow previously executed PR-head `i18n-pr-gate.mjs --classify-relevance-only` before authority evaluation. **Fixed:** Layer A trusted bootstrap shell (Git-only).

### B. Trusted bootstrap implementation

`.github/scripts/i18n-pr-bootstrap-relevance.sh` uses `git diff --name-only -z` only. Fail-closed on Git errors. No PR-head governance JS execution for relevance.

### C. Expanded governance authority

`package.json`, `package-lock.json`, `i18n-check.mjs`, `i18n-shim-inventory.mjs` added to authority set.

### D. Authority-before-no-op ordering

`runGate` evaluates authority policy before irrelevant no-op return.

### E. Adversarial bypass tests

Malicious `i18n-pr-gate.mjs` / `pr-gate-policy.mjs` changes cannot force bootstrap `relevant=false`.

### F. Real rename+addition witness

Single-commit `R*` rename with spaces + one new host occurrence → `NEW_PR_ACTIONABLE_HOST_DEBT=1`, exit 2.

### G. CLI exit-5 witness

Spawned `node scripts/i18n-pr-gate.mjs` proves `GIT_SOURCE_READ_FAILURE` exit 5.

### H. Worktree cleanliness on gate failure

`if: always() && relevant` ensures cleanliness check runs even when gate exits 3.

### I. Workflow self-modification caveat

Documented CODEOWNERS/ruleset requirement for post-merge activation.

### Authoritative final test count

`npm run i18n:pr-gate:test` — **65 tests**.
