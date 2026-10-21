# KG-ATE Agent Maintenance Protocol

Any agent modifying Automatic Trip Enrichment **MUST** follow this protocol.

## 1. Read first

1. `architecture/knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml`
2. `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
3. `governance/AUTHORITY_BOUNDARIES.md`
4. `open-questions/OPEN_QUESTIONS.md` — do not assume closed questions are facts

## 2. Identify impact

Before coding, list:

- Affected node IDs (`ATE-*`)
- Affected invariants (`ATE-INV-*`)
- Cross-graph authorities (EED, DI, Scaling Process)
- Whether change touches energy semantics (**if yes → stop; belongs to EED**)

## 3. Classify change type

| Class | Definition | Graph update required |
|-------|------------|----------------------|
| `PATCH` | Docs/typos in KG only | nodes/edges + changelog |
| `IMPLEMENTATION_CHANGE` | Behavior change, same semantics | nodes, evidence, tests, changelog |
| `ARCHITECTURAL_CHANGE` | New stage, queue, scheduler, or path | nodes, edges, invariants?, decisions?, changelog |
| `SEMANTIC_CHANGE` | Meaning of status fields or outputs changes | decisions, invariants, evidence, changelog |
| `AUTHORITY_CHANGE` | Ownership moves between graphs | **Independent review required**; AUTHORITY_BOUNDARIES + cross-graph refs |

## 4. Gather evidence

- Code path + test + (if applicable) production observation
- Assign or extend `ATE-EV-####` in `evidence/EVIDENCE_REGISTRY.md`
- Link evidence from affected nodes
- Record negative results when disproving prior assumptions

## 5. Implement

- Preserve `TripEnrichmentOrchestratorService` as canonical entry unless AUTHORITY_CHANGE approved
- Do not inline energy-event semantics in ATE modules
- Do not redefine DI scoring in orchestrator

## 6. Update tests

- Extend or add tests for changed behavior
- Reference test evidence IDs (`ATE-EV-*` with source_type TEST)

## 7. Update graph

- `graph/nodes.yaml` — new/changed nodes with provenance
- `graph/edges.yaml` — execution or authority edges
- `graph/invariants.yaml` — if invariants added/changed/disproven
- `decisions/DECISIONS.md` — if semantics or architecture decisions changed
- `open-questions/OPEN_QUESTIONS.md` — resolve or add questions explicitly

## 8. Changelog

Append entry to `history/CHANGELOG.md` with SHA, summary, audit deltas.

## 9. Validate

```bash
node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs
```

Must PASS before merge.

## 10. Declare uncertainty

In PR/commit message, list:

- Unresolved open questions touched
- INFERRED rationale (label explicitly)
- External authorities consulted

## Forbidden

- Converting assumptions into canonical facts
- Closing open questions without evidence
- Duplicating EED, DI, or Scaling Process ownership
- Skipping graph update for ARCHITECTURAL_CHANGE or SEMANTIC_CHANGE

## SynqDrive architecture docs

Per project rules, also update:

- `architecture/` change record when architecture/data flow changes
- Frontend master Changes/Architektur views if user-facing architecture summaries require sync (separate from KG files)
