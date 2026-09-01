# KG-ATE Changelog

## 2026-09-01 — Phase 2A canonicalization (initial baseline)

**Main SHA:** `4843a4ebc60f38237f9184d47b1da731e426b7b3`  
**Agent:** KG-ATE canonicalization gate Phase 2A  
**Scope:** Automatic Trip Enrichment only (NOT EED)

### Created

- `architecture/knowledge-graphs/automatic-trip-enrichment/` full structure
- Canonical graph: 86 nodes (52 operational + 34 evidence), 9 invariants, 12 decisions
- Validation script: `scripts/validate-graph.mjs`
- Governance: `AGENT_PROTOCOL.md`, `AUTHORITY_BOUNDARIES.md`

### Discovery → canonical audit

| Metric | Value |
|--------|------:|
| DISCOVERY_COMPONENT_COUNT | 48 |
| CANONICAL_COMPONENT_COUNT | 52 |
| MERGED_OR_RECLASSIFIED | 38 |
| DROPPED | 10 |
| NET_NEW_CANONICAL | 14 |

#### Merge / reclassify (examples)

| Discovery ref | Canonical ID | Action |
|---------------|--------------|--------|
| ATE-N01..N20 | ATE-SVC-*, ATE-TRIG-*, ATE-FB-* | Renamed to stable ATE-* IDs; split infra from flow |
| ATE-N15 | ATE-EXT-001 | Reclassified SHARED_INFRASTRUCTURE |
| ATE-N16 | ATE-EXT-002 | Reclassified SHARED_INFRASTRUCTURE |
| B3 schedulers (5) | ATE-SCH-001..005 | Explicit scheduler nodes |
| B5 DIMO deps (7) | ATE-EXT-003..005 | Consolidated to external authorities |
| ATE-DEC-001..012 | ATE-DEC-001..012 + DEC-013/014 | Added EED/DI boundary decisions |

#### Dropped (not silent — reasons)

| Discovery item | Reason |
|----------------|--------|
| Generic "BullMQ platform" node | Absorbed into queue/job nodes; generic semantics OUT_OF_SCOPE |
| Duplicate `enqueueDrivingImpact` as separate component | Merged into ATE-SVC-003 orchestrator |
| `BoundaryRefreshLifecycleService` (mentioned in imports) | Not on ATE critical path; OUT_OF_SCOPE unless wired to enrichment |
| `TripMetricsService` standalone | Merged into ATE-COMP-004 observability component |
| `canEnqueueQueue` util | Implementation detail; covered by ATE-FM-006 |
| `DimoPollLog` writes | Observability side-effect; covered by orchestrator evidence |
| `RentalDrivingAnalysisRecomputeTrigger` | Rental/DI concern; referenced only via ATE-SVC-002 |
| `platform-admin` as separate flow node | Canonicalized as ATE-TRIG-004 |
| Discovery "check impl" leader placeholders | Replaced with verified leader keys (NEG-001) |
| `dimo.trip-tracking` queue as ATE-owned | FSM tracking; ATE_REFERENCES_EXTERNAL (trip detection) |

### Open questions

- 6 resolved/reclassified (see `open-questions/OPEN_QUESTIONS.md`)
- 6 remaining open

### Validation

- `node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs` — PASS at creation
