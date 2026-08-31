# P2.3.3 — Changed-File / New-Debt PR Gate

**Date:** 2026-08-31  
**Campaign branch:** `p239-p238-merge-baseline-3c10`  
**Foundation:** P2.3.2 scanner governance (#1450), P2.3.2R remediation (#1460)

## Purpose

`npm run i18n:governance` answers repository snapshot health against the immutable historical baseline (1627 fingerprints, v3).

`npm run i18n:pr-gate` answers a different question:

> What actionable host-presentation debt did **this PR** introduce relative to its exact PR base?

Required future invariant: `NEW_PR_ACTIONABLE_HOST_DEBT = 0` for governed PRs.

## Historical baseline vs PR base

| Concept | Authority | Mutable |
|---------|-----------|---------|
| Historical governance baseline | `i18n-debt-classifications.json` (`governanceBaseline`, `baselineFingerprints`) | **No** |
| PR comparison base | `github.event.pull_request.base.sha` / `--base-sha` | Per PR |

Historical baseline membership never authorizes reintroduction. PR-base absence is authoritative for reintroduction detection.

## Identity models

### Fingerprint v3 (historical identity)

`file | category | presentationOwner | kind | structuralContext | normalizedLiteral | occurrenceOrdinal`

Used for historical baseline membership and reintroduction detection.

### PR-lineage key (PR delta identity)

`severity | category | presentationOwner | kind | normalizedLiteral`

Used for multiset counting across base/head. Ignores file, line, structural context, and occurrence ordinal so pure refactors/renames do not false-positive.

## Multiset comparison

For each PR-lineage key:

`newOccurrences = max(0, headCount - baseCount)`

Duplicate safety uses scanner `occurrences` counts from deduped findings.

## Rename / copy semantics

| Git status | Semantics |
|------------|-----------|
| `R` | Compare base old path findings vs head new path as one lineage pair |
| `C` | Destination treated as new source; no inherited lineage |
| `D` | Deletion always allowed |
| `A/M` | Standard base vs head comparison |

## Deferred classifications (baseline-only)

`DATA_ANALYSE_PLANNED_REMOVAL`, `IAM_PRODUCT_WIRING_REQUIRED`, and other deferred classes describe **existing** historical exceptions only.

**New host copy in deferred surfaces still blocks.**

## Semantic new-copy allowlist (narrow)

Allowed without blocking:

- `MACHINE_DOMAIN` / `FORMAT_LOCALE`
- `RAW_PROVIDER`, `RAW_USER`
- `EDITORIAL_CONTENT` when classification rule matches (non-enforce-clean surfaces)

Help Center enforce-clean shell remains fail-closed for ambiguous editorial/shell boundaries.

## Governance authority firewall

Authority paths:

- `frontend/scripts/i18n-hardcoded-scan.mjs`
- `frontend/scripts/i18n-governance.mjs`
- `frontend/scripts/i18n-pr-gate.mjs`
- `frontend/scripts/lib/i18n-governance/**`
- `frontend/src/i18n/i18n-debt-classifications.json`
- `.github/workflows/i18n-governance-new-debt.yml`

Mixed authority + governed production changes fail closed.

Authority-only PRs require label `i18n-governance-authority-change`.

## Ungoverned path firewall

New/modified `frontend/src/**/*.ts(x)` outside scanner roots fails with `UNGOVERNED_PRODUCTION_SOURCE_PATH`.

Unsupported `frontend/src/**/*.js(x)` fails with `UNSUPPORTED_GOVERNED_SOURCE_EXTENSION`.

## GitHub workflow

- Workflow: `i18n Governance — New Debt Gate`
- Job/check: `i18n-new-debt-gate`
- Checkout: exact `github.event.pull_request.head.sha`, `fetch-depth: 0`
- Base authority: `github.event.pull_request.base.sha`
- **No top-level `paths:` filter** — the check always materializes for every `pull_request` event (`opened`, `synchronize`, `reopened`, `ready_for_review`, `labeled`, `unlabeled`).

### Required-check materialization + relevance no-op

1. Classify changed paths vs exact PR base via `hasI18nRelevantChanges()` in `pr-gate-policy.mjs`.
2. **Irrelevant PR** (e.g. backend-only): emit `I18N_PR_GATE=PASS`, `I18N_PR_GATE_REASON=NO_I18N_RELEVANT_CHANGES`, `I18N_RELEVANT_CHANGES=NO`; skip `npm ci`, scanner tests, dictionary suite, and full gate.
3. **Relevant PR**: run full validation including read-only `npm run i18n:check:ci`.

Canonical relevance surface:

- `frontend/src/**`
- `frontend/scripts/i18n-*.mjs`
- `frontend/scripts/lib/i18n-governance/**`
- `frontend/package.json`, `frontend/package-lock.json`
- `.github/workflows/i18n-governance-new-debt.yml`

### Read-only CI validation

- `i18n-hardcoded-scan.mjs --no-write` — scan without mutating `hardcoded-copy-inventory.json`
- `npm run i18n:check:ci` — read-only scanner + structural/dictionary validation
- Workflow asserts `git status --porcelain` is empty after relevant-path CI

### Git source read fail-closed

Expected source absence is derived from Git diff status (`A`/`M`/`D`/`R`/`C`) before `git show`:

| Status | Base source | Head source |
|--------|-------------|-------------|
| `A` | absent | must exist |
| `M` | must exist | must exist |
| `D` | must exist | absent |
| `R` | old must exist | new must exist |
| `C` | absent (new lineage) | destination must exist |

Unexpected `git show` failure for a must-exist source → `GIT_SOURCE_READ_FAILURE`, exit `5`.

Supported Git statuses: **A, M, D, R, C only**. `T`/`U`/`X`/`B` → `UNSUPPORTED_GIT_STATUS` (fail closed).

Single canonical NUL parser: `parseNameStatusZGit` (`git diff --name-status -z -M`).

### Bootstrap label lifecycle

Authority-only governance PRs require GitHub label `i18n-governance-authority-change` (or local `--authority-approved` for validation). Label `labeled`/`unlabeled` events retrigger the workflow.

Branch protection activation is **out of scope** for P2.3.3 implementation; enable only after independent audit certification.

## CLI exit codes

| Code | Meaning |
|------|---------|
| 0 | PASS |
| 2 | New actionable host debt or reintroduction |
| 3 | Governance authority policy failure |
| 4 | Ungoverned / unsupported production path |
| 5 | Invalid base / git comparison failure |
