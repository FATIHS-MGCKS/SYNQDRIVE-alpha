# EXP-021 S4F-7Z.2 — Exact-head CI certification & fresh Tiny tool authority seal

**Date (UTC):** 2026-10-08  
**Scope:** Read-only CI verification on immutable PR exact head + authority documentation only. **No** Production access/mutation, deploy, restart, provider calls, backfill, `DRY_RUN=0`, S4 activation, or new JIT authority generation.

## Phase 1 — Exact-head CI certification

| Field | Value |
|-------|--------|
| `PR_NUMBER` | **1915** (merged) |
| `EXACT_HEAD_SHA` | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` |
| `SQUASH_MERGE_SHA` | `123ec54e762ba3d1816b549f2485b34ba19d21d0` |
| `CURRENT_MAIN_SHA` (certification time) | `340b4c86ab30e9c06c0b74d39ae394dc0af170bb` |
| `EXACT_HEAD_IS_GIT_ANCESTOR_OF_MAIN` | **NO** (squash merge; blob-equivalent operator surface on `main`) |
| `EXACT_HEAD_CI_CERTIFIED` | **YES** |
| `ALL_REQUIRED_CHECKS_PASS` | **YES** (latest attempt per check name; historical cancelled attempt-1 **not** counted as current failure) |

### Squash lineage (explicit)

| Step | SHA | Note |
|------|-----|------|
| PR #1915 exact head | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` | Immutable tool-authority candidate |
| Squash merge on `main` | `123ec54e762ba3d1816b549f2485b34ba19d21d0` | Parent `564de4a2bff2314a917724d88e2894485e0091ed`; message references #1915 |
| Post-merge `main` tip | `340b4c86ab30e9c06c0b74d39ae394dc0af170bb` | Includes unrelated commits after merge; five operator blobs unchanged |

### Production-readiness reruns (Playwright install timeout recovery)

| Workflow | Run ID | Attempt | `headSha` | `conclusion` |
|----------|--------|---------|-----------|--------------|
| Vehicle Detail — Production Readiness CI | `37668090093` | **2** | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` | **success** |
| Legal Documents — Production Readiness CI | `37668090226` | **2** | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` | **success** |

Attempt **1** on both workflows ended **cancelled** (job timeout during `npx playwright install --with-deps chromium`). Attempt **2** is the governing success surface.

### Vehicle Detail CI gate (attempt 2)

| Job | `conclusion` |
|-----|--------------|
| Playwright E2E (Vehicle Detail) | **success** |
| Backend boundary repair PostgreSQL tests | **success** |
| Accessibility (axe) | **success** |
| CI gate (all critical jobs) | **success** |

`VEHICLE_CI_GATE=PASS`

### Legal Documents CI gate (attempt 2)

| Job | `conclusion` |
|-----|--------------|
| Accessibility (axe) | **success** |
| CI gate (all critical jobs) | **success** |

`LEGAL_CI_GATE=PASS`

### Conditional skips (allowed)

| Check | `conclusion` | Reason |
|-------|--------------|--------|
| S4 unit test suites (S4A–S4F) | **skipped** | Path filter `run_s4a=false` |
| S4 PostgreSQL test suites (S4A–S4F) | **skipped** | Path filter `run_s4a=false` |

All other latest check-runs on `715dea564…` report **success**.

## Phase 2 — Tool authority seal (`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`)

Prerequisite: `EXACT_HEAD_CI_CERTIFIED=YES` — satisfied.

### Five-file operator blob parity

Byte-identical across **exact head**, **squash merge**, and **`origin/main`**:

| Path | `sha256` (blob) |
|------|-----------------|
| `backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh` | `9d8ad0b7dedd5959f16a54aafc84d2e1ebe69623b6b956ede683d964ba62e2ad` |
| `backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh` | `e2c08c31c7989d1c1697f933c954885eb65abebf3538d1972746b6b0c9b3277a` |
| `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-production-cli.ts` | `6d43c55adee10de9e6d1648d6a03db1816d40469e28d0db373db6f2045f0d719` |
| `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib.ts` | `e8731adaf525c596876d9716cf932133434f294f8b697bbba2496197399d5d73` |
| `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-poststate.lib.ts` | `6cb07b51084e99d5b5906cac0e375553c5f3033fa7b237525a24917085102c1c` |

`TOOL_BLOB_PARITY=PASS`

### Sealed pin (immutable candidate)

| Field | Value |
|-------|--------|
| **`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`** | **`715dea5648ebb862eeedfc30e7dc3d3cd57bb02c`** |
| `TOOL_SHA` | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` |
| `TOOL_SHA_SEAL_STATUS` | **SEALED_AFTER_EXACT_HEAD_CI** |
| `TOOL_COMMIT_FETCHABLE` | **YES** (`git cat-file -e` + detached worktree checkout) |
| `TOOL_WRAPPER_SYNTAX_CHECK` | **PASS** (`bash -n` on fresh wrapper @ tool SHA) |

### Operator surface vs shared ops libs

The fresh wrapper sources standard merged ops libraries (`di-v0-s4-fresh-tiny-staging-production.lib.sh`, tiny-staging / replica / budget / kill-init libs) from the **same repository checkout** pinned by `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`. No additional **unreviewed** S4F-7Y-specific operator files beyond the five-file seal set are required.

### Supersession / non-reuse boundaries

| Historical pin | Status for post–S4F-7Y operations |
|----------------|-----------------------------------|
| S4F-7W sealed `11b4a80ccb88d1d6f747399f84667b06c9a71050` | **Superseded** for fresh Tiny staging **tool checkout** authority by `715dea564…` |
| S4F-7X JIT dry-run evidence @ `11b4a80cc…` | **Preserved** as historical dry-run only — **not** a live-staging or Gate 6 authority |
| S4F-7U sample fresh authority (`9abb1a57…`, expired) | **Evidence only** — **not** executable |

**No new JIT** `FRESH_*` values were generated in this slice.

## Phase 3 — Evidence consistency audit

| Check | Result |
|-------|--------|
| Exact head CI vs seal prerequisite | **CONSISTENT** |
| Squash merge blobs vs exact head | **CONSISTENT** |
| `main` operator blobs vs exact head | **CONSISTENT** |
| Gate 6 | **NOT_SATISFIED** (unchanged; seal does not imply activation) |
| Production mutation in this slice | **NO** |
| Reuse of S4F-7X JIT timestamps/fingerprints for S4F-7Y live path | **NOT CLAIMED** |
| Fabricated / truncated SHAs in authority docs | **NONE** in this seal |

`EVIDENCE_CONSISTENCY=PASS`

## Gate 6 / activation

| Field | Value |
|-------|--------|
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | **NOT_SATISFIED** |
| `TINY_ACTIVATION_READY` | **NO** |
| `PRODUCTION_STAGING_AUTHORIZED` | **NO** |

## Next safe action

Human operator: generate a **new** JIT fresh staging authorization packet (≤900 s) bound to `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` and independent `AUTHORIZED_*` pins — then **Production `DRY_RUN=1` only** before any live staging review. Live `DRY_RUN=0` remains **not** authorized.

## Machine block

```
EXP021_S4F7Z2_EXACT_HEAD_SEAL_RESULT=PASS
EXACT_HEAD_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c
CURRENT_MAIN_SHA=340b4c86ab30e9c06c0b74d39ae394dc0af170bb
VEHICLE_CI_GATE=PASS
LEGAL_CI_GATE=PASS
ALL_REQUIRED_CHECKS_PASS=YES
EXACT_HEAD_CI_CERTIFIED=YES
TOOL_BLOB_PARITY=PASS
TOOL_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c
TOOL_SHA_SEAL_STATUS=SEALED_AFTER_EXACT_HEAD_CI
EVIDENCE_CONSISTENCY=PASS
PRODUCTION_MUTATION_OCCURRED=NO
GATE_6=NOT_SATISFIED
```
