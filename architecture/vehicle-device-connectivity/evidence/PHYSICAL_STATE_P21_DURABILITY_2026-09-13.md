# VDC RB-019 Phase 2 — P2.1 Durability Foundation

| Field | Value |
|-------|-------|
| **ID** | VDC-EVID-RB019-P21-DURABILITY-001 |
| **Date** | 2026-09-13 |
| **Subphase** | P2.1 |
| **Epistemic** | `P2_1_IMPLEMENTATION_PRESENT` — pending CI `P2_1_POSTGRES_VALIDATED` / `P2_1_FINAL_CI_VALIDATED` |
| **Production** | **NOT_DEPLOYED** — flags OFF; coordinator dark/unwired |

## Scope delivered

| Component | Status |
|-----------|--------|
| `device_connection_physical_authority_cutover` schema | ✅ migration `20260913120000_device_connection_physical_state_p21_durability` |
| `device_connection_physical_state_action_outbox` schema | ✅ same migration |
| `reconcileInTransaction(tx)` public refactor | ✅ no nested `$transaction` |
| `PhysicalStateReconcileCoordinator` outer tx | ✅ projection + audit + APPLIED event history + outbox |
| Action outbox processor skeleton | ✅ claim/lease/retry/DLQ row lifecycle only |
| Authority latch default `LEGACY` | ✅ schema default; no Production cutover |

## Explicitly NOT delivered (P2.2+)

- Shadow comparison / flag resolver runtime
- Webhook/snapshot writers wired to live processors
- Authority `LEGACY → PHYSICAL` cutover (P2.5)
- Episode/alert side-effect execution (P2.6)
- Pre-seed (P2.4)

## Authority identity

- **Authority scope:** `UNIQUE (organizationId, vehicleId, provider)`
- **Projection scope:** `bindingKey` (unchanged Phase 1)
- **Default authorityMode:** `LEGACY`

## Outbox idempotency

`physical:{org}:{vehicle}:{bindingKey}:{stateVersion}:{episodeAction}:{alertAction}` — `INSERT … ON CONFLICT DO NOTHING`

## Claim algorithm

`FOR UPDATE SKIP LOCKED` batch claim + per-row lease (`processing_lease_expires_at`)

## Test surfaces

| Suite | Path | Count |
|-------|------|-------|
| Phase 1 PG regression | `device-connection-physical-state.postgres.integration.spec.ts` | 17 |
| Authority latch PG | `device-connection-physical-authority-cutover.postgres.integration.spec.ts` | 8 |
| Action outbox PG | `device-connection-physical-state-action-outbox.postgres.integration.spec.ts` | 7 |
| Coordinator atomicity PG | `physical-state-reconcile.coordinator.postgres.integration.spec.ts` | 7 |
| Unit (binding/policy/observability) | `device-connection-physical-state.*.spec.ts` | 18 |

## Safety invariants preserved

- `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` remains **OFF**
- No live webhook/snapshot wiring
- No Production mutation/backfill
- `authorityMode` remains `LEGACY` everywhere in Production
