# Trip Detection & Lifecycle — Agent Contract (`AUTHORITY_ACTIVE`)

**Effective:** 2026-09-06
**Registry coverage:** `AUTHORITY_ACTIVE` (promoted 2026-09-26 — TDL-DEC-PHASE5-001)
**Authority maturity:** `PHASE_0_5_COMPLETE` — explicit non-blocking limitations tracked in [contradictions/](contradictions/)

## Mandatory read-first sequence

1. [README.md](README.md), [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md), [CURRENT_STATE.md](CURRENT_STATE.md)
2. [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md), [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md)
3. Neighbor mandatory entry documents listed in [README.md](README.md)
4. [`TRIP_OWNERSHIP.ts`](../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) (P1 ownership invariants; no separate P1 Markdown)

## Module-authority maintenance duty

Any **substantive** Trip Detection & Lifecycle change **must** update this authority in the **same workstream/PR**.

Maintenance rules (`AUTHORITY_ACTIVE`):

- Treat [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) as **supporting evidence**, not canonical authority.
- Do **not** create competing authorities at `docs/architecture/trip-fsm/` or `architecture/trip-fsm/`.
- Any change to FSM states/transitions, `transitionState` call sites, or `TripDecisionEngine` lifecycle writers **must** update `graph/nodes.yaml`, `graph/edges.yaml` (`transitions_to`), `graph/schema.yaml` pinned counts, and [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md) in the same PR.
- Do **not** treat `UNKNOWN` surfaces or **EXPLICIT_NON_BLOCKING_LIMITATION** items as canonical behavior.
- Never silently rewrite historical decisions, contradictions, failed approaches, or evidence — append status history instead.

**Graph relation direction:** `A upstream_of B` means A's output feeds B; `A transitions_to B` is a live FSM state change from A to B.

## Same-PR registry synchronization duty

When registry metadata facts change in the same PR:

1. Update this module authority artifacts.
2. Re-read the module overview row and detailed section in [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md).
3. Update the central registry **only when facts changed** (name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated).
4. Run `bash architecture/scripts/validate-module-registry.sh`.

## Mandatory registry review reporting

Every substantive workstream must report **one result per affected module**:

- `REGISTRY_REVIEWED: UPDATED` or `REGISTRY_REVIEWED: UNCHANGED`
- registry coverage status **before** and **after**
- specific **reason**

Cross-module changes require the same review result for **every owning/neighbor authority touched**.

## What counts as substantive

- FSM state transitions, dwell clocks, or terminal recovery semantics
- Start/end detection policies, detectors, CUSUM validation, or timestamp authority
- `TripDecisionEngine` lifecycle mutations or ownership violations
- BullMQ queue handoff, retries, locks, idempotency on `dimo.trip-tracking`
- Snapshot ingress cadence affecting trip start evaluation
- **R9 adaptive provider-wake ingress** (`SnapshotWakeIntakeService`, `SnapshotWakeCoordinatorService`, durable Redis mailboxes, `snapshot.wake.handoff` queue, DIMO webhook wiring, coalesce QUEUED/ACTIVE, continuation RESTING+eligible, UNKNOWN bounded retry)
- Reconciliation / repair (`TripRepair`, partial-boundary repair, intra-gap split)
- Route artifact materialization (Mapbox/FMM/Route V2)
- Prisma trip detection models or migrations
- Trip API read models or rental UI trip lifecycle presentation
- Observability / forensic metadata contracts for trip FSM

**Not substantive (usually):** pure refactors with no behavioral claim, comment-only edits, neighbor-module work outside trip boundaries.

## Prohibited silent changes

Without updating authority artifacts (and registry when metadata changes):

- FSM, detection, lifecycle, queue, repair, or route-artifact behavior
- Ownership boundaries or neighbor handoff assumptions
- Evidence classifications, contradictions, or open questions
- Promotion-related claims

## Evidence requirements

- Separate **source type** from **epistemic/currentness** status (see [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md)).
- Use stable evidence IDs (`TDL-EV-*`, `TDL-EV-PROD-*`); do not rewrite or delete historical evidence.
- Preserve gap IDs (`TDL-GAP-*`), contradiction IDs (`TDL-CX-*`), and question IDs (`TDL-OQ-*`).
- Production evidence: read-only, bounded, sanitized — no credentials, connection strings, PII, VINs, or coordinates in committed docs.
- Tests, deployment success, and natural Production evidence are **different evidence classes** — do not conflate them.

## Three-axis status separation

Never merge these axes:

1. **Registry coverage status** — `NOT_STARTED`, `AUDIT_IN_PROGRESS`, `AUTHORITY_ACTIVE`, `SUPERSEDED`
2. **Epistemic state** — e.g. `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED`
3. **Decision / validation status** — e.g. `PROPOSED`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`

## Neighbor boundaries

| Neighbor | Owns |
|----------|------|
| Driving Intelligence | Post-trip behavior, scoring, DI V2 pipeline — **not** canonical trip boundaries |
| KG-ATE | Post-finalize enrichment orchestration |
| KG-EED | REFUEL/RECHARGE — may associate to trips but **not** trip start/end |
| Scaling Process | Leader election, DIMO budget, generic reconciliation mutex |
| Battery V2 | Battery health; may consume trip lifecycle hooks |
| DIMO Integration (`AUDIT_IN_PROGRESS`) | Provider auth, telemetry, segments, webhooks, triggers — canonical authority at [`architecture/dimo-integration/`](../dimo-integration/); R9 cross-module contract DIM-DEC-R9-001 / TDL-DEC-R9-CX-001 |

**Resolved:** COMPLETED → Driving Intelligence handoff (TDL-OQ-001). **`drive-profile/`** — Battery V2 owns; TDL non-owner (TDL-OQ-002).

## Production safety

Unless **separately authorized**: no deploy, PM2 mutation, migrations, queue mutation, Redis writes, synthetic trips, or Production file edits. Production SQL: read-only transactions, short statement timeout, bounded aggregates.

## Validation commands

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
git diff --check
```

Module graph validator: `validate-graph.sh` (FSM transitions, OQ-010 mapping, orphans, invariants, decisions).

## Required final `ARCHITECTURE_GOVERNANCE` report

Substantive work must end with the completion block defined in [`.cursor/rules/Architectur-Updates.mdc`](../../.cursor/rules/Architectur-Updates.mdc), including:

- `substantive_change: YES|NO`
- affected modules and authority updates
- one `registry_review` object **per affected module** (before/after status + reason)
- central registry validator result
- SynqDrive Code view updates when applicable
