# Tankstellenerkennung — Agent Contract

**Effective:** 2026-09-01  
**Scope:** All future agents touching fuel-station dataset, resolver, enrichment lifecycle, queue/recovery, trust, cutover, API projection, or Fahrverlauf presentation.

## Mandatory rule

> Any substantive Tankstellenerkennung change **must** update this knowledge authority in the **same workstream/PR** when applicable.

Phase memos under `architecture/FUEL_STATION_*.md` are **supporting evidence**, not a substitute for this authority.

## What counts as substantive

- Search radius, scoring weights, ambiguity thresholds, dedupe rules
- Match confidence or trust policy
- Cutover timestamp semantics or backfill policy
- Enrichment lifecycle, fingerprint, terminality, recovery behavior
- BullMQ queue naming, job payload, processor semantics
- Prisma enrichment schema or migration
- API DTO shape or trips-timeline include strategy
- UI presentation of trusted vs possible vs ambiguous states
- OSM dataset import/promotion semantics

**Not substantive (usually):** pure refactors with no behavior change, comment-only edits, test-only coverage with no new behavioral claim.

## Validation levels (`decision_status`)

| Status | Definition |
|--------|------------|
| **PROPOSED** | Design intent recorded; not yet implemented or tested |
| **EXPERIMENTAL** | Implemented behind flag or limited scope |
| **VALIDATED** | Current code + focused tests / CI confirm implementation |
| **PRODUCTION_VALIDATED** | **Post-change** production evidence proves **EXPECTED_EFFECT** under real runtime conditions |
| **REJECTED** | Approach explicitly not adopted |
| **SUPERSEDED** | Replaced by newer decision |

### PRODUCTION_VALIDATED — strict rules

Never promote to `PRODUCTION_VALIDATED` merely because:

- PR merged or CI passed
- deployment health check passed
- synthetic GPS calibration or production-shaped fixtures passed
- architecture deployed without a natural eligible production event

A natural post-cutover REFUEL exercising match → persistence → API → UI is required for full E2E `PRODUCTION_VALIDATED` on the match path. See `FST-DEC-REAL-REFUEL-E2E-001`.

## Required scientific record per substantive change

| Field | Question answered |
|-------|-------------------|
| **BEFORE** | Previous behavior or assumption |
| **WHY** | Why this solution over alternatives |
| **CHANGE** | Exact code paths, flags, graph IDs |
| **EXPECTED_EFFECT** | What should improve |
| **VALIDATION** | Tests, calibration, deployment checks |
| **OBSERVED_EFFECT** | What actually improved (may be UNKNOWN) |
| **NON_EFFECTS** | What this explicitly did **not** solve |
| **TRADEOFFS** | Complexity, risks, downsides |
| **REMAINING_GAPS** | Follow-up work |
| **STATUS** | decision_status |
| **EVIDENCE** | `FST-EVID-*` and/or `FST-TEST-*` node references (types `evidence` \| `test_evidence` only) |

## Prohibited silent changes

Without updating graph / decisions / evidence:

- radius, scoring, confidence, ambiguity, dedupe
- trust, cutover, backfill, lifecycle
- queue/recovery semantics
- API contract or UI uncertainty semantics

## Confidence domain rule

Never conflate in code, API, or UI:

1. `VehicleEnergyEvent.confidence` — REFUEL **detection**
2. `matchConfidence` — **station identification**
3. `trusted` — presentation authority (MATCHED + HIGH/MEDIUM)

## Epistemic status vs reconstruction maturity

**Epistemic status:** `CONFIRMED` | `INFERRED` | `HISTORICAL` | `UNKNOWN` | `CONTRADICTED`

**Reconstruction maturity:** `NONE` | `PARTIAL` | `SUBSTANTIAL` | `COMPLETE`

## Graph maintenance

- Assign new permanent `FST-*` IDs; never recycle
- Add edges in `graph/edges.yaml`
- Add invariants when introducing new non-negotiable rules
- Index gaps/hypotheses/contradictions in `contradictions/` and `research/`
- Run `bash architecture/tankstellenerkennung/scripts/validate-graph.sh` before merge

### Edge relation semantics (direction: `from` → `relation` → `to`)

| Relation | Direction meaning |
|----------|-------------------|
| `queries` | Query/resolver **queries** dataset |
| `supports` | Evidence **supports** decision/gap/claim |
| `tested_by` | Component/consumer **tested_by** test_evidence |
| `governs` | Decision/policy **governs** component |
| `gates` | Policy **gates** pipeline/orchestrator/queue stage |
| `enqueues` | Pipeline **enqueues** to queue |
| `consumed_by` | Queue→worker, api→consumer, query→resolver, dto→api |
| `processes` | Worker **processes** via orchestrator |
| `uses` | Orchestrator/recovery **uses** authority (coordinate, fingerprint, leader guard) |
| `invokes` | Orchestrator **invokes** resolver |
| `input_to` | Authority/event coordinate **input_to** resolver/orchestrator |
| `returns_to` | Resolver **returns_to** orchestrator |
| `persists` | Orchestrator **persists** enrichment row |
| `derives_from` | Trust authority **derives_from** resolution state + match confidence |
| `projects_to` | Persist store **projects_to** DTO |
| `recovers` | Recovery scheduler **recovers** via queue |
| `superseded_by` | Superseded/rejected approach **superseded_by** current decision |
| `validates` | Hypothesis **validates** (testability linkage to) gap |

### Node `evidence:` arrays

May reference only `evidence` and `test_evidence` node types (`FST-EVID-*`, `FST-TEST-*`).
Use graph edges for decision↔gap, policy↔decision, rejected/superseded approaches, and other semantic links.

### Recovery scheduler leader ownership

`FuelStationEnrichmentRecoveryScheduler` may be instantiated on every backend replica, but
`recoverMissedEnrichments()` is **SINGLETON_GLOBAL** via `SchedulerLeaderGuardService`.
Only the elected cluster scheduler leader executes the recovery sweep tick; followers skip.
This invariant applies to the **recovery scheduler tick**, not to BullMQ enrichment worker concurrency.
See `FST-AUTH-RECOVERY-LEADER-001` and `FST-INV-RECOVERY-SINGLETON-001`.

## Related upstream authority

REFUEL detection changes belong to Energy Event / DIMO documentation — not this domain. When detection coordinate or timestamp contracts change, record cross-domain impact here as a gap or contradiction.
