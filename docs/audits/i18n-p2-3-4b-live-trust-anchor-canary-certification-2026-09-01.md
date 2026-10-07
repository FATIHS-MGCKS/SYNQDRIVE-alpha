# P2.3.4B — Live Trust-Anchor Canary Certification

**Date:** 2026-09-01
**Phase:** P2.3.4B live `pull_request_target` canary certification
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha

---

## A — P2.3.4A merge topology

| Field | Value |
|-------|-------|
| Implementation PR | #1489 (merged) |
| Implementation HEAD | `3068fee9a2e39037313619a1d60badfac77c47ac` |
| Actual merge commit | `ea5e499c938969460c75cba1ef6ff80e831e17b2` |
| Merge parent 1 (pre-merge main) | `182731fe48cd25578668f102ed847f4791fbaabd` |
| Merge parent 2 (implementation) | `3068fee9a2e39037313619a1d60badfac77c47ac` |
| Canary start main HEAD | `b8501bfd22c07a57c37150c59a79d75c1ece746d` |
| P2.3.4A merge on main ancestry | **YES** |

---

## B — Trusted workflow main authority

| Field | Value |
|-------|-------|
| Workflow path | `.github/workflows/i18n-authority-protection.yml` |
| Workflow blob SHA on canary-start main | `c8ab22ee49b85be88f0386562dbe22c787e6e977` |
| Workflow name | `i18n Governance — Authority Protection` |
| Job/check name | `i18n-authority-protection` |
| Event | `pull_request_target` |
| Target branches | `main`, `p239-p238-merge-baseline-3c10` |
| Workflow ID | `347503182` |
| Unexpected workflow change | **NO** |

---

## C — Authenticated actor / label bootstrap

| Field | Value |
|-------|-------|
| `gh auth status` account | `cursor` (GitHub App integration) |
| `gh api user` | **403** Resource not accessible by integration |
| Trusted actor required | `FATIHS-MGCKS` |
| Authenticated actor = trusted owner | **NO** |
| Authority label existed before | **NO** (404) |
| Authority label created | **NO** (owner credentials required) |
| Label create actor | N/A |
| Label create permission | **OWNER_INTERACTION_REQUIRED** |

---

## D — M1 main non-authority (#1495)

| Field | Value |
|-------|-------|
| Base | `main` @ `b8501bfd22c07a57c37150c59a79d75c1ece746d` |
| Head | `87f9f14171334fb7c9b96ca069d3c9e47f057416` |
| Changed files | `docs/audits/canary-p234b-main-nonauthority.md` |
| Workflow run ID | `33512600160` |
| Event | `pull_request_target` / `opened` |
| Job conclusion | **success** |
| Run `head_sha` | `87f9f14171334fb7c9b96ca069d3c9e47f057416` (PR head) |
| Check `head_sha` | `87f9f14171334fb7c9b96ca069d3c9e47f057416` |
| `I18N_AUTHORITY_PROTECTION` | **PASS** |
| `AUTHORITY_CHANGED` | NO |
| `PRODUCT_OR_PRESENTATION_CHANGED` | NO |
| `AUTHORITY_APPROVED` | NO |
| `REASON` | `NO_GOVERNANCE_AUTHORITY_CHANGE` |

---

## E — C1 campaign non-authority (#1493)

| Field | Value |
|-------|-------|
| Base | `p239-p238-merge-baseline-3c10` @ `7406d4cdf7d87b91eea28c1f5a55368928656d1d` |
| Head | `b3f1deb759ee2e28a1dd04fdf04f9eb5bfbf2356` |
| Trusted workflow run ID | `33512599898` |
| Trusted result | **PASS** |
| `REASON` | `NO_GOVERNANCE_AUTHORITY_CHANGE` |
| P2.3.3 run ID | `33512600811` |
| P2.3.3 result | **PASS** (`I18N_PR_GATE_REASON=NO_I18N_RELEVANT_CHANGES`) |
| `CAMPAIGN_PULL_REQUEST_TARGET_MATERIALIZES` | **YES** |

---

## F — A1 authority lifecycle (#1496) — PARTIAL

### F1 opened (verified live)

| Field | Value |
|-------|-------|
| Workflow run ID | `33512600522` |
| Result | **FAIL** |
| `AUTHORITY_CHANGED` | YES |
| `PRODUCT_OR_PRESENTATION_CHANGED` | NO |
| `AUTHORITY_APPROVED` | NO |
| `REASON` | `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |

### F2 trusted label approval — NOT EXECUTED

**Reason:** authenticated integration actor is `cursor`, not `FATIHS-MGCKS`. Owner interaction required.

### F3 synchronize invalidation — NOT EXECUTED

Blocked by missing trusted label approval step.

### F4 reapproval — NOT EXECUTED

Blocked by missing trusted label approval step.

---

## G — M2 mixed scope (#1492)

### G1 opened (verified live)

| Field | Value |
|-------|-------|
| Workflow run ID | `33512599382` |
| Result | **FAIL** |
| `AUTHORITY_CHANGED` | YES |
| `PRODUCT_OR_PRESENTATION_CHANGED` | YES |
| `REASON` | `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE` |
| Product path | `frontend/src/__p234b_canary__/README.md` |

### G2 label override test — NOT EXECUTED

Owner label capability unavailable from integration actor.

---

## H — C2 campaign rename-away (#1497)

| Field | Value |
|-------|-------|
| Base | campaign @ `7406d4cdf` |
| Head | `24b6b4581cc08d7d683c78ce551e1061d10dd012` |
| Rename | `i18n-governance-new-debt.yml` → `i18n-governance-new-debt.disabled-canary.yml` |
| Trusted run ID | `33512600469` |
| Result | **FAIL** |
| `REASON` | `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` |
| `AUTHORITY_PATHS` | `.github/workflows/i18n-governance-new-debt.disabled-canary.yml,.github/workflows/i18n-governance-new-debt.yml` |
| `PREVIOUS_FILENAME_VISIBLE` | **YES** |
| `RENAME_AWAY_BLOCKED_LIVE` | **YES** |
| P2.3.3 run | **PASS** (non-relevant no-op; workflow absent on PR head) |
| Layer-0 still enforced from main | **YES** |

---

## I — S1 live check-name spoof (#1494)

| Field | Value |
|-------|-------|
| Spoof workflow | `.github/workflows/p234b-spoof-canary.yml` (`pull_request` triggered) |
| Trusted run ID | `33512599609` |
| Trusted result | **FAIL** (`GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL`) |
| Fake authority check run | `33512599859` job `99871708228` → **success** |
| Fake debt check run | `33512599859` job `99871707801` → **success** |
| Trusted check on same PR head | **FAIL** (job `99871707749`) |

---

## J — Trusted check SHA / PR attachment model

| Observation | Value |
|-------------|-------|
| Workflow run `head_sha` | **PR head SHA** (not base SHA) |
| Check run `head_sha` | **PR head SHA** |
| PR association in workflow run payload | **YES** (`pull_requests[].head.sha`) |
| `TRUSTED_CHECK_ATTACHMENT_MODEL` | Check attached to **PR head SHA** via `pull_request_target` |
| `TRUSTED_CHECK_PR_HEAD_COMPATIBILITY_VERDICT` | **A — TRUSTED_CHECK_PR_HEAD_COMPATIBLE** |

---

## K — Exact check contexts / apps

| Check | Context name | App | App ID | Conclusion (S1) |
|-------|--------------|-----|--------|-----------------|
| Trusted authority | `i18n-authority-protection` | `github-actions` | 15368 | failure |
| Fake authority | `i18n-authority-protection` | `github-actions` | 15368 | success |
| Fake new-debt | `i18n-new-debt-gate` | `github-actions` | 15368 | success |
| P2.3.3 (campaign) | `i18n-new-debt-gate` | `github-actions` | 15368 | success (no-op) |

---

## L — Classic required-context spoofability

| Assessment | Value |
|------------|-------|
| `DUPLICATE_CHECK_NAME_OBSERVED` | **YES** (`i18n-authority-protection`) |
| `SAME_GITHUB_ACTIONS_APP` | **YES** (app_id 15368 for trusted and fake) |
| `DISTINGUISHABLE_BY_CLASSIC_CONTEXT_NAME` | **NO** (identical context string) |
| `CLASSIC_REQUIRED_STATUS_CONTEXT_SAFE` | **NO** |
| Layer-0 classifier effectiveness | **EFFECTIVE** (trusted FAIL despite fake PASS) |
| Spoof bypass of policy logic | **NO** |
| Spoof bypass of classic required-check UI | **POSSIBLE** (ambiguous green duplicate) |

---

## M — Campaign / P2.3.3 non-effects

| Check | Result |
|-------|--------|
| Campaign SHA | `7406d4cdf7d87b91eea28c1f5a55368928656d1d` (unchanged) |
| Main modified by canaries | **NO** (canary PRs closed unmerged) |
| Campaign modified by canaries | **NO** |
| P2.3.3 workflow modified | **NO** |
| Audit #1491 | open / draft / unmerged |

---

## N — Cleanup state

| Canary PR | State |
|-----------|-------|
| #1495 M1 | **closed** unmerged |
| #1493 C1 | **closed** unmerged |
| #1496 A1 | **closed** unmerged |
| #1492 M2 | **closed** unmerged |
| #1497 C2 | **closed** unmerged |
| #1494 S1 | **closed** unmerged |
| `CANARY_MERGES` | **0** |

---

## O — Blockers

1. **OWNER_INTERACTION_REQUIRED** — trusted approval lifecycle (label apply / synchronize / reapproval) not live-tested because integration actor is not `FATIHS-MGCKS` and authority label does not exist.

---

## P — Non-blocking observations

1. Main advanced from `ea5e499` to `b8501bfd` after P2.3.4A merge (unrelated commits); trusted workflow blob unchanged.
2. Classic branch-protection context names are spoofable by PR-head workflows with identical job names.
3. P2.3.3 on campaign C2 no-ops because renamed workflow is not i18n-relevant on PR head; Layer-0 authority guard still fails correctly.

---

## Q — Recommended P2.3.4C enforcement primitive

Do **not** activate classic required status checks using bare context name `i18n-authority-protection`.

Recommended P2.3.4C path:

1. **GitHub repository ruleset** with **required workflows** pinning `.github/workflows/i18n-authority-protection.yml` from default branch.
2. Alternatively, ruleset check requiring trusted workflow path / workflow ref, not job display name alone.
3. Owner must create `i18n-governance-authority-change` label before approval canary can complete.
4. Owner (`FATIHS-MGCKS`) must execute A1 label/sync/reapproval live canary before enforcement activation.

---

## R — Final verdict

**J — OWNER ACTION REQUIRED — APPROVAL CANARY INCOMPLETE**

Partial live certification achieved for: main non-authority PASS, campaign non-authority PASS, authority opened FAIL, mixed-scope FAIL, campaign rename-away FAIL with `previous_filename`, spoof classifier FAIL despite fake green duplicate checks.

Incomplete: trusted owner label approval, synchronize invalidation, reapproval lifecycle.

**Ready for enforcement activation:** **NO** (pending owner label bootstrap + approval lifecycle live verification + P2.3.4C ruleset design).
