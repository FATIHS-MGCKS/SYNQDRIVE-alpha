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
| **EVIDENCE** | FST-EVID-* node references |

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
| `queries` | Query or resolver **queries** dataset (not dataset → query) |
| `supports` | Evidence **supports** decision, gap, or claim |
| `tested_by` | Component/consumer **tested_by** test_evidence |
| `governs` | Decision or policy **governs** component behavior |
| `consumed_by` | Queue **consumed_by** worker |
| `enqueues` | Producer **enqueues** to queue |
| `processes` | Worker **processes** via orchestrator |
| `enriches` | Orchestrator **enriches** via resolver pipeline |
| `persists` | Orchestrator **persists** enrichment row (not resolver directly) |
| `derives` | Authority/policy **derives** downstream field semantics |
| `projects_to` | Persist store **projects_to** DTO |
| `gates` | Policy **gates** pipeline stage |
| `recovers` | Recovery scheduler **recovers** via queue |
| `superseded_by` | Historical approach **superseded_by** current decision |
| `validates` | Governance decision **validates** (policy over) evidence gap |

Do not invert evidence, test, or query directions for validator convenience.

## Related upstream authority

REFUEL detection changes belong to Energy Event / DIMO documentation — not this domain. When detection coordinate or timestamp contracts change, record cross-domain impact here as a gap or contradiction.
