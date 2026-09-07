# Trip Detection & Lifecycle — Failed Approaches

Historical intermediate designs superseded during R9 remediation. Preserved per Standard-1.0.

| ID | Package | Approach | Why rejected | Superseded by |
|----|---------|----------|--------------|---------------|
| **TDL-FAIL-R9A-001** | R9A | Reuse canonical snapshot stable jobId for successor dispatch | Self-coalescing duplicate stable IDs silently dropped successor | TDL-DEC-R9B-001 |
| **TDL-FAIL-R9A-002** | R9A | Destructive pending consume before durable snapshot completion | Lost wakes under ACTIVE canonical job races | TDL-DEC-R9A-001 |
| **TDL-FAIL-R9C-001** | R9C | Return success from handoff on UNKNOWN continuation | Handoff job completed with successor Redis stranded | TDL-DEC-R9E-001 |
| **TDL-FAIL-R9E-001** | R9E | ACK latest pending/successor under stale obsolete classification | Newer valid wakes deleted after transient ACTIVE read | TDL-DEC-R9E-001 |
| **TDL-FAIL-R9F-001** | R9F | Preserve UNKNOWN pending without scheduling retry handoff | No bounded liveness path outside dispatchSuccessorHandoff defer | TDL-DEC-R9F-001 |

Graph nodes: [`graph/nodes.yaml`](graph/nodes.yaml) (`TDL-FAIL-*`)

Full narrative: [`docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md`](../../docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md)
