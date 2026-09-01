# P2.3.4A — Trusted Authority Guard Independent Security Audit

**Date:** 2026-09-01
**Phase:** P2.3.4A independent security certification (read-only)
**Auditor mode:** Independent / adversarial / do-not-merge
**Implementation PR:** #1489
**Implementation branch:** `cursor/p234a-i18n-trusted-authority-guard-3c10`
**Implementation HEAD audited:** `3068fee9a2e39037313619a1d60badfac77c47ac`
**Implementation original main base:** `da959784f835a31482852d506daa137c90389b87`
**Audit branch:** `cursor/p234a-trusted-authority-independent-audit-3c10`
**Audit base branch:** `cursor/p234a-i18n-trusted-authority-guard-3c10` @ `3068fee9a2e39037313619a1d60badfac77c47ac`
**Campaign branch (verified unchanged):** `p239-p238-merge-baseline-3c10` @ `7406d4cdf7d87b91eea28c1f5a55368928656d1d`

---

## PART A — Topology

| Check | Observed | Pass |
|-------|----------|------|
| Implementation PR #1489 state | open, draft, unmerged | YES |
| Implementation base | `main` @ `da959784f835a31482852d506daa137c90389b87` | YES |
| Implementation HEAD | `3068fee9a2e39037313619a1d60badfac77c47ac` | YES |
| Implementation commits | 3 | YES |
| Implementation changed files | 3 (exact expected paths) | YES |
| Current `main` HEAD at audit | `3772d992dae012bc9d794184e05e8ad39db09df4` | — |
| Exact path collision with `main` | **NO** (all three P2.3.4A paths absent on `main`) | YES |
| Main advancement classification | **NON_BLOCKING_MAIN_ADVANCEMENT** | YES |
| Campaign HEAD | `7406d4cdf7d87b91eea28c1f5a55368928656d1d` | YES |
| Campaign branch modified by #1489 | **NO** | YES |

Expected implementation paths (verified):

1. `.github/workflows/i18n-authority-protection.yml`
2. `architecture/I18N_GOVERNANCE_WORKFLOW_AUTHORITY_PROTECTION_P2_3_4_2026-09-01.md`
3. `docs/audits/i18n-p2-3-4a-trusted-authority-guard-implementation-2026-09-01.md`

---

## PART B — `pull_request_target` trust semantics

| Property | Finding |
|----------|---------|
| Event | `pull_request_target` |
| Trust anchor | Workflow definition on **default branch** (`main`) after merge |
| PR-head execution | **None** — API-only path enumeration |
| Certification tier | **STATIC_SECURITY_CERTIFIED** |
| Live canary tier | **NOT_YET_CERTIFIABLE** (workflow not on `main`; P2.3.4B required) |

Independent assessment: `pull_request_target` is the correct GitHub primitive for a trusted base-defined governance layer that must not execute PR-head workflow content. The workflow reads PR metadata and calls the GitHub REST API; it does not checkout or execute repository code from the PR head.

---

## PART C — Zero PR-head execution

| Forbidden pattern | Count |
|-------------------|-------|
| `actions/checkout` | **0** |
| PR HEAD checkout / merge ref | **0** |
| `npm ci` / `npm install` / `npm run` | **0** |
| `node` repository script execution | **0** |
| `bash` / `source` repository file | **0** |
| `python` repository file | **0** |
| Local `.github/actions/**` | **0** |
| Docker build | **0** |
| `workflow_call` to PR-controlled workflow | **0** |
| PR-head artifact execution | **0** |
| **PR_HEAD_REPOSITORY_CODE_EXECUTED** | **0** |

Temporary files use `RUNNER_TEMP` only. No repository worktree is required.

---

## PART D — Permissions and secret firewall

### Permissions (exact)

```yaml
contents: read
pull-requests: read
issues: write
```

No `contents: write`, `actions: write`, `checks: write`, `packages: write`, `deployments`, `id-token`, or repository secrets.

`issues: write` is used exclusively by `invalidate_authority_label()` to DELETE `repos/{repo}/issues/{pr}/labels/i18n-governance-authority-change`. No broad issue mutation.

### Secret firewall

| Pattern | Count |
|---------|-------|
| `secrets.` / `${{ secrets` | **0** |
| Environment secrets / OIDC / cloud credentials | **0** |
| `github.token` usage | **1** (narrow GitHub API access via `GH_TOKEN`) |
| **SECRET_REFERENCES** | **0** |

---

## PART E — API enumeration / 3000-limit model

| Property | Verified |
|----------|----------|
| Endpoint | `repos/${REPO}/pulls/${PR_NUMBER}/files` |
| Pagination | `gh api --paginate --slurp` |
| Slurp outer shape | `array` of per-page `array` objects |
| Enumeration count jq | `[.[][] \| .filename] \| length` |
| Path extraction jq | `.[][] \| [.filename, (.previous_filename // empty)][]` |
| `ENUMERATED_FILE_COUNT` vs `EVENT_CHANGED_FILES` | Compared only at record level |
| `CLASSIFIED_PATH_COUNT` | Separate; not compared to `changed_files` |

### Official 3000-file API limit

GitHub documents that **List pull request files** returns a maximum of **3000 files** total across pagination. Implementation policy:

| `changed_files` | Result |
|-----------------|--------|
| 2999 | Normal evaluation may proceed |
| 3000 | **FAIL** `PR_FILE_ENUMERATION_LIMIT_UNSAFE` (before API call) |
| 3001 | **FAIL** `PR_FILE_ENUMERATION_LIMIT_UNSAFE` |
| 5000 | **FAIL** `PR_FILE_ENUMERATION_LIMIT_UNSAFE` |

### Enumeration failure outcomes (all fail-closed)

| Condition | REASON |
|-----------|--------|
| API failure | `PR_FILE_ENUMERATION_FAILED` |
| Invalid outer JSON (not array) | `PR_FILE_JSON_PARSE_FAILED` |
| jq path extraction failure | `PR_FILE_PATH_EXTRACTION_FAILED` |
| `ENUMERATED_FILE_COUNT != EVENT_CHANGED_FILES` | `INCOMPLETE_PR_FILE_ENUMERATION` |

No error path defaults to PASS for authority-changing PRs.

### Malformed `changed_files` adversarial probe

| Value | Behavior |
|-------|----------|
| `""` (empty) | `[ -ge 3000 ]` emits bash integer warning; continues; enumeration mismatch → **FAIL** `INCOMPLETE_PR_FILE_ENUMERATION` |
| `abc` (non-numeric) | Same warning path; mismatch → **FAIL** |
| `-1` | Passes 3000 guard; mismatch with real enumeration → **FAIL** |

**Assessment:** Malformed values cannot yield authority PASS. Non-blocking observation: empty/non-numeric values produce bash warnings rather than an explicit dedicated reason code.

---

## PART F — NUL and filename handling

| Test | Result |
|------|--------|
| jq NUL delimiter emission | **PASS** |
| `while IFS= read -r -d '' path` consumption | **PASS** |
| Filename with spaces | **PASS** (product classification only) |
| Unicode filename | **PASS** |
| Leading hyphen | **PASS** |
| Tab in filename | **PASS** |
| Shell metacharacters in path | Classified as literal path data |

Independent slurp fixture (`a.ts`, `b.ts` renamed from `old.ts`, `c.ts`) produced 4 NUL-delimited path identities with `ENUMERATED_FILE_COUNT=3` and `CLASSIFIED_PATH_COUNT=4` — confirming rename pre-image is a separate classification identity.

---

## PART G — Rename pre/post authority

| Fixture | AUTHORITY_CHANGED | Result |
|---------|-------------------|--------|
| `.github/workflows/i18n-governance-new-debt.yml` → `.github/workflows/disabled.yml` | **YES** | FAIL (requires approval) |
| `frontend/scripts/i18n-pr-gate.mjs` → `frontend/scripts/legacy-pr-gate.mjs` | **YES** | FAIL |
| `frontend/src/rental/Foo.tsx` → `frontend/src/i18n/i18n-pr-gate.test.ts` | **YES** + product | MIXED FAIL |
| `frontend/src/i18n/i18n-pr-gate.test.ts` → `frontend/src/rental/Foo.tsx` | **YES** + product | MIXED FAIL |
| Authority file deletion | **YES** | FAIL |
| Authority file addition | **YES** | FAIL |

Rename-away bypass via `previous_filename` omission is **closed**.

---

## PART H — Complete workflow namespace

Authority classifier prefix: **`.github/workflows/*`**

| Operation | AUTHORITY_CHANGED |
|-----------|-------------------|
| Add `.github/workflows/spoof.yml` | **YES** |
| Modify `.github/workflows/foo.yml` | **YES** |
| Delete `.github/workflows/foo.yml` | **YES** |
| Rename away from `.github/workflows/foo.yml` | **YES** (via `previous_filename`) |
| Rename into `.github/workflows/foo.yml` | **YES** |

---

## PART I — Required-check spoofing analysis

**Scenario:** PR adds `.github/workflows/fake-i18n.yml` attempting to emit job/check names `i18n-new-debt-gate` or `i18n-authority-protection`.

**Result:** Layer 0 classifies any `.github/workflows/**` change as `AUTHORITY_CHANGED=YES`. The PR cannot pass as a non-authority change regardless of spoofed check names inside the workflow file.

**REQUIRED_CHECK_NAME_SPOOFING_FIREWALL = EFFECTIVE** (static analysis; live spoof execution not tested — no PR-head execution occurs in Layer 0).

---

## PART J — Authority-path census

Independent inspection of P2.3.3 execution graph on campaign SHA `7406d4cdf`:

| Material control surface | Protected by Layer 0 |
|--------------------------|---------------------|
| `.github/workflows/i18n-governance-new-debt.yml` | **YES** (`.github/workflows/**`) |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | **YES** |
| `frontend/scripts/i18n-check.mjs` | **YES** |
| `frontend/scripts/i18n-governance.mjs` | **YES** |
| `frontend/scripts/i18n-pr-gate.mjs` | **YES** |
| `frontend/scripts/i18n-shim-inventory.mjs` | **YES** |
| `frontend/scripts/lib/i18n-governance/**` | **YES** |
| `frontend/package.json` / `package-lock.json` | **YES** |
| `frontend/src/i18n/i18n-debt-classifications.json` | **YES** |
| Governance test files (6 enumerated) | **YES** |

Import graph verification (`i18n-pr-gate.mjs` → `i18n-hardcoded-scan.mjs`, `lib/i18n-governance/*`, manifest) is fully contained within protected paths.

**Non-covered file observed:** `frontend/scripts/capture-i18n-governance-baseline.mjs` — operational baseline capture utility, **not** in P2.3.3 CI execution graph. Classified as **future dependency caveat** (operational invariant: new governance dependencies must be added to authority census before trust).

**Missing authority dependencies blocking certification:** **NONE**

---

## PART K — Mixed-scope firewall

| Scenario | Without approval | With trusted label event |
|----------|------------------|--------------------------|
| Authority + `frontend/src/rental/*` product | MIXED FAIL | MIXED FAIL |
| Authority + translation content under `frontend/src` | MIXED FAIL | MIXED FAIL |
| Authority + `docs/` or `architecture/` | FAIL (no approval) | **PASS** (authority-only + trusted event) |

Mixed authority/product cannot be overridden by label approval.

---

## PART L — Approval provenance state machine

`AUTHORITY_APPROVED` initializes **false**.

**Only** transition to `AUTHORITY_APPROVED=YES`:

| Condition | Required value |
|-----------|----------------|
| `EVENT_ACTION` | `labeled` |
| `EVENT_LABEL_NAME` | `i18n-governance-authority-change` |
| `EVENT_SENDER_LOGIN` | `FATIHS-MGCKS` |
| `AUTHORITY_CHANGED` | YES |
| `PRODUCT_OR_PRESENTATION_CHANGED` | NO |

No other control path sets `AUTHORITY_APPROVED=YES`.

### Passive label matrix

| Event with stale authority label present | Result |
|------------------------------------------|--------|
| `opened` | FAIL `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| `reopened` | FAIL |
| `ready_for_review` | FAIL |
| Unrelated `labeled` (e.g. `bug`) | FAIL |
| `unlabeled` | FAIL |

Passive label presence **never** approves.

### Trusted label event

Authority-only PR + exact trusted `labeled` event → **PASS** `GOVERNANCE_AUTHORITY_APPROVED`.

---

## PART M — Stale-label invalidation

### Untrusted actor (`labeled` + authority label)

| DELETE API result | Outcome |
|-------------------|---------|
| Success | FAIL `UNTRUSTED_AUTHORITY_APPROVAL_ACTOR` |
| Failure | FAIL `AUTHORITY_LABEL_INVALIDATION_FAILED` |

### Synchronize with authority change + stale label

| DELETE API result | Outcome |
|-------------------|---------|
| Success | FAIL `AUTHORITY_REAPPROVAL_REQUIRED_AFTER_HEAD_CHANGE` |
| Failure | FAIL `AUTHORITY_LABEL_INVALIDATION_FAILED` |

### Synchronize without label payload (`HAS_AUTHORITY_LABEL=false`)

Result: **FAIL** `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` — never PASS.

### Reapproval lifecycle

After synchronize invalidation failure, a new exact trusted `labeled` event on current HEAD with authority-only scope → **PASS**.

### Fail-open suppression

`|| true` on label DELETE: **0** occurrences. Invalidation failures are not silently suppressed.

Label DELETE endpoint: `repos/${REPO}/issues/${PR_NUMBER}/labels/${AUTHORITY_LABEL}` — label name contains only safe characters (hyphens/alphanumerics); no additional encoding required.

---

## PART N — Shell-injection analysis

| Property | Result |
|----------|--------|
| `DIRECT_GITHUB_EXPRESSION_IN_RUN_COUNT` | **0** |
| Event metadata transport | Step `env:` (`EVENT_REPOSITORY`, `EVENT_PR_NUMBER`, `EVENT_LABEL_NAME`, `EVENT_SENDER_LOGIN`, etc.) |
| PR title/body/description in shell | **Absent** |
| PR-head ref as command source | **Absent** |

Adversarial probes:

| Payload | Result |
|---------|--------|
| `EVENT_LABEL_NAME='"; rm -rf /; echo "'` | Treated as data; no match unless exact label string |
| `EVENT_SENDER_LOGIN='FATIHS-MGCKS; evil'` | Treated as data; fails trusted-actor check |

No command execution or control-flow escape observed.

---

## PART O — Self-protection analysis

Because `.github/workflows/**` is authority-classified, modifications to `.github/workflows/i18n-authority-protection.yml` require explicit trusted approval.

Combined with `pull_request_target` base-defined execution (workflow version from default branch after merge):

**TRUST_ANCHOR_SELF_PROTECTION = VALID** (subject to workflow existing on `main` post-merge).

---

## PART P — P2.3.3 / campaign firewalls

| Surface | Diff from campaign SHA `7406d4cdf` to implementation HEAD |
|---------|--------------------------------------------------------------|
| `.github/workflows/i18n-governance-new-debt.yml` | **None** |
| `frontend/scripts/i18n-*` | **None** |
| `frontend/scripts/lib/i18n-governance/**` | **None** |
| `frontend/src/i18n/**` (P2.3.3 artifacts) | **None** |
| Campaign branch HEAD on remote | **Unchanged** @ `7406d4cdf` |

### Historical governance firewall (campaign manifest @ `7406d4cdf`)

| Metric | Value |
|--------|-------|
| `fingerprintVersion` | 3 |
| Historical baseline (`findingCount`) | 1627 |
| `capturedFromSha` | `381671605ea1cd55844518312839b0f7d99a48bd` |
| Active | 0 |
| New-Unclassified | 0 |
| Enhanced | 1542 (257 Rental / 43 Finance) |
| Legacy | 1241 / 144 / 25 |
| EN / DE | 9803 / 9803 |
| Parity / orphans | 100% / 0 |
| Category E | 0 |

---

## PART Q — Live-canary limitation

| Property | Status |
|----------|--------|
| `i18n-authority-protection.yml` on `main` | **NO** (not merged) |
| Live `pull_request_target` canary | **NOT_YET_CERTIFIABLE** |
| Required next stage | **P2.3.4B LIVE CANARY** |

This is **expected** and **not a blocker** for static security certification or merge-to-main to establish the trust anchor.

---

## PART R — Label bootstrap state

| Check | Result |
|-------|--------|
| Label `i18n-governance-authority-change` exists | **NO** (API 404) |
| Owner action required before canary approval | **YES** |
| Blocks P2.3.4A static certification | **NO** |
| Blocks live trusted-approval canary | **YES** |

---

## PART S — Blocking findings

**NONE**

---

## PART T — Non-blocking observations

1. **OWNER_ACTION_REQUIRED_BEFORE_CANARY_APPROVAL** — authority label does not exist; owner must create before P2.3.4B approval canary.
2. **NON_BLOCKING_DUAL_PURPOSE_AUTHORITY_SURFACE** — `frontend/package.json` / `package-lock.json` are authority-classified but may also carry non-governance dependency changes; explicit trusted approval still required.
3. **NON_BLOCKING_OPERATIONAL_LOCKOUT_RISK** — trusted actor hardcoded as `FATIHS-MGCKS` via `sender.login`; account rename/transfer would require workflow update.
4. **NON_BLOCKING_MALFORMED_CHANGED_FILES_WARNING** — empty/non-numeric `changed_files` produces bash integer-expression warnings before fail-closed enumeration mismatch; does not authorize.
5. **NON_BLOCKING_FUTURE_DEPENDENCY_CAVEAT** — `capture-i18n-governance-baseline.mjs` is not in authority census (not in CI graph today); future governance dependencies must be added explicitly.
6. **NON_BLOCKING_MAIN_ADVANCEMENT** — `main` advanced to `3772d992` without collision on P2.3.4A paths.
7. **LOG_ONLY_DIAGNOSTIC_INJECTION** — path strings containing `::warning::` or newlines may affect log presentation only; no control-flow, authorization, or repository mutation impact.

---

## PART U — Final verdict

### Independent adversarial harness

| Metric | Value |
|--------|-------|
| Harness | Ephemeral `/tmp/independent-p234a-audit-harness.sh` (not committed) |
| **INDEPENDENT_TEST_COUNT** | **50** (37 core reproduction + 13 additional audit cases) |
| **INDEPENDENT_TEST_PASS_COUNT** | **50** |
| Result | **50/50 PASS** |

### Validation

| Check | Result |
|-------|--------|
| `git diff --check da959784...3068fee` | **PASS** |
| Workflow security grep | **PASS** (0 forbidden patterns) |
| Branch protection modified by P2.3.4A | **NO** (API 403 unreadable; no changes made) |
| Required checks activated | **NO** |

### Certification statements

- P2.3.4A trusted authority protection is independently security-certified.
- The trusted `pull_request_target` gate executes no PR-head repository code.
- Rename pre-images, post-images, and the complete workflow namespace are protected.
- Authority approval requires an explicit trusted labeling event and cannot survive synchronize.
- File enumeration fails closed at the GitHub 3000-file boundary.
- P2.3.3 remains authoritative and unchanged.
- PR #1489 may be merged to `main` to establish the default-branch trust anchor.
- The audit PR remains unmerged.
- Required-check activation remains forbidden.
- P2.3.4B live canary certification is mandatory after merge.

---

## VERDICT

**B — CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE TO MAIN**

Non-blocking items: authority label bootstrap (owner creation), dual-purpose `package.json` authority surface, hardcoded owner identity lockout risk, malformed `changed_files` bash warnings, future dependency census operational invariant, unrelated `main` advancement.
