# R1 — Capability gap analysis

| ID | Gap | Status | R2 action |
|----|-----|--------|-----------|
| DIM-GAP-003 | Complete DIMO env flag matrix on Production | **PARTIAL** — R1 names only | Read-only full env inventory |
| DIM-GAP-005 | Stale former-fleet scheduler mirror | **OPEN** | Data cleanup workstream |
| DIM-GAP-006 | Fleet-wide R9 wake KPI + payload archive | **OPEN** | Log forensics |
| DIM-GAP-007 | Swallowed driving-events errors | **OPEN** (DI) | Fail-closed policy |
| DIM-R1-GAP-001 | DIMO MCP unavailable during audit | **OPEN** | Retry MCP auth |
| DIM-R1-GAP-002 | `DimoTriggersService` legacy API vs ops scripts | **CONTRADICTED** | Deprecate or align Nest client |
| DIM-R1-GAP-003 | Production tier env overrides | **UNKNOWN** | SSH read-only |
| DIM-R1-GAP-004 | Privilege ID official matrix | **UNKNOWN** | Provider docs |

## Not integrated (opportunity)

- Fetch API bulk export paths
- Programmatic webhook lifecycle fully in Nest (today: ops scripts + console)
- Per-vehicle dynamic query shaping from `availableSignals`
