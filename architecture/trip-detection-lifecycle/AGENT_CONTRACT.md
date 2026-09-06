# Trip Detection & Lifecycle — Agent Contract (Partial, Phase 0–2)

**Effective:** 2026-09-07  
**Registry coverage:** `AUDIT_IN_PROGRESS`  
**Authority maturity:** `PARTIAL_RECONSTRUCTION` — not yet `AUTHORITY_ACTIVE`

## Mandatory rule during audit

Any substantive Trip Detection & Lifecycle change **must** update this authority in the **same workstream/PR** once the module is under active reconstruction.

Until promotion to `AUTHORITY_ACTIVE`:

- Treat [`docs/audits/trip-fsm/`](../../docs/audits/trip-fsm/) as **supporting evidence**, not canonical authority.
- Do **not** create competing authorities at `docs/architecture/trip-fsm/` or `architecture/trip-fsm/`.
- Do **not** promote to `AUTHORITY_ACTIVE` without completing Standard-1.0 phases 3–6 and the Production promotion gate.

## What counts as substantive (trip module)

- FSM state transitions, dwell clocks, or terminal recovery semantics
- Start/end detection policies, detectors, CUSUM validation, or timestamp authority
- `TripDecisionEngine` lifecycle mutations or ownership violations
- BullMQ queue handoff, retries, locks, idempotency on `dimo.trip-tracking`
- Snapshot ingress cadence affecting trip start evaluation
- Reconciliation / repair (`TripRepair`, partial-boundary repair, intra-gap split)
- Route artifact materialization (Mapbox/FMM/Route V2)
- Prisma trip detection models or migrations
- Trip API read models or rental UI trip lifecycle presentation
- Observability / forensic metadata contracts for trip FSM

**Not substantive (usually):** pure refactors with no behavioral claim, comment-only edits, neighbor-module work outside trip boundaries.

## Production safety (non-negotiable)

During audit and authority work unless **separately authorized**:

- No deploy, PM2 mutation, migrations, queue mutation, Redis writes, synthetic trips, or Production file edits
- Production SQL: read-only transactions, short statement timeout, bounded aggregates, no PII extraction

## Neighbor boundaries (do not silently absorb)

| Neighbor | Owns |
|----------|------|
| Driving Intelligence | Post-trip behavior, scoring, DI V2 pipeline — **not** canonical trip boundaries |
| KG-ATE | Post-finalize enrichment orchestration |
| KG-EED | REFUEL/RECHARGE — may associate to trips but **not** trip start/end |
| Scaling Process | Leader election, DIMO budget, generic reconciliation mutex |
| Battery V2 | Battery health; may consume trip lifecycle hooks |
| DIMO Integration (`NOT_STARTED`) | Provider auth, telemetry, segments, webhooks — inspect code; no active authority |

**Open:** exact COMPLETED → Driving Intelligence handoff; ownership of `drive-profile/`.

## Required read order before substantive trip work

1. This directory's [README.md](README.md), [CURRENT_STATE.md](CURRENT_STATE.md), [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md)
2. [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md)
3. Neighbor mandatory entry docs listed in [README.md](README.md)
4. [`TRIP_OWNERSHIP.ts`](../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) (P1 invariants)

## Validation (current phase)

```bash
bash architecture/scripts/validate-module-registry.sh
git diff --check
```

Module graph validators: **not yet created**.
