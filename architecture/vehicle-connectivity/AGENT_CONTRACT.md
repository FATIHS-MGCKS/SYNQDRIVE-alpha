# Vehicle Connectivity — Agent Contract

Mandatory rules for agents working on connectivity semantics, freshness, standby/disconnect classification, or connectivity projections.

## Mandatory read-first

1. [`AGENTS.md`](../../AGENTS.md)
2. [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) — locate **Vehicle Connectivity** row
3. [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md)
4. This authority:
   - [README.md](./README.md)
   - [CURRENT_STATE.md](./CURRENT_STATE.md)
   - [AUDIT_MANIFEST.md](./AUDIT_MANIFEST.md)
   - [research/OPEN_HYPOTHESES.md](./research/OPEN_HYPOTHESES.md)
5. Neighbor authorities when touching boundaries:
   - [DIMO Integration](../dimo-integration/README.md)
   - [Trip Detection & Lifecycle](../trip-detection-lifecycle/README.md)

## Registry status

| Status | Agent action |
|--------|--------------|
| `AUDIT_IN_PROGRESS` | Read bootstrap artifacts; **do not** treat as complete authority; complete Phase 1–2 before substantive runtime changes |

## Substantive change definition

Substantive for Vehicle Connectivity includes:

- connectivity state taxonomy or transitions
- freshness / standby / offline thresholds exposed to product
- provider-neutral projection contracts
- fault classification rules
- connectivity alert semantics
- ground-truth methodology or promoted Production observations

## Same-workstream duties

- Update this authority in the **same PR** when making substantive connectivity-semantics changes.
- Record BEFORE / WHY / CHANGE / evidence / gaps.
- Never promote chat-derived Production numbers without independent reconstruction.

## Registry synchronization

After substantive work:

1. Re-read Vehicle Connectivity overview row.
2. Update registry **only if** metadata facts changed.
3. Report `REGISTRY_REVIEWED: UPDATED|UNCHANGED` with before/after status.
4. Run `bash architecture/scripts/validate-module-registry.sh`.

Cross-module changes require reviewing **every** affected neighbor registry row.

## Ownership boundaries (mandatory)

**Vehicle Connectivity owns semantics and evidence interpretation.**

**Do not implement in VC authority PRs without neighbor review:**

- DIMO API clients, webhooks, triggers → DIMO Integration
- Trip FSM, wake mailboxes → Trip Detection
- Fleet CRUD / vehicle entity → Vehicles
- HM APIs → High Mobility Integration

If code today contradicts these boundaries, record in [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md) — do not silently relocate code in a bootstrap/docs-only PR.

## Evidence rules

| Concept | Valid evidence |
|---------|----------------|
| New device/source data | Monotonic `sourceTimestamp` / `signalsLatest.lastSeen` |
| SynqDrive polled | `DimoPollLog`, `providerFetchedAt` — **not** proof of new device data |
| Standby vs disconnected | Multi-source: source gaps, signal groups, physical evidence, provider status |

Separate registry coverage, epistemic state, and validation status.

## Production safety

Production audits are **read-only** unless the user explicitly authorizes mutation in a separate task.

## Validation commands

```bash
bash architecture/vehicle-connectivity/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Completion report (substantive VC work)

Include `ARCHITECTURE_GOVERNANCE` block per [`.cursor/rules/Architectur-Updates.mdc`](../../.cursor/rules/Architectur-Updates.mdc).
