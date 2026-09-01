# Battery V2 — Agent Contract

**Effective:** 2026-09-01  
**Scope:** All future agents touching Battery V2 behavior, policy, lifecycle, signals, health model, queues, persistence, scheduling, reconciliation, publication, or safety boundaries.

## Mandatory rule

> Any substantive Battery V2 change **must** update the Battery V2 knowledge authority in the **same workstream/PR** when applicable.

A repository changelog entry (dated `architecture/BATTERY_V2_*.md` memo) is **supporting evidence**, not a substitute for this authority.

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

## Validation levels (DECISION_STATUS)

| Status | Definition |
|--------|------------|
| **PROPOSED** | Design intent recorded; not yet implemented or tested |
| **EXPERIMENTAL** | Implemented behind flag or limited scope; not validated |
| **VALIDATED** | Current code + focused tests / CI or equivalent technical verification confirm the implementation/decision |
| **PRODUCTION_VALIDATED** | **Post-change** production evidence demonstrates that the **EXPECTED_EFFECT** actually occurred under production/runtime conditions |
| **REJECTED** | Approach explicitly not adopted (governance or design rejection) |
| **SUPERSEDED** | Replaced by a newer decision; historical record preserved |

### PRODUCTION_VALIDATED — strict rules

`PRODUCTION_VALIDATED` requires **post-change** production evidence linked to the decision.

**Never promote to PRODUCTION_VALIDATED merely because:**

- the bug occurred in production **before** the fix (that is OBSERVATION/WHY evidence only)
- production-shaped test data passes in unit/integration tests (that is **VALIDATED**)
- the PR merged
- CI passed
- deployment health check passed without behavioral verification

A production validation must cite post-change production evidence (observation trace, audit, soak result) proving the expected effect.

`decision_status` belongs primarily on `type=decision` nodes. Authority, policy, and liveness nodes inherit governance via `governs` edges from decisions — they must not carry `decision_status` independently.

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
| **DECISION_STATUS** | See validation levels above |
| **AFFECTED_GRAPH** | Stable graph IDs added/changed (`BAT-V2-*`) |
| **EVIDENCE** | Tests, production observations, PRs, commits, architecture docs |

### “What did this NOT bring?”

This phrase is **mandatory scientific information**.

A successful fix must **not** imply that adjacent problems were solved. Example: fixing orphaned `ENQUEUED` metadata does **not** prove every post-deploy natural trip succeeds, does **not** activate Stage 2, and does **not** recover every `RUNNING`-without-job crash state.

## Epistemic status vs reconstruction maturity

**Epistemic status** (`epistemic_status`) — what we know about a claim:

`CONFIRMED` | `INFERRED` | `HISTORICAL` | `UNKNOWN` | `CONTRADICTED`

Do **not** use `PARTIAL`, `GAP`, `LOW`, `MEDIUM`, or `HIGH` as epistemic statuses.

**Reconstruction maturity** (`reconstruction_maturity`) — how complete our code/doc reconstruction is:

`NONE` | `PARTIAL` | `SUBSTANTIAL` | `COMPLETE`

## Graph relation taxonomy

Canonical directional relations (see `graph/schema.yaml`):

| Relation | Direction | Meaning |
|----------|-----------|---------|
| `supports` | evidence → claim/decision/gap | Evidence backs a node |
| `governs` | decision → authority/policy/liveness | Decision establishes governance |
| `gates` | authority → job/transition | Authority controls entry |
| `tested_by` | liveness_rule → test_evidence | Liveness rule covered by test |
| `does_not_solve` | decision → gap | Explicit non-effect / remaining limitation |
| `superseded_by` | old → new | Historical replacement |
| `contradicts` | contradiction → affected node | Unresolved tension |

Do not document unsupported relation aliases. `limited_by` is **not** a canonical relation — use `does_not_solve` from decision to gap.

Evidence chain pattern:

```
PRODUCTION_OBSERVATION --supports--> DECISION --governs--> AUTHORITY/POLICY --gates--> TRANSITION
```

## Where to write updates

| Change type | Minimum updates |
|-------------|-----------------|
| Any substantive change | `research/CHANGE_LEDGER.md` entry + affected `graph/nodes.yaml` / `edges.yaml` / `invariants.yaml` |
| New unknown | `research/OPEN_QUESTIONS.md` and/or `contradictions/KNOWLEDGE_GAPS.md` with `BAT-V2-GAP-*` |
| Failed approach | `research/FAILED_APPROACHES.md` with `BAT-V2-FAIL-*` |
| Rejected approach | `research/FAILED_APPROACHES.md` rejected section with `BAT-V2-REJECT-*` |
| Open hypothesis | `research/OPEN_HYPOTHESES.md` + `BAT-V2-HYP-*` graph node |
| Superseded decision | `decisions/` entry; mark old `BAT-V2-DEC-*` as `SUPERSEDED` with `superseded_by` edge |
| Contradiction found | `contradictions/OPEN_CONTRADICTIONS.md` + `BAT-V2-CONTRA-*` nodes |
| Snapshot shift | `CURRENT_STATE.md` (date + maturity notes) |

## No silent history rewrites

Decisions are **append-only** from a historical perspective.

- Do **not** delete an old decision because a newer one replaces it.
- Use explicit relationships: `supersedes`, `superseded_by`, `contradicts`, `supports`, `governs`, `refines`.
- Old rationale and evidence must remain discoverable.

## Stable ID rules

- Prefix taxonomy: see [README.md](./README.md) and `graph/schema.yaml`.
- IDs are **never recycled** for a different concept.
- New nodes get new IDs even when refining an old concept (`refines` edge links them).
- After bootstrap merge, stable IDs must not be casually renamed.

## Evidence typing

Evidence and test_evidence nodes require machine-readable `source_type`:

`CURRENT_CODE` | `CURRENT_TEST` | `PRODUCTION_OBSERVATION` | `ARCHITECTURE_DOCUMENT` | `AUDIT_DOCUMENT` | `PR_HISTORY` | `COMMIT_HISTORY` | `SYNTHETIC_TEST` | `DOMAIN_REASONING` | `PROVIDER_DOCUMENTATION`

Optional provenance: `source_paths`, `source_locator`, `verified_ref`, `verified_at`.

Evidence node existence and claim confidence are separate concepts.

## Epistemic honesty

- Mark claims `UNKNOWN` when evidence is insufficient.
- Do **not** silently resolve contradictions — record both sides.
- Do **not** treat architecture memos as current code truth without verification.
- Do **not** treat synthetic tests as production validation.
- Do **not** treat production correlation as proven causation without support.
- Do **not** treat pre-change production defects as post-change production validation.

## Prohibited without explicit user request

- Production data mutation or backfill
- Mass re-evaluation of Battery data
- Enabling publication/readiness/Stage 2 flags
- Deploy
