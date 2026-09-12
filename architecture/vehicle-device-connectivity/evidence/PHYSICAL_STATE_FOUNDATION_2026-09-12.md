# VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 — Physical-state reconciliation Phase 1

| Field | Value |
|-------|-------|
| **ID** | VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 |
| **Date** | 2026-09-12 |
| **Epistemic** | IMPLEMENTATION_PRESENT — PG_VALIDATION_PENDING until CI/local PostgreSQL suite passes |
| **Decision** | VDC-DEC-012 |
| **Backlog** | VDC-RB-019 (Phase 1 foundation) |

## Scope implemented (dark)

- Prisma models `device_connection_physical_states`, `device_connection_physical_state_transitions`
- Pure policy `evaluatePhysicalStateTransition`
- Repository with `SELECT … FOR UPDATE`, `stateVersion`, idempotent transition log
- Service layer returns episode/alert **intents only** (no post-commit execution — Phase 2 outbox)
- Feature flag `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` default **OFF**
- Unit tests + PostgreSQL integration tests (GT-R1 regression path)
- Read-only drift detector `backend/scripts/ops/vdc-physical-state-drift-detect.ts`

## Explicitly deferred

- Live webhook gate replacement (`device-connection-webhook.service.ts`)
- Live snapshot writer cutover (`dimo-snapshot.processor.ts`)
- Production backfill / repair
- Flag enablement and mixed-version cutover

## Binding identity invariant (VDC-DEC-012)

`bindingKey = {PROVIDER}:device:{providerDeviceIdHash}` always — `deviceBindingId` is enrichment only.

## Transition audit semantics

`device_connection_physical_state_transitions` is a **reconciliation decision audit** (DUPLICATE/STALE/CONFLICT/APPLIED/…), not only applied physical transitions.

Idempotency key includes `candidateState` so pathological same-ref/time/source conflicts cannot hide behind a prior row.

## Baseline initialization (ESTABLISHED)

`ESTABLISHED` initializes projection only — **never** emits episode/alert intents. Only `APPLIED` logical transitions may return intents (still not executed in Phase 1).

Phase 2 cutover **requires** pre-seeding active bindings before enabling the flag (hard prerequisite).

## GT-R1 regression (automated — requires PostgreSQL)

1. Historical UNPLUGGED webhook evidence establishes projection
2. Newer snapshot PLUG self-heal → PLUGGED, `episodeAction: none`
3. Newer webhook UNPLUG → APPLIED once, `episodeAction: open_unplug`
4. Duplicate webhook → DUPLICATE, no second episode action
