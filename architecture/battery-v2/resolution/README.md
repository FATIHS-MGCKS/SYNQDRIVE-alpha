# Battery V2 — Phase 4 Resolution Planning

**Phase:** 4 — Open-gap resolution planning, experiment design & implementation readiness  
**Date:** 2026-09-01  
**Epistemic:** PROPOSED planning authority — **not** runtime validation  
**Runtime impact:** None

## Purpose

Phase 3 answered *what exists* and *what can execute*. Phase 4 answers *what to do about remaining gaps* — without implementing fixes.

## Implementation readiness states

Distinct from graph `decision_status` and gap `epistemic_status`.

| State | Meaning |
|-------|---------|
| `NOT_READY` | Insufficient design or dependency blockers |
| `RESEARCH_REQUIRED` | Needs code/architecture/DIMO investigation before deciding |
| `DECISION_REQUIRED` | Product or architecture choice must be made first |
| `IMPLEMENTATION_READY` | Target state defined; evidence plan exists; safe to implement |
| `PRODUCTION_VALIDATION_ONLY` | No code change; natural observation protocol suffices |
| `ACCEPT_RISK` | Known limitation; explicit defer with monitoring |
| `DEFERRED` | Low value or blocked; intentionally postponed |
| `REJECTED` | Option ruled out (method removal, no-fix path) |

A gap may remain **open** in `KNOWLEDGE_GAPS.md` even when readiness is `IMPLEMENTATION_READY` — planning ≠ resolution.

## Document index

| File | Scope |
|------|-------|
| [RESOLUTION_PRIORITY_MATRIX.md](./RESOLUTION_PRIORITY_MATRIX.md) | Master gap table (all 20 gaps) |
| [phase4-executive-summary.md](./phase4-executive-summary.md) | DO NOW / DECIDE NOW / DEFER ranking |
| [implementation-packages.md](./implementation-packages.md) | Future runtime work packages |
| [dependency-graph.md](./dependency-graph.md) | Parallel vs sequential ordering |
| [no-code-validation-paths.md](./no-code-validation-paths.md) | Gaps reducible without runtime changes |
| [lv-publication-chain-resolution.md](./lv-publication-chain-resolution.md) | LV assessment → publication target architecture |
| [lv-timestamp-provenance-resolution.md](./lv-timestamp-provenance-resolution.md) | Timestamp provenance target model |
| [hev-phev-product-authority.md](./hev-phev-product-authority.md) | HEV/PHEV product authority options |
| [hv-soh-selection-resolution.md](./hv-soh-selection-resolution.md) | HV SOH winner-usability options |
| [production-validation-protocol.md](./production-validation-protocol.md) | Post-#1445 natural soak protocol |
| [redis-lock-resilience-options.md](./redis-lock-resilience-options.md) | Per-scope lock fail-open analysis |
| [bridge-fallback-resolution.md](./bridge-fallback-resolution.md) | Bridge identity strategies |
| [hv-method-roadmap.md](./hv-method-roadmap.md) | SESSION_CHARGE / GROSS_CAPACITY |
| [threshold-calibration-backlog.md](./threshold-calibration-backlog.md) | Threshold provenance classification |

## Validation

```bash
bash architecture/battery-v2/scripts/validate-graph.sh
```
