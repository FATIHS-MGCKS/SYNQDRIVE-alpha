# KG-EED Agent Protocol

**Purpose:** Make this graph safe for future independent agents changing Energy Event Detection architecture.

## Before any EED architecture change

1. **Read** `GRAPH.yaml` — scope, cross-graph refs, validation command
2. **Read** `governance/AUTHORITY_BOUNDARIES.md` — confirm change is EED-owned
3. **Identify affected nodes** in `graph/nodes.yaml` (by ID prefix)
4. **Identify affected invariants** in `graph/invariants.yaml`
5. **Inspect related decisions** in `decisions/DECISIONS.md` and decision nodes
6. **Collect new evidence** — code, test, or production; assign maturity class
7. **Implement runtime/code change** in separate commit step (if applicable)
8. **Update graph in same workstream** — nodes, edges, invariants, evidence registry
9. **Append** `history/CHANGELOG.md` — never silently overwrite history
10. **Validate** — `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs`
11. **Request independent review** when change touches:
    - Semantic changes (`durationSeconds`, `fuelLevelRise*`, RECHARGE meaning)
    - Authority boundaries (ATE/EED, Battery V2, Scaling Process)
    - Provider path (DIMO query, detector config)
    - Persistence identity (`dimoSegmentId`, upsert keys)
    - Sibling reconciliation delete rules
    - REFUEL/RECHARGE boundary

## Authority firewall rules

- **Do NOT** add REFUEL/RECHARGE semantics to KG-ATE unless genuine cross-authority correction with EED review
- **Do NOT** modify KG-ATE for EED canonicalization tasks
- **Do NOT** promote `INFERENCE` or `UNVERIFIED` evidence to `CONFIRMED` epistemic_status
- **Do NOT** execute fleet-wide historical backfill without explicit product decision superseding EED-DEC-009
- **Do NOT** fabricate physical pump/nozzle duration (EED-INV-003)
- **Do NOT** expand deferred ATE topics (FM-007, multi-replica) — reference only

## Evidence policy

| Maturity | May become canonical fact? |
|----------|---------------------------|
| PROVEN_IN_CODE | YES |
| PROVEN_BY_TEST | YES |
| PROVEN_IN_PRODUCTION | YES (label as production/historical) |
| PROVEN_HISTORICALLY | YES for decisions/incidents |
| INFERENCE | NO — mark node INFERRED or open question |
| UNVERIFIED | NO — must not appear in CONFIRMED nodes |

## Graph update checklist

- [ ] Node IDs unique; prefixes match `graph/schema.yaml`
- [ ] Decision nodes have `evidence: [...]` provenance
- [ ] Edge `from`/`to` reference existing node IDs
- [ ] Invariant evidence refs resolve
- [ ] `source_paths` exist on disk
- [ ] Open questions classified in `open-questions/OPEN_QUESTIONS.md`
- [ ] Cross-graph edges use `MAY_TRIGGER`, `MUST_NOT_INTERPRET_AS`, `REFERENCES` appropriately
- [ ] Validator passes

## Validation command

```bash
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
```

## Changes / Architektur records

Per workspace rules: after meaningful implementation (not this docs-only phase), update SynqDrive Code → Changes and Architektur when runtime architecture changes. KG-EED canonicalization itself is documented in `architecture/KG_EED_CANONICALIZATION_2026-09-01.md`.

## Independent review triggers

Request adversarial KG-EED review when:

- Duration semantic change proposed
- New delete/reconcile authority beyond REFUEL sibling rules
- Detector config production change
- Breaking API field rename
- ATE/EED boundary move
- RECHARGE ↔ Battery V2 linkage decision

## History discipline

- Append to `history/CHANGELOG.md`; do not delete prior entries
- Supersede decisions with new decision node + `SUPERSEDED` status on old
- Historical incidents (e.g. KS MX) remain permanent nodes — update with new evidence edges, do not remove
