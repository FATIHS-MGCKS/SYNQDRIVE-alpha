# Battery V2 — Living Architecture Authority

**Status:** Bootstrap (2026-09-01)  
**Maturity:** Incremental / open scientific workstream  
**Runtime impact:** None (documentation and knowledge graph only)

## What this is

`architecture/battery-v2/` is the **architectural memory** of Battery V2.

It is **not** a finalized static architecture document. It is a continuously evolving knowledge system that preserves:

- what the system currently does (best known)
- why it does it
- what evidence supports each claim
- what changed, why, and what it did **not** improve
- unknowns, contradictions, failed approaches, and superseded decisions

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
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Best-known snapshot of Battery V2 today |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Human-readable graph overview |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | **Mandatory rules for future agents** |
| [purpose/profile-matrix.md](./purpose/profile-matrix.md) | ICE/HEV/PHEV/BEV profile behavior |
| [signals/hv-signal-authority.md](./signals/hv-signal-authority.md) | HV DIMO signal catalog |
| [signals/threshold-catalog.md](./signals/threshold-catalog.md) | Threshold CODE FACT catalog |
| [health-model/hv-capacity.md](./health-model/hv-capacity.md) | M2/M3/cross-session methods |
| [health-model/hv-soh.md](./health-model/hv-soh.md) | Provider SOH + SOH gate |
| [lifecycle/hv-charge-sessions.md](./lifecycle/hv-charge-sessions.md) | Native vs fallback recharge |
| [persistence/models.md](./persistence/models.md) | Prisma persistence model |
| [consumers/api-authority.md](./consumers/api-authority.md) | API route authority |
| [consumers/frontend-authority.md](./consumers/frontend-authority.md) | Frontend consumers |
| [research/CHANGE_LEDGER.md](./research/CHANGE_LEDGER.md) | Scientific change history |
| [graph/nodes.yaml](./graph/nodes.yaml) | Machine-readable node catalog |
| [graph/edges.yaml](./graph/edges.yaml) | Machine-readable relationships |
| [graph/invariants.yaml](./graph/invariants.yaml) | Invariants with epistemic classification |

## Maintenance

Any substantive Battery V2 behavior, policy, lifecycle, queue/liveness, persistence, scheduling, reconciliation, publication, or safety change **must** update this authority in the same workstream/PR when applicable.

A simple changelog entry alone is **not sufficient**. See [AGENT_CONTRACT.md](./AGENT_CONTRACT.md).

## Validation

```bash
bash architecture/battery-v2/scripts/validate-graph.sh
# or: node architecture/battery-v2/scripts/validate-graph.mjs
```

Validates YAML syntax, unique stable IDs, required fields, type/prefix alignment, epistemic/decision status, evidence `source_type`, edge/node references, invariant evidence, source paths, and canonical GAP/HYP/CONTRA index resolution.

## Related legacy architecture documents

These remain evidence sources (not unquestionable authority):

- `architecture/BATTERY_V2_STAGE1_PIPELINE_DEFECT_CLOSURE_2026-08-30.md`
- `architecture/BATTERY_V2_LV_REST_SESSION_LIVENESS_2026-08-28.md`
- `architecture/BATTERY_V2_ICE_REST_OPENING_POLICY_2026-08-28.md`
- `architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md`
