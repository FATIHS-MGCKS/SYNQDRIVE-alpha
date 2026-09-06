# Driving Intelligence — Agent Contract

**Effective:** 2026-09-06  
**Scope:** All future agents touching driving behavior enrichment, event detection, impact scoring, V2 pipeline, reference capture, assessability, misuse, rental analysis, or driving-related API/UI.

## Mandatory rule

> Any substantive Driving Intelligence change **must** update this knowledge authority in the **same workstream/PR** when applicable.

Legacy audits under `docs/audits/driving-intelligence-*` and `architecture/DI_EV_*` are **supporting evidence**, not a substitute for this authority.

## What counts as substantive

- HF acquisition cadence, overlap, settlement, recovery policy
- Event detection thresholds, smoothing, hysteresis, event taxonomy
- Driving impact weights, normalization caps, composite formula
- Load component semantics (`tireLoad`, `brakingLoad`, provenance downgrades)
- V2 stage DAG, job types, idempotency keys, retry policy
- Assessability dimensions and gating
- Prisma schema for DI tables
- API DTO shape for trips, impact, events, rental analysis
- UI stress/score presentation semantics
- Reference capture calibration phases
- Multi-replica / leader election behavior for DI schedulers

**Not substantive (usually):** pure refactors with no behavior change, comment-only edits, test-only coverage with no new behavioral claim.

## Validation levels (`decision_status`)

| Status | Definition |
|--------|------------|
| **PROPOSED** | Design intent; not implemented or not tested |
| **EXPERIMENTAL** | Implemented behind flag or reference-capture scope only |
| **VALIDATED** | Current code + focused tests confirm implementation |
| **PRODUCTION_VALIDATED** | Post-change production evidence under real conditions |
| **REJECTED** | Approach explicitly not adopted |
| **SUPERSEDED** | Replaced by newer decision |

Never promote HF scalability or V2 pipeline decisions to `PRODUCTION_VALIDATED` from CI alone or reference-capture testbed success without production-path evidence.

## Required scientific record per substantive change

| Field | Question answered |
|-------|-------------------|
| **BEFORE** | Previous behavior or assumption |
| **WHY** | Why this solution over alternatives |
| **CHANGE** | Exact code paths, flags, graph IDs |
| **EXPECTED_EFFECT** | What should improve |
| **VALIDATION** | Tests, reference drives, deployment checks |
| **OBSERVED_EFFECT** | What actually improved (may be UNKNOWN) |
| **NON_EFFECTS** | What this explicitly did **not** solve |
| **TRADEOFFS** | Complexity, risks, downsides |
| **REMAINING_GAPS** | Follow-up work |
| **STATUS** | decision_status |
| **EVIDENCE** | `DI-EVID-*` references |

## Prohibited silent changes

Without updating graph / decisions / evidence:

- Event thresholds or taxonomy
- Score weights, caps, composite formula
- Load proxy semantics or health eligibility gates
- HF polling / recovery / overlap parameters in any path
- V2 stage dependencies or job idempotency
- Assessability dimension definitions
- API/UI score labels implying driver quality or measured wear

## Confidence domain rules

Never conflate:

1. **Assessability** — can we reason about this dimension for this trip?
2. **Event provenance** — native provider vs HF-reconstructed
3. **Operational load** — `drivingStressScore`, `tireLoad`, `brakingLoad`
4. **Measured wear** — physical tread/pad measurement (outside DI)

## Epistemic discipline

- **UNKNOWN is valid** — do not fabricate fleet numbers or cadence proofs
- **CURRENT RUNTIME CODE** beats stale documentation
- Preserve **HISTORICAL** intent when superseding; do not silently rewrite
- Record **CONTRADICTED** sources in `contradictions/CONTRADICTION_REGISTER.md`

## Architectural invariants (enforce in code reviews)

| ID | Rule |
|----|------|
| DI-INV-SEGMENTS-001 | DIMO Segments define canonical trip boundaries — DI does not redefine them |
| DI-INV-RC-SEPARATION-001 | Reference capture HF policy does not alter production HF without explicit cutover decision |
| DI-INV-POLL-NOT-GEN-001 | Provider request cadence ≠ signal generation cadence |
| DI-INV-GAP-NOT-IDLE-001 | Telemetry gap ≠ proof of vehicle inactivity |
| DI-INV-STRESS-NOT-DRIVER-001 | `drivingStressScore` is vehicle load, not driver quality |
| DI-INV-LOAD-NOT-WEAR-001 | Load components are operational proxies, not measured wear |
| DI-INV-IDEMPOTENT-001 | Job and impact writes must remain idempotent under retry |
| DI-INV-ORG-SCOPE-001 | All DI reads/writes must respect organization tenancy |
| DI-INV-SOURCE-TS-001 | Preserve provider source timestamps through enrichment |
| DI-INV-MULTI-REPLICA-001 | Schedulers must use leader guard when election enabled |

## Graph maintenance

- Assign new permanent `DI-*` IDs; never recycle
- Add edges in `graph/edges.yaml`
- Add invariants when introducing non-negotiable rules
- Index gaps and contradictions in `research/` and `contradictions/`
- Run `bash architecture/drivingintelligence/scripts/validate-graph.sh` before merge

### Edge relation semantics (direction: `from` → `relation` → `to`)

| Relation | Direction meaning |
|----------|-------------------|
| `provides` | External/adjacent **provides** input to DI |
| `consumes` | Service **consumes** signal/data |
| `writes` | Component **writes** persistence |
| `reads` | Component **reads** persistence |
| `triggers` | Event/scheduler **triggers** work |
| `enqueues` | Producer **enqueues** queue job |
| `processes` | Worker **processes** queue |
| `derives` | Algorithm **derives** metric/event |
| `aggregates` | Service **aggregates** trips/time |
| `projects` | API **projects** persistence to DTO |
| `depends_on` | Component **depends_on** upstream |
| `gates` | Policy/flag **gates** execution |
| `associates_with` | Data **associates_with** trip |
| `falls_back_to` | Path **falls_back_to** alternate |
| `exposes` | API **exposes** to UI |
| `renders` | UI **renders** API field |

## Related adjacent authorities

| Authority | When to cross-reference |
|-----------|------------------------|
| `architecture/knowledge-graphs/automatic-trip-enrichment/` | Trip enrichment timing, ATE boundaries |
| `architecture/tankstellenerkennung/` | Fuel station — no DI overlap |
| Trip FSM / snapshot polling architecture memos | Trip boundary changes |
| Battery V2 | Separate health domain |

## HF / reference capture agent rules

- Do not assume `interval:"1s"` means 1 Hz observed density
- Do not merge reference-capture recovery into production enrichment without `DI-DEC-*` cutover record
- Live calibration requires operator vehicle selection — no hardcoded production vehicle tokens in runtime
- Document settlement delay and overlap changes with RD00x evidence linkage

## Multi-replica safety

- `DrivingAnalysisReconciliationScheduler`: SINGLETON_GLOBAL when `SCHEDULER_LEADER_ELECTION_ENABLED`
- BullMQ workers (`driving-intelligence-job.processor`): multi-replica safe via durable job row + idempotency
- Disabled election: duplicate reconciliation sweeps possible — document in deployment config
