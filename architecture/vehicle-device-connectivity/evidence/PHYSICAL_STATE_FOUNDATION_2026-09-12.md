# VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 — Physical-state reconciliation Phase 1

| Field | Value |
|-------|-------|
| **ID** | VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 |
| **Date** | 2026-09-12 |
| **Epistemic** | CONFIRMED (repository + automated tests) |
| **Decision** | VDC-DEC-012 |
| **Backlog** | VDC-RB-019 (Phase 1 foundation) |

## Scope implemented (dark)

- Prisma models `device_connection_physical_states`, `device_connection_physical_state_transitions`
- Pure policy `evaluatePhysicalStateTransition`
- Repository with `SELECT … FOR UPDATE`, `stateVersion`, idempotent transition log
- Service layer with episode/alert side-effect bridge (only when flag ON)
- Feature flag `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` default **OFF**
- Unit tests + PostgreSQL integration tests (GT-R1 regression path)
- Read-only drift detector `backend/scripts/ops/vdc-physical-state-drift-detect.ts`

## Explicitly deferred

- Live webhook gate replacement (`device-connection-webhook.service.ts`)
- Live snapshot writer cutover (`dimo-snapshot.processor.ts`)
- Production backfill / repair
- Flag enablement and mixed-version cutover

## GT-R1 regression (automated)

1. Historical UNPLUGGED webhook evidence establishes projection
2. Newer snapshot PLUG self-heal → PLUGGED, `episodeAction: none`
3. Newer webhook UNPLUG → APPLIED once, `episodeAction: open_unplug`
4. Duplicate webhook → DUPLICATE, no second episode action
