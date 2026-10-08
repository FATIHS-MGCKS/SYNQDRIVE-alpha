# EXP-021 S4F-7AI — New S4F-7AH tool bootstrap authority migration

**Date (UTC):** 2026-10-08  
**Scope:** Engineering-only bootstrap pin migration from historical Z2 to S4F-7AH certified tool. **No** Production SSH dispatch, env mutation, deploy, restart, `DRY_RUN=0`, live authorization reuse, or S4 activation in this slice.

---

## Authority lineage

| Field | Value |
|-------|--------|
| `HISTORICAL_Z2_TOOL_SHA` | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` |
| `NEW_CERTIFIED_TOOL_SHA` | `ed78748bc9493cdc8da56000e333e4940114f9f1` |
| Authoritative seal evidence | `architecture/drivingintelligence/evidence/EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md` |
| Historical Z2 evidence (preserved) | `architecture/drivingintelligence/evidence/EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md` |

Seal field read by new bootstrap (exactly one table row):

| **\`NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA\`** | **`ed78748bc9493cdc8da56000e333e4940114f9f1`** |

---

## Bootstrap surface

| Item | Path / value |
|------|----------------|
| Historical AA.1 bootstrap (unchanged) | `.cursor/scripts/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh` |
| New S4F-7AI bootstrap | `.cursor/scripts/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh` |
| Pin / blob verification lib | `.cursor/scripts/lib/cloud-agent-s4f7ai-tool-pin.lib.sh` |
| Regression tests | `.cursor/scripts/cloud-agent-s4f7ai-tool-pin.test.sh` |
| `BOOTSTRAP_SCRIPT_SHA256` (S4F-7AI) | `f4d5b2479b0abd768af78a37d7ec21e056492127c78780cc8aa8a57e4e4eb39c` |

---

## Fail-closed pin resolution

1. Read `NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` from S4F-7AH evidence only (reject missing/duplicate/unreadable).
2. Assert SHA equals certified `ed78748bc9493cdc8da56000e333e4940114f9f1`.
3. Ensure git commit fetchable (`git fetch --depth 1 origin <sha>` when needed).
4. Verify six operator git blobs + content SHA256 against S4F-7AH seal table.
5. Verify shared ops libs exist at same commit.
6. Verify S4F-7AG DB-clock + fail-closed validator symbols in operator tree.
7. Reject stale env pins (`TOOL_AUTHORITY_SHA`, `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`, `CLOUD_AGENT_S4F7X_TOOL_SHA`, `CLOUD_AGENT_S4F7AA_TOOL_SHA`) before dispatch.
8. Optional detached shallow checkout verification (`S4F7AI_SKIP_DETACHED_FETCH=1` for fast engineering tests).

Z2 evidence may be present on disk but is **not** used as authority (`S4F7AI_Z2_PIN_NOT_USED_FOR_AUTHORITY=YES`).

---

## Dry-run-only guards

| Guard | Enforcement |
|-------|-------------|
| Local `DRY_RUN=0` | **Forbidden** (`S4F7AI_FAIL_CLOSED=DRY_RUN_ZERO_FORBIDDEN_LOCAL`) |
| Remote `DRY_RUN=0` | **Forbidden** (`FAIL_CLOSED=DRY_RUN_ZERO_FORBIDDEN_REMOTE`) |
| `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES` | **Forbidden** local + remote |
| Production SSH in this slice | **Skipped** when `S4F7AI_SKIP_PRODUCTION_DISPATCH=1` |

Remote Production dry-run path (post-merge, separate human slice) reuses the AA.1 safety checklist with S4F-7AI tool checkout and `/tmp/s4f7ai-fresh-wrapper.*` temp dirs.

---

## Regression certification (engineering)

| Suite | Result |
|-------|--------|
| `.cursor/scripts/cloud-agent-s4f7ai-tool-pin.test.sh` | **15** cases A–O — **PASS** |
| `.cursor/scripts/cloud-agent-s4f7aa-tool-pin.test.sh` (O) | **PASS** |
| `npm run test:di:s4f7v:fresh-tiny-staging-wrapper` | **131/131 PASS** (includes S4F-7AG **13/13**) |
| `bash -n` S4F-7AI bootstrap + lib | **PASS** |

---

## Production boundaries (this slice)

| Field | Value |
|-------|--------|
| `PRODUCTION_SSH_DISPATCH_EXECUTED` | **NO** |
| `PRODUCTION_MUTATION_OCCURRED` | **NO** |
| `PRODUCTION_DRY_RUN_EXECUTED` | **NO** (pending post-merge human slice) |
| `GATE_6` | **NOT_SATISFIED** |

---

## Next safe action

1. Human merge S4F-7AI engineering PR.  
2. Confirm final bootstrap `BOOTSTRAP_SCRIPT_SHA256` on merged `main`.  
3. Separate follow-on: Production `DRY_RUN=1` via `cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh` **without** `S4F7AI_SKIP_PRODUCTION_DISPATCH`, fresh JIT ≤900 s, tool pin `ed78748bc…` only.

---

## Machine block

```
EXP021_S4F7AI_BOOTSTRAP_AUTHORITY_MIGRATION_RESULT=READY_FOR_HUMAN_MERGE

HISTORICAL_Z2_TOOL_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c
NEW_CERTIFIED_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1
NEW_SEAL_EVIDENCE_VERIFIED=YES

OLD_BOOTSTRAP_UNCHANGED=YES
NEW_BOOTSTRAP_PATH=.cursor/scripts/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh
NEW_BOOTSTRAP_SHA256=f4d5b2479b0abd768af78a37d7ec21e056492127c78780cc8aa8a57e4e4eb39c

NEW_TOOL_PIN_RESOLUTION=S4F7AH_EVIDENCE_ONLY
Z2_FALLBACK_PRESENT=YES_NOT_USED
STALE_PIN_GUARD=YES
SIX_FILE_BLOB_PARITY=PASS
SHARED_DEPENDENCY_PARITY=PASS

PRODUCTION_SSH_DISPATCH_EXECUTED=NO
PRODUCTION_DRY_RUN_READY=NO
GATE_6=NOT_SATISFIED
```
