# Master Architecture Overview

Single entry for agents — details in linked docs.

## Pinned revision

| Pin | SHA |
|-----|-----|
| Dossier content documents | `origin/main` @ `0a16ffb5b0add0bec30fefc4e55a41973428677b` |
| Dossier git commits | See [GIT_INTEGRITY.md](./GIT_INTEGRITY.md) |

## Layered system (terminology)

| Term | Meaning | Not interchangeable with |
|------|---------|---------------------------|
| **S3A** | 1s coordinate acquisition + normalization | S1, L3 |
| **S1** | Motion classification, hold/release, stationary band | Trip FSM, micro-motion FSM |
| **L3** | `L3_CENTERED_PATH` speed estimate | Provider waypoint speed, R1 authority |
| **S4** | Shadow work items, pinned snapshots, road pipeline | `s4-research` library alone |
| **Route V2** | Production/shadow road-matching generation label | Viterbi research variant IDs |

## Pipelines

**Production (always):** DIMO Segments → Trip FSM → COMPLETED → legacy HF enrichment → Driving Impact V1.

**DI V0 shadow (mostly dormant on main):** S3A → S1/L3 → S2 → S4D snapshot → road matching / QC — see [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md).

## Deep dives

| Topic | Document |
|-------|----------|
| Kinematics & L3 authority | [L3_AUTHORITY_DECISION.md](./L3_AUTHORITY_DECISION.md) |
| Stop/go & B7 | [MOTION_STOP_GO_RESEARCH.md](./MOTION_STOP_GO_RESEARCH.md) |
| Road matching | [ROAD_MATCHING_EVOLUTION.md](./ROAD_MATCHING_EVOLUTION.md) |
| Production vs research | [PRODUCTION_RESEARCH_STATUS.md](./PRODUCTION_RESEARCH_STATUS.md) |
| Algorithms | [ALGORITHM_COMPARISON_MATRIX.md](./ALGORITHM_COMPARISON_MATRIX.md) |
| Trips & GT | [REFERENCE_TRIP_REGISTRY.md](./REFERENCE_TRIP_REGISTRY.md) |

## Integrity & inventory

- [DOSSIER_INVENTORY.md](./DOSSIER_INVENTORY.md)  
- [CONTRADICTIONS_AND_EVIDENCE_GAPS.md](./CONTRADICTIONS_AND_EVIDENCE_GAPS.md)  
- [ARCHITECTURE_RECONCILIATION_REPORT.md](./ARCHITECTURE_RECONCILIATION_REPORT.md)
