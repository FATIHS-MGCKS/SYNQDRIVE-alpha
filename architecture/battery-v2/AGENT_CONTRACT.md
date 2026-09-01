# Battery V2 — Agent Contract

**Effective:** 2026-09-01  
**Scope:** All future agents touching Battery V2 behavior, policy, lifecycle, signals, health model, queues, persistence, scheduling, reconciliation, publication, or safety boundaries.

## Mandatory rule

> Any substantive Battery V2 change **must** update the Battery V2 knowledge authority in the **same workstream/PR** when applicable.

A repository changelog entry (`ChangesView`, `ArchitekturView`, or a dated `architecture/BATTERY_V2_*.md` memo) is **supporting evidence**, not a substitute for this authority.

## What counts as substantive

- New or changed lifecycle transitions (trip → session → target → measurement)
- Signal authority or timestamp semantics changes
- Opening vs measurement policy changes
- Job types, idempotency keys, DLQ/recovery semantics
- Reconciliation / liveness rules
- Persistence invariants (session binding, anchor, metadata FSM)
- Assessment or publication/read-model behavior
- Feature-flag-gated behavior that affects production paths
- Removal or supersession of a prior decision

**Not substantive (usually):** pure refactors with no behavior change, comment-only edits, test-only coverage with no new behavioral claim.

## Required scientific record per substantive change

For each change, preserve:

| Field | Question answered |
|-------|-------------------|
| **BEFORE** | What was the previous behavior, policy, or assumption? |
| **OBSERVATION** | What evidence caused us to revisit it? |
| **HYPOTHESIS** | What did we believe was wrong or could be improved? |
| **CHANGE** | What exactly changed? (code paths, flags, graph IDs) |
| **WHY** | Why was this solution selected over alternatives? |
| **EXPECTED_EFFECT** | What should improve? |
| **VALIDATION** | How was it tested or observed? |
| **OBSERVED_EFFECT** | What actually improved? (may be `UNKNOWN` until production observation) |
| **NON_EFFECTS** | **What did this explicitly NOT solve?** (mandatory) |
| **REGRESSIONS_OR_TRADEOFFS** | New complexity, risks, or downsides |
| **REMAINING_GAPS** | Unresolved questions or follow-up work |
| **DECISION_STATUS** | `PROPOSED` \| `EXPERIMENTAL` \| `VALIDATED` \| `PRODUCTION_VALIDATED` \| `REJECTED` \| `SUPERSEDED` |
| **AFFECTED_GRAPH** | Stable graph IDs added/changed (`BAT-V2-*`) |
| **EVIDENCE** | Tests, production observations, PRs, commits, architecture docs |

### “What did this NOT bring?”

This phrase is **mandatory scientific information**.

A successful fix must **not** imply that adjacent problems were solved. Example: fixing orphaned `ENQUEUED` metadata does **not** prove every post-deploy natural trip succeeds, does **not** activate Stage 2, and does **not** recover every `RUNNING`-without-job crash state.

## Where to write updates

| Change type | Minimum updates |
|-------------|-----------------|
| Any substantive change | `research/CHANGE_LEDGER.md` entry + affected `graph/nodes.yaml` / `edges.yaml` / `invariants.yaml` |
| New unknown | `research/OPEN_QUESTIONS.md` and/or `contradictions/KNOWLEDGE_GAPS.md` with `BAT-V2-GAP-*` |
| Failed approach | `research/FAILED_APPROACHES.md` with `BAT-V2-FAIL-*` |
| Superseded decision | `decisions/` entry; mark old `BAT-V2-DEC-*` as `SUPERSEDED` with `superseded_by` edge |
| Contradiction found | `contradictions/OPEN_CONTRADICTIONS.md` + `BAT-V2-CONTRA-*` nodes |
| Snapshot shift | `CURRENT_STATE.md` (date + maturity notes) |

## No silent history rewrites

Decisions are **append-only** from a historical perspective.

- Do **not** delete an old decision because a newer one replaces it.
- Use explicit relationships: `supersedes`, `superseded_by`, `contradicts`, `supported_by`, `invalidated_by`, `refined_by`.
- Old rationale and evidence must remain discoverable.

## Stable ID rules

- Prefix taxonomy: see [README.md](./README.md) and `graph/schema.yaml`.
- IDs are **never recycled** for a different concept.
- New nodes get new IDs even when refining an old concept (`refines` edge links them).

## Epistemic honesty

- Mark claims `UNKNOWN` when evidence is insufficient.
- Do **not** silently resolve contradictions — record both sides.
- Do **not** treat architecture memos as current code truth without verification.
- Do **not** treat synthetic tests as production validation.
- Do **not** treat production correlation as proven causation without support.

## Prohibited without explicit user request

- Production data mutation or backfill
- Mass re-evaluation of Battery data
- Enabling publication/readiness/Stage 2 flags
- Deploy
