# VO-SIG-01 data repair plan (dry-run only — not executed)

## Principles

- No production execution in VO-SIG-01 workstream.
- No `hardwareType` promotion `UNKNOWN → LTE_R1/SMART5` without DI routing regression proof.
- Sold vehicles `187336` / `190497`: **offboard** via canonical Master Admin HTTP — never backfill connectivity.

## SAFE_AUTOMATIC (post-approval)

| Target | Before | After | Evidence |
|--------|--------|-------|----------|
| Active HM link with `provider=UNKNOWN` | `provider: UNKNOWN` | `provider: HIGH_MOBILITY` | `sourceType=HIGH_MOBILITY`, org + vehicle ownership match |

Script: `backend/scripts/ops/vo-sig-01-backfill-dry-run.mjs` (read-only).

## MANUAL_REVIEW

| Case | Action |
|------|--------|
| ACTIVE vehicle, no active `VehicleDataSourceLink`, legacy `dimoVehicleId` set | Materialize DIMO link via governed backfill or re-adoption — **not** auto in VO-SIG-01 |
| `hardwareType=UNKNOWN` with DIMO telemetry | Classify connection modality + DI hardware profile separately |
| Sold tokens 187336 / 190497 still ACTIVE | Offboard through `VehicleOffboardingService` |

## Transactional backfill shape (future)

1. `BEGIN`
2. `UPDATE vehicle_data_source_links SET provider = 'HIGH_MOBILITY' WHERE id = :id AND provider = 'UNKNOWN' AND source_type = 'HIGH_MOBILITY'`
3. Insert audit row / outbox event `VEHICLE_CONNECTION_IDENTITY_REPAIRED`
4. `COMMIT`

Rollback: reverse `UPDATE` using audit table primary key.

## Idempotency

Re-running dry-run or backfill must leave already-correct rows unchanged (`provider` already `HIGH_MOBILITY`).

## Production fleet disposition (read-only inventory 2026-10-13)

| Vehicle / link | Disposition | Operator action |
|----------------|-------------|-----------------|
| 9 ACTIVE vehicles | Mix of pilot DIMO R1, Tesla software, HM composite, staging UNKNOWN hardware | No auto-mutation; new onboardings gated by P1 verified modality |
| 7 active links | 6 with explicit provider; 1 HM `UNKNOWN` | HM UNKNOWN → `SAFE_AUTOMATIC` provider fix when approved |
| DIMO 187336, 190497 | Sold, still ACTIVE | **Offboard only** (`MANUAL_REVIEW_OFFBOARD`) — no reconnect/backfill |
| Staging rows (`hardwareType=UNKNOWN`, no fleet intent) | Non-authoritative for modality | Do not invent hardware/connections |
| Legacy `Vehicle.dimoVehicleId` without link | Bypasses VO-3 link materialization | `MANUAL_REVIEW` — governed link materialization or re-adoption |

Helpers: `vo-sig-01-backfill-dry-run.lib.cjs` (`classifyLinkProviderRepair`, `classifySoldVehicleRepair`).

## B1 legacy connection identity (2026-10-13)

| Item | Path |
|------|------|
| Contract v2 | `backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2.ts` |
| Planner + executor | `legacy-connection-identity-reconcile.service.ts` |
| Dry-run CLI | `backend/scripts/ops/vo-sig-01-legacy-connection-identity-reconcile-dry-run.ts` |
| Evidence | [VO_SIG_01_B1_LEGACY_CONNECTION_IDENTITY_RECONCILIATION.md](../evidence/VO_SIG_01_B1_LEGACY_CONNECTION_IDENTITY_RECONCILIATION.md) |

**Not** the same as provider-repair dry-run (`vo-sig-01-backfill-dry-run.mjs`). B1 writes `metadata.connectionIdentity` v2 only after separate owner-approved execute authorization.
