# Scaling Process — Agent Maintenance Policy

**TYPE:** GOVERNANCE  
**EFFECTIVE:** 2026-09-01  
**SCOPE:** All agents touching horizontal scaling, multi-replica coordination, production scale gates, deploy/rollback, or related coordination code.

---

## Mandatory rule

> Any change affecting the **Scaling Process** must update this canonical authority in the **same workstream/PR** when applicable.

A dated memo in `architecture/P1_*` alone is **supporting evidence**, not a substitute for `architecture/scaling-process/`.

---

## What counts as a Scaling Process change

- Scheduler leader election behavior, TTL, registry, guards
- DIMO global provider budget limits, categories, executor paths
- Reconciliation mutex scope, TTL, entry points
- BullMQ worker/scheduler scaling assumptions
- Production replica topology (PM2, ports, nginx)
- `vps-deploy-release.sh`, rollback scripts, PM2 ecosystem
- Production scale gates, soak audits, validation harnesses affecting prod topology
- New replica counts or coordination primitives

**Not substantive (usually):** unrelated feature work with no scaling/coordination impact.

---

## Completion checklist

No architecture change is **complete** until:

1. **Code** updated (if applicable)
2. **Tests** updated (unit, integration, ops selftests)
3. **[CURRENT_STATE.md](./CURRENT_STATE.md)** updated if runtime truth changed
4. **[DECISION_LOG.md](./DECISION_LOG.md)** updated if architecture **choice** changed
5. **[SCALING_PROCESS_KNOWLEDGE_GRAPH.md](./SCALING_PROCESS_KNOWLEDGE_GRAPH.md)** updated if relationships changed
6. **[VALIDATION_EVIDENCE.md](./VALIDATION_EVIDENCE.md)** updated with new evidence
7. **[OPEN_QUESTIONS_AND_FUTURE_WORK.md](./OPEN_QUESTIONS_AND_FUTURE_WORK.md)** updated if gaps closed or new gaps found
8. **Subsystem doc** updated (`SCHEDULER_*`, `DIMO_*`, etc.) when that subsystem changed
9. **[FAILURE_AND_RECOVERY_MODEL.md](./FAILURE_AND_RECOVERY_MODEL.md)** updated for new incidents
10. **ChangesView / ArchitekturView** updated per project convention (`Architectur-Updates` rule)

---

## Epistemic discipline

| Rule | Requirement |
|------|-------------|
| Never delete historical decisions | Mark **SUPERSEDED** with link to successor |
| Never rewrite incidents | Add corrections as new entries with dates |
| Never claim certification beyond evidence | Use SCALING_ENVELOPES levels |
| Never promote FUTURE_OPTION to FACT | Requires implementation + validation |
| DISCOVERED_INCONSISTENCY | Document; do not silently fix in doc-only tasks |

Use metadata blocks where helpful:

```
TYPE:
STATUS:
SOURCE:
INTRODUCED_BY:
SUPERSEDED_BY:
RATIONALE:
EVIDENCE:
RISK_IF_CHANGED:
```

---

## Production mutation policy

Scaling authority updates are **documentation-first**. Production changes require explicit task authorization (e.g. P1.8.2 scale gate).

Read-only verification (SSH health, `pm2 list`, Redis GET) is allowed for CURRENT_STATE updates.

---

## Cross-references

| Related authority | Path |
|-------------------|------|
| Battery V2 (separate workstream) | `architecture/battery-v2/` |
| Project engineering rules | `.cursor/rules/projektregel.mdc` |
| DIMO MCP rule | `.cursor/rules/Dimo-Rule.mdc` |
| Architectur-Updates rule | Changes + Architektur views |

---

## Review cadence

Update CURRENT_STATE after:
- Any production deploy
- Any scale event
- Any coordination incident
- Monthly minimum while scaling workstream active
