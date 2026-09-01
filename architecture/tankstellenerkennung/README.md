# Tankstellenerkennung — Living Architecture Authority

**Status:** Bootstrap V1 (2026-09-01)  
**Maturity:** Incremental / open scientific workstream  
**Runtime impact:** None (documentation and knowledge graph only)

## What this is

`architecture/tankstellenerkennung/` is the **canonical architectural memory** for SynqDrive fuel-station identification after a REFUEL `VehicleEnergyEvent` has been persisted.

It covers:

- OSM fuel-station reference data (PostGIS)
- candidate lookup, scoring, deduplication, ambiguity
- `FuelStationLocationResolver` V1
- async station enrichment persistence + BullMQ orchestration
- cutover / no-backfill policy
- API projection (Phase E) and Fahrverlauf timeline presentation (Phase F)
- production evidence, decisions, gaps, and future research

## Critical system boundary

**Tankstellenerkennung does NOT decide whether refueling happened.**

REFUEL detection belongs to the Energy Event subsystem. This authority begins **after** a REFUEL `VehicleEnergyEvent` exists.

Three confidence domains must never be conflated:

| Domain | Field / concept | Meaning |
|--------|-----------------|---------|
| A | `VehicleEnergyEvent.confidence` | Confidence that a **REFUEL event** happened |
| B | `stationEnrichment.matchConfidence` | Confidence that a **physical fuel station** was identified |
| C | `stationEnrichment.trusted` | Presentation/business trust derived from B (MATCHED + HIGH/MEDIUM only) |

## Epistemic states (first-class)

| State | Meaning |
|-------|---------|
| `CONFIRMED` | Supported by current code and/or strong corroborating evidence |
| `INFERRED` | Reasonable reconstruction; not yet fully verified |
| `HISTORICAL` | Was true in a past era; may be superseded |
| `UNKNOWN` | Not yet reconstructed — **not a documentation failure** |
| `CONTRADICTED` | Sources disagree; both recorded explicitly |

## Entry points

| File | Purpose |
|------|---------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Best-known snapshot today |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Human-readable graph overview |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | **Mandatory rules for future agents** |
| [decisions/DECISION_REGISTER.md](./decisions/DECISION_REGISTER.md) | Decision register with scientific record |
| [research/CHANGE_LEDGER.md](./research/CHANGE_LEDGER.md) | Phase B–F evolution ledger |
| [graph/nodes.yaml](./graph/nodes.yaml) | Machine-readable node catalog |
| [graph/edges.yaml](./graph/edges.yaml) | Machine-readable relationships |
| [graph/invariants.yaml](./graph/invariants.yaml) | Invariants with epistemic classification |

## Maintenance

Any substantive Tankstellenerkennung behavior, resolver policy, enrichment lifecycle, queue/recovery, trust, cutover, API contract, or UI uncertainty semantics change **must** update this authority in the same workstream/PR when applicable.

See [AGENT_CONTRACT.md](./AGENT_CONTRACT.md).

## Validation

```bash
bash architecture/tankstellenerkennung/scripts/validate-graph.sh
# or: node architecture/tankstellenerkennung/scripts/validate-graph.mjs
```

## Related legacy architecture documents (evidence, not unquestionable authority)

- `architecture/OSM_FUEL_STATIONS_DATASET_2026-08-30.md` (PR #1447)
- `architecture/FUEL_STATION_RESOLVER_V1_2026-08-30.md` (PR #1451)
- `architecture/FUEL_STATION_ENRICHMENT_PERSISTENCE_WORKER_V1_2026-08-31.md` (PR #1453)
- `architecture/FUEL_STATION_ENRICHMENT_API_EXPOSURE_PHASE_E_2026-08-31.md` (PR #1473)
- `architecture/FUEL_STATION_ENRICHMENT_UI_PHASE_F_2026-09-01.md` (PR #1475)

Governance reference (philosophy only — **not** domain semantics): `architecture/battery-v2/`.
