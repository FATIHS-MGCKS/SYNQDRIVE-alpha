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

`npm run i18n:pr-gate:test` — **43 tests PASS**

Covers: translated pass, direct/indirect host fail, duplicates 1→2/1→3, insert before/after, refactor pass, rename pass/fail, copy fail, deletion pass, wording change, reintroduction, unchanged residual, Data Analyse/IAM new-copy block, machine/raw pass, Help Center shell fail, editorial fail-closed, parser statuses, authority policy, ungoverned/unsupported paths, determinism.

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
| `npm run i18n:pr-gate:test` | PASS (43/43) |
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
