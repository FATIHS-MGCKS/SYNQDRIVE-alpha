# EXP-021 — Targeted Gap Recovery (TGR) Architecture Audit Evidence Freeze

**Frozen at:** 2026-09-16  
**Evidence class:** Post-hoc read-only architecture audit + bounded DIMO historical experiments  
**Separate from:** Primary Run 1 evidence (`EXP_021_KS_MX_2024_PHYSICAL_90_60_2026-09-15.json`) and gap-replay package (`exp021-run1-gap-replay-2026-09-16/`)

## Authority flags

| Flag | Value |
|------|-------|
| `POST_HOC_DIAGNOSTIC_EVIDENCE` | **YES** |
| `TGR_RUNTIME_IMPLEMENTATION` | **NO** |
| `PRODUCTION_CHANGED` | **NO** |
| `PRIMARY_RUN1_EVIDENCE` | **NO** |
| `CADENCE_SELECTION_AUTHORITY` | **NO** |
| `RUNTIME_SEMANTICS_CHANGED` | **NO** |

## Package hash authority

`EVIDENCE_PACKAGE_SHA256` = SHA256(exact bytes of `SHA256SUMS`)

Verify: `sha256sum -c SHA256SUMS` (all entries must PASS)

## Audit purpose

Determine whether SynqDrive should evolve toward:

**60s baseline capture + targeted local retries for recoverable data debt + optional post-trip reconciliation**

instead of globally polling faster than 60s.

Two independent questions (must not be conflated):

- **A. WHEN** should a missing/empty window be queried again? → maturation / retry-age
- **B. HOW LARGE** should the retry query window be? → micro-window sizing

## Source provenance

| Field | Value |
|-------|-------|
| `SOURCE_DIAGNOSTIC_DIRECTORY` | `/tmp/exp021-tgr-audit-20260916T0958Z/` |
| `SOURCE_FILE_COUNT` | 2 |
| `AUDIT_MAIN_SHA` | `11304a1bfd80cd2cef757e4aef708ec5691bc667` |
| `GAP_REPLAY_EVIDENCE` | `exp021-run1-gap-replay-2026-09-16/` (PR #1668) |

Original `/tmp` source files copied without mutation to `source/`.

## Key findings summary

| Finding | Value |
|---------|-------|
| `MICRO_WINDOW_RECOVERY_EFFECT_OBSERVED` | **NO** |
| `TRANSITION_GAP_MICRO_FRAGMENTATION_RECOVERY` | **NO** |
| `THIS_TRANSITION_WINDOW_RECOVERABILITY_NOT_DEMONSTRATED` | **YES** |
| `SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED` | **YES** |
| `PRODUCTION_RETRY_AGE_ESTABLISHED` | **NO** |
| `SEPARATE_GAP_DEBT_AUTHORITY_REQUIRED` | **YES** |
| `PREFERRED_TGR_ARCHITECTURE` | **OPTION_C** |
| `PRIMARY_DEMONSTRATED_RECOVERY_LEVER` | **MATURATION_AWARE_TARGETED_REQUERY** |
| `RAW_AND_RECOVERED_METRICS_SEPARATE` | **YES** |

## Cadence authority (unchanged)

| Field | Value |
|-------|-------|
| `ORIGINAL_RUN1_90_SLOT_SUCCESS` | 7/7 |
| `ORIGINAL_RUN1_60_SLOT_SUCCESS` | 9/10 |
| `OVERALL_DIRECTIONAL_SIGNAL` | LEAN_60 |
| `SUFFICIENT_FOR_CADENCE_RECOMMENDATION` | **NO** |
| `RECOMMENDED_CADENCE_MS` | **NONE** |
| `PRODUCTION_CADENCE_CHANGE_AUTHORIZED` | **NO** |

## Artifact index

| File | Role |
|------|------|
| `README.md` | Authority flags, summary, artifact index |
| `architecture-findings.md` | Full architecture audit narrative |
| `micro-window-experiment.json` | HF60/HF90 partition experiment authority |
| `transition-fragmentation.json` | Transition gap fragmentation experiment |
| `synthetic-recovery.json` | Synthetic local recovery + identity semantics |
| `maturation-findings.json` | Settlement maturation + live shadow design |
| `source/tgr-micro-window-results.json` | Raw experiment output (immutable copy) |
| `source/summary.txt` | Machine-readable summary (immutable copy) |
| `SHA256SUMS` | Deterministic artifact hashes |
